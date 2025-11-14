#!/usr/bin/env node

/**
 * Generate Static Map Images from GPX Files
 *
 * This script:
 * 1. Finds all GPX files referenced in tours.json
 * 2. Generates static map images (PNG) with the GPX track rendered
 * 3. Saves images to static/maps/ directory in the plugin repo
 *
 * Uses staticmaps package to generate images without external API keys.
 */

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('xmldom');
const StaticMaps = require('staticmaps');

// Configuration
const PLUGIN_REPO_DIR = process.env.PLUGIN_REPO_DIR || './mbplugin-fischr-tours';
const TOURS_JSON = './tours.json';
const MAP_OUTPUT_DIR = path.join(PLUGIN_REPO_DIR, 'static', 'maps');
const MAP_WIDTH = 800;
const MAP_HEIGHT = 400;

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

      if (!isNaN(lat) && !isNaN(lon)) {
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
 * Generate static map image for a tour
 * @param {Object} tour - Tour object from tours.json
 * @param {string} gpxFilePath - Full path to GPX file
 */
async function generateMapImage(tour, gpxFilePath) {
  console.log(`Generating map for tour: ${tour.id}`);

  // Parse GPX
  const trackPoints = parseGpxFile(gpxFilePath);

  if (trackPoints.length === 0) {
    console.warn(`No valid track points found in ${gpxFilePath}`);
    return;
  }

  // Sample points to avoid too many (keep every 5th point for performance)
  const sampledPoints = trackPoints.filter((_, index) => index % 5 === 0);

  // Create map
  const options = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    paddingX: 20,
    paddingY: 20,
  };

  const map = new StaticMaps(options);

  // Add polyline (track)
  const line = {
    coords: sampledPoints.map(p => [p.lon, p.lat]), // [lon, lat] format
    color: '#0066cc',
    width: 3,
  };

  map.addLine(line);

  // Generate image
  try {
    await map.render();

    // Save image
    const outputPath = path.join(MAP_OUTPUT_DIR, `${tour.id}.png`);
    await map.image.save(outputPath);

    console.log(`✓ Map saved: ${outputPath}`);
  } catch (error) {
    console.error(`Error generating map for ${tour.id}:`, error.message);
  }
}

/**
 * Resolve GPX file path
 * @param {string} gpxPath - GPX path from tour (e.g., "/uploads/2025/tour.gpx")
 * @returns {string|null} - Resolved file path or null
 */
function resolveGpxPath(gpxPath) {
  // Try common locations
  const possiblePaths = [
    gpxPath, // Absolute path
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

  // Ensure output directory exists
  if (!fs.existsSync(MAP_OUTPUT_DIR)) {
    fs.mkdirSync(MAP_OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${MAP_OUTPUT_DIR}\n`);
  }

  // Read tours.json
  if (!fs.existsSync(TOURS_JSON)) {
    console.error(`Error: ${TOURS_JSON} not found`);
    console.log('Run parse-tours.js first to generate tours.json');
    process.exit(1);
  }

  const toursData = JSON.parse(fs.readFileSync(TOURS_JSON, 'utf-8'));
  const tours = toursData.tours || [];

  console.log(`Found ${tours.length} tours\n`);

  // Generate map for each tour with GPX
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

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
