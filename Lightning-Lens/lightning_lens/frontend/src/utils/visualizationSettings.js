/**
 * Visualization performance settings
 * This module provides configurable performance settings for visualizations.
 */

/**
 * Default performance settings for visualizations with tuned parameters for different dataset sizes
 */
export const defaultPerformanceSettings = {
  // Maximum particles per link - lower is better for performance
  maxParticlesPerLink: 3,

  // Minimum link width to show particles
  minLinkWidthForParticles: 2,

  // Animation duration in ms (higher = smoother but more CPU intensive)
  animationDuration: 4000,

  // Skip animations entirely for very large datasets
  skipAnimationsThreshold: 150,

  // Maximum nodes to show labels for
  maxNodeLabels: 40,

  // Throttle mouseover events to improve performance
  mouseEventThrottle: 40, // ms

  // Use simplified animation for better performance
  useSimplifiedAnimation: false,

  // Maximum number of items to display in tabular view
  maxTableRows: 10,
};

/**
 * Determine if a dataset is large and requires performance optimizations
 *
 * @param {Array} data - The dataset to check
 * @param {Object} settings - Performance settings
 * @returns {boolean} - True if the dataset is considered large
 */
export const isLargeDataset = (data, settings = defaultPerformanceSettings) => {
  if (!data) return false;
  return data.length > settings.skipAnimationsThreshold;
};

/**
 * Throttle a function to limit how often it can be called
 *
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
export const throttle = (func, limit) => {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    }
  };
};
