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
      '}' +
      '.tour-peak-marker-active {' +
        'background:#f97316;' +
      '}' +
      '.tour-peak-item.tour-peak-active {' +
        'color:#1d4ed8;' +
        'font-weight:600;' +
      '}';
    document.head.appendChild(style);
  }

  function setupPeakInteractions(canvas, markerLookup) {
    var entry = canvas.closest('.tour-entry');
    if (!entry) {
      return;
    }
    var list = entry.querySelector('.tour-peaks-list');
    if (!list) {
      return;
    }

    var activeIndex = null;

    function getListItemByIndex(index) {
      return list.querySelector('[data-peak-index="' + index + '"]');
    }

    function setActive(index, item) {
      if (activeIndex === index) {
        return;
      }
      if (activeIndex !== null) {
        clearActive(activeIndex);
      }
      activeIndex = index;
      if (item) {
        item.classList.add('tour-peak-active');
      }
      var marker = markerLookup[index];
      if (marker) {
        if (typeof marker.openPopup === 'function') {
          marker.openPopup();
        }
        var element = marker.getElement && marker.getElement();
        if (element) {
          element.classList.add('tour-peak-marker-active');
        }
      }
    }

    function clearActive(index) {
      var item = getListItemByIndex(index);
      if (item) {
        item.classList.remove('tour-peak-active');
      }
      var marker = markerLookup[index];
      if (marker) {
        if (typeof marker.closePopup === 'function') {
          marker.closePopup();
        }
        var element = marker.getElement && marker.getElement();
        if (element) {
          element.classList.remove('tour-peak-marker-active');
        }
      }
      if (activeIndex === index) {
        activeIndex = null;
      }
    }

    function handleEnter(event) {
      var item = event.target.closest('.tour-peak-item');
      if (!item || !list.contains(item)) {
        return;
      }
      var index = item.getAttribute('data-peak-index');
      if (index === null) {
        return;
      }
      setActive(index, item);
    }

    function handleLeave(event) {
      var item = event.target.closest('.tour-peak-item');
      if (!item || !list.contains(item)) {
        return;
      }
      var index = item.getAttribute('data-peak-index');
      if (index === null) {
        return;
      }
      clearActive(index);
    }

    list.addEventListener('pointerenter', handleEnter, true);
    list.addEventListener('pointerleave', handleLeave, true);
    list.addEventListener('focusin', handleEnter);
    list.addEventListener('focusout', handleLeave);
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

      var markerLookup = Object.create(null);
      var hasMarkers = false;

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
        markerLookup[index] = marker;
        hasMarkers = true;
      });

      if (hasMarkers) {
        setupPeakInteractions(canvas, markerLookup);
      }
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
