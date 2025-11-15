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
  var METERS_PER_DEGREE_LAT = 111320;
  var DUPLICATE_OFFSET_METERS = 15;

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

  function calculateDuplicateOffset(lat, duplicateIndex, totalDuplicates) {
    var angle = (Math.PI * 2 * duplicateIndex) / totalDuplicates;
    var radiusMultiplier = 1 + Math.floor(totalDuplicates / 6);
    var radiusMeters = DUPLICATE_OFFSET_METERS * radiusMultiplier;

    var latMeters = Math.sin(angle) * radiusMeters;
    var lngMeters = Math.cos(angle) * radiusMeters;

    var latOffset = latMeters / METERS_PER_DEGREE_LAT;
    var metersPerDegreeLng = Math.max(Math.cos(lat * (Math.PI / 180)) * METERS_PER_DEGREE_LAT, 1);
    var lngOffset = lngMeters / metersPerDegreeLng;

    return {
      lat: latOffset,
      lng: lngOffset
    };
  }

  function createPeakMarkers(peaks) {
    if (!Array.isArray(peaks) || !peaks.length) {
      return [];
    }

    var locationCounts = peaks.reduce(function(counts, peak) {
      var lat = parseFloat(peak.lat);
      var lng = parseFloat(peak.lng);

      if (!isFinite(lat) || !isFinite(lng)) {
        return counts;
      }

      var key = lat.toFixed(6) + ',' + lng.toFixed(6);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});

    var duplicateOffsets = {};

    return peaks.reduce(function(markers, peak, index) {
      var lat = parseFloat(peak.lat);
      var lng = parseFloat(peak.lng);

      if (!isFinite(lat) || !isFinite(lng)) {
        log('[Tours] Ignoring peak with invalid coordinates', peak);
        return markers;
      }

      var key = lat.toFixed(6) + ',' + lng.toFixed(6);
      var duplicateCount = locationCounts[key] || 0;
      if (duplicateCount > 1) {
        var duplicateIndex = duplicateOffsets[key] || 0;
        var offset = calculateDuplicateOffset(lat, duplicateIndex, duplicateCount);
        lat += offset.lat;
        lng += offset.lng;
        duplicateOffsets[key] = duplicateIndex + 1;
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

      markers.push(marker);
      return markers;
    }, []);
  }

  var CLUSTER_ZOOM_RADII = [
    { maxZoom: 5, radius: 120 },
    { maxZoom: 7, radius: 100 },
    { maxZoom: 10, radius: 70 },
    { maxZoom: 13, radius: 50 },
    { maxZoom: 15, radius: 30 },
    { maxZoom: Infinity, radius: 0 }
  ];

  var CLUSTER_ICON_LEVELS = [
    { maxCount: 9, className: 'tour-cluster--xs', size: 30 },
    { maxCount: 24, className: 'tour-cluster--sm', size: 36 },
    { maxCount: 49, className: 'tour-cluster--md', size: 44 },
    { maxCount: 99, className: 'tour-cluster--lg', size: 52 },
    { maxCount: Infinity, className: 'tour-cluster--xl', size: 60 }
  ];

  function getClusterRadiusForZoom(zoom) {
    var normalizedZoom = typeof zoom === 'number' && isFinite(zoom) ? zoom : 10;
    for (var i = 0; i < CLUSTER_ZOOM_RADII.length; i++) {
      if (normalizedZoom <= CLUSTER_ZOOM_RADII[i].maxZoom) {
        return CLUSTER_ZOOM_RADII[i].radius;
      }
    }
    return 40;
  }

  function getClusterIconConfig(count) {
    var normalizedCount = Math.max(parseInt(count, 10) || 0, 1);
    for (var i = 0; i < CLUSTER_ICON_LEVELS.length; i++) {
      if (normalizedCount <= CLUSTER_ICON_LEVELS[i].maxCount) {
        return CLUSTER_ICON_LEVELS[i];
      }
    }
    return CLUSTER_ICON_LEVELS[CLUSTER_ICON_LEVELS.length - 1];
  }

  function createClusterIcon(count) {
    var config = getClusterIconConfig(count);
    var size = config.size || 36;
    return L.divIcon({
      html: '<span>' + count + '</span>',
      className: 'tour-cluster ' + (config.className || ''),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function createClusteredPeakLayer(map, markers) {
    if (!map || !Array.isArray(markers) || !markers.length) {
      return null;
    }

    var layerGroup = L.layerGroup().addTo(map);
    var ready = false;
    var scheduled = false;

    function buildClusters(zoom) {
      var radius = getClusterRadiusForZoom(zoom);
      var clusters = [];

      markers.forEach(function(marker) {
        if (!marker || !marker.getLatLng) {
          return;
        }

        var latLng = marker.getLatLng();
        if (!latLng) {
          return;
        }

        var point = map.project(latLng, zoom);
        var targetCluster = null;

        for (var i = 0; i < clusters.length; i++) {
          var candidate = clusters[i];
          if (candidate.point.distanceTo(point) <= radius) {
            targetCluster = candidate;
            break;
          }
        }

        if (targetCluster) {
          var previousCount = targetCluster.count;
          var newCount = previousCount + 1;
          targetCluster.point = new L.Point(
            (targetCluster.point.x * previousCount + point.x) / newCount,
            (targetCluster.point.y * previousCount + point.y) / newCount
          );
          targetCluster.lat = (targetCluster.lat * previousCount + latLng.lat) / newCount;
          targetCluster.lng = (targetCluster.lng * previousCount + latLng.lng) / newCount;
          targetCluster.count = newCount;
          targetCluster.markers.push(marker);
        } else {
          clusters.push({
            point: point,
            lat: latLng.lat,
            lng: latLng.lng,
            count: 1,
            markers: [marker]
          });
        }
      });

      return clusters;
    }

    function renderClusters() {
      scheduled = false;
      if (!ready) {
        return;
      }

      var zoom = map.getZoom();
      if (typeof zoom !== 'number' || !isFinite(zoom)) {
        return;
      }

      var clusters = buildClusters(zoom);
      layerGroup.clearLayers();

      clusters.forEach(function(cluster) {
        if (cluster.count === 1) {
          layerGroup.addLayer(cluster.markers[0]);
          return;
        }

        var clusterMarker = L.marker([cluster.lat, cluster.lng], {
          icon: createClusterIcon(cluster.count),
          interactive: true,
          keyboard: false,
          bubblingMouseEvents: false
        });

        clusterMarker.on('click', function() {
          var targetZoom = Math.min((map.getZoom() || 0) + 2, MAX_ZOOM);
          map.setView(clusterMarker.getLatLng(), targetZoom, { animate: true });
        });

        clusterMarker.bindTooltip(cluster.count + ' Gipfel in diesem Bereich', {
          direction: 'top',
          offset: [0, -18],
          className: 'tour-peak-tooltip'
        });

        layerGroup.addLayer(clusterMarker);
      });
    }

    function scheduleRender() {
      if (scheduled) {
        return;
      }
      scheduled = true;

      var scheduleFn = typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame
        : function(callback) { setTimeout(callback, 16); };

      scheduleFn(function() {
        renderClusters();
      });
    }

    map.on('zoomend', scheduleRender);

    return {
      setReady: function(flag) {
        ready = !!flag;
        if (ready) {
          renderClusters();
        } else {
          layerGroup.clearLayers();
        }
      },
      refresh: function() {
        if (ready) {
          renderClusters();
        }
      }
    };
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
        chip.setAttribute('aria-pressed', chip === activeChip ? 'true' : 'false');
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

    function openMarkerTooltip(marker) {
      if (!marker || typeof marker.openTooltip !== 'function') {
        return;
      }

      if (marker._map) {
        marker.openTooltip();
        return;
      }

      var onceHandler = function() {
        map.off('zoomend', onceHandler);
        map.off('moveend', onceHandler);
        if (marker._map) {
          marker.openTooltip();
        }
      };

      map.on('zoomend', onceHandler);
      map.on('moveend', onceHandler);
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

      openMarkerTooltip(peakMarkers[idx]);
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
    if (!canvas || canvas.dataset.mapInitialized === 'true' || canvas.dataset.mapInitialized === 'error') {
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
    var peakClusterController = null;
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
      peakMarkers = createPeakMarkers(peakData);
    }

    if (peakMarkers.length) {
      peakClusterController = createClusteredPeakLayer(map, peakMarkers);
      if (!peakClusterController) {
        peakMarkers.forEach(function(marker) {
          if (marker && marker.addTo) {
            marker.addTo(map);
          }
        });
      }

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

        if (peakClusterController && typeof peakClusterController.setReady === 'function') {
          peakClusterController.setReady(true);
        }

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
