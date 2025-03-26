import React, { useCallback, useMemo, useState, useEffect } from 'react';
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
  // Add state for visualization mode
  const [visualizationMode, setVisualizationMode] = useState('sankey'); // 'sankey' or 'tabular'
  // Add a key to force re-render when toggling visualization modes
  const [visualizationKey, setVisualizationKey] = useState(0);

  // Toggle visualization mode
  const toggleVisualizationMode = () => {
    // Toggle the mode
    setVisualizationMode((prev) => (prev === 'sankey' ? 'tabular' : 'sankey'));
    // Increment the key to force a complete re-render of the D3 visualization
    setVisualizationKey((prev) => prev + 1);
  };

  // Calculate circular connection percentage whenever filtered link count changes
  useEffect(() => {
    if (totalLinkCount > 0) {
      const percentage = Math.round((filteredLinkCount / totalLinkCount) * 100);
      setCircularConnectionPercentage(percentage);
    }
  }, [filteredLinkCount, totalLinkCount]);

  // Main render function to be passed to useD3
  const renderFlow = useCallback(
    (containerRef, svg) => {
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

      // Calculate circular connection percentage for display
      const currentCircularConnectionPercentage =
        flowData.length > 0
          ? Math.round((skippedLinkCount / flowData.length) * 100)
          : 0;

      console.log(
        `Visualization mode: ${visualizationMode}, Circular connections: ${currentCircularConnectionPercentage}%`
      );

      // Choose visualization based on selected mode
      if (visualizationMode === 'tabular') {
        console.log('Rendering tabular view');
        renderTabularView();
      } else {
        // Default to Sankey diagram
        console.log('Rendering Sankey view');
        try {
          renderSankeyDiagram();
        } catch (error) {
          console.error('Error rendering Sankey diagram:', error);
          // Fall back to tabular visualization as it's simplest
          svg.selectAll('*').remove();
          renderTabularView();
        }
      }

      // Function to render Sankey diagram
      function renderSankeyDiagram() {
        // Create a Sankey generator
        const sankeyGenerator = sankey()
          .nodeWidth(15)
          .nodePadding(10)
          .extent([
            [50, 10],
            [width - 50, height - 30],
          ]);

        // Generate the layout with error handling
        const sankeyData = sankeyGenerator({
          nodes: nodes.map((d) => ({ ...d })),
          links: links.map((d) => ({ ...d })),
        });

        // Create link paths
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
          .attr('opacity', 0.3)
          .on('mouseover', function (event, d) {
            d3.select(this)
              .transition()
              .duration(200)
              .attr('opacity', 0.7)
              .attr('stroke-width', (d) => Math.max(1, d.width + 2));

            // Show tooltip
            const [x, y] = d3.pointer(event, containerRef.current);

            let tooltip = svg.select('.tooltip');
            if (tooltip.empty()) {
              tooltip = svg
                .append('g')
                .attr('class', 'tooltip')
                .attr('transform', `translate(${x}, ${y})`)
                .attr('opacity', 0);

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

              tooltip.transition().duration(200).attr('opacity', 1);
            } else {
              tooltip
                .attr('transform', `translate(${x}, ${y})`)
                .attr('opacity', 1);
            }

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
          })
          .on('mouseout', function () {
            d3.select(this)
              .transition()
              .duration(300)
              .attr('opacity', 0.3)
              .attr('stroke-width', (d) => Math.max(1, d.width));

            // Remove tooltip with fade
            const existingTooltip = svg.select('.tooltip');
            if (!existingTooltip.empty()) {
              existingTooltip
                .transition()
                .duration(200)
                .attr('opacity', 0)
                .on('end', function () {
                  d3.select(this).remove();
                });
            }
          });

        // Add animated flow particles
        sankeyData.links.forEach((d) => {
          // Skip links that are too small to show particles
          if (d.width < 2) return;

          // Calculate the number of particles based on the value, but limit for performance
          const particleCount = Math.min(
            3,
            Math.max(1, Math.floor(d.value / 100))
          );

          // Get the path element for this link
          const path = d3.select(link.nodes()[sankeyData.links.indexOf(d)]);
          const pathNode = path.node();
          const pathLength = pathNode.getTotalLength();

          // Create particle group for this link
          const particleGroup = svg.append('g').attr('class', 'particles');

          // Add particles
          for (let i = 0; i < particleCount; i++) {
            const offset = (i / particleCount) * pathLength;

            // Create the particle
            particleGroup
              .append('circle')
              .attr('r', 1.5)
              .attr('fill', 'white')
              .attr('opacity', 0.7)
              .call(animateParticle, pathNode, offset, pathLength);
          }
        });

        // Create node rectangles
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
          .attr('opacity', 0.7)
          .on('mouseover', function (event, d) {
            // Highlight this node
            d3.select(this)
              .transition()
              .duration(200)
              .attr('opacity', 1)
              .attr('stroke', 'white');

            // Highlight associated links
            link
              .transition()
              .duration(200)
              .attr('opacity', (l) =>
                l.source.index === d.index || l.target.index === d.index
                  ? 0.7
                  : 0.1
              )
              .attr('stroke-width', (l) => {
                // Make associated links thicker
                if (l.source.index === d.index || l.target.index === d.index) {
                  return Math.max(1, l.width + 1);
                }
                return Math.max(1, l.width);
              });

            // Highlight connected nodes
            node
              .select('rect')
              .transition()
              .duration(200)
              .attr('opacity', (n) => {
                // Check if this node is connected to the hovered node
                const isConnected = sankeyData.links.some(
                  (l) =>
                    (l.source.index === d.index &&
                      l.target.index === n.index) ||
                    (l.source.index === n.index && l.target.index === d.index)
                );
                return isConnected || n.index === d.index ? 1 : 0.3;
              });
          })
          .on('mouseout', function () {
            // Reset all elements
            node
              .select('rect')
              .transition()
              .duration(300)
              .attr('opacity', 0.7)
              .attr('stroke', '#10151F');

            link
              .transition()
              .duration(300)
              .attr('opacity', 0.3)
              .attr('stroke-width', (d) => Math.max(1, d.width));
          });

        // Add node labels
        node
          .append('text')
          .attr('x', (d) => (d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6))
          .attr('y', (d) => (d.y1 - d.y0) / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', (d) => (d.x0 < width / 2 ? 'start' : 'end'))
          .attr('font-size', '10px')
          .attr('fill', 'white')
          .text((d) => d.id)
          .each(function (d) {
            // Truncate text if too long
            const text = d3.select(this);
            let textLength = text.node().getComputedTextLength();
            let textContent = text.text();
            const maxWidth = 80;

            if (textLength > maxWidth) {
              while (textLength > maxWidth && textContent.length > 0) {
                textContent = textContent.slice(0, -1);
                text.text(textContent + '...');
                textLength = text.node().getComputedTextLength();
              }
            }
          });

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
            .text(`Showing ${links.length} of ${flowData.length} transactions`);
        }
      }

      // Function to animate a particle along a path
      function animateParticle(circle, path, initialOffset, pathLength) {
        // Amount of time (in ms) to make a complete journey
        const duration = 3000 + Math.random() * 1000;

        function animate() {
          // Progress from 0 to 1 based on current time
          circle
            .transition()
            .duration(duration)
            .attrTween('transform', function () {
              return function (t) {
                // Calculate position along the path
                const pos = path.getPointAtLength(
                  (initialOffset + t * pathLength) % pathLength
                );
                return `translate(${pos.x}, ${pos.y})`;
              };
            })
            .on('end', animate); // Repeat animation
        }

        // Start the animation
        animate();
      }

      // Function to render a tabular view
      function renderTabularView() {
        // Clear the svg
        svg.selectAll('*').remove();

        // Add background
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
      }

      // Clean up function
      return () => {
        // Remove any timers or other resources here
      };
    },
    [flowData, visualizationMode]
  );

  // Memoized dependencies
  const dependencies = useMemo(() => {
    return [flowData, visualizationMode, visualizationKey];
  }, [flowData, visualizationMode, visualizationKey]);

  // Use our custom hook for D3 integration
  const { containerRef } = useD3(renderFlow, dependencies);

  // Handle empty state
  if (!flowData || flowData.length === 0) {
    return (
      <div
        className='flex items-center justify-center h-96 bg-dark-node rounded-lg border border-lightning-blue/20 text-satoshi-white'
        ref={containerRef}>
        <p>Waiting for transaction flow data...</p>
      </div>
    );
  }

  // Current visualization mode descriptive text
  const currentModeText = visualizationMode === 'sankey' ? 'Sankey' : 'Table';

  // Use React to display information about filtered links and visualization controls
  const infoPanel = (
    <div className='absolute top-2 right-2 flex flex-col items-end gap-2'>
      {filteredLinkCount > 0 && visualizationMode === 'sankey' && (
        <div className='bg-dark-blue/30 border border-lightning-blue/30 text-xs px-2 py-1 rounded text-satoshi-white'>
          <span className='text-lightning-blue'>
            {circularConnectionPercentage}%
          </span>{' '}
          circular connections filtered
        </div>
      )}
      <button
        onClick={toggleVisualizationMode}
        className='bg-gradient-to-r from-bitcoin-orange to-lightning-blue text-satoshi-white text-xs px-3 py-1 rounded border border-bitcoin-orange/30 hover:opacity-90 transition-opacity'>
        View: {currentModeText}
      </button>
    </div>
  );

  return (
    <div
      key={`flow-${visualizationMode}-${visualizationKey}`}
      ref={containerRef}
      className='w-full p-2 relative overflow-hidden'
      style={{ height: '400px' }}
      role='presentation'
      aria-label='Transaction flow visualization'>
      {infoPanel}
      {/* SVG will be inserted here by useD3 */}
    </div>
  );
};

export default TransactionFlow;
