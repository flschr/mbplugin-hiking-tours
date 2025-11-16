/**
 * Tour Maps - Optimized GPX map renderer for Micro.blog Tours Plugin
 *
 * Features:
 * - Lazy loading with Intersection Observer
 * - Direction arrows along track
 * - Peak markers with deduplication
 * - Optimized performance for long tracks
 */
(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Track styling
    TRACK_COLOR: '#1d4ed8',
    TRACK_WEIGHT: 4,
    OUTLINE_COLOR: '#ffffff',
    OUTLINE_WEIGHT_OFFSET: 4,
    OUTLINE_OPACITY: 0.95,
    TRACK_OPACITY: 0.9,

    // Direction arrows
    ARROW_SPACING_METERS: 400,
    ARROW_SIZE: 14,
    ARROW_STROKE_COLOR: '#dbeafe',
    ARROW_PANE_ZINDEX: 450,
    ARROW_ZINDEX_OFFSET: -200,
    ARROW_SAMPLE_RATE: 5, // Only process every Nth point for performance

    // Endpoint markers
    ENDPOINT_SIZE: 28,
    ENDPOINT_FONT_SIZE: 14,
    ENDPOINT_BORDER_WIDTH: 3,

    // Peak markers
    PEAK_ICON_SIZE: 36,
    PEAK_ICON_ANCHOR_X: 14,
    PEAK_ICON_ANCHOR_Y: 24,
    PEAK_POPUP_ANCHOR_X: 0,
    PEAK_POPUP_ANCHOR_Y: -22,
    PEAK_SCALE_MULTIPLE: 2,
    PEAK_TEXT_FONT_SIZE: 11,
    PEAK_TEXT_Y: 11.45, // Slightly lower to keep digits visually centered in the badge
    PEAK_TEXT_COLOR: '#f97316',
    PEAK_BADGE_RADIUS: 5.2,
    PEAK_BADGE_FILL: '#ffffff',
    PEAK_BADGE_STROKE: '#ffffff',
    PEAK_BADGE_STROKE_WIDTH: 1.75,

    // Map settings
    LAYER_READY_FRAME_DELAY: 16,

    // Lazy loading
    LAZY_LOAD_MARGIN: '100px', // Load maps 100px before they enter viewport
    LAZY_LOAD_MARGIN_PX: 100, // Same as above but as number for scroll fallback

    // Peak interaction
    PEAK_POPUP_DELAY: 850, // Delay before opening popup after zoom
    PEAK_COORD_TOLERANCE: 0.00001 // Tolerance for coordinate comparison
  };

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  // Counter for unique shadow IDs (more efficient than Math.random())
  let shadowIdCounter = 0;

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate a coordinate key for deduplication
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {string} Coordinate key
   */
  function coordKey(lat, lng) {
    return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
  }

  /**
   * Validate coordinate values
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {boolean} True if coordinates are valid
   */
  function isValidCoordinate(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    return isFinite(latNum) && isFinite(lngNum) &&
           latNum >= -90 && latNum <= 90 &&
           lngNum >= -180 && lngNum <= 180;
  }

  /**
   * DOM ready helper
   */
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /**
   * HTML entity decoder using DOMParser (modern & safe)
   */
  function decodeHTMLEntities(html) {
    if (!html || html.indexOf('&') === -1) {
      return html;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return doc.documentElement.textContent || html;
    } catch (err) {
      console.warn('[Tours] Failed to decode HTML entities', err);
      return html;
    }
  }

  /**
   * Basic HTML escaper for dynamic SVG text
   */
  const HTML_ESCAPE_LOOKUP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/[&<>"]/g, ch => HTML_ESCAPE_LOOKUP[ch] || ch);
  }

  /**
   * Calculate distance between two lat/lng points
   */
  function distanceBetween(a, b) {
    if (!window.L || !a || !b) {
      return 0;
    }
    try {
      return L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
    } catch (err) {
      console.warn('[Tours] Failed to calculate distance between points', err);
      return 0;
    }
  }

  /**
   * Calculate bearing between two points
   */
  function bearingBetween(a, b) {
    if (!a || !b) {
      return 0;
    }
    const lat1 = a.lat * DEG_TO_RAD;
    const lat2 = b.lat * DEG_TO_RAD;
    const deltaLng = (b.lng - a.lng) * DEG_TO_RAD;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    const bearing = Math.atan2(y, x) * RAD_TO_DEG;
    return (bearing + 360) % 360;
  }

  /**
   * Recursively collect all LatLng points from nested arrays
   */
  function collectLatLngs(latLngs, target = []) {
    if (!latLngs) {
      return target;
    }
    if (Array.isArray(latLngs)) {
      latLngs.forEach(entry => {
        if (Array.isArray(entry)) {
          collectLatLngs(entry, target);
        } else if (entry && typeof entry.lat === 'number' && typeof entry.lng === 'number') {
          target.push(entry);
        }
      });
    }
    return target;
  }

  // ============================================================================
  // TRACK MANIPULATION
  // ============================================================================

  /**
   * Collect all polyline layers from a GPX layer
   */
  function collectTrackLines(layer) {
    const collected = [];
    if (!layer) {
      return collected;
    }

    const stack = [layer];
    while (stack.length) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      if (typeof current.getLayers === 'function') {
        const children = current.getLayers();
        if (children && children.length) {
          children.forEach(child => stack.push(child));
        }
        continue;
      }

      if (current._layers) {
        Object.keys(current._layers).forEach(key => stack.push(current._layers[key]));
        continue;
      }

      if (window.L && L.Polyline && current instanceof L.Polyline) {
        collected.push(current);
      }
    }

    return collected;
  }

  /**
   * Bring layer to back once it's rendered in DOM (simplified)
   */
  function bringLayerToBackWhenReady(layer) {
    if (!layer || typeof layer.bringToBack !== 'function') {
      return;
    }

    // Try immediately
    if (layer._path && layer._path.parentNode) {
      try {
        layer.bringToBack();
        return;
      } catch (err) {
        console.warn('[Tours] Failed to move outline behind track', err);
      }
    }

    // Fallback: Wait for next frame
    const schedule = window.requestAnimationFrame || (cb => setTimeout(cb, CONFIG.LAYER_READY_FRAME_DELAY));
    schedule(() => {
      if (layer._path && layer._path.parentNode) {
        try {
          layer.bringToBack();
        } catch (err) {
          console.warn('[Tours] Failed to move outline behind track (delayed)', err);
        }
      }
    });
  }

  /**
   * Add white outline behind track for better visibility
   */
  function addTrackOutline(lines, map, color) {
    if (!window.L || !lines || !map || !lines.length) {
      return;
    }

    lines.forEach(line => {
      if (typeof line.getLatLngs !== 'function') {
        return;
      }
      const latLngs = line.getLatLngs();
      if (!latLngs || !latLngs.length) {
        return;
      }
      const baseWeight = line.options?.weight || CONFIG.TRACK_WEIGHT;
      const outline = L.polyline(latLngs, {
        color: CONFIG.OUTLINE_COLOR,
        weight: baseWeight + CONFIG.OUTLINE_WEIGHT_OFFSET,
        opacity: CONFIG.OUTLINE_OPACITY,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
      bringLayerToBackWhenReady(outline);
      if (typeof line.setStyle === 'function') {
        line.setStyle({
          color: color,
          lineJoin: 'round',
          lineCap: 'round'
        });
      }
    });
  }

  /**
   * Zoom map to fit track bounds
   */
  function zoomTrackToMax(map, bounds) {
    if (!map || !bounds) {
      return;
    }

    // Validate bounds
    if (typeof bounds.isValid === 'function' && !bounds.isValid()) {
      console.warn('[Tours] Invalid bounds, skipping zoom');
      return;
    }

    // Ensure Leaflet knows the final canvas size before calculating zoom
    map.invalidateSize();

    let targetZoom = map.getBoundsZoom(bounds, false);
    if (typeof targetZoom !== 'number' || !isFinite(targetZoom)) {
      return;
    }

    const minZoom = typeof map.getMinZoom === 'function' ? map.getMinZoom() : map.options.minZoom;
    const maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : map.options.maxZoom;
    if (typeof minZoom === 'number' && isFinite(minZoom)) {
      targetZoom = Math.max(targetZoom, minZoom);
    }
    if (typeof maxZoom === 'number' && isFinite(maxZoom)) {
      targetZoom = Math.min(targetZoom, maxZoom);
    }

    map.setView(bounds.getCenter(), targetZoom);
  }

  // ============================================================================
  // DIRECTION ARROWS
  // ============================================================================

  /**
   * Create directional arrow icon
   */
  function createDirectionIcon(rotationDeg, color) {
    const size = CONFIG.ARROW_SIZE;
    const stroke = CONFIG.ARROW_STROKE_COLOR;
    const arrowColor = color || CONFIG.TRACK_COLOR;
    const rotation = typeof rotationDeg === 'number' && isFinite(rotationDeg) ? rotationDeg : 0;
    const svg = `<svg viewBox="0 0 32 32" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="display:block">
      <rect x="2" y="2" width="28" height="28" rx="6" ry="6" fill="#fff" stroke="${stroke}" stroke-width="2" />
      <g transform="rotate(${rotation}, 16, 16)">
        <path d="M16 6l7 10h-4.5v10h-5v-10H9z" fill="${arrowColor}" />
      </g>
    </svg>`;
    const wrapperStyles = `width:${size}px;height:${size}px`;
    return L.divIcon({
      className: '',
      html: `<div style="${wrapperStyles}">${svg}</div>`,
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
    });
  }

  /**
   * Add direction arrows along the track (optimized with sampling)
   */
  function addDirectionArrows(lines, map, color) {
    if (!window.L || !lines || !map || !lines.length) {
      return;
    }

    const arrowPaneName = 'tours-direction-arrow-pane';
    let arrowPane = map.getPane(arrowPaneName);
    if (!arrowPane) {
      arrowPane = map.createPane(arrowPaneName);
      if (arrowPane?.style) {
        arrowPane.style.zIndex = String(CONFIG.ARROW_PANE_ZINDEX);
        arrowPane.style.pointerEvents = 'none';
      }
    }

    const allTrackPoints = [];
    lines.forEach(line => {
      if (!line || typeof line.getLatLngs !== 'function') {
        return;
      }
      collectLatLngs(line.getLatLngs(), allTrackPoints);
    });

    if (allTrackPoints.length < 2) {
      return;
    }

    // Optimize for long tracks: sample points
    let sampleRate = CONFIG.ARROW_SAMPLE_RATE;
    if (allTrackPoints.length > 1000) {
      // For very long tracks, sample more aggressively
      sampleRate = Math.max(sampleRate, Math.floor(allTrackPoints.length / 200));
    }

    const trackPoints = allTrackPoints.filter((_, i) => i % sampleRate === 0);
    // Always include the last point
    if (trackPoints[trackPoints.length - 1] !== allTrackPoints[allTrackPoints.length - 1]) {
      trackPoints.push(allTrackPoints[allTrackPoints.length - 1]);
    }

    const spacing = CONFIG.ARROW_SPACING_METERS;
    let nextMarkerDistance = spacing / 2;
    let travelled = 0;

    for (let i = 1; i < trackPoints.length; i++) {
      const prev = trackPoints[i - 1];
      const current = trackPoints[i];
      const segmentDistance = distanceBetween(prev, current);
      if (!segmentDistance) {
        continue;
      }

      while (travelled + segmentDistance >= nextMarkerDistance) {
        const distanceIntoSegment = nextMarkerDistance - travelled;
        const ratio = distanceIntoSegment / segmentDistance;
        const lat = prev.lat + (current.lat - prev.lat) * ratio;
        const lng = prev.lng + (current.lng - prev.lng) * ratio;
        const bearing = bearingBetween(prev, current);
        L.marker([lat, lng], {
          interactive: false,
          pane: arrowPaneName,
          zIndexOffset: CONFIG.ARROW_ZINDEX_OFFSET,
          icon: createDirectionIcon(bearing, color)
        }).addTo(map);
        nextMarkerDistance += spacing;
      }

      travelled += segmentDistance;
    }
  }

  // ============================================================================
  // ENDPOINT MARKERS
  // ============================================================================

  /**
   * Create endpoint icon (A or B)
   */
  function createEndpointIcon(label) {
    const size = CONFIG.ENDPOINT_SIZE;
    const styles = `width: ${size}px; height: ${size}px; border-radius: ${Math.round(size / 2)}px; background: #000; color: #fff; font-weight: 700; font-size: ${CONFIG.ENDPOINT_FONT_SIZE}px; display: flex; align-items: center; justify-content: center; border: ${CONFIG.ENDPOINT_BORDER_WIDTH}px solid #fff; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45)`;
    return L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
      html: `<div style="${styles}">${label}</div>`
    });
  }

  /**
   * Add start (A) and end (B) markers
   */
  function addEndpointMarkers(lines, map) {
    if (!window.L || !lines || !map || !lines.length) {
      return;
    }

    let startLatLng = null;
    let endLatLng = null;
    lines.forEach(line => {
      if (!line || typeof line.getLatLngs !== 'function') {
        return;
      }
      const flattened = collectLatLngs(line.getLatLngs(), []);
      if (!flattened.length) {
        return;
      }
      if (!startLatLng) {
        startLatLng = flattened[0];
      }
      endLatLng = flattened[flattened.length - 1];
    });

    if (startLatLng) {
      L.marker(startLatLng, {
        icon: createEndpointIcon('A')
      }).addTo(map);
    }

    if (endLatLng) {
      L.marker(endLatLng, {
        icon: createEndpointIcon('B')
      }).addTo(map);
    }
  }

  // ============================================================================
  // PEAK MARKERS
  // ============================================================================

  /**
   * Create peak icon with number(s) - supports multiple numbers separated by pipes
   */
  function calculatePeakFontSize(numbers) {
    const baseFontSize = CONFIG.PEAK_TEXT_FONT_SIZE;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return baseFontSize;
    }

    if (numbers.length === 1) {
      const singleLength = String(numbers[0]).length;
      if (singleLength <= 2) {
        return baseFontSize;
      }
      return Math.max(7, baseFontSize - (singleLength - 2));
    }

    const sanitized = numbers
      .filter(value => typeof value !== 'undefined' && value !== null)
      .map(value => String(value));

    const charCount = sanitized.reduce((total, value) => total + value.length, 0);
    const separatorWeight = Math.max(0, numbers.length - 1) * 0.85;
    const visualCount = charCount + separatorWeight;
    const reduction = 1.5 + visualCount * 0.95;

    return Math.max(5, Math.round(baseFontSize - reduction));
  }

  function createPeakIcon(scale, numbers) {
    const baseSize = CONFIG.PEAK_ICON_SIZE;
    const size = Math.round(baseSize * scale);
    const sizeDelta = size - baseSize;
    const fontSize = calculatePeakFontSize(numbers);
    let textLengthAttr = '';
    if (Array.isArray(numbers) && numbers.length > 1) {
      const badgeDiameter = CONFIG.PEAK_BADGE_RADIUS * 2;
      const maxTextWidth = Math.max(6.5, badgeDiameter - 1.2);
      textLengthAttr = ` textLength="${maxTextWidth.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`;
    }

    // Build text content with pipes for multiple numbers
    let textElement = '';
    if (Array.isArray(numbers) && numbers.length > 0) {
      // Create text with tspan elements for numbers and pipes
      const textParts = [];
      for (let i = 0; i < numbers.length; i++) {
        textParts.push(`<tspan>${escapeHtml(numbers[i])}</tspan>`);
        if (i < numbers.length - 1) {
          // Add pipe with reduced opacity
          textParts.push('<tspan opacity="0.5">|</tspan>');
        }
      }
      textElement = `<text x="14" y="${CONFIG.PEAK_TEXT_Y}" text-anchor="middle" font-size="${fontSize}" font-family="-apple-system, BlinkMacSystemFont,'Segoe UI', sans-serif" font-weight="400" fill="${CONFIG.PEAK_TEXT_COLOR}" dominant-baseline="middle" alignment-baseline="middle"${textLengthAttr}>${textParts.join('')}</text>`;
    } else {
      // Fallback for single number (legacy support)
      const numberText = numbers ? escapeHtml(numbers) : '';
      textElement = `<text x="14" y="${CONFIG.PEAK_TEXT_Y}" text-anchor="middle" font-size="${fontSize}" font-family="-apple-system, BlinkMacSystemFont,'Segoe UI', sans-serif" font-weight="400" fill="${CONFIG.PEAK_TEXT_COLOR}" dominant-baseline="middle" alignment-baseline="middle">${numberText}</text>`;
    }

    const anchor = [
      Math.round(CONFIG.PEAK_ICON_ANCHOR_X + sizeDelta / 2),
      Math.round(CONFIG.PEAK_ICON_ANCHOR_Y + sizeDelta)
    ];
    const popupAnchor = [
      Math.round(CONFIG.PEAK_POPUP_ANCHOR_X * scale),
      Math.round(CONFIG.PEAK_POPUP_ANCHOR_Y * scale)
    ];
    const shadowId = `mbtourShadow${++shadowIdCounter}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28" fill="none">
      <defs>
        <filter id="${shadowId}" x="-30%" y="-10%" width="160%" height="160%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#000" flood-opacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#${shadowId})">
        <path d="M14 2C9.029 2 5 6.029 5 11c0 6.363 7.156 14.482 8.115 15.51a1.2 1.2 0 0 0 1.77 0C15.844 25.482 23 17.363 23 11c0-4.97-4.029-9-9-9Zm0 6.5A2.5 2.5 0 1 1 11.5 11 2.5 2.5 0 0 1 14 8.5Z" fill="#f97316" stroke="#ffffff" stroke-width="2" />
        <circle cx="14" cy="11" r="${CONFIG.PEAK_BADGE_RADIUS}" fill="${CONFIG.PEAK_BADGE_FILL}" stroke="${CONFIG.PEAK_BADGE_STROKE}" stroke-width="${CONFIG.PEAK_BADGE_STROKE_WIDTH}" />
        ${textElement}
      </g>
    </svg>`;
    return L.divIcon({
      className: 'mbtour-peak-icon',
      iconSize: [size, size],
      iconAnchor: anchor,
      popupAnchor: popupAnchor,
      html: svg
    });
  }

  /**
   * Add peak markers to map
   */
  function addPeakMarkers(canvas, map) {
    const peaksRaw = canvas.getAttribute('data-peaks');
    if (!peaksRaw) {
      return;
    }

    try {
      const decoded = decodeHTMLEntities(peaksRaw);
      const peaks = JSON.parse(decoded);

      // Initialize marker registry for this canvas
      const markerMap = new Map();
      peakMarkerRegistry.set(canvas, markerMap);

      // Deduplicate peaks by coordinates, collecting all numbers
      const peakIndex = Object.create(null);
      peaks.forEach(peak => {
        if (!peak || !peak.lat || !peak.lng) {
          return;
        }
        const lat = parseFloat(peak.lat);
        const lng = parseFloat(peak.lng);

        // Use helper function for validation
        if (!isValidCoordinate(lat, lng)) {
          console.warn('[Tours] Invalid coordinates for peak:', peak.label, lat, lng);
          return;
        }

        const key = coordKey(lat, lng);
        if (!peakIndex[key]) {
          peakIndex[key] = {
            lat: lat,
            lng: lng,
            label: peak.label,
            numbers: [],
            count: 0
          };
        }
        peakIndex[key].numbers.push(peak.number || 0);
        peakIndex[key].count += 1;
      });

      // Add markers and register them for O(1) lookup
      Object.keys(peakIndex).forEach(key => {
        const info = peakIndex[key];
        const iconScale = info.count > 1 ? CONFIG.PEAK_SCALE_MULTIPLE : 1;
        const marker = L.marker([info.lat, info.lng], {
          icon: createPeakIcon(iconScale, info.numbers)
        });
        if (info.label) {
          marker.bindPopup(info.label);
        }
        marker.addTo(map);

        // Register marker for fast lookup (O(1) instead of O(n))
        markerMap.set(key, marker);
      });
    } catch (err) {
      console.error('[Tours] Failed to parse peak data', err);
    }
  }

  // ============================================================================
  // MAP INITIALIZATION
  // ============================================================================

  /**
   * WeakMap to track initialized maps (prevents race conditions)
   */
  const initializedMaps = new WeakMap();

  /**
   * Peak marker registry for O(1) lookup during peak click interactions
   * Structure: WeakMap<canvas, Map<coordKey, marker>>
   */
  const peakMarkerRegistry = new WeakMap();

  /**
   * Validate GPX URL to prevent potential XSS
   */
  function isValidGpxUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    // Allow relative URLs and http/https protocols only
    const trimmed = url.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return true;
    }
    try {
      const parsed = new URL(trimmed, window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (err) {
      return false;
    }
  }

  /**
   * Initialize a single map
   */
  function initMap(canvas) {
    if (!window.L || !canvas) {
      return;
    }

    // Use WeakMap to prevent race conditions and double initialization
    if (initializedMaps.has(canvas)) {
      return;
    }
    initializedMaps.set(canvas, true);

    const gpxUrl = canvas.getAttribute('data-gpx');
    if (!gpxUrl || !isValidGpxUrl(gpxUrl)) {
      if (gpxUrl) {
        console.warn('[Tours] Invalid GPX URL:', gpxUrl);
      }
      return;
    }

    const map = L.map(canvas, {
      scrollWheelZoom: false,
      tap: false
    });

    // Check for MapTiler API key, fallback to OpenTopoMap
    const maptilerKey = canvas.getAttribute('data-maptiler-key');
    if (maptilerKey && maptilerKey.trim() !== '') {
      // Use MapTiler Outdoor v2 with high-res tiles
      L.tileLayer(`https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${encodeURIComponent(maptilerKey)}`, {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
    } else {
      // Fallback to OpenTopoMap
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
      }).addTo(map);
    }

    const trackColor = CONFIG.TRACK_COLOR;
    new L.GPX(gpxUrl, {
      async: true,
      marker_options: {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null
      },
      polyline_options: {
        color: trackColor,
        weight: CONFIG.TRACK_WEIGHT,
        opacity: CONFIG.TRACK_OPACITY,
        lineJoin: 'round',
        lineCap: 'round'
      }
    })
    .on('loaded', e => {
      const bounds = e.target.getBounds();
      if (bounds) {
        zoomTrackToMax(map, bounds);
        // Register map with default bounds for peak click interaction
        registerMap(canvas, map, bounds);
      }

      // Collect track lines once and reuse (performance optimization)
      const trackLines = collectTrackLines(e.target);
      if (trackLines.length) {
        addTrackOutline(trackLines, map, trackColor);
        addDirectionArrows(trackLines, map, trackColor);
        addEndpointMarkers(trackLines, map);
      }

      addPeakMarkers(canvas, map);
    })
    .on('error', err => {
      console.error('[Tours] Failed to load GPX file:', gpxUrl, err);
      // Optional: Show error message to user
      canvas.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Failed to load tour map</div>';
    })
    .addTo(map);
  }

  // ============================================================================
  // LAZY LOADING WITH INTERSECTION OBSERVER
  // ============================================================================

  /**
   * Scroll-based lazy loading fallback for older browsers
   */
  function initScrollFallback(canvases) {
    let pending = Array.from(canvases);

    function checkVisibility() {
      pending = pending.filter(canvas => {
        if (initializedMaps.has(canvas)) {
          return false;
        }
        const rect = canvas.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const margin = CONFIG.LAZY_LOAD_MARGIN_PX;
        if (rect.top < viewportHeight + margin && rect.bottom > -margin) {
          initMap(canvas);
          return false;
        }
        return true;
      });

      // Remove listeners if all maps are initialized
      if (!pending.length) {
        window.removeEventListener('scroll', checkVisibility);
        window.removeEventListener('resize', checkVisibility);
      }
    }

    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', checkVisibility, { passive: true });
    checkVisibility(); // Initial check
  }

  /**
   * Initialize maps with lazy loading
   */
  function initMapsWithLazyLoading() {
    const canvases = document.querySelectorAll('[data-tour-map]');
    if (!canvases.length) {
      return;
    }

    // Check if Intersection Observer is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: scroll-based lazy loading
      initScrollFallback(canvases);
      return;
    }

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !initializedMaps.has(entry.target)) {
          initMap(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: CONFIG.LAZY_LOAD_MARGIN
    });

    canvases.forEach(canvas => observer.observe(canvas));
  }

  // ============================================================================
  // PEAK CLICK INTERACTION
  // ============================================================================

  /**
   * Store map instances and their state
   */
  const mapRegistry = new WeakMap();

  /**
   * Register a map with its default bounds
   */
  function registerMap(canvas, map, bounds) {
    if (!canvas || !map) {
      return;
    }
    mapRegistry.set(canvas, {
      map: map,
      defaultBounds: bounds,
      currentPeak: null
    });
  }

  /**
   * Handle peak click to zoom to peak or return to default view
   * OPTIMIZED: Uses peakMarkerRegistry for O(1) lookup instead of O(n) layer iteration
   */
  function handlePeakClick(event) {
    const peakElement = event.target;
    if (!peakElement?.classList.contains('peak-name')) {
      return;
    }

    const lat = parseFloat(peakElement.getAttribute('data-peak-lat'));
    const lng = parseFloat(peakElement.getAttribute('data-peak-lng'));

    if (!isValidCoordinate(lat, lng)) {
      return;
    }

    // Find the tour entry container
    const tourEntry = peakElement.closest('.tour-entry');
    if (!tourEntry) {
      return;
    }

    // Find the map canvas
    const mapCanvas = tourEntry.querySelector('[data-tour-map]');
    if (!mapCanvas) {
      return;
    }

    const mapState = mapRegistry.get(mapCanvas);
    if (!mapState?.map) {
      return;
    }

    const map = mapState.map;
    const peakLatLng = L.latLng(lat, lng);
    const peakKey = coordKey(lat, lng);

    // Check if clicking the same peak again
    if (mapState.currentPeak === peakKey) {
      // Return to default view
      if (mapState.defaultBounds) {
        map.flyToBounds(mapState.defaultBounds, {
          duration: 0.8,
          easeLinearity: 0.25
        });
      }
      mapState.currentPeak = null;

      // Close any open popups
      map.closePopup();
    } else {
      // Zoom to peak
      const maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : map.options.maxZoom || 18;
      map.flyTo(peakLatLng, maxZoom, {
        duration: 0.8,
        easeLinearity: 0.25
      });
      mapState.currentPeak = peakKey;

      // OPTIMIZED: O(1) lookup instead of O(n) layer iteration
      const markerMap = peakMarkerRegistry.get(mapCanvas);
      if (markerMap) {
        const marker = markerMap.get(peakKey);
        if (marker?.getPopup?.()) {
          setTimeout(() => {
            marker.openPopup();
          }, CONFIG.PEAK_POPUP_DELAY);
        }
      }
    }
  }

  /**
   * Initialize peak click handlers
   */
  let peakClickHandlerRegistered = false;

  function initPeakClickHandlers() {
    // Prevent duplicate event listeners (memory leak prevention)
    if (peakClickHandlerRegistered) {
      return;
    }
    // Use event delegation for better performance
    document.addEventListener('click', handlePeakClick);
    peakClickHandlerRegistered = true;
  }

  /**
   * Cleanup function for removing event listeners (useful for SPAs)
   * Call this if you need to teardown the tours plugin
   */
  function cleanup() {
    if (peakClickHandlerRegistered) {
      document.removeEventListener('click', handlePeakClick);
      peakClickHandlerRegistered = false;
    }
  }

  // Expose cleanup function for external use if needed
  if (typeof window !== 'undefined') {
    window.ToursPluginCleanup = cleanup;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  ready(() => {
    initMapsWithLazyLoading();
    initPeakClickHandlers();
  });

})();
