#!/usr/bin/env node

/**
 * Generate Static Map Images from GPX Files using Mapbox Static Image API
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { DOMParser } = require('xmldom');
const polyline = require('@mapbox/polyline');

// Configuration
const PLUGIN_REPO_DIR = process.env.PLUGIN_REPO_DIR || './mbplugin-fischr-tours';
const TOURS_JSON = './tours.json';
const MAP_OUTPUT_DIR = path.join(PLUGIN_REPO_DIR, 'static', 'maps');
const MAP_WIDTH = parseInt(process.env.MAP_IMAGE_WIDTH || '800', 10);
const MAP_HEIGHT = parseInt(process.env.MAP_IMAGE_HEIGHT || '400', 10);
const MAP_PADDING = process.env.MAPBOX_PADDING || '80,80,80,80';
const MAPBOX_STYLE = process.env.MAPBOX_STYLE || 'mapbox/outdoors-v11';
const MAPBOX_LINE_COLOR = (process.env.MAPBOX_PATH_COLOR || '#0ea5e9').replace('#', '');
const MAPBOX_LINE_WIDTH = parseInt(process.env.MAPBOX_PATH_WIDTH || '5', 10);
const MAPBOX_LINE_OPACITY = process.env.MAPBOX_PATH_OPACITY || '1';
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const MAX_POLYLINE_POINTS = parseInt(process.env.MAPBOX_MAX_POLYLINE_POINTS || '500', 10);
const MAPBOX_EXTRA_QUERY = process.env.MAPBOX_EXTRA_QUERY || 'logo=false&attribution=false';

if (!MAPBOX_ACCESS_TOKEN) {
  console.error('Error: MAPBOX_ACCESS_TOKEN environment variable is required to generate static maps.');
  process.exit(1);
}

/**
 * Parse GPX file and extract track points
 * @param {string} gpxPath - Path to GPX file
 * @returns {Array<{lat: number, lon: number}>} - Array of coordinates
 */
function parseGpxFile(gpxPath) {
  try {
    const gpxContent = fs.readFileSync(gpxPath, 'utf-8');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');

    const trackPoints = [];
    const trkpts = xmlDoc.getElementsByTagName('trkpt');

    for (let i = 0; i < trkpts.length; i++) {
      const point = trkpts[i];
      const lat = parseFloat(point.getAttribute('lat'));
      const lon = parseFloat(point.getAttribute('lon'));

      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        trackPoints.push({ lat, lon });
      }
    }

    return trackPoints;
  } catch (error) {
    console.error(`Error parsing GPX file ${gpxPath}:`, error.message);
    return [];
  }
}

/**
 * Reduce track points so Mapbox URL remains within limits
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {Array<{lat: number, lon: number}>}
 */
function clampTrackPoints(points) {
  if (points.length <= MAX_POLYLINE_POINTS) {
    return points;
  }

  const step = Math.ceil(points.length / MAX_POLYLINE_POINTS);
  const reduced = [];

  for (let i = 0; i < points.length; i += step) {
    reduced.push(points[i]);
  }

  const lastPoint = points[points.length - 1];
  const reducedLast = reduced[reduced.length - 1];
  if (lastPoint && (!reducedLast || reducedLast.lat !== lastPoint.lat || reducedLast.lon !== lastPoint.lon)) {
    reduced.push(lastPoint);
  }

  return reduced;
}

/**
 * Build encoded polyline for Mapbox
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {string|null}
 */
function buildPolyline(points) {
  if (!points.length) {
    return null;
  }

  const geoJson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lon, p.lat]),
    },
  };

  const encoded = polyline.fromGeoJSON(geoJson).replace(/\?/g, '%3F');
  return encoded;
}

/**
 * Build the Mapbox Static Image API URL
 * @param {string} encodedPolyline
 * @returns {string}
 */
