import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

/**
 * Custom hook for integrating D3 with React
 *
 * @param {function} renderFn - Function to render D3 visualization.
 *   It receives refs to the container and svg, and the data.
 * @param {array} dependencies - Array of dependencies to watch for changes
 * @returns {object} - Contains containerRef and svgRef
 */
function useD3(renderFn, dependencies = []) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const cleanupFnRef = useRef(null);

  // Store the render function in a ref to avoid it being included in dependencies
  const renderFnRef = useRef(renderFn);

  // Update the renderFnRef when renderFn changes
  useEffect(() => {
    renderFnRef.current = renderFn;
  }, [renderFn]);

  useEffect(() => {
    // Skip if refs aren't available
    if (!containerRef.current) return;

    // Clear previous SVG content if it exists
    if (!svgRef.current) {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight || 350;

      // Create new SVG element if it doesn't exist
      svgRef.current = d3
        .select(containerRef.current)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);
    } else {
      // Just clear the existing SVG content
      d3.select(svgRef.current.node()).selectAll('*').remove();
    }

    // Call the render function using the ref
    const cleanupFn = renderFnRef.current(containerRef, svgRef.current);

    // Store cleanup function for later
    if (typeof cleanupFn === 'function') {
      cleanupFnRef.current = cleanupFn;
    }

    // Cleanup when component unmounts or dependencies change
    return () => {
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }
    };
    // Using a standard array for dependencies that eslint can verify
  }, [...dependencies]);

  return { containerRef, svgRef };
}

export default useD3;
