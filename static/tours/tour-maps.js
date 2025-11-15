(function() {
  'use strict';

  var TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_LAYER_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors';

  function hasLeafletSupport() {
    return typeof window !== 'undefined' && window.L && typeof window.L.map === 'function';
  }

  function renderTourMap(canvas) {
    if (!canvas || canvas.dataset.mapInitialized === 'true') {
      console.log('[Tours] Canvas already initialized or not found');
      return;
    }

    if (!hasLeafletSupport()) {
      console.error('[Tours] Leaflet not available for rendering map');
      return;
    }

    var gpxUrl = canvas.getAttribute('data-gpx');
    console.log('[Tours] Initializing map with GPX URL:', gpxUrl);

    if (!gpxUrl) {
      console.error('[Tours] No GPX URL provided');
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

    console.log('[Tours] Map created, tile layer added');

    // Set initial view to avoid blank map
    map.setView([47.5, 11.5], 10);

    // Force map to recalculate size after a short delay
    setTimeout(function() {
      map.invalidateSize();
      console.log('[Tours] Map size invalidated');
    }, 100);

    // Check if leaflet-gpx is available
    if (typeof L.GPX !== 'function') {
      console.error('[Tours] Leaflet GPX plugin not available');
      console.error('[Tours] Make sure leaflet-gpx is loaded before tour-maps.js');
      return;
    }

    console.log('[Tours] Loading GPX file:', gpxUrl);

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
        weight: 4,
        lineCap: 'round',
        lineJoin: 'round'
      }
    });

    gpxLayer.on('loaded', function(evt) {
      console.log('[Tours] GPX loaded successfully', evt);
      var bounds = evt.target.getBounds();
      console.log('[Tours] GPX bounds:', bounds);

      if (bounds && bounds.isValid()) {
        console.log('[Tours] Fitting map to bounds');
        map.fitBounds(bounds, { padding: [20, 20] });

        // Force another size recalculation after bounds are set
        setTimeout(function() {
          map.invalidateSize();
        }, 200);
      } else {
        console.warn('[Tours] Invalid bounds from GPX');
      }
    });

    gpxLayer.on('error', function(err) {
      console.error('[Tours] Error loading GPX:', err);
      console.error('[Tours] GPX URL was:', gpxUrl);
      console.error('[Tours] Check if the file exists and is accessible');
    });

    gpxLayer.on('addline', function(evt) {
      console.log('[Tours] Track line added to map');
    });

    gpxLayer.on('addpoint', function(evt) {
      console.log('[Tours] Point added to map');
    });

    gpxLayer.addTo(map);
    console.log('[Tours] GPX layer added to map');
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
