(function() {
  'use strict';

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

    var schedule = window.requestAnimationFrame || function(cb) { return setTimeout(cb, 16); };
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
      var baseWeight = 4;
      if (line.options && line.options.weight) {
        baseWeight = line.options.weight;
      }
      var outline = L.polyline(latLngs, {
        color: '#ffffff',
        weight: baseWeight + 4,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
      bringLayerToBackWhenReady(outline, 10);
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
    var size = 14;
    var stroke = '#dbeafe';
    var arrowColor = color || '#1d4ed8';
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
        arrowPane.style.zIndex = '450';
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

    var spacing = 400; // meters between arrows
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
          zIndexOffset: -200,
          icon: createDirectionIcon(bearing, color)
        }).addTo(map);
        nextMarkerDistance += spacing;
      }

      travelled += segmentDistance;
    }
  }

  function createEndpointIcon(label) {
    var size = 28;
    var styles = [
      'width: ' + size + 'px',
      'height: ' + size + 'px',
      'border-radius: ' + Math.round(size / 2) + 'px',
      'background: #000',
      'color: #fff',
      'font-weight: 700',
      'font-size: 14px',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'border: 3px solid #fff',
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

    if (canvas._toursMapInitialized || canvas.getAttribute('data-map-initialized') === 'true') {
      return;
    }
    canvas._toursMapInitialized = true;
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

    var trackColor = '#1d4ed8';
    new L.GPX(gpxUrl, {
      async: true,
      marker_options: {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null
      },
      polyline_options: {
        color: trackColor,
        weight: 4,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round'
      }
    }).on('loaded', function(e) {
      zoomTrackToMax(map, e.target.getBounds());
      addTrackOutline(e.target, map, trackColor);
      addDirectionArrows(e.target, map, trackColor);
      addEndpointMarkers(e.target, map);
    }).addTo(map);

    var baseIconSize = 28;
    var baseAnchor = [14, 24];
    var basePopupAnchor = [0, -22];
    function createPeakIcon(scale) {
      var size = Math.round(baseIconSize * scale);
      return L.icon({
        iconUrl: '/tours/note.svg',
        iconRetinaUrl: '/tours/note.svg',
        iconSize: [size, size],
        iconAnchor: [Math.round(baseAnchor[0] * scale), Math.round(baseAnchor[1] * scale)],
        popupAnchor: [basePopupAnchor[0], Math.round(basePopupAnchor[1] * scale)]
      });
    }

    var peaksRaw = canvas.getAttribute('data-peaks');
    if (!peaksRaw) {
      return;
    }

    try {
      var decoded = peaksRaw;
      if (peaksRaw.indexOf('&') !== -1) {
        var textarea = document.createElement('textarea');
        textarea.innerHTML = peaksRaw;
        decoded = textarea.value;
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
        var iconScale = info.count > 1 ? 2 : 1;
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
