import React, { useCallback, useRef } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import useD3 from '../../hooks/improved/useD3';
import {
  isLargeDataset,
  throttle,
  defaultPerformanceSettings,
} from '../../utils/visualizationSettings';

/**
 * SankeyDiagram component for visualizing transaction flows as a Sankey diagram.
 * This component is extracted from TransactionFlow for better modularity.
 */
const SankeyDiagram = ({
  flowData,
  nodes,
  links,
  skippedLinkCount,
  totalLinkCount,
  performanceSettings = defaultPerformanceSettings,
}) => {
  // Keep track of animation cleanup functions
  const animationCleanupFnsRef = useRef([]);
  // Keep track of simulation for force-directed graph
  const simulationRef = useRef(null);

  // Create the Sankey diagram visualization
  const { containerRef } = useD3(
    useCallback(
      (containerRef, svg) => {
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

        // Stop any existing simulation
        if (simulationRef.current) {
          simulationRef.current.stop();
          simulationRef.current = null;
        }

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

        // Check if we need to optimize for large datasets
        const isLarge = isLargeDataset(flowData, performanceSettings);

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

        // Check if very few links (but we still want to render Sankey)
        if (links.length < 2) {
          // Add title explaining the issue
          svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2 - 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#FF5555')
            .text('Not enough transaction links to display Sankey diagram');

          svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2 + 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'white')
            .text(
              'Try expanding your filter criteria to include more transactions'
            );
          return;
        }

        try {
          // Add title for the visualization
          svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', 'white')
            .attr('font-weight', 'bold')
            .text('Transaction Flow (Sankey View)');

          // Create a Sankey generator with optimized parameters for large datasets
          const sankeyGenerator = sankey()
            .nodeWidth(15)
            .nodePadding(isLarge ? 5 : 10) // Reduce padding for large datasets
            .extent([
              [50, 50], // Adjusted to make room for title
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
            .style('pointer-events', 'none');

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
          if (!isLarge) {
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
          const labelNodes = isLarge
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
                `Showing ${links.length} of ${totalLinkCount} transactions`
              );
          }
        } catch (error) {
          console.error('Error rendering Sankey diagram:', error);

          // Add error message
          svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2 - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#FF5555')
            .text('Error rendering Sankey diagram');

          svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', height / 2 + 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', 'white')
            .text('Try adjusting filters to reduce network complexity');
        }

        // Clean up function
        return () => {
          try {
            // Stop all ongoing animations
            svg.selectAll('*').interrupt();

            // Stop any simulation
            if (simulationRef.current) {
              simulationRef.current.stop();
              simulationRef.current = null;
            }

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
      [
        flowData,
        performanceSettings,
        nodes,
        links,
        skippedLinkCount,
        totalLinkCount,
      ]
    ),
    [flowData, nodes, links, skippedLinkCount, totalLinkCount]
  );

  /**
   * Renders a force-directed graph as a fallback when Sankey diagram cannot be rendered
   * This function is kept for reference but is not used in the current implementation
   * as we now always render the Sankey diagram
   *
   * @param {d3.Selection} svg - D3 selection of SVG element
   * @param {Array} flowData - Array of flow items with source, target, and amount
   * @param {number} width - Width of the SVG
   * @param {number} height - Height of the SVG
   */
  const renderForceDirectedGraph = (svg, flowData, width, height) => {
    // This function is now kept for reference only and is not used
    console.log(
      'Force-directed graph visualization is disabled - using Sankey diagram instead'
    );
  };

  // Sankey diagram has empty state handling in parent component
  return (
    <div
      ref={containerRef}
      className='w-full p-2 relative overflow-hidden'
      style={{ height: '400px' }}
      role='presentation'
      aria-label='Transaction flow Sankey visualization'>
      {/* SVG will be inserted here by useD3 */}
    </div>
  );
};

export default SankeyDiagram;
