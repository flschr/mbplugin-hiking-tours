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

    var peakIcon = L.icon({
      iconUrl: '/tours/peak-flag.svg',
      iconSize: [28, 28],
      iconAnchor: [14, 24],
      popupAnchor: [0, -22],
      className: 'tour-peak-icon'
    });

    var peakIconLarge = L.icon({
      iconUrl: peakIcon.options.iconUrl,
      iconSize: [36, 36],
      iconAnchor: [18, 30],
      popupAnchor: [0, -26],
      className: peakIcon.options.className
    });

    function getPeakIcon(repeatCount) {
      return repeatCount > 1 ? peakIconLarge : peakIcon;
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
        var marker = L.marker([info.lat, info.lng], {
          icon: getPeakIcon(info.count)
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