function buildMapboxUrl(encodedPolyline) {
  const safeWidth = Math.max(1, MAPBOX_LINE_WIDTH);
  const stroke = `path-${safeWidth}+${MAPBOX_LINE_COLOR}-${MAPBOX_LINE_OPACITY}`;
  const baseUrl = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${stroke}(${encodedPolyline})/auto/${MAP_WIDTH}x${MAP_HEIGHT}?padding=${MAP_PADDING}`;
  const extraQuery = MAPBOX_EXTRA_QUERY ? `&${MAPBOX_EXTRA_QUERY}` : '';
  return `${baseUrl}${extraQuery}&access_token=${MAPBOX_ACCESS_TOKEN}`;
}

/**
 * Generate static map image for a tour
 * @param {Object} tour - Tour object from tours.json
 * @param {string} gpxFilePath - Full path to GPX file
 */
async function generateMapImage(tour, gpxFilePath) {
  console.log(`Generating map for tour: ${tour.id}`);

  const trackPoints = clampTrackPoints(parseGpxFile(gpxFilePath));

  if (trackPoints.length === 0) {
    console.warn(`No valid track points found in ${gpxFilePath}`);
    return;
  }

  const encodedPolyline = buildPolyline(trackPoints);

  if (!encodedPolyline) {
    console.warn(`Could not encode polyline for ${tour.id}`);
    return;
  }

  const mapboxUrl = buildMapboxUrl(encodedPolyline);

  try {
    const buffer = await downloadBuffer(mapboxUrl);
    const outputPath = path.join(MAP_OUTPUT_DIR, `${tour.id}.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`✓ Map saved: ${outputPath}`);
  } catch (error) {
    console.error(`Error generating map for ${tour.id}:`, error.message);
  }
}

/**
 * Simple HTTPS download helper that follows redirects
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const { statusCode, headers } = response;

        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          resolve(downloadBuffer(headers.location));
          return;
        }

        if (!statusCode || statusCode >= 400) {
          response.resume();
          reject(new Error(`Mapbox API responded with ${statusCode || 'unknown status'}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

/**
 * Resolve GPX file path
 * @param {string} gpxPath - GPX path from tour (e.g., "/uploads/2025/tour.gpx")
 * @returns {string|null} - Resolved file path or null
 */
function resolveGpxPath(gpxPath) {
  const possiblePaths = [
    gpxPath,
    path.join(process.cwd(), gpxPath.replace(/^\//, '')),
    path.join('uploads', path.basename(gpxPath)),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Main execution
 */
async function main() {
  console.log('🗺️  Generating static map images from GPX files...\n');

  if (!fs.existsSync(MAP_OUTPUT_DIR)) {
    fs.mkdirSync(MAP_OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${MAP_OUTPUT_DIR}\n`);
  }

  if (!fs.existsSync(TOURS_JSON)) {
    console.error(`Error: ${TOURS_JSON} not found`);
    console.log('Run parse-tours.js first to generate tours.json');
    process.exit(1);
  }

  const rawTours = JSON.parse(fs.readFileSync(TOURS_JSON, 'utf-8'));
  let tours = [];

  if (Array.isArray(rawTours)) {
    tours = rawTours;
  } else if (Array.isArray(rawTours.tours)) {
    tours = rawTours.tours;
  } else if (rawTours && typeof rawTours === 'object') {
    tours = Object.values(rawTours);
  }

  if (!Array.isArray(tours)) {
    console.error('Error: Could not determine tours array from tours.json');
    process.exit(1);
  }

  console.log(`Found ${tours.length} tours\n`);

  let generated = 0;
  let skipped = 0;

  for (const tour of tours) {
    if (!tour.gpx) {
      console.log(`⊘ Skipping ${tour.id} (no GPX)`);
      skipped++;
      continue;
    }

    const gpxPath = resolveGpxPath(tour.gpx);

    if (!gpxPath) {
      console.warn(`⚠ Could not find GPX file for ${tour.id}: ${tour.gpx}`);
      skipped++;
      continue;
    }

    await generateMapImage(tour, gpxPath);
    generated++;
  }

  console.log(`\n✓ Generated ${generated} map images`);
  console.log(`⊘ Skipped ${skipped} tours`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
