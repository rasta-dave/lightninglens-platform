import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import useD3 from '../../hooks/improved/useD3';

/**
 * Improved TransactionFlow component that uses the useD3 hook for better
 * integration with React lifecycle. This component renders a Sankey diagram
 * visualization of transaction flows between nodes.
 */
const TransactionFlow = ({ flowData }) => {
  // State to track filtered links
  const [filteredLinkCount, setFilteredLinkCount] = useState(0);
  const [totalLinkCount, setTotalLinkCount] = useState(0);
  const [circularConnectionPercentage, setCircularConnectionPercentage] =
    useState(0);
  // Add state for visualization mode - default to sankey mode as primary visualization
  const [visualizationMode, setVisualizationMode] = useState('sankey'); // 'sankey' or 'tabular'
  // Add a key to force re-render when toggling visualization modes
  const [visualizationKey, setVisualizationKey] = useState(0);

  // Store last successful mode in ref to handle failed renders
  const lastSuccessfulModeRef = useRef('sankey');

  // Add a performance settings object at the top of the component
  // This allows easy tuning of performance-critical parameters
  const performanceSettings = useMemo(
    () => ({
      // Maximum particles per link - lower is better for performance
      maxParticlesPerLink: 3,
      // Minimum link width to show particles
      minLinkWidthForParticles: 2, // Reduced from 3 to show more animations
      // Animation duration in ms (higher = smoother but more CPU intensive)
      animationDuration: 4000, // Increased for smoother animation
      // Skip animations entirely for very large datasets
      skipAnimationsThreshold: 150, // Increased threshold to allow animations for medium datasets
      // Maximum nodes to show labels for
      maxNodeLabels: 40, // Increased from 30
      // Throttle mouseover events to improve performance
      mouseEventThrottle: 40, // ms (slightly increased to reduce event processing)
      // Use simplified animation for better performance
      useSimplifiedAnimation: false, // Set to true for very large datasets
    }),
    []
  );

  // Calculate whether this is a large dataset that needs performance optimizations
  const isLargeDataset = useMemo(() => {
    if (!flowData) return false;
    return flowData.length > performanceSettings.skipAnimationsThreshold;
  }, [flowData, performanceSettings.skipAnimationsThreshold]);

  // Make sure the toggle function properly updates the visualizationMode and forces a re-render
  const toggleVisualizationMode = useCallback(() => {
    console.log('Toggling visualization mode from:', visualizationMode);
    // Toggle the mode
    const newMode = visualizationMode === 'sankey' ? 'tabular' : 'sankey';
    setVisualizationMode(newMode);
    // Store the attempted mode change
    lastSuccessfulModeRef.current = newMode;
    // Increment the key to force a complete re-render of the D3 visualization
    setVisualizationKey((prev) => prev + 1);
  }, [visualizationMode]);

  // Calculate circular connection percentage whenever filtered link count changes
  useEffect(() => {
    if (totalLinkCount > 0) {
      const percentage = Math.round((filteredLinkCount / totalLinkCount) * 100);
      setCircularConnectionPercentage(percentage);
    }
  }, [filteredLinkCount, totalLinkCount]);

  // Throttle function for mouse events to reduce computational load
  const throttle = useCallback((func, limit) => {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  }, []);

  // Add refs to maintain state persistence across rerenders
  const lastSuccessfulRenderTimeRef = useRef(null);
  const hasRenderedSankeyRef = useRef(false);

  // Track animations and cleanup functions to prevent memory leaks
  const animationCleanupFnsRef = useRef([]);

  // Create separate hooks for each visualization type
  const { containerRef: sankeyContainerRef } = useD3(
    useCallback(
      (containerRef, svg) => {
        console.log('Rendering Sankey diagram');
        if (!flowData || flowData.length === 0) return;

        // Clear any previous cleanup functions
        animationCleanupFnsRef.current.forEach((cleanup) => {
          if (typeof cleanup === 'function') {
            try {
              cleanup();
            } catch (e) {
              console.error('Error in animation cleanup:', e);
            }
          }
        });
        animationCleanupFnsRef.current = [];

        // Clear any existing content to ensure clean rendering
        svg.selectAll('*').remove();

        // Get dimensions
        const width = containerRef.current.clientWidth;
        const height = 400;

        // Set up the SVG with background
        svg
          .attr('width', width)
          .attr('height', height)
          .attr('viewBox', [0, 0, width, height]);

        // Add background rectangle
        svg
          .append('rect')
          .attr('width', '100%')
          .attr('height', '100%')
          .attr('fill', '#121923')
          .attr('rx', 8);

        // Process data for Sankey diagram
        // First, get all unique source and target nodes
        const nodeSet = new Set();
        flowData.forEach((item) => {
          nodeSet.add(item.source);
          nodeSet.add(item.target);
        });

        // Convert to array of node objects
        const nodes = Array.from(nodeSet).map((id) => ({ id }));

        // Create a directed graph adjacency list to detect cycles
        const graph = {};
        nodes.forEach((node) => {
          graph[node.id] = [];
        });

        // Populate adjacency list
        flowData.forEach((item) => {
          if (!graph[item.source].includes(item.target)) {
            graph[item.source].push(item.target);
          }
        });

        // Filter out links that create cycles
        const safeFlowData = [];
        const visitedInCurrentPath = {};
        const visited = {};
        let skippedLinkCount = 0;

        // DFS to detect cycles
        function hasCycle(node, path = {}) {
          if (path[node]) return true;
          if (visited[node]) return false;

          path[node] = true;
          visited[node] = true;

          for (const neighbor of graph[node]) {
            if (hasCycle(neighbor, { ...path })) {
              return true;
            }
          }

          path[node] = false;
          return false;
        }

        // Check each flow data item
        flowData.forEach((item) => {
          // Skip self-loops
          if (item.source === item.target) {
            skippedLinkCount++;
            return;
          }

          // Test if adding this link would create a cycle
          const tempGraph = { ...graph };

          // Temporarily remove this link to test
          tempGraph[item.source] = tempGraph[item.source].filter(
            (t) => t !== item.target
          );

          // Add link back and check for cycles
          tempGraph[item.source].push(item.target);

          // Reset visited states
          Object.keys(graph).forEach((key) => {
            visitedInCurrentPath[key] = false;
            visited[key] = false;
          });

          // If no cycle is detected with this link, include it
          let cycleDetected = false;
          for (const node in tempGraph) {
            if (!visited[node] && hasCycle(node, {})) {
              cycleDetected = true;
              break;
            }
          }

          if (!cycleDetected) {
            safeFlowData.push(item);
          } else {
            skippedLinkCount++;
            console.log(
              `Skipping link from ${item.source} to ${item.target} to avoid cycle`
            );
          }
        });

        // Update state with filtered link count
        setFilteredLinkCount(skippedLinkCount);
        setTotalLinkCount(flowData.length);

        // If we ended up removing all links, use a simpler approach
        if (safeFlowData.length === 0 && flowData.length > 0) {
          // Just use unique source-target pairs and ignore directionality
          const seenPairs = new Set();
          flowData.forEach((item) => {
            const pair = [item.source, item.target].sort().join('-');
            if (!seenPairs.has(pair) && item.source !== item.target) {
              seenPairs.add(pair);
              safeFlowData.push(item);
            }
          });
        }

        // Create links array for Sankey
        const links = safeFlowData.map((item) => ({
          source: nodes.findIndex((n) => n.id === item.source),
          target: nodes.findIndex((n) => n.id === item.target),
          value: item.amount || 1,
          originalData: item,
        }));

        // Define gradients for visual effects
        const defs = svg.append('defs');

        // Link gradient
        const flowGradient = defs
          .append('linearGradient')
          .attr('id', 'flow-gradient')
          .attr('gradientUnits', 'userSpaceOnUse');
        flowGradient
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', '#F7931A');
        flowGradient
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', '#3D8EF7');

        try {
          // Create a Sankey generator with optimized parameters for large datasets
          const sankeyGenerator = sankey()
            .nodeWidth(15)
            .nodePadding(isLargeDataset ? 5 : 10) // Reduce padding for large datasets
            .extent([
              [50, 10],
              [width - 50, height - 30],
            ]);

          // Generate the layout with error handling
          const sankeyData = sankeyGenerator({
            nodes: nodes.map((d) => ({ ...d })),
            links: links.map((d) => ({ ...d })),
          });

          // Create link paths with optimized event listeners
          const link = svg
            .append('g')
            .selectAll('.flow-link')
            .data(sankeyData.links)
            .join('path')
            .attr('class', 'flow-link')
            .attr('d', sankeyLinkHorizontal())
            .attr('stroke', 'url(#flow-gradient)')
            .attr('stroke-width', (d) => Math.max(1, d.width))
            .attr('fill', 'none')
            .attr('opacity', 0.3);

          // Create a single tooltip for better performance
          let tooltip = svg
            .append('g')
            .attr('class', 'tooltip')
            .attr('opacity', 0)
            .style('pointer-events', 'none'); // Don't capture mouse events

          tooltip
            .append('rect')
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('fill', 'rgba(0, 0, 0, 0.7)')
            .attr('stroke', 'rgba(247, 147, 26, 0.6)')
            .attr('stroke-width', 0.5);

          tooltip
            .append('text')
            .attr('fill', 'white')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '10px');

          // Only add hover effects if the dataset is not too large
          if (!isLargeDataset) {
            // Create throttled mouseover handler
            const throttledMouseOver = throttle(function (event, d) {
              d3.select(this)
                .transition()
                .duration(200)
                .attr('opacity', 0.7)
                .attr('stroke-width', (d) => Math.max(1, d.width + 2));

              // Show tooltip
              const [x, y] = d3.pointer(event, containerRef.current);

              // Find original flow data
              const originalData = d.originalData || d;

              const tooltipText = originalData.count
                ? `${originalData.count} tx, ${Math.round(
                    originalData.amount
                  )} sats`
                : `${Math.round(d.value)} sats`;

              const text = tooltip.select('text').text(tooltipText);

              // Size the background rectangle to fit the text
              const textBBox = text.node().getBBox();
              tooltip
                .select('rect')
                .attr('width', textBBox.width + 10)
                .attr('height', textBBox.height + 6)
                .attr('x', -textBBox.width / 2 - 5)
                .attr('y', -textBBox.height / 2 - 3);

              // Position and show tooltip
              tooltip
                .attr('transform', `translate(${x}, ${y})`)
                .transition()
                .duration(200)
                .attr('opacity', 1);
            }, performanceSettings.mouseEventThrottle);

            // Create throttled mouseout handler
            const throttledMouseOut = throttle(function () {
              d3.select(this)
                .transition()
                .duration(300)
                .attr('opacity', 0.3)
                .attr('stroke-width', (d) => Math.max(1, d.width));

              // Hide tooltip
              tooltip.transition().duration(200).attr('opacity', 0);
            }, performanceSettings.mouseEventThrottle);

            // Add event listeners
            link
              .on('mouseover', throttledMouseOver)
              .on('mouseout', throttledMouseOut);
          }

          // Create node rectangles with optimized event handlers
          const node = svg
            .append('g')
            .selectAll('.flow-node')
            .data(sankeyData.nodes)
            .join('g')
            .attr('class', 'flow-node')
            .attr('transform', (d) => `translate(${d.x0}, ${d.y0})`);

          // Add node rectangles
          node
            .append('rect')
            .attr('height', (d) => d.y1 - d.y0)
            .attr('width', (d) => d.x1 - d.x0)
            .attr('fill', '#F7931A')
            .attr('stroke', '#10151F')
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('stroke-width', 1)
            .attr('opacity', 0.7);

          // Add node labels with performance optimization for large datasets
          const labelNodes = isLargeDataset
            ? sankeyData.nodes.slice(0, performanceSettings.maxNodeLabels)
            : sankeyData.nodes;

          node
            .filter((d, i) => labelNodes.some((n) => n.index === i))
            .append('text')
            .attr('x', (d) => (d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6))
            .attr('y', (d) => (d.y1 - d.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', (d) => (d.x0 < width / 2 ? 'start' : 'end'))
            .attr('font-size', '10px')
            .attr('fill', 'white')
            .text((d) => d.id);

          // Mark as successfully rendered
          hasRenderedSankeyRef.current = true;
          lastSuccessfulRenderTimeRef.current = Date.now();

          // If we filtered out links, show an info message
          if (skippedLinkCount > 0) {
            const infoBox = svg
              .append('g')
              .attr('class', 'info-box')
              .attr('transform', `translate(${width - 200}, 45)`);

            infoBox
              .append('rect')
              .attr('width', 190)
              .attr('height', 36)
              .attr('fill', 'rgba(61, 142, 247, 0.15)')
              .attr('stroke', 'rgba(61, 142, 247, 0.4)')
              .attr('rx', 4)
              .attr('stroke-width', 1);

            infoBox
              .append('text')
              .attr('x', 95)
              .attr('y', 15)
              .attr('text-anchor', 'middle')
              .attr('font-size', '10px')
              .attr('fill', '#3D8EF7')
              .text(
                `${skippedLinkCount} circular connection${
                  skippedLinkCount !== 1 ? 's' : ''
                } filtered`
              );

            infoBox
              .append('text')
              .attr('x', 95)
              .attr('y', 28)
              .attr('text-anchor', 'middle')
              .attr('font-size', '10px')
              .attr('fill', 'white')
              .text(
                `Showing ${links.length} of ${flowData.length} transactions`
              );
          }
        } catch (error) {
          console.error('Error rendering Sankey diagram:', error);

          // Add error message
          svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#FF5555')
            .text('Error rendering Sankey diagram');
        }

        // Clean up function
        return () => {
          console.log('Running Sankey cleanup');
          try {
            // Stop all ongoing animations
            svg.selectAll('*').interrupt();
            // Clear all animation cleanup functions
            animationCleanupFnsRef.current.forEach((cleanup) => {
              if (typeof cleanup === 'function') {
                try {
                  cleanup();
                } catch (e) {
                  console.error('Error in animation cleanup:', e);
                }
              }
            });
            // Reset the array
            animationCleanupFnsRef.current = [];
          } catch (e) {
            console.error('Error in Sankey cleanup:', e);
          }
        };
      },
      [flowData, performanceSettings, isLargeDataset, throttle]
    ),
    [flowData, visualizationKey]
  );

  const { containerRef: tableContainerRef } = useD3(
    useCallback(
      (containerRef, svg) => {
        console.log('Rendering tabular view');
        if (!flowData || flowData.length === 0) return;

        // Clear any existing content to ensure clean rendering
        svg.selectAll('*').remove();

        // Get dimensions
        const width = containerRef.current.clientWidth;
        const height = 400;

        // Set up the SVG with background
        svg
          .attr('width', width)
          .attr('height', height)
          .attr('viewBox', [0, 0, width, height]);

        // Add background rectangle
        svg
          .append('rect')
          .attr('width', '100%')
          .attr('height', '100%')
          .attr('fill', '#121923')
          .attr('rx', 8);

        // Add title
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', 30)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('fill', 'white')
          .attr('font-weight', 'bold')
          .text('Transaction Flow Summary');

        // Create a table-like structure
        const table = svg.append('g').attr('transform', `translate(20, 60)`);

        // Headers
        table
          .append('text')
          .attr('x', 10)
          .attr('y', 10)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', 'white')
          .text('Source');

        table
          .append('text')
          .attr('x', 150)
          .attr('y', 10)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', 'white')
          .text('Target');

        table
          .append('text')
          .attr('x', 290)
          .attr('y', 10)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', 'white')
          .text('Amount (sats)');

        table
          .append('text')
          .attr('x', 430)
          .attr('y', 10)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', 'white')
          .text('Transactions');

        // Add separator line
        table
          .append('line')
          .attr('x1', 0)
          .attr('y1', 20)
          .attr('x2', width - 40)
          .attr('y2', 20)
          .attr('stroke', 'white')
          .attr('opacity', 0.3);

        // Group transactions by source-target pair
        const txGroups = {};
        flowData.forEach((item) => {
          const key = `${item.source}-${item.target}`;
          if (!txGroups[key]) {
            txGroups[key] = {
              source: item.source,
              target: item.target,
              amount: 0,
              count: 0,
            };
          }
          txGroups[key].amount += item.amount || 0;
          txGroups[key].count += item.count || 1;
        });

        // Convert to array and sort by amount
        const rows = Object.values(txGroups).sort(
          (a, b) => b.amount - a.amount
        );

        // Only show top 10 rows
        const shownRows = rows.slice(0, 10);

        // Add rows
        shownRows.forEach((row, i) => {
          const y = 40 + i * 25;
          const rowGroup = table
            .append('g')
            .attr('transform', `translate(0, ${y})`);

          // Alternating row backgrounds
          if (i % 2 === 0) {
            rowGroup
              .append('rect')
              .attr('x', 0)
              .attr('y', -12)
              .attr('width', width - 40)
              .attr('height', 25)
              .attr('fill', 'rgba(255, 255, 255, 0.05)')
              .attr('rx', 3);
          }

          // Source cell with bitcoin-orange accent
          rowGroup
            .append('rect')
            .attr('x', 5)
            .attr('y', -10)
            .attr('width', 3)
            .attr('height', 20)
            .attr('fill', '#F7931A')
            .attr('rx', 1);

          rowGroup
            .append('text')
            .attr('x', 15)
            .attr('y', 3)
            .attr('font-size', '11px')
            .attr('fill', 'white')
            .text(row.source);

          // Target cell with lightning-blue accent
          rowGroup
            .append('rect')
            .attr('x', 145)
            .attr('y', -10)
            .attr('width', 3)
            .attr('height', 20)
            .attr('fill', '#3D8EF7')
            .attr('rx', 1);

          rowGroup
            .append('text')
            .attr('x', 155)
            .attr('y', 3)
            .attr('font-size', '11px')
            .attr('fill', 'white')
            .text(row.target);

          // Amount
          rowGroup
            .append('text')
            .attr('x', 295)
            .attr('y', 3)
            .attr('font-size', '11px')
            .attr('fill', '#F7931A')
            .text(Math.round(row.amount).toLocaleString());

          // Count
          rowGroup
            .append('text')
            .attr('x', 435)
            .attr('y', 3)
            .attr('font-size', '11px')
            .attr('fill', '#3D8EF7')
            .text(row.count);
        });

        // Add total
        const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
        const totalCount = rows.reduce((sum, row) => sum + row.count, 0);

        const totalY = 40 + shownRows.length * 25 + 20;

        table
          .append('line')
          .attr('x1', 0)
          .attr('y1', totalY - 10)
          .attr('x2', width - 40)
          .attr('y2', totalY - 10)
          .attr('stroke', 'white')
          .attr('opacity', 0.3);

        table
          .append('text')
          .attr('x', 15)
          .attr('y', totalY + 5)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', 'white')
          .text('TOTAL');

        table
          .append('text')
          .attr('x', 295)
          .attr('y', totalY + 5)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', '#F7931A')
          .text(Math.round(totalAmount).toLocaleString());

        table
          .append('text')
          .attr('x', 435)
          .attr('y', totalY + 5)
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', '#3D8EF7')
          .text(totalCount);

        // Add note if showing partial data
        if (rows.length > 10) {
          table
            .append('text')
            .attr('x', width / 2)
            .attr('y', totalY + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', 'rgba(255, 255, 255, 0.7)')
            .text(`Showing top 10 of ${rows.length} transaction pairs`);
        }
      },
      [flowData]
    ),
    [flowData, visualizationKey]
  );

  // Handle empty state
  if (!flowData || flowData.length === 0) {
    return (
      <div className='flex items-center justify-center h-96 bg-dark-node rounded-lg border border-lightning-blue/20 text-satoshi-white'>
        <p>Waiting for transaction flow data...</p>
      </div>
    );
  }

  // Return both visualizations in a flex column layout
  return (
    <div className='relative space-y-6'>
      {/* Sankey Diagram Section */}
      <div className='relative'>
        <div className='dashboard-card'>
          <div className='flex items-center mb-4'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6 mr-2 text-bitcoin-orange'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
              />
            </svg>
            <h2 className='dashboard-header'>Transaction Flow (Sankey View)</h2>
          </div>
          <div
            key={`sankey-${visualizationKey}`}
            ref={sankeyContainerRef}
            className='w-full p-2 relative overflow-hidden'
            style={{ height: '400px' }}
            role='presentation'
            aria-label='Transaction flow Sankey visualization'>
            {/* SVG will be inserted here by useD3 */}
          </div>
          {filteredLinkCount > 0 && (
            <div className='text-right text-xs text-satoshi-white/70 pr-4 mt-2'>
              <span className='text-lightning-blue'>
                {circularConnectionPercentage}%
              </span>{' '}
              circular connections filtered
            </div>
          )}
        </div>
      </div>

      {/* Table View Section */}
      <div className='relative'>
        <div className='dashboard-card'>
          <div className='flex items-center mb-4'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6 mr-2 text-lightning-blue'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
              />
            </svg>
            <h2 className='dashboard-header'>Transaction Flow (Table View)</h2>
          </div>
          <div
            key={`table-${visualizationKey}`}
            ref={tableContainerRef}
            className='w-full p-2 relative overflow-hidden'
            style={{ height: '400px' }}
            role='presentation'
            aria-label='Transaction flow tabular visualization'>
            {/* SVG will be inserted here by useD3 */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionFlow;
