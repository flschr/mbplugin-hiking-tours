(function() {
  'use strict';

  // Configuration constants
  var TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_LAYER_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors';
  var MAX_ZOOM = 18;
  var BOUNDS_PADDING = [20, 20];
  var GPX_COLOR = '#dc2626';
  var GPX_OPACITY = 0.9;
  var GPX_WEIGHT = 4;
  var DEBUG = false; // Set to true for debugging

  function log() {
    if (DEBUG && console && console.log) {
      console.log.apply(console, arguments);
    }
  }

  function logError() {
    if (console && console.error) {
      console.error.apply(console, arguments);
    }
  }

  function hasLeafletSupport() {
    return typeof window !== 'undefined' && window.L && typeof window.L.map === 'function';
  }

  function showError(canvas, message) {
    canvas.innerHTML = '<div class="map-error map-error--full">' + message + '</div>';
    canvas.dataset.mapInitialized = 'error';
  }

  var htmlDecoder = null;

  function decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') {
      return str;
    }

    if (!htmlDecoder) {
      htmlDecoder = document.createElement('textarea');
    }

    htmlDecoder.innerHTML = str;
    return htmlDecoder.value;
  }

  function parsePeaksData(canvas) {
    if (!canvas) {
      return [];
    }

    var raw = canvas.getAttribute('data-peaks');
    if (!raw) {
      return [];
    }

    try {
      var normalized = decodeHtmlEntities(raw);
      var parsed = JSON.parse(normalized);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(function(peak) {
        return peak && peak.lat !== undefined && peak.lng !== undefined;
      });
    } catch (err) {
      logError('[Tours] Failed to parse peak data', err);
      return [];
    }
  }

  function createPeakMarkers(map, peaks) {
    if (!map || !Array.isArray(peaks) || !peaks.length) {
      return [];
    }

    return peaks.reduce(function(markers, peak, index) {
      var lat = parseFloat(peak.lat);
      var lng = parseFloat(peak.lng);

      if (!isFinite(lat) || !isFinite(lng)) {
        log('[Tours] Ignoring peak with invalid coordinates', peak);
        return markers;
      }

      var icon = L.divIcon({
        className: 'tour-peak-marker',
        html: '<span>' + (index + 1) + '</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      var marker = L.marker([lat, lng], {
        icon: icon,
        keyboard: false,
        riseOnHover: true,
        bubblingMouseEvents: false
      });

      if (peak.label) {
        marker.bindTooltip(peak.label, {
          direction: 'top',
          offset: [0, -16],
          className: 'tour-peak-tooltip'
        });
      }

      marker.addTo(map);
      markers.push(marker);
      return markers;
    }, []);
  }

  function attachPeakChipInteractions(map, canvas, peakMarkers) {
    if (!map || !canvas || !Array.isArray(peakMarkers) || !peakMarkers.length) {
      return;
    }

    var tourBox = canvas.closest ? canvas.closest('.tour-box') : null;
    if (!tourBox) {
      return;
    }

    var chips = tourBox.querySelectorAll('.tour-peak-chip[data-peak-index]');
    if (!chips.length) {
      return;
    }

    var chipList = Array.prototype.slice.call(chips);
    var activeChip = null;
    var activeMarkerIndex = null;
    var isProgrammaticMapChange = false;

    function updateChipStates() {
      chipList.forEach(function(chip) {
        chip.classList.toggle('tour-peak-chip--active', chip === activeChip);
      });
    }

    function runProgrammaticMapAction(action) {
      if (typeof action !== 'function') {
        return;
      }

      isProgrammaticMapChange = true;
      try {
        action();
      } finally {
        setTimeout(function() {
          isProgrammaticMapChange = false;
        }, 0);
      }
    }

    canvas.__tourRunProgrammaticMapAction = runProgrammaticMapAction;

    function clearActiveChip(options) {
      options = options || {};

      if (activeMarkerIndex !== null && peakMarkers[activeMarkerIndex] && peakMarkers[activeMarkerIndex].closeTooltip) {
        peakMarkers[activeMarkerIndex].closeTooltip();
      }

      activeChip = null;
      activeMarkerIndex = null;
      updateChipStates();

      if (options.resetView && typeof canvas.__tourResetToDefaultView === 'function') {
        canvas.__tourResetToDefaultView();
      }
    }

    function focusPeak(index, sourceChip) {
      var idx = parseInt(index, 10);
      if (isNaN(idx) || !peakMarkers[idx] || !peakMarkers[idx].getLatLng) {
        return;
      }

      if (sourceChip === activeChip) {
        clearActiveChip({ resetView: true });
        return;
      }

      clearActiveChip();

      if (typeof canvas.__activateTourMap === 'function') {
        canvas.__activateTourMap();
      }

      var latLng = peakMarkers[idx].getLatLng();
      if (!latLng) {
        return;
      }

      activeChip = sourceChip;
      activeMarkerIndex = idx;
      updateChipStates();

      runProgrammaticMapAction(function() {
        map.setView(latLng, MAX_ZOOM, { animate: true });
      });

      if (peakMarkers[idx].openTooltip) {
        peakMarkers[idx].openTooltip();
      }
    }

    function handleManualMapInteraction() {
      if (isProgrammaticMapChange) {
        return;
      }
      clearActiveChip();
    }

    map.on('movestart', handleManualMapInteraction);
    map.on('zoomstart', handleManualMapInteraction);

    chipList.forEach(function(chip) {
      chip.addEventListener('click', function() {
        focusPeak(chip.getAttribute('data-peak-index'), chip);
      });

      chip.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusPeak(chip.getAttribute('data-peak-index'), chip);
        }
      });
    });
  }

  function setupInteractionGuard(map, canvas) {
    if (!map || !canvas) {
      return;
    }

    var guardButton = document.createElement('button');
    guardButton.type = 'button';
    guardButton.className = 'tour-map-guard';
    guardButton.setAttribute('aria-label', 'Karte aktivieren, um sie zu bedienen');
    guardButton.innerHTML = '<span>Karte aktivieren</span><small>Scrollen und Zoomen einschalten</small>';

    var controls = [
      map.scrollWheelZoom,
      map.dragging,
      map.touchZoom,
      map.doubleClickZoom,
      map.boxZoom,
      map.keyboard
    ];

    controls.forEach(function(control) {
      if (control && control.disable) {
        control.disable();
      }
    });

    var activated = false;

    function activateMap() {
      if (activated) {
        return;
      }
      activated = true;

      controls.forEach(function(control) {
        if (control && control.enable) {
          control.enable();
        }
      });

      if (guardButton.parentNode) {
        guardButton.parentNode.removeChild(guardButton);
      }
      canvas.classList.remove('tour-map-guarded');
    }

    canvas.__activateTourMap = activateMap;

    guardButton.addEventListener('click', function(event) {
      event.preventDefault();
      activateMap();
    });

    guardButton.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateMap();
      }
    });

    canvas.classList.add('tour-map-guarded');
    canvas.appendChild(guardButton);
  }

  function renderTourMap(canvas) {
    if (!canvas || canvas.dataset.mapInitialized === 'true') {
      log('[Tours] Canvas already initialized or not found');
      return;
    }

    if (!hasLeafletSupport()) {
      logError('[Tours] Leaflet not available for rendering map');
      showError(canvas, 'Karte kann nicht geladen werden (Leaflet nicht verfügbar)');
      return;
    }

    var gpxUrl = canvas.getAttribute('data-gpx');
    log('[Tours] Initializing map with GPX URL:', gpxUrl);

    var peakData = parsePeaksData(canvas);
    var peakMarkers = [];
    var hiddenMarkerIcon = L.divIcon({
      className: 'tour-hidden-marker',
      iconSize: [0, 0]
    });

    if (!gpxUrl) {
      logError('[Tours] No GPX URL provided');
      showError(canvas, 'Keine GPX-Datei angegeben');
      return;
    }

    // Check if leaflet-gpx is available
    if (typeof L.GPX !== 'function') {
      logError('[Tours] Leaflet GPX plugin not available');
      showError(canvas, 'GPX-Plugin nicht verfügbar');
      return;
    }

    canvas.dataset.mapInitialized = 'true';

    var map = L.map(canvas, {
      zoomControl: true,
      attributionControl: true
    });

    setupInteractionGuard(map, canvas);

    L.tileLayer(TILE_LAYER_URL, {
      attribution: TILE_LAYER_ATTRIBUTION,
      maxZoom: MAX_ZOOM
    }).addTo(map);

    log('[Tours] Map created, tile layer added');
    log('[Tours] Loading GPX file:', gpxUrl);

    var gpxLayer = new L.GPX(gpxUrl, {
      async: true,
      marker_options: {
        startIcon: hiddenMarkerIcon,
        endIcon: hiddenMarkerIcon,
        shadowUrl: ''
      },
      polyline_options: {
        color: GPX_COLOR,
        opacity: GPX_OPACITY,
        weight: GPX_WEIGHT,
        lineCap: 'round',
        lineJoin: 'round'
      }
    });

    if (peakData.length) {
      peakMarkers = createPeakMarkers(map, peakData);
    }

    if (peakMarkers.length) {
      attachPeakChipInteractions(map, canvas, peakMarkers);
    }

    gpxLayer.on('loaded', function(evt) {
      log('[Tours] GPX loaded successfully');
      var bounds = evt.target.getBounds();
      log('[Tours] GPX bounds:', bounds);

      if (bounds && bounds.isValid()) {
        if (peakMarkers.length) {
          peakMarkers.forEach(function(marker) {
            if (marker && marker.getLatLng) {
              bounds.extend(marker.getLatLng());
            }
          });
        }

        log('[Tours] Fitting map to bounds');
        map.fitBounds(bounds, { padding: BOUNDS_PADDING });

        var defaultBounds = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
        map.__tourDefaultBounds = defaultBounds;
        canvas.__tourResetToDefaultView = function() {
          var resetAction = function() {
            if (map.__tourDefaultBounds && map.__tourDefaultBounds.isValid()) {
              map.fitBounds(map.__tourDefaultBounds, { padding: BOUNDS_PADDING });
            }
          };

          if (typeof canvas.__tourRunProgrammaticMapAction === 'function') {
            canvas.__tourRunProgrammaticMapAction(resetAction);
          } else {
            resetAction();
          }
        };

        // Single invalidateSize after bounds are set
        requestAnimationFrame(function() {
          map.invalidateSize();
        });
      } else {
        logError('[Tours] Invalid bounds from GPX');
        showError(canvas, 'GPX-Datei enthält ungültige Koordinaten');
      }
    });

    gpxLayer.on('error', function(err) {
      logError('[Tours] Error loading GPX:', err);
      logError('[Tours] GPX URL was:', gpxUrl);
      showError(canvas, 'GPX-Datei konnte nicht geladen werden');
    });

    gpxLayer.addTo(map);
    log('[Tours] GPX layer added to map');
  }

  function setupTourMaps() {
    var canvases = document.querySelectorAll('[data-tour-map-canvas]');
    if (!canvases.length) {
      return;
    }

    // Use IntersectionObserver for lazy loading
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting && entry.target.dataset.mapInitialized !== 'true') {
            renderTourMap(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '50px'
      });

      canvases.forEach(function(canvas) {
        observer.observe(canvas);
      });
    } else {
      // Fallback for browsers without IntersectionObserver
      canvases.forEach(function(canvas) {
        renderTourMap(canvas);
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTourMaps);
  } else {
    setupTourMaps();
  }
})();
