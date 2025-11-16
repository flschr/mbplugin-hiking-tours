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
    PEAK_ICON_SIZE: 28,
    PEAK_ICON_ANCHOR_X: 14,
    PEAK_ICON_ANCHOR_Y: 24,
    PEAK_POPUP_ANCHOR_X: 0,
    PEAK_POPUP_ANCHOR_Y: -22,
    PEAK_SCALE_MULTIPLE: 2,

    // Map settings
    MAP_MIN_HEIGHT: 320,
    LAYER_READY_MAX_ATTEMPTS: 10,
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
   * Improved HTML entity decoder using textarea (safer than DOMParser)
   */
  function decodeHTMLEntities(html) {
    if (!html || html.indexOf('&') === -1) {
      return html;
    }
    var textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    var decoded = textarea.value;
    textarea = null; // Cleanup
    return decoded;
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
   * Bring layer to back once it's rendered in DOM
   */
  function bringLayerToBackWhenReady(layer, attemptsLeft) {
    if (!layer || typeof layer.bringToBack !== 'function') {
      return;
    }

    if (layer._path && layer._path.parentNode) {
      try {
        layer.bringToBack();
      } catch (err) {
        console.warn('[Tours] Failed to move outline behind track', err);
      }
      return;
    }

    if (!attemptsLeft) {
      return;
    }

    var schedule = window.requestAnimationFrame || function(cb) {
      return setTimeout(cb, CONFIG.LAYER_READY_FRAME_DELAY);
    };
    schedule(function() {
      bringLayerToBackWhenReady(layer, attemptsLeft - 1);
    });
  }

  /**
   * Add white outline behind track for better visibility
   */
  function addTrackOutline(layer, map, color) {
    if (!window.L || !layer || !map) {
      return;
    }

    var lines = collectTrackLines(layer);
    if (!lines.length) {
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
      bringLayerToBackWhenReady(outline, CONFIG.LAYER_READY_MAX_ATTEMPTS);
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
  function addDirectionArrows(layer, map, color) {
    if (!window.L || !layer || !map) {
      return;
    }

    var lines = collectTrackLines(layer);
    if (!lines.length) {
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
  function addEndpointMarkers(layer, map) {
    if (!window.L || !layer || !map) {
      return;
    }

    var lines = collectTrackLines(layer);
    if (!lines.length) {
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
   * Create peak icon with number
   */
  function createPeakIcon(scale, number) {
    var size = Math.round(CONFIG.PEAK_ICON_SIZE * scale);
    var numberText = number ? escapeHtml(number) : '';
    var anchor = [
      Math.round(CONFIG.PEAK_ICON_ANCHOR_X * scale),
      Math.round(CONFIG.PEAK_ICON_ANCHOR_Y * scale)
    ];
    var popupAnchor = [
      Math.round(CONFIG.PEAK_POPUP_ANCHOR_X * scale),
      Math.round(CONFIG.PEAK_POPUP_ANCHOR_Y * scale)
    ];
    var shadowId = 'mbtourShadow' + Math.random().toString(36).slice(2, 8);
    var textElement = '<text x="14" y="12.5" text-anchor="middle" font-size="9" font-family="-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif" font-weight="700" fill="#9a3412" dominant-baseline="middle">' + numberText + '</text>';
    var svg = '' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 28 28" fill="none">' +
      '<defs>' +
      '<filter id="' + shadowId + '" x="-30%" y="-10%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
      '<feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#000" flood-opacity="0.35" />' +
      '</filter>' +
      '</defs>' +
      '<g filter="url(#' + shadowId + ')">' +
      '<path d="M14 2C9.029 2 5 6.029 5 11c0 6.363 7.156 14.482 8.115 15.51a1.2 1.2 0 0 0 1.77 0C15.844 25.482 23 17.363 23 11c0-4.97-4.029-9-9-9Zm0 6.5A2.5 2.5 0 1 1 11.5 11 2.5 2.5 0 0 1 14 8.5Z" fill="#f97316" stroke="#ffffff" stroke-width="2" />' +
      '<circle cx="14" cy="11" r="4.25" fill="#fff7ed" stroke="#ffffff" stroke-width="1.5" />' +
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

      // Deduplicate peaks by coordinates, keeping first number
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
            number: peak.number || 0,
            count: 0
          };
        }
        peakIndex[key].count += 1;
      });

      // Add markers
      Object.keys(peakIndex).forEach(function(key) {
        var info = peakIndex[key];
        var iconScale = info.count > 1 ? CONFIG.PEAK_SCALE_MULTIPLE : 1;
        var marker = L.marker([info.lat, info.lng], {
          icon: createPeakIcon(iconScale, info.number)
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
    if (!gpxUrl) {
      return;
    }

    var map = L.map(canvas, {
      scrollWheelZoom: false,
      tap: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
    }).addTo(map);

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
      }
      addTrackOutline(e.target, map, trackColor);
      addDirectionArrows(e.target, map, trackColor);
      addEndpointMarkers(e.target, map);
      addPeakMarkers(canvas, map);
    }).addTo(map);
  }

  // ============================================================================
  // LAZY LOADING WITH INTERSECTION OBSERVER
  // ============================================================================

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
      // Fallback: initialize all maps immediately
      canvases.forEach(initMap);
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
  // INITIALIZATION
  // ============================================================================

  ready(initMapsWithLazyLoading);

})();
