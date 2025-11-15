(function() {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function initMap(canvas) {
    if (!window.L || !canvas) {
      return;
    }

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
    }).on('addline', function(e) {
      var latLngs = e.line.getLatLngs();
      var outlineWeight = (e.line.options.weight || 4) + 4;
      var outline = L.polyline(latLngs, {
        color: '#ffffff',
        weight: outlineWeight,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);
      if (outline.bringToBack) {
        outline.bringToBack();
      }
      e.line.setStyle({
        color: trackColor,
        lineJoin: 'round',
        lineCap: 'round'
      });
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
