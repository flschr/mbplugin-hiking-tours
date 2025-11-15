#!/usr/bin/env node

/**
 * Generate Static Map Images from GPX Files using Geoapify Static Map API
 *
 * Geoapify advantages over Mapbox:
 * - No URL length limitations (uses POST requests)
 * - No need for polyline encoding
 * - Better support for complex GPX tracks
 * - More generous free tier
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { DOMParser } = require('xmldom');

// Configuration
const PLUGIN_REPO_DIR = process.env.PLUGIN_REPO_DIR || './mbplugin-fischr-tours';
const TOURS_JSON = './tours.json';
const MAP_OUTPUT_DIR = path.join(PLUGIN_REPO_DIR, 'static', 'maps');
const MAP_WIDTH = parseInt(process.env.MAP_IMAGE_WIDTH || '800', 10);
const MAP_HEIGHT = parseInt(process.env.MAP_IMAGE_HEIGHT || '400', 10);
const MAP_SCALE_FACTOR = parseInt(process.env.MAP_SCALE_FACTOR || '2', 10);
const MAP_STYLE = process.env.GEOAPIFY_STYLE || 'osm-carto';
const PATH_COLOR = (process.env.MAP_PATH_COLOR || '#0ea5e9').replace('#', '');
const PATH_WIDTH = parseInt(process.env.MAP_PATH_WIDTH || '3', 10);
const PATH_OPACITY = parseFloat(process.env.MAP_PATH_OPACITY || '0.9');
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
const MAX_TRACK_POINTS = parseInt(process.env.MAX_TRACK_POINTS || '2000', 10);

if (!GEOAPIFY_API_KEY) {
  console.error('Error: GEOAPIFY_API_KEY environment variable is required to generate static maps.');
  console.error('Get a free API key at https://www.geoapify.com/ (3000 requests/day free tier)');
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
 * Simplify track points if needed to reduce file size
 * Uses Douglas-Peucker-like simplification by sampling
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {Array<{lat: number, lon: number}>}
 */
function simplifyTrackPoints(points) {
  if (points.length <= MAX_TRACK_POINTS) {
    return points;
  }

  const step = Math.ceil(points.length / MAX_TRACK_POINTS);
  const simplified = [];

  for (let i = 0; i < points.length; i += step) {
    simplified.push(points[i]);
  }

  // Always include the last point
  const lastPoint = points[points.length - 1];
  const lastSimplified = simplified[simplified.length - 1];
  if (lastPoint && (!lastSimplified || lastSimplified.lat !== lastPoint.lat || lastSimplified.lon !== lastPoint.lon)) {
    simplified.push(lastPoint);
  }

  return simplified;
}

/**
 * Build GeoJSON LineString from track points
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {Object|null} GeoJSON Feature
 */
function buildGeoJsonFeature(points) {
  if (!points.length) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lon, p.lat]), // GeoJSON uses [lon, lat] order
    },
    properties: {
      stroke: `#${PATH_COLOR}`,
      'stroke-width': PATH_WIDTH,
      'stroke-opacity': PATH_OPACITY,
    },
  };
}

/**
 * Generate static map using Geoapify API
 * @param {Object} geoJsonFeature - GeoJSON Feature with LineString
 * @returns {Promise<Buffer>} - Image buffer
 */
async function fetchStaticMap(geoJsonFeature) {
  const requestBody = JSON.stringify({
    style: MAP_STYLE,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    scaleFactor: MAP_SCALE_FACTOR,
    area: geoJsonFeature,
  });

  const url = `https://maps.geoapify.com/v1/staticmap?apiKey=${GEOAPIFY_API_KEY}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (response) => {
      const { statusCode } = response;

      if (!statusCode || statusCode >= 400) {
        response.resume();
        let errorBody = '';
        response.on('data', (chunk) => {
          errorBody += chunk;
        });
        response.on('end', () => {
          reject(new Error(`Geoapify API responded with ${statusCode}: ${errorBody}`));
        });
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * Generate static map image for a tour
 * @param {Object} tour - Tour object from tours.json
 * @param {string} gpxFilePath - Full path to GPX file
 */
async function generateMapImage(tour, gpxFilePath) {
  console.log(`Generating map for tour: ${tour.id}`);

  const trackPoints = parseGpxFile(gpxFilePath);

  if (trackPoints.length === 0) {
    console.warn(`  ⚠ No valid track points found in ${gpxFilePath}`);
    return;
  }

  console.log(`  📍 Parsed ${trackPoints.length} track points`);

  const simplifiedPoints = simplifyTrackPoints(trackPoints);
  if (simplifiedPoints.length < trackPoints.length) {
    console.log(`  ⚡ Simplified to ${simplifiedPoints.length} points`);
  }

  const geoJsonFeature = buildGeoJsonFeature(simplifiedPoints);

  if (!geoJsonFeature) {
    console.warn(`  ⚠ Could not create GeoJSON for ${tour.id}`);
    return;
  }

  try {
    const buffer = await fetchStaticMap(geoJsonFeature);
    const outputPath = path.join(MAP_OUTPUT_DIR, `${tour.id}.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`  ✓ Map saved: ${outputPath}`);
  } catch (error) {
    console.error(`  ✗ Error generating map for ${tour.id}:`, error.message);
  }
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
  console.log('🗺️  Generating static map images from GPX files using Geoapify...\n');

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

  console.log(`\n✅ Generated ${generated} map images`);
  console.log(`⊘ Skipped ${skipped} tours`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
