import React, { useCallback, useMemo, useState } from 'react';
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

  // Main render function to be passed to useD3
  const renderFlow = useCallback(
    (containerRef, svg) => {
      if (!flowData || flowData.length === 0) return;

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
      } catch (error) {
        console.error('Error rendering Sankey diagram:', error);

        // Create a more helpful fallback visualization
        // Clear the svg in case we have partial renders
        svg.selectAll('*').remove();

        // Add background again
        svg
          .append('rect')
          .attr('width', '100%')
          .attr('height', '100%')
          .attr('fill', '#121923')
          .attr('rx', 8);

        // Better heading
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', 30)
          .attr('text-anchor', 'middle')
          .attr('font-size', '16px')
          .attr('fill', 'white')
          .attr('font-weight', 'bold')
          .text('Transaction Flow Summary');

        // Information about complexity
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height / 2 - 40)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('fill', '#F7931A')
          .text('Network has complex circular payment patterns');

        // Info circle for main message
        const infoCircle = svg
          .append('circle')
          .attr('cx', width / 2)
          .attr('cy', height / 2)
          .attr('r', 70)
          .attr('fill', 'rgba(61, 142, 247, 0.1)')
          .attr('stroke', 'rgba(61, 142, 247, 0.3)')
          .attr('stroke-width', 2);

        // Add transaction count
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height / 2 - 10)
          .attr('text-anchor', 'middle')
          .attr('font-size', '24px')
          .attr('fill', 'white')
          .attr('font-weight', 'bold')
          .text(flowData.length);

        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height / 2 + 15)
          .attr('text-anchor', 'middle')
          .attr('font-size', '14px')
          .attr('fill', 'white')
          .text('Transactions');

        // Node count
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height / 2 + 50)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('fill', '#ccc')
          .text(`Between ${nodeSet.size} nodes`);

        // Add suggestion for understanding the data
        svg
          .append('text')
          .attr('x', width / 2)
          .attr('y', height - 50)
          .attr('text-anchor', 'middle')
          .attr('font-size', '11px')
          .attr('fill', '#999')
          .text('Try the Network Graph visualization for an alternative view');

        // Add explanation about circular references
        const explanationBox = svg
          .append('g')
          .attr('transform', `translate(${width / 2 - 150}, ${height - 35})`);

        explanationBox
          .append('rect')
          .attr('width', 300)
          .attr('height', 20)
          .attr('fill', 'rgba(0, 0, 0, 0.3)')
          .attr('rx', 3);

        explanationBox
          .append('text')
          .attr('x', 150)
          .attr('y', 13)
          .attr('text-anchor', 'middle')
          .attr('font-size', '9px')
          .attr('fill', '#999')
          .text(
            `${Math.round(
              (skippedLinkCount / flowData.length) * 100
            )}% of connections form circular payment paths`
          );
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

      // Add title and legend
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', 'white')
        .attr('font-weight', 'bold')
        .text('Transaction Flow Visualization');

      // Create a simple legend
      const legend = svg
        .append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(20, ${height - 50})`);

      legend
        .append('rect')
        .attr('width', 120)
        .attr('height', 40)
        .attr('fill', 'rgba(0, 0, 0, 0.4)')
        .attr('rx', 3);

      legend
        .append('rect')
        .attr('x', 10)
        .attr('y', 10)
        .attr('width', 15)
        .attr('height', 10)
        .attr('fill', '#F7931A')
        .attr('opacity', 0.7)
        .attr('rx', 2);

      legend
        .append('text')
        .attr('x', 35)
        .attr('y', 18)
        .attr('font-size', '8px')
        .attr('fill', 'white')
        .text('Node');

      legend
        .append('line')
        .attr('x1', 10)
        .attr('y1', 30)
        .attr('x2', 25)
        .attr('y2', 30)
        .attr('stroke', 'url(#flow-gradient)')
        .attr('stroke-width', 3)
        .attr('opacity', 0.5);

      legend
        .append('text')
        .attr('x', 35)
        .attr('y', 32)
        .attr('font-size', '8px')
        .attr('fill', 'white')
        .text('Transaction Flow');

      // Clean up function
      return () => {
        // Remove any timers or other resources here
      };
    },
    [flowData]
  );

  // Memoized dependencies
  const dependencies = useMemo(() => {
    return [flowData, flowData?.length];
  }, [flowData]);

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

  // Use React to display information about filtered links
  const filterInfo =
    filteredLinkCount > 0 ? (
      <div className='absolute top-2 right-2 bg-dark-blue/30 border border-lightning-blue/30 text-xs px-2 py-1 rounded text-satoshi-white'>
        <span className='text-lightning-blue'>
          {Math.round((filteredLinkCount / totalLinkCount) * 100)}%
        </span>{' '}
        circular connections filtered
      </div>
    ) : null;

  return (
    <div
      ref={containerRef}
      className='w-full p-2 relative overflow-hidden'
      style={{ height: '400px' }}
      role='presentation'
      aria-label='Transaction flow visualization'>
      {filterInfo}
      {/* SVG will be inserted here by useD3 */}
    </div>
  );
};

export default TransactionFlow;
