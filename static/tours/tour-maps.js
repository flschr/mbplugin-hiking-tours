(function() {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  var peakMarkerStyleInjected = false;

  function ensurePeakMarkerStyles() {
    if (peakMarkerStyleInjected) {
      return;
    }
    peakMarkerStyleInjected = true;
    var style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = '' +
      '.tour-peak-marker {' +
        'background:#1d4ed8;' +
        'border-radius:50%;' +
        'color:#fff;' +
        'display:flex;' +
        'align-items:center;' +
        'justify-content:center;' +
        'font-weight:600;' +
        'border:2px solid #fff;' +
        'box-shadow:0 2px 4px rgba(0,0,0,0.35);' +
      '}' +
      '.tour-peak-marker-number {' +
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'font-size:0.85rem;' +
        'line-height:1;' +
      '}';
    document.head.appendChild(style);
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

    new L.GPX(gpxUrl, {
      async: true,
      marker_options: {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null
      },
      polyline_options: {
        color: '#1d4ed8',
        weight: 4,
        opacity: 0.85
      }
    }).on('loaded', function(e) {
      map.fitBounds(e.target.getBounds(), { padding: [16, 16] });
    }).addTo(map);

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

      var layerFactory = (typeof L.markerClusterGroup === 'function') ?
        function() { return L.markerClusterGroup({ chunkedLoading: true }); } :
        function() { return L.layerGroup(); };
      ensurePeakMarkerStyles();

      var markerLayer = layerFactory();
      markerLayer.addTo(map);

      peaks.forEach(function(peak, index) {
        if (!peak || !peak.lat || !peak.lng) {
          return;
        }
        var lat = parseFloat(peak.lat);
        var lng = parseFloat(peak.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          return;
        }
        var markerNumber = index + 1;
        var marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'tour-peak-marker',
            html: '<span class="tour-peak-marker-number">' + markerNumber + '</span>',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -24]
          })
        });
        if (peak.label) {
          marker.bindPopup(peak.label);
        }
        markerLayer.addLayer(marker);
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
