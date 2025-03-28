import { useRef, useEffect } from 'react';
import * as d3 from 'd3';

/**
 * Custom hook for integrating D3 with React with performance optimizations
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
  const isInitialRender = useRef(true);
  const previousDependencies = useRef([]);
  const renderTimerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const isResizing = useRef(false);
  const resizeTimeoutRef = useRef(null);
  const lastDimensionsRef = useRef({ width: 0, height: 0 });

  // Store the render function in a ref to avoid it being included in dependencies
  const renderFnRef = useRef(renderFn);

  // Update the renderFnRef when renderFn changes
  useEffect(() => {
    renderFnRef.current = renderFn;
  }, [renderFn]);

  // Function to clean up the SVG completely to prevent duplication
  const cleanupSVG = () => {
    if (!containerRef.current) return;

    // First run any cleanup function from the previous render
    if (cleanupFnRef.current) {
      try {
        cleanupFnRef.current();
      } catch (e) {
        console.error('Error in cleanup function:', e);
      }
      cleanupFnRef.current = null;
    }

    // Remove ALL SVG elements from the container to prevent duplication
    try {
      d3.select(containerRef.current).selectAll('svg').remove();
      svgRef.current = null;
    } catch (e) {
      console.error('Error removing SVGs:', e);
    }
  };

  // Function to update SVG dimensions only
  const updateSVGDimensions = () => {
    if (!containerRef.current || !svgRef.current) return;

    try {
      const newWidth = containerRef.current.clientWidth;
      // Use the explicit height from the container
      const newHeight = containerRef.current.clientHeight || 350;

      // Only update if dimensions have changed significantly
      if (
        Math.abs(newWidth - lastDimensionsRef.current.width) > 5 ||
        Math.abs(newHeight - lastDimensionsRef.current.height) > 5
      ) {
        svgRef.current
          .attr('width', newWidth)
          .attr('height', newHeight)
          .attr('viewBox', [0, 0, newWidth, newHeight]);

        lastDimensionsRef.current = { width: newWidth, height: newHeight };
      }
    } catch (e) {
      console.error('Error updating SVG dimensions:', e);
    }
  };

  // Function to perform the actual rendering
  const performRender = () => {
    // Skip if container ref isn't available
    if (!containerRef.current) return;

    // Clean up any existing SVG elements
    cleanupSVG();

    try {
      // Always create a new SVG element
      const width = containerRef.current.clientWidth;
      // Use the explicit height from the container
      const height = containerRef.current.clientHeight || 350;

      lastDimensionsRef.current = { width, height };

      // Create SVG with appropriate attributes
      svgRef.current = d3
        .select(containerRef.current)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height])
        .style('display', 'block'); // Prevent vertical stretching

      // Call the render function using the ref
      try {
        const cleanupFn = renderFnRef.current(containerRef, svgRef.current);

        // Store cleanup function for later
        if (typeof cleanupFn === 'function') {
          cleanupFnRef.current = cleanupFn;
        }
      } catch (e) {
        console.error('Error in render function:', e);

        // Display error message in container
        if (svgRef.current) {
          svgRef.current
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', 'red')
            .text('Error rendering visualization');
        }
      }
    } catch (e) {
      console.error('Error setting up SVG:', e);
    }
  };

  // Create and manage the ResizeObserver more safely
  useEffect(() => {
    if (!containerRef.current) return;

    const handleResize = () => {
      // Clear any existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Use a timeout to debounce and avoid too many resize events
      resizeTimeoutRef.current = setTimeout(() => {
        if (isResizing.current) return;
        isResizing.current = true;

        try {
          if (svgRef.current) {
            updateSVGDimensions();
          } else {
            performRender();
          }
        } catch (error) {
          console.error('Error handling resize:', error);
        } finally {
          isResizing.current = false;
        }
      }, 100);
    };

    // Use a more controlled approach instead of direct ResizeObserver use
    // This helps prevent the "loop completed with undelivered notifications" error
    window.addEventListener('resize', handleResize);

    // Initial render
    performRender();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  // Handle dependency changes
  useEffect(() => {
    // Skip if refs aren't available
    if (!containerRef.current) return;

    // Run on initial render or when dependencies change
    const shouldUpdate =
      isInitialRender.current ||
      dependencies.length !== previousDependencies.current.length ||
      dependencies.some((dep, i) => dep !== previousDependencies.current[i]);

    if (shouldUpdate) {
      // Update previous dependencies
      previousDependencies.current = [...dependencies];
      isInitialRender.current = false;

      // Clear any pending render
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }

      // Render after a small delay to batch multiple rapid changes
      renderTimerRef.current = setTimeout(performRender, 10);
    }

    // Cleanup when component unmounts or dependencies change
    return () => {
      if (cleanupFnRef.current) {
        try {
          cleanupFnRef.current();
        } catch (e) {
          console.error('Effect cleanup error:', e);
        }
        cleanupFnRef.current = null;
      }

      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }
    };
  }, [...dependencies]);

  // Clean up everything when component unmounts
  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      cleanupSVG();
    };
  }, []);

  return { containerRef, svgRef };
}

export default useD3;
