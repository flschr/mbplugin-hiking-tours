/**
 * Tours Archive Filter & Statistics Script
 *
 * Provides client-side filtering by year and type on /tours/ page.
 * Updates statistics (count, distance, elevation) based on visible tours.
 *
 * No frameworks - vanilla JavaScript only.
 */

(function() {
  'use strict';

  /**
   * Formats a number with thousand separators using browser locale
   * @param {number} num - Number to format
   * @returns {string} - Formatted number
   */
  function formatNumber(num) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  /**
   * Updates statistics based on visible tour items
   */
  function updateStatistics() {
    const visibleItems = document.querySelectorAll('.tour-item:not(.tour-item--hidden)');

    let count = 0;
    let totalDistance = 0;
    let totalElevation = 0;

    visibleItems.forEach(function(item) {
      count++;

      const distance = parseFloat(item.getAttribute('data-distance')) || 0;
      const elevation = parseInt(item.getAttribute('data-elevation'), 10) || 0;

      totalDistance += distance;
      totalElevation += elevation;
    });

    // Update DOM elements
    const countEl = document.getElementById('stat-count');
    const distanceEl = document.getElementById('stat-distance');
    const elevationEl = document.getElementById('stat-elevation');

    if (countEl) countEl.textContent = count;
    if (distanceEl) distanceEl.textContent = formatNumber(totalDistance);
    if (elevationEl) elevationEl.textContent = formatNumber(totalElevation);
  }

  /**
   * Filters tours based on selected year and type
   */
  function filterTours() {
    const yearFilter = document.getElementById('filter-year');
    const typeFilter = document.getElementById('filter-type');

    if (!yearFilter || !typeFilter) {
      console.warn('[Tours Archive] Filter elements not found');
      return;
    }

    const selectedYear = yearFilter.value;
    const selectedType = typeFilter.value;

    const tourItems = document.querySelectorAll('.tour-item');

    tourItems.forEach(function(item) {
      const itemYear = item.getAttribute('data-year');
      const itemType = item.getAttribute('data-type');

      let show = true;

      // Filter by year
      if (selectedYear && itemYear !== selectedYear) {
        show = false;
      }

      // Filter by type
      if (selectedType && itemType !== selectedType) {
        show = false;
      }

      // Show or hide item using CSS class
      if (show) {
        item.classList.remove('tour-item--hidden');
      } else {
        item.classList.add('tour-item--hidden');
      }
    });

    // Update statistics after filtering
    updateStatistics();
  }

  /**
   * Initializes the archive page functionality
   */
  function initialize() {
    const yearFilter = document.getElementById('filter-year');
    const typeFilter = document.getElementById('filter-type');

    if (!yearFilter || !typeFilter) {
      // Not on tours archive page
      return;
    }

    // Attach event listeners
    yearFilter.addEventListener('change', filterTours);
    typeFilter.addEventListener('change', filterTours);

    // Set initial statistics (all tours visible)
    updateStatistics();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
