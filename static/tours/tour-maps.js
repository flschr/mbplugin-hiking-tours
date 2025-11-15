(function() {
  'use strict';

  var TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_LAYER_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors';

  function hasLeafletSupport() {
    return typeof window !== 'undefined' && window.L && typeof window.L.map === 'function';
  }

  function renderTourMap(canvas) {
    if (!canvas || canvas.dataset.mapInitialized === 'true') {
      return;
    }

    if (!hasLeafletSupport()) {
      console.warn('[Tours] Leaflet not available for rendering map');
      return;
    }

    var gpxUrl = canvas.getAttribute('data-gpx');
    if (!gpxUrl) {
      return;
    }

    canvas.dataset.mapInitialized = 'true';

    var map = L.map(canvas, {
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer(TILE_LAYER_URL, {
      attribution: TILE_LAYER_ATTRIBUTION,
      maxZoom: 18
    }).addTo(map);

    // Force map to recalculate size after a short delay
    setTimeout(function() {
      map.invalidateSize();
    }, 100);

    // Check if leaflet-gpx is available
    if (typeof L.GPX !== 'function') {
      console.warn('[Tours] Leaflet GPX plugin not available');
      // Set a default view if GPX is not available
      map.setView([47.5, 11.5], 10);
      return;
    }

    var gpxLayer = new L.GPX(gpxUrl, {
      async: true,
      marker_options: {
        startIconUrl: '',
        endIconUrl: '',
        shadowUrl: ''
      },
      polyline_options: {
        color: '#0ea5e9',
        opacity: 0.9,
        weight: 4
      }
    });

    gpxLayer.on('loaded', function(evt) {
      var bounds = evt.target.getBounds();
      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [15, 15] });
      }
    });

    gpxLayer.on('error', function(err) {
      console.warn('[Tours] Error loading GPX:', err);
      // Set a default view if GPX fails to load
      map.setView([47.5, 11.5], 10);
    });

    gpxLayer.addTo(map);
  }

  function setupTourMaps() {
    var canvases = document.querySelectorAll('[data-tour-map-canvas]');
    if (!canvases.length) {
      return;
    }

    canvases.forEach(function(canvas) {
      renderTourMap(canvas);
    });
  }

  function initWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupTourMaps);
    } else {
      setupTourMaps();
    }
  }

  initWhenReady();
})();
