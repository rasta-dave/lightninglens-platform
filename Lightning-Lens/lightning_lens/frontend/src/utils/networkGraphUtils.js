import * as d3 from 'd3';

/**
 * Utility functions for the NetworkGraph component
 */

/**
 * Creates optimized D3 force simulation for the lightning network visualization
 *
 * @param {Array} nodes - Array of node objects
 * @param {Array} links - Array of link objects
 * @param {number} width - Width of the container
 * @param {number} height - Height of the container
 * @returns {Object} D3 force simulation
 */
export const createOptimizedSimulation = (nodes, links, width, height) => {
  // Initialize node positions if not already set
  nodes.forEach((node) => {
    if (typeof node.x === 'undefined' || typeof node.y === 'undefined') {
      node.x = width / 2 + (Math.random() - 0.5) * 100;
      node.y = height / 2 + (Math.random() - 0.5) * 100;
    }
  });

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => 80 + Math.max(0, 100 - 15 * Math.sqrt(nodes.length))) // Dynamic link distance based on node count
    )
    .force(
      'charge',
      d3
        .forceManyBody()
        .strength((d) => -150 - (d.transactions || 1) * 10) // Stronger repulsion for active nodes
        .distanceMax(250) // Limit the maximum distance for force calculation
        .theta(0.8) // Performance optimization
    )
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force(
      'collision',
      d3.forceCollide().radius((d) => 10 + Math.sqrt(d.transactions || 1) * 2)
    )
    .force('x', d3.forceX(width / 2).strength(0.05))
    .force('y', d3.forceY(height / 2).strength(0.05))
    .alphaDecay(0.03) // Slightly faster decay for quicker stabilization
    .velocityDecay(0.4) // Less bouncy
    .alpha(0.3); // Lower starting alpha for less initial movement

  // Run a few ticks immediately to stabilize the layout faster
  for (let i = 0; i < 20; i++) {
    simulation.tick();
  }

  return simulation;
};

/**
 * Throttle function for performance optimization
 *
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (func, limit = 16) => {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
};

/**
 * Calculate optimal node size based on transaction count
 *
 * @param {Object} node - Node data object
 * @param {number} baseSize - Base node size
 * @returns {number} Calculated node size
 */
export const calculateNodeSize = (node, baseSize = 4) => {
  return baseSize + Math.sqrt(node.transactions || 1) * 1.5;
};

/**
 * Generates a particle update function optimized for performance
 *
 * @param {Object} svg - D3 selection of the SVG element
 * @param {Array} links - Array of link objects
 * @returns {Function} Update function for particles
 */
export const createParticleUpdater = (svg, links) => {
  // Cache for particle positions
  const lastPositions = new Map();
  let frameCount = 0;

  return throttle(() => {
    // Only update every other frame for better performance
    frameCount++;
    if (frameCount % 2 !== 0) return;

    svg.selectAll('.flow-particle-group').each(function () {
      const group = d3.select(this);
      const sourceId = group.attr('data-source');
      const targetId = group.attr('data-target');

      const path = svg.select(
        `path.link[data-source="${sourceId}"][data-target="${targetId}"]`
      );

      if (path.empty()) return;

      // Only update visible links
      if (parseFloat(path.attr('stroke-opacity')) < 0.2) return;

      const pathNode = path.node();
      if (!pathNode) return;

      try {
        const pathLength = pathNode.getTotalLength();
        if (!isFinite(pathLength) || pathLength <= 0) return;

        // Use a consistent offset for each particle based on link value
        const linkData = links.find(
          (l) =>
            (l.source.id === sourceId && l.target.id === targetId) ||
            (l.source.id === targetId && l.target.id === sourceId)
        );

        const linkSpeed = linkData
          ? Math.min(5000, 7000 - Math.sqrt(linkData.value || 0) * 200)
          : 5000;

        group.selectAll('.flow-particle').each(function (_, i) {
          const particle = d3.select(this);
          const particleId = `${sourceId}-${targetId}-${i}`;
          const offset = (i / 3) * pathLength;
          const currentTime = Date.now() / linkSpeed;

          try {
            const position = pathNode.getPointAtLength(
              (offset + currentTime * pathLength) % pathLength
            );

            // Check if position has changed significantly
            const lastPosition = lastPositions.get(particleId);
            if (lastPosition) {
              const dx = position.x - lastPosition.x;
              const dy = position.y - lastPosition.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // Only update if position changed significantly
              if (distance < 0.5) return;
            }

            // Update cache
            lastPositions.set(particleId, { x: position.x, y: position.y });

            // Apply transformation without causing layout shifts
            particle.attr(
              'transform',
              `translate(${position.x}, ${position.y})`
            );
          } catch (e) {
            // Silently handle errors that might occur during animation
          }
        });
      } catch (e) {
        // Silent error handling for robustness
      }
    });
  }, 33); // Throttle to ~30fps
};
