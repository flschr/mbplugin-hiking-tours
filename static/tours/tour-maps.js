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

  var CONFIG = {
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
    LAZY_LOAD_MARGIN: '100px' // Load maps 100px before they enter viewport
  };

  // ============================================================================
  // UTILITIES
  // ============================================================================

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
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      return doc.documentElement.textContent || html;
    } catch (err) {
      console.warn('[Tours] Failed to decode HTML entities', err);
      return html;
    }
  }

  /**
   * Basic HTML escaper for dynamic SVG text
   */
  var HTML_ESCAPE_LOOKUP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/[&<>"]/g, function(ch) {
      return HTML_ESCAPE_LOOKUP[ch] || ch;
    });
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
    var lat1 = a.lat * Math.PI / 180;
    var lat2 = b.lat * Math.PI / 180;
    var deltaLng = (b.lng - a.lng) * Math.PI / 180;
    var y = Math.sin(deltaLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    var bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Recursively collect all LatLng points from nested arrays
   */
  function collectLatLngs(latLngs, target) {
    target = target || [];
    if (!latLngs) {
      return target;
    }
    if (Array.isArray(latLngs)) {
      latLngs.forEach(function(entry) {
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
    var collected = [];
    if (!layer) {
      return collected;
    }

    var stack = [layer];
    while (stack.length) {
      var current = stack.pop();
      if (!current) {
        continue;
      }

      if (typeof current.getLayers === 'function') {
        var children = current.getLayers();
        if (children && children.length) {
          children.forEach(function(child) {
            stack.push(child);
          });
        }
        continue;
      }

      if (current._layers) {
        Object.keys(current._layers).forEach(function(key) {
          stack.push(current._layers[key]);
        });
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
    var schedule = window.requestAnimationFrame || function(cb) {
      return setTimeout(cb, CONFIG.LAYER_READY_FRAME_DELAY);
    };
    schedule(function() {
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

    lines.forEach(function(line) {
      if (typeof line.getLatLngs !== 'function') {
        return;
      }
      var latLngs = line.getLatLngs();
      if (!latLngs || !latLngs.length) {
        return;
      }
      var baseWeight = CONFIG.TRACK_WEIGHT;
      if (line.options && line.options.weight) {
        baseWeight = line.options.weight;
      }
      var outline = L.polyline(latLngs, {
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

    var targetZoom = map.getBoundsZoom(bounds, false);
    if (typeof targetZoom !== 'number' || !isFinite(targetZoom)) {
      return;
    }

    var minZoom = typeof map.getMinZoom === 'function' ? map.getMinZoom() : map.options.minZoom;
    var maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : map.options.maxZoom;
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
    var size = CONFIG.ARROW_SIZE;
    var stroke = CONFIG.ARROW_STROKE_COLOR;
    var arrowColor = color || CONFIG.TRACK_COLOR;
    var rotation = typeof rotationDeg === 'number' && isFinite(rotationDeg) ? rotationDeg : 0;
    var svg = [
      '<svg viewBox="0 0 32 32" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg" style="display:block">',
      '<rect x="2" y="2" width="28" height="28" rx="6" ry="6" fill="#fff" stroke="' + stroke + '" stroke-width="2" />',
      '<g transform="rotate(' + rotation + ', 16, 16)">',
      '<path d="M16 6l7 10h-4.5v10h-5v-10H9z" fill="' + arrowColor + '" />',
      '</g>',
      '</svg>'
    ].join('');
    var wrapperStyles = [
      'width:' + size + 'px',
      'height:' + size + 'px'
    ].join(';');
    return L.divIcon({
      className: '',
      html: '<div style="' + wrapperStyles + '">' + svg + '</div>',
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

    var arrowPaneName = 'tours-direction-arrow-pane';
    var arrowPane = map.getPane(arrowPaneName);
    if (!arrowPane) {
      arrowPane = map.createPane(arrowPaneName);
      if (arrowPane && arrowPane.style) {
        arrowPane.style.zIndex = String(CONFIG.ARROW_PANE_ZINDEX);
        arrowPane.style.pointerEvents = 'none';
      }
    }

    var allTrackPoints = [];
    lines.forEach(function(line) {
      if (!line || typeof line.getLatLngs !== 'function') {
        return;
      }
      collectLatLngs(line.getLatLngs(), allTrackPoints);
    });

    if (allTrackPoints.length < 2) {
      return;
    }

    // Optimize for long tracks: sample points
    var trackPoints = [];
    var sampleRate = CONFIG.ARROW_SAMPLE_RATE;
    if (allTrackPoints.length > 1000) {
      // For very long tracks, sample more aggressively
      sampleRate = Math.max(sampleRate, Math.floor(allTrackPoints.length / 200));
    }
    for (var i = 0; i < allTrackPoints.length; i += sampleRate) {
      trackPoints.push(allTrackPoints[i]);
    }
    // Always include the last point
    if (trackPoints[trackPoints.length - 1] !== allTrackPoints[allTrackPoints.length - 1]) {
      trackPoints.push(allTrackPoints[allTrackPoints.length - 1]);
    }

    var spacing = CONFIG.ARROW_SPACING_METERS;
    var nextMarkerDistance = spacing / 2;
    var travelled = 0;

    for (var i = 1; i < trackPoints.length; i += 1) {
      var prev = trackPoints[i - 1];
      var current = trackPoints[i];
      var segmentDistance = distanceBetween(prev, current);
      if (!segmentDistance) {
        continue;
      }

      while (travelled + segmentDistance >= nextMarkerDistance) {
        var distanceIntoSegment = nextMarkerDistance - travelled;
        var ratio = distanceIntoSegment / segmentDistance;
        var lat = prev.lat + (current.lat - prev.lat) * ratio;
        var lng = prev.lng + (current.lng - prev.lng) * ratio;
        var bearing = bearingBetween(prev, current);
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
    var size = CONFIG.ENDPOINT_SIZE;
    var styles = [
      'width: ' + size + 'px',
      'height: ' + size + 'px',
      'border-radius: ' + Math.round(size / 2) + 'px',
      'background: #000',
      'color: #fff',
      'font-weight: 700',
      'font-size: ' + CONFIG.ENDPOINT_FONT_SIZE + 'px',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'border: ' + CONFIG.ENDPOINT_BORDER_WIDTH + 'px solid #fff',
      'box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45)'
    ].join('; ');
    return L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
      html: '<div style="' + styles + '">' + label + '</div>'
    });
  }

  /**
   * Add start (A) and end (B) markers
   */
  function addEndpointMarkers(lines, map) {
    if (!window.L || !lines || !map || !lines.length) {
      return;
    }

    var startLatLng = null;
    var endLatLng = null;
    lines.forEach(function(line) {
      if (!line || typeof line.getLatLngs !== 'function') {
        return;
      }
      var flattened = collectLatLngs(line.getLatLngs(), []);
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
    var baseFontSize = CONFIG.PEAK_TEXT_FONT_SIZE;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return baseFontSize;
    }

    if (numbers.length === 1) {
      var singleLength = String(numbers[0]).length;
      if (singleLength <= 2) {
        return baseFontSize;
      }
      return Math.max(7, baseFontSize - (singleLength - 2));
    }

    var sanitized = numbers
      .filter(function(value) { return typeof value !== 'undefined' && value !== null; })
      .map(function(value) { return String(value); });

    var charCount = sanitized.reduce(function(total, value) {
      return total + value.length;
    }, 0);
    var separatorWeight = Math.max(0, numbers.length - 1) * 0.85;
    var visualCount = charCount + separatorWeight;
    var reduction = 1.5 + visualCount * 0.95;

    return Math.max(5, Math.round(baseFontSize - reduction));
  }

  function createPeakIcon(scale, numbers) {
    var baseSize = CONFIG.PEAK_ICON_SIZE;
    var size = Math.round(baseSize * scale);
    var sizeDelta = size - baseSize;
    var fontSize = calculatePeakFontSize(numbers);
    var textLengthAttr = '';
    if (Array.isArray(numbers) && numbers.length > 1) {
      var badgeDiameter = CONFIG.PEAK_BADGE_RADIUS * 2;
      var maxTextWidth = Math.max(6.5, badgeDiameter - 1.2);
      textLengthAttr = ' textLength="' + maxTextWidth.toFixed(2) + '" lengthAdjust="spacingAndGlyphs"';
    }

    // Build text content with pipes for multiple numbers
    var textElement = '';
    if (Array.isArray(numbers) && numbers.length > 0) {
      // Create text with tspan elements for numbers and pipes
      var textParts = [];
      for (var i = 0; i < numbers.length; i++) {
        textParts.push('<tspan>' + escapeHtml(numbers[i]) + '</tspan>');
        if (i < numbers.length - 1) {
          // Add pipe with reduced opacity
          textParts.push('<tspan opacity="0.5">|</tspan>');
        }
      }
      textElement = '<text x="14" y="' + CONFIG.PEAK_TEXT_Y + '" text-anchor="middle" font-size="' + fontSize + '" font-family="-apple-system, BlinkMacSystemFont,\"Segoe UI\", sans-serif" font-weight="400" fill="' + CONFIG.PEAK_TEXT_COLOR + '" dominant-baseline="middle" alignment-baseline="middle"' + textLengthAttr + '>' + textParts.join('') + '</text>';
    } else {
      // Fallback for single number (legacy support)
      var numberText = numbers ? escapeHtml(numbers) : '';
      textElement = '<text x="14" y="' + CONFIG.PEAK_TEXT_Y + '" text-anchor="middle" font-size="' + fontSize + '" font-family="-apple-system, BlinkMacSystemFont,\"Segoe UI\", sans-serif" font-weight="400" fill="' + CONFIG.PEAK_TEXT_COLOR + '" dominant-baseline="middle" alignment-baseline="middle">' + numberText + '</text>';
    }

    var anchor = [
      Math.round(CONFIG.PEAK_ICON_ANCHOR_X + sizeDelta / 2),
      Math.round(CONFIG.PEAK_ICON_ANCHOR_Y + sizeDelta)
    ];
    var popupAnchor = [
      Math.round(CONFIG.PEAK_POPUP_ANCHOR_X * scale),
      Math.round(CONFIG.PEAK_POPUP_ANCHOR_Y * scale)
    ];
    var shadowId = 'mbtourShadow' + Math.random().toString(36).slice(2, 8);
    var svg = '' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 28 28" fill="none">' +
      '<defs>' +
      '<filter id="' + shadowId + '" x="-30%" y="-10%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
      '<feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#000" flood-opacity="0.35" />' +
      '</filter>' +
      '</defs>' +
      '<g filter="url(#' + shadowId + ')">' +
      '<path d="M14 2C9.029 2 5 6.029 5 11c0 6.363 7.156 14.482 8.115 15.51a1.2 1.2 0 0 0 1.77 0C15.844 25.482 23 17.363 23 11c0-4.97-4.029-9-9-9Zm0 6.5A2.5 2.5 0 1 1 11.5 11 2.5 2.5 0 0 1 14 8.5Z" fill="#f97316" stroke="#ffffff" stroke-width="2" />' +
      '<circle cx="14" cy="11" r="' + CONFIG.PEAK_BADGE_RADIUS + '" fill="' + CONFIG.PEAK_BADGE_FILL + '" stroke="' + CONFIG.PEAK_BADGE_STROKE + '" stroke-width="' + CONFIG.PEAK_BADGE_STROKE_WIDTH + '" />' +
      textElement +
      '</g>' +
      '</svg>';
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
    var peaksRaw = canvas.getAttribute('data-peaks');
    if (!peaksRaw) {
      return;
    }

    try {
      var decoded = decodeHTMLEntities(peaksRaw);
      var peaks = JSON.parse(decoded);

      // Deduplicate peaks by coordinates, collecting all numbers
      var peakIndex = Object.create(null);
      peaks.forEach(function(peak) {
        if (!peak || !peak.lat || !peak.lng) {
          return;
        }
        var lat = parseFloat(peak.lat);
        var lng = parseFloat(peak.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          return;
        }
        // Validate coordinate ranges
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn('[Tours] Invalid coordinates for peak:', peak.label, lat, lng);
          return;
        }
        var key = lat.toFixed(6) + ':' + lng.toFixed(6);
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

      // Add markers
      Object.keys(peakIndex).forEach(function(key) {
        var info = peakIndex[key];
        var iconScale = info.count > 1 ? CONFIG.PEAK_SCALE_MULTIPLE : 1;
        var marker = L.marker([info.lat, info.lng], {
          icon: createPeakIcon(iconScale, info.numbers)
        });
        if (info.label) {
          marker.bindPopup(info.label);
        }
        marker.addTo(map);
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
  var initializedMaps = new WeakMap();

  /**
   * Validate GPX URL to prevent potential XSS
   */
  function isValidGpxUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    // Allow relative URLs and http/https protocols only
    var trimmed = url.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return true;
    }
    try {
      var parsed = new URL(trimmed, window.location.href);
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

    var gpxUrl = canvas.getAttribute('data-gpx');
    if (!gpxUrl || !isValidGpxUrl(gpxUrl)) {
      if (gpxUrl) {
        console.warn('[Tours] Invalid GPX URL:', gpxUrl);
      }
      return;
    }

    var map = L.map(canvas, {
      scrollWheelZoom: false,
      tap: false
    });

    // Check for MapTiler API key, fallback to OpenTopoMap
    var maptilerKey = canvas.getAttribute('data-maptiler-key');
    if (maptilerKey && maptilerKey.trim() !== '') {
      // Use MapTiler Outdoor v2 with high-res tiles
      L.tileLayer('https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=' + encodeURIComponent(maptilerKey), {
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

    var trackColor = CONFIG.TRACK_COLOR;
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
    }).on('loaded', function(e) {
      var bounds = e.target.getBounds();
      if (bounds) {
        zoomTrackToMax(map, bounds);
        // Register map with default bounds for peak click interaction
        registerMap(canvas, map, bounds);
      }

      // Collect track lines once and reuse (performance optimization)
      var trackLines = collectTrackLines(e.target);
      if (trackLines.length) {
        addTrackOutline(trackLines, map, trackColor);
        addDirectionArrows(trackLines, map, trackColor);
        addEndpointMarkers(trackLines, map);
      }

      addPeakMarkers(canvas, map);
    }).addTo(map);
  }

  // ============================================================================
  // LAZY LOADING WITH INTERSECTION OBSERVER
  // ============================================================================

  /**
   * Scroll-based lazy loading fallback for older browsers
   */
  function initScrollFallback(canvases) {
    var pending = Array.prototype.slice.call(canvases);

    function checkVisibility() {
      pending = pending.filter(function(canvas) {
        if (initializedMaps.has(canvas)) {
          return false;
        }
        var rect = canvas.getBoundingClientRect();
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        var margin = 100; // Similar to CONFIG.LAZY_LOAD_MARGIN
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
    var canvases = document.querySelectorAll('[data-tour-map]');
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
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !initializedMaps.has(entry.target)) {
          initMap(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: CONFIG.LAZY_LOAD_MARGIN
    });

    canvases.forEach(function(canvas) {
      observer.observe(canvas);
    });
  }

  // ============================================================================
  // PEAK CLICK INTERACTION
  // ============================================================================

  /**
   * Store map instances and their state
   */
  var mapRegistry = new WeakMap();

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
   */
  function handlePeakClick(event) {
    var peakElement = event.target;
    if (!peakElement || !peakElement.classList.contains('peak-name')) {
      return;
    }

    var lat = parseFloat(peakElement.getAttribute('data-peak-lat'));
    var lng = parseFloat(peakElement.getAttribute('data-peak-lng'));
    var label = peakElement.getAttribute('data-peak-label');

    if (!isFinite(lat) || !isFinite(lng)) {
      return;
    }

    // Find the tour entry container
    var tourEntry = peakElement.closest('.tour-entry');
    if (!tourEntry) {
      return;
    }

    // Find the map canvas
    var mapCanvas = tourEntry.querySelector('[data-tour-map]');
    if (!mapCanvas) {
      return;
    }

    var mapState = mapRegistry.get(mapCanvas);
    if (!mapState || !mapState.map) {
      return;
    }

    var map = mapState.map;
    var peakLatLng = L.latLng(lat, lng);
    var peakKey = lat.toFixed(6) + ':' + lng.toFixed(6);

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
      var maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : map.options.maxZoom || 18;
      map.flyTo(peakLatLng, maxZoom, {
        duration: 0.8,
        easeLinearity: 0.25
      });
      mapState.currentPeak = peakKey;

      // Find and open popup for this peak marker
      map.eachLayer(function(layer) {
        if (layer instanceof L.Marker) {
          var markerLatLng = layer.getLatLng();
          if (markerLatLng &&
              Math.abs(markerLatLng.lat - lat) < 0.00001 &&
              Math.abs(markerLatLng.lng - lng) < 0.00001) {
            // Open popup if available
            if (layer.getPopup && layer.getPopup()) {
              setTimeout(function() {
                layer.openPopup();
              }, 850); // Open after zoom completes
            }
          }
        }
      });
    }
  }

  /**
   * Initialize peak click handlers
   */
  function initPeakClickHandlers() {
    // Use event delegation for better performance
    document.addEventListener('click', handlePeakClick);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  ready(function() {
    initMapsWithLazyLoading();
    initPeakClickHandlers();
  });

})();
