(function() {
  'use strict';

  var TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_LAYER_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors';

  function hasLeafletSupport() {
    return typeof window !== 'undefined' && window.L && typeof window.L.map === 'function';
  }

  function hideStaticImage(img) {
    if (!img) return;
    img.classList.add('tour-map-static--hidden');
  }

  function showDynamicCanvas(canvas) {
    if (!canvas) return;
    canvas.hidden = false;
    canvas.classList.add('tour-map-dynamic--visible');
  }

  function renderDynamicMap(canvas) {
    if (!canvas || canvas.dataset.mapInitialized === 'true') {
      return;
    }

    if (!hasLeafletSupport()) {
      console.warn('[Tours] Leaflet not available for dynamic map fallback');
      return;
    }

    var gpxUrl = canvas.getAttribute('data-gpx');
    if (!gpxUrl) {
      return;
    }

    canvas.dataset.mapInitialized = 'true';
    showDynamicCanvas(canvas);

    var map = L.map(canvas, {
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer(TILE_LAYER_URL, {
      attribution: TILE_LAYER_ATTRIBUTION,
      maxZoom: 18
    }).addTo(map);

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

    gpxLayer.addTo(map);
  }

  function enableDynamicFallback(wrapper) {
    var canvas = wrapper.querySelector('[data-tour-map-canvas]');
    if (!canvas) {
      return;
    }
    renderDynamicMap(canvas);
  }

  function setupMapFallbacks() {
    var mapWrappers = document.querySelectorAll('.tour-card-map');
    if (!mapWrappers.length) {
      return;
    }

    mapWrappers.forEach(function(wrapper) {
      var canvas = wrapper.querySelector('[data-tour-map-canvas]');
      if (!canvas) {
        return;
      }

      var staticImage = wrapper.querySelector('[data-tour-map-image]');
      if (!staticImage) {
        enableDynamicFallback(wrapper);
        return;
      }

      var shouldWatch = staticImage.hasAttribute('data-fallback-map');
      if (!shouldWatch) {
        return;
      }

      if (staticImage.complete && staticImage.naturalWidth === 0) {
        hideStaticImage(staticImage);
        enableDynamicFallback(wrapper);
        return;
      }

      staticImage.addEventListener('error', function() {
        hideStaticImage(staticImage);
        enableDynamicFallback(wrapper);
      }, { once: true });
    });
  }

  function initWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupMapFallbacks);
    } else {
      setupMapFallbacks();
    }
  }

  initWhenReady();
})();
