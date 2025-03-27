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

  // Store the render function in a ref to avoid it being included in dependencies
  const renderFnRef = useRef(renderFn);

  // Update the renderFnRef when renderFn changes
  useEffect(() => {
    renderFnRef.current = renderFn;
  }, [renderFn]);

  // Debounce function to avoid too many renders in rapid succession
  const debounce = (func, delay) => {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };
  };

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

  // Function to perform the actual rendering
  const performRender = () => {
    // Skip if container ref isn't available
    if (!containerRef.current) return;

    // Clean up any existing SVG elements
    cleanupSVG();

    // Always create a new SVG element
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 350;

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      try {
        // Apply will-change to hint browser about upcoming animations
        d3.select(containerRef.current)
          .style('will-change', 'transform')
          .style('transform', 'translateZ(0)'); // Force GPU acceleration

        // Create SVG with hardware acceleration hints
        svgRef.current = d3
          .select(containerRef.current)
          .append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('viewBox', [0, 0, width, height])
          .style('transform', 'translate3d(0,0,0)')
          .style('backface-visibility', 'hidden')
          .style('will-change', 'transform')
          .style('transform-style', 'preserve-3d');

        // If there's an existing resize observer, disconnect it
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }

        // Create a resize observer to handle window resizing efficiently
        resizeObserverRef.current = new ResizeObserver(
          debounce(() => {
            if (containerRef.current && svgRef.current) {
              const newWidth = containerRef.current.clientWidth;
              const newHeight = containerRef.current.clientHeight || 350;

              svgRef.current
                .attr('width', newWidth)
                .attr('height', newHeight)
                .attr('viewBox', [0, 0, newWidth, newHeight]);

              // Clean up and re-render
              if (cleanupFnRef.current) {
                try {
                  cleanupFnRef.current();
                } catch (e) {
                  console.error('Error in resize cleanup function:', e);
                }
                cleanupFnRef.current = null;
              }

              try {
                const cleanupFn = renderFnRef.current(
                  containerRef,
                  svgRef.current
                );
                if (typeof cleanupFn === 'function') {
                  cleanupFnRef.current = cleanupFn;
                }
              } catch (e) {
                console.error('Error in resize render function:', e);
              }
            }
          }, 150)
        );

        resizeObserverRef.current.observe(containerRef.current);

        // Call the render function using the ref
        try {
          const cleanupFn = renderFnRef.current(containerRef, svgRef.current);

          // Store cleanup function for later
          if (typeof cleanupFn === 'function') {
            cleanupFnRef.current = cleanupFn;
          }
        } catch (e) {
          console.error('Error in render function:', e);
        }

        // Remove acceleration hints after rendering is complete
        setTimeout(() => {
          if (containerRef.current) {
            d3.select(containerRef.current).style('will-change', 'auto');
          }
        }, 1000);
      } catch (e) {
        console.error('Error setting up SVG:', e);
      }
    });
  };

  useEffect(() => {
    // Skip if refs aren't available
    if (!containerRef.current) return;

    // Check if dependencies have actually changed to avoid unnecessary re-renders
    let shouldUpdate = isInitialRender.current;

    if (
      !shouldUpdate &&
      dependencies.length === previousDependencies.current.length
    ) {
      for (let i = 0; i < dependencies.length; i++) {
        if (dependencies[i] !== previousDependencies.current[i]) {
          shouldUpdate = true;
          break;
        }
      }
    }

    // Force update if visualizationKey dependency changed
    const hasKeyDependency = dependencies.some(
      (dep) =>
        typeof dep === 'number' &&
        previousDependencies.current.some(
          (prev) => typeof prev === 'number' && prev !== dep
        )
    );

    if (hasKeyDependency) {
      shouldUpdate = true;
    }

    if (!shouldUpdate) {
      return;
    }

    // Update previous dependencies
    previousDependencies.current = [...dependencies];
    isInitialRender.current = false;

    // Clear any pending render
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }

    // Delay the rendering slightly to batch operations
    renderTimerRef.current = setTimeout(performRender, 10);

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

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [...dependencies]);

  return { containerRef, svgRef };
}

export default useD3;
