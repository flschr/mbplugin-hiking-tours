(function() {
  'use strict';

  // Configuration constants
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
    LAYER_READY_FRAME_DELAY: 16
  };

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

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

    var schedule = window.requestAnimationFrame || function(cb) { return setTimeout(cb, CONFIG.LAYER_READY_FRAME_DELAY); };
    schedule(function() {
      bringLayerToBackWhenReady(layer, attemptsLeft - 1);
    });
  }

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

  function zoomTrackToMax(map, bounds) {
    if (!map || !bounds) {
      return;
    }

    // Validate bounds are valid before using
    if (typeof bounds.isValid === 'function' && !bounds.isValid()) {
      console.warn('[Tours] Invalid bounds, skipping zoom');
      return;
    }

    // Ensure Leaflet knows the final canvas size before calculating the zoom level.
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

  function distanceBetween(a, b) {
    if (!window.L || !a || !b) {
      return 0;
    }
    try {
      return L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
    } catch (err) {
      console.warn('[Tours] Failed to calculate distance between points', err);
    }
    return 0;
  }

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

    var trackPoints = [];
    lines.forEach(function(line) {
      if (!line || typeof line.getLatLngs !== 'function') {
        return;
      }
      collectLatLngs(line.getLatLngs(), trackPoints);
    });

    if (trackPoints.length < 2) {
      return;
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

  function initMap(canvas) {
    if (!window.L || !canvas) {
      return;
    }

    // Use single source of truth to prevent race conditions
    if (canvas.getAttribute('data-map-initialized') === 'true') {
      return;
    }
    // Set flag immediately to prevent double initialization
    canvas.setAttribute('data-map-initialized', 'true');

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
    }).addTo(map);

    function createPeakIcon(scale) {
      var size = Math.round(CONFIG.PEAK_ICON_SIZE * scale);
      return L.icon({
        iconUrl: '/tours/note.svg',
        iconRetinaUrl: '/tours/note.svg',
        iconSize: [size, size],
        iconAnchor: [Math.round(CONFIG.PEAK_ICON_ANCHOR_X * scale), Math.round(CONFIG.PEAK_ICON_ANCHOR_Y * scale)],
        popupAnchor: [CONFIG.PEAK_POPUP_ANCHOR_X, Math.round(CONFIG.PEAK_POPUP_ANCHOR_Y * scale)]
      });
    }

    var peaksRaw = canvas.getAttribute('data-peaks');
    if (!peaksRaw) {
      return;
    }

    try {
      var decoded = peaksRaw;
      if (peaksRaw.indexOf('&') !== -1) {
        // Safer HTML entity decoding without innerHTML
        var doc = new DOMParser().parseFromString(peaksRaw, 'text/html');
        decoded = doc.documentElement.textContent;
      }
      var peaks = JSON.parse(decoded);
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
            count: 0
          };
        }
        peakIndex[key].count += 1;
      });

      Object.keys(peakIndex).forEach(function(key) {
        var info = peakIndex[key];
        var iconScale = info.count > 1 ? CONFIG.PEAK_SCALE_MULTIPLE : 1;
        var marker = L.marker([info.lat, info.lng], {
          icon: createPeakIcon(iconScale)
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

  ready(function() {
    var canvases = document.querySelectorAll('[data-tour-map]');
    if (!canvases.length) {
      return;
    }
    canvases.forEach(initMap);
  });
})();
