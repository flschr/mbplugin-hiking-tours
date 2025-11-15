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
      'border: 2px solid #fff',
      'box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35)'
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
      map.fitBounds(e.target.getBounds(), { padding: [16, 16] });
      addTrackOutline(e.target, map, trackColor);
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
