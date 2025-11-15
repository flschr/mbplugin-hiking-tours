#!/usr/bin/env node

/**
 * Tour Shortcode Parser for Micro.blog Backup Repos
 *
 * Scans all markdown files in the backup repo for {{< tour ... >}} shortcodes,
 * extracts parameters, validates required fields, and generates a consolidated
 * tours.json file for the plugin.
 *
 * Required environment variables (or use defaults):
 * - BLOG_BASE_URL: Base URL for post_url reconstruction (e.g., https://fischr.org)
 * - CONTENT_DIR: Directory containing markdown files (default: ./content/posts)
 *
 * Output: tours.json in the current directory
 */

const fs = require('fs');
const path = require('path');

// Configuration from environment variables or defaults
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || 'https://fischr.org';
const CONTENT_DIR = process.env.CONTENT_DIR || './content/posts';

// Statistics
const stats = {
  filesScanned: 0,
  toursFound: 0,
  toursSkipped: 0,
  errors: []
};

/**
 * Recursively finds all markdown files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} fileList - Accumulated file list
 * @returns {string[]} - Array of file paths
 */
function findMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directory not found: ${dir}`);
    return fileList;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findMarkdownFiles(filePath, fileList);
    } else if (file.match(/\.(md|markdown)$/i)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Extracts frontmatter and content from a markdown file
 * @param {string} content - File content
 * @returns {object} - { frontmatter, content }
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const frontmatterText = match[1];
  const bodyContent = match[2];

  // Simple YAML parser for common fields
  const frontmatter = {};
  frontmatterText.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Remove quotes
      value = value.replace(/^["']|["']$/g, '');

      frontmatter[key] = value;
    }
  });

  return { frontmatter, content: bodyContent };
}

/**
 * Reconstructs a post URL from file path and frontmatter
 * @param {string} filePath - Path to the markdown file
 * @param {object} frontmatter - Parsed frontmatter
 * @returns {string} - Reconstructed URL or empty string
 */
function reconstructPostUrl(filePath, frontmatter) {
  // Check if frontmatter has explicit URL or permalink
  if (frontmatter.url) {
    return frontmatter.url.startsWith('http')
      ? frontmatter.url
      : `${BLOG_BASE_URL}${frontmatter.url}`;
  }

  if (frontmatter.permalink) {
    return frontmatter.permalink.startsWith('http')
      ? frontmatter.permalink
      : `${BLOG_BASE_URL}${frontmatter.permalink}`;
  }

  // Try to reconstruct from file path
  // Expected structure: content/posts/YYYY/MM/DD/post-slug.md
  // or: content/posts/YYYY/MM/post-slug.md
  // or: content/posts/post-slug.md

  const pathParts = filePath.split(path.sep);
  const fileName = path.basename(filePath, path.extname(filePath));

  // Look for date components in path or frontmatter
  let year, month, day, slug;

  // Try to extract from path (e.g., posts/2025/11/07/drei-gipfel.md)
  const dateMatch = filePath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (dateMatch) {
    year = dateMatch[1];
    month = dateMatch[2];
    day = dateMatch[3];
    slug = fileName;
  } else {
    // Try from frontmatter date
    if (frontmatter.date) {
      const dateParts = frontmatter.date.split(/[-T\s]/);
      if (dateParts.length >= 3) {
        year = dateParts[0];
        month = dateParts[1];
        day = dateParts[2];
      }
    }

    slug = frontmatter.slug || fileName;
  }

  // If we have date components, construct URL
  if (year && month && day && slug) {
    return `${BLOG_BASE_URL}/${year}/${month}/${day}/${slug}/`;
  }

  // Fallback: just use slug
  if (slug) {
    return `${BLOG_BASE_URL}/${slug}/`;
  }

  // Give up - return empty string
  return '';
}

/**
 * Extracts parameters from a tour shortcode
 * @param {string} shortcodeContent - Content between {{< tour and >}}
 * @returns {object} - Parsed parameters
 */
function parseShortcodeParams(shortcodeContent) {
  const params = {};

  // Regex to match param="value" or param='value'
  const paramRegex = /(\w+)\s*=\s*["']([^"']*)["']/g;

  let match;
  while ((match = paramRegex.exec(shortcodeContent)) !== null) {
    const key = match[1];
    const value = match[2];
    params[key] = value;
  }

  return params;
}

/**
 * Validates and normalizes a tour object
 * @param {object} tour - Raw tour data
 * @param {string} filePath - Source file path
 * @returns {object|null} - Validated tour or null if invalid
 */
function validateTour(tour, filePath) {
  const required = ['id', 'title', 'date', 'type', 'distance_km', 'elevation_m', 'gpx'];

  // Check required fields
  for (const field of required) {
    if (!tour[field] || tour[field].trim() === '') {
      stats.errors.push(`Missing required field "${field}" in ${filePath}`);
      return null;
    }
  }

  // Normalize and validate types
  const normalized = {
    id: tour.id.trim(),
    title: tour.title.trim(),
    date: tour.date.trim(),
    year: parseInt(tour.date.split('-')[0], 10),
    type: tour.type.trim().toLowerCase(),
    gpx: tour.gpx.trim(),
    post_url: tour.post_url || '',
  };

  // Optional fields
  if (tour.region) normalized.region = tour.region.trim();
  if (tour.cover_image) normalized.cover_image = tour.cover_image.trim();
  if (tour.bergfex_url) normalized.bergfex_url = tour.bergfex_url.trim();
  if (tour.peaks) {
    const peaksTrimmed = tour.peaks.trim();
    if (peaksTrimmed) {
      normalized.peaks = peaksTrimmed;
    }
  }

  // Numeric fields with validation
  const distanceKm = parseFloat(tour.distance_km);
  if (isNaN(distanceKm) || distanceKm <= 0) {
    stats.errors.push(`Invalid distance_km in ${filePath}: ${tour.distance_km}`);
    return null;
  }
  normalized.distance_km = distanceKm;

  const elevationM = parseInt(tour.elevation_m, 10);
  if (isNaN(elevationM) || elevationM < 0) {
    stats.errors.push(`Invalid elevation_m in ${filePath}: ${tour.elevation_m}`);
    return null;
  }
  normalized.elevation_m = elevationM;

  // Optional numeric fields
  if (tour.duration_h) {
    const durationH = parseFloat(tour.duration_h);
    if (!isNaN(durationH) && durationH > 0) {
      normalized.duration_h = durationH;
    }
  }

  // Accept both max_height (from shortcode) and max_alt_m (legacy)
  const maxHeightValue = tour.max_height || tour.max_alt_m;
  if (maxHeightValue) {
    const maxAlt = parseInt(maxHeightValue, 10);
    if (!isNaN(maxAlt)) {
      normalized.max_alt_m = maxAlt;
    }
  }

  if (tour.min_alt_m) {
    const minAlt = parseInt(tour.min_alt_m, 10);
    if (!isNaN(minAlt)) {
      normalized.min_alt_m = minAlt;
    }
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) {
    stats.errors.push(`Invalid date format in ${filePath}: ${normalized.date} (expected YYYY-MM-DD)`);
    return null;
  }

  // Validate type
  const validTypes = ['hike', 'mtb', 'gravel', 'run', 'other'];
  if (!validTypes.includes(normalized.type)) {
    console.warn(`⚠️  Unknown tour type "${normalized.type}" in ${filePath} (keeping anyway)`);
  }

  return normalized;
}

/**
 * Parses a single markdown file for tour shortcodes
 * @param {string} filePath - Path to markdown file
 * @returns {object[]} - Array of tour objects
 */
function parseFile(filePath) {
  const tours = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    stats.filesScanned++;

    // Parse frontmatter
    const { frontmatter, content: bodyContent } = parseFrontmatter(content);

    // Find all tour shortcodes
    // Regex pattern: {{< tour ... >}} or {{% tour ... %}}
    const shortcodeRegex = /\{\{[<%]\s*tour([\s\S]*?)[>%]\}\}/g;

    let match;
    while ((match = shortcodeRegex.exec(bodyContent)) !== null) {
      const shortcodeContent = match[1];
      const params = parseShortcodeParams(shortcodeContent);

      // Reconstruct post URL
      params.post_url = reconstructPostUrl(filePath, frontmatter);

      // Validate and normalize
      const tour = validateTour(params, filePath);

      if (tour) {
        tours.push(tour);
        stats.toursFound++;
      } else {
        stats.toursSkipped++;
      }
    }
  } catch (error) {
    stats.errors.push(`Error reading ${filePath}: ${error.message}`);
  }

  return tours;
}

/**
 * Main execution function
 */
function main() {
  console.log('🔍 Tour Shortcode Parser');
  console.log('========================\n');

  console.log(`📂 Scanning directory: ${CONTENT_DIR}`);
  console.log(`🌐 Base URL: ${BLOG_BASE_URL}\n`);

  // Find all markdown files
  const markdownFiles = findMarkdownFiles(CONTENT_DIR);

  if (markdownFiles.length === 0) {
    console.log('⚠️  No markdown files found. Trying alternative locations...\n');

    // Try common alternative locations
    const alternatives = ['./posts', './content', '.'];
    for (const alt of alternatives) {
      if (fs.existsSync(alt)) {
        console.log(`   Trying: ${alt}`);
        const altFiles = findMarkdownFiles(alt);
        if (altFiles.length > 0) {
          markdownFiles.push(...altFiles);
          break;
        }
      }
    }
  }

  console.log(`📄 Found ${markdownFiles.length} markdown files\n`);

  // Parse all files
  const allTours = [];

  markdownFiles.forEach(filePath => {
    const tours = parseFile(filePath);
    allTours.push(...tours);
  });

  // Sort tours by date (descending)
  allTours.sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return 0;
  });

  // Write output
  const outputPath = 'tours.json';
  fs.writeFileSync(outputPath, JSON.stringify(allTours, null, 2), 'utf8');

  // Print statistics
  console.log('📊 Statistics');
  console.log('=============');
  console.log(`Files scanned:  ${stats.filesScanned}`);
  console.log(`Tours found:    ${stats.toursFound}`);
  console.log(`Tours skipped:  ${stats.toursSkipped}`);
  console.log(`Errors:         ${stats.errors.length}\n`);

  if (stats.errors.length > 0) {
    console.log('⚠️  Errors:');
    stats.errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }

  console.log(`✅ Generated ${outputPath} with ${allTours.length} tours`);

  // Exit with error if no tours found
  if (allTours.length === 0) {
    console.error('\n❌ No valid tours found!');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { parseFile, validateTour, findMarkdownFiles };
