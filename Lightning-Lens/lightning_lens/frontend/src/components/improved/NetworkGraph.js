import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import * as d3 from 'd3';
import useD3 from '../../hooks/improved/useD3';

/**
 * Improved NetworkGraph component that uses the useD3 hook for better
 * integration with React lifecycle. This component renders a force-directed
 * graph visualization of the Lightning Network nodes and links.
 */
const NetworkGraph = ({ nodes, links }) => {
  // Store persistent data across renders
  const nodeMapRef = useRef(new Map()); // Map of node ID to node object
  const persistentLinksRef = useRef([]); // Persistent links with proper references
  const animationRef = useRef(null); // Animation frame reference
  const lastTimeRef = useRef(0); // Timestamp for throttling animation
  const nodePositionsRef = useRef(new Map()); // Store stable node positions
  const isSimulationStabilizedRef = useRef(false); // Track if simulation has stabilized
  const simulationRef = useRef(null); // Keep reference to simulation

  // Define fixed height for the visualization
  const FIXED_HEIGHT = 350;

  // Debug log whenever nodes or links change
  useEffect(() => {
    console.log(
      `NetworkGraph received ${nodes?.length || 0} nodes and ${
        links?.length || 0
      } links`
    );
  }, [nodes, links]);

  // Create a memoized function for drag behavior
  const createDragBehavior = useCallback((simulation) => {
    function dragstarted(event) {
      if (!event.active && simulation) simulation.alphaTarget(0.2).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      // Constrain drag to bounds
      const width = event.subject.containerWidth || 600;
      const height = FIXED_HEIGHT;

      event.subject.fx = Math.max(10, Math.min(width - 10, event.x));
      event.subject.fy = Math.max(10, Math.min(height - 10, event.y));
    }

    function dragended(event) {
      if (!event.active && simulation) simulation.alphaTarget(0);
      // Pin the node in place after dragging
      // This helps maintain stability
    }

    return d3
      .drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }, []);

  // Safe path generator function
  const generateSafePath = useCallback((d) => {
    try {
      // Safely access source and target coordinates
      if (!d || !d.source || !d.target) return 'M0,0 L0,0';

      const sourceX = Number(d.source.x);
      const sourceY = Number(d.source.y);
      const targetX = Number(d.target.x);
      const targetY = Number(d.target.y);

      // Check if any coordinates are invalid
      if (
        isNaN(sourceX) ||
        isNaN(sourceY) ||
        isNaN(targetX) ||
        isNaN(targetY) ||
        !isFinite(sourceX) ||
        !isFinite(sourceY) ||
        !isFinite(targetX) ||
        !isFinite(targetY)
      ) {
        return 'M0,0 L0,0'; // Return invisible line
      }

      // Use simple straight line for stability
      return `M${sourceX},${sourceY} L${targetX},${targetY}`;
    } catch (error) {
      console.error('Error generating path:', error);
      return 'M0,0 L0,0'; // Return invisible line on error
    }
  }, []);

  // Safe node transform function
  const getNodeTransform = useCallback((d) => {
    try {
      if (!d) return 'translate(0, 0)';

      let x = Number(d.x);
      let y = Number(d.y);

      // Constrain coordinates to container bounds if valid
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        const width = d.containerWidth || 600;
        const height = FIXED_HEIGHT;

        x = Math.max(10, Math.min(width - 10, x));
        y = Math.max(10, Math.min(height - 10, y));

        // Update node object with constrained values
        d.x = x;
        d.y = y;

        // Store valid position
        nodePositionsRef.current.set(d.id, { x, y });

        return `translate(${x}, ${y})`;
      } else {
        // Try to use saved position
        const savedPos = nodePositionsRef.current.get(d.id);
        if (savedPos && isFinite(savedPos.x) && isFinite(savedPos.y)) {
          // Update node object
          d.x = savedPos.x;
          d.y = savedPos.y;
          return `translate(${savedPos.x}, ${savedPos.y})`;
        }
        return 'translate(0, 0)';
      }
    } catch (error) {
      console.error('Error generating node transform:', error);
      return 'translate(0, 0)';
    }
  }, []);

  // Main render function to be passed to useD3
  const renderGraph = useCallback(
    (containerRef, svg) => {
      if (!nodes || !links || nodes.length === 0) {
        console.log('NetworkGraph: No nodes or links to render');
        return;
      }

      console.log(
        `NetworkGraph: Rendering ${nodes.length} nodes and ${links.length} links`
      );

      try {
        // Get dimensions
        const width = containerRef.current.clientWidth;
        const height = FIXED_HEIGHT;

        // Store width in node objects for constraint calculations
        nodes.forEach((node) => {
          node.containerWidth = width;
        });

        // Assign static positions for nodes in a circle pattern if they don't have stable positions
        const radius = Math.min(width, height) / 2 - 50;
        const centerX = width / 2;
        const centerY = height / 2;

        nodes.forEach((node, i) => {
          // Check if we already have a stable position
          const savedPos = nodePositionsRef.current.get(node.id);

          if (!savedPos || !isFinite(savedPos.x) || !isFinite(savedPos.y)) {
            // Assign deterministic positions in a circle layout
            const angle = (i / nodes.length) * 2 * Math.PI;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);

            // Ensure position is within bounds
            node.x = Math.max(10, Math.min(width - 10, node.x));
            node.y = Math.max(10, Math.min(height - 10, node.y));

            // Store stable position
            nodePositionsRef.current.set(node.id, { x: node.x, y: node.y });
          } else {
            // Use saved position
            node.x = savedPos.x;
            node.y = savedPos.y;
          }

          // Store node for link reference
          nodeMapRef.current.set(node.id, node);
        });

        // Update existing links to reference current node objects
        persistentLinksRef.current = [];

        links.forEach((link) => {
          const sourceId =
            typeof link.source === 'object' ? link.source.id : link.source;
          const targetId =
            typeof link.target === 'object' ? link.target.id : link.target;

          const sourceNode = nodeMapRef.current.get(sourceId);
          const targetNode = nodeMapRef.current.get(targetId);

          if (sourceNode && targetNode) {
            persistentLinksRef.current.push({
              ...link,
              source: sourceNode,
              target: targetNode,
              value: link.value || 1,
              count: link.count || 1,
            });
          }
        });

        // Set up the SVG with background and fixed height
        svg
          .attr('width', width)
          .attr('height', height)
          .attr('viewBox', [0, 0, width, height])
          .style('max-height', `${height}px`);

        // Add background rectangle
        svg
          .append('rect')
          .attr('width', '100%')
          .attr('height', '100%')
          .attr('fill', '#121923')
          .attr('rx', 8);

        // Define gradients and filters for visual effects
        const defs = svg.append('defs');

        // Link gradient
        const linkGradient = defs
          .append('linearGradient')
          .attr('id', 'link-gradient')
          .attr('gradientUnits', 'userSpaceOnUse');
        linkGradient
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', '#3D8EF7');
        linkGradient
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', 'rgba(123, 61, 255, 0.7)');

        // Node gradient
        const nodeGradient = defs
          .append('radialGradient')
          .attr('id', 'node-gradient')
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('cx', '0')
          .attr('cy', '0')
          .attr('r', '20')
          .attr('spreadMethod', 'pad');
        nodeGradient
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', '#F7931A');
        nodeGradient
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', 'rgba(255, 215, 0, 0.8)');

        // Glow filter
        const filter = defs
          .append('filter')
          .attr('id', 'glow')
          .attr('x', '-50%')
          .attr('y', '-50%')
          .attr('width', '200%')
          .attr('height', '200%');
        filter
          .append('feGaussianBlur')
          .attr('stdDeviation', '1.5')
          .attr('result', 'coloredBlur');
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Create element groups for better organization
        const linkGroup = svg.append('g').attr('class', 'links');
        const nodeGroup = svg.append('g').attr('class', 'nodes');

        // Compute link width scale based on link values
        const maxLinkValue =
          d3.max(persistentLinksRef.current, (d) => d.value) || 1;
        const linkWidthScale = d3
          .scaleLinear()
          .domain([1, maxLinkValue])
          .range([0.8, 2.5])
          .clamp(true);

        // Draw links (simplified, no particles for stability)
        const link = linkGroup
          .selectAll('.link')
          .data(persistentLinksRef.current)
          .join('path')
          .attr('class', 'link')
          .attr('stroke', 'url(#link-gradient)')
          .attr('stroke-opacity', 0.4)
          .attr('stroke-width', (d) => linkWidthScale(d.value || 1))
          .attr('fill', 'none')
          .attr('d', generateSafePath);

        // Create a very gentle force simulation (mostly for initial positioning if needed)
        // This won't actually move the nodes much if they already have positions
        const simulation = d3
          .forceSimulation(nodes)
          .force(
            'link',
            d3
              .forceLink(persistentLinksRef.current)
              .id((d) => d.id)
              .distance(50)
          )
          .force('charge', d3.forceManyBody().strength(-30))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .force('collision', d3.forceCollide().radius(20))
          .alphaDecay(0.1) // Make it stabilize quickly
          .alpha(0.3); // Low starting alpha

        // Save simulation reference
        simulationRef.current = simulation;

        // Stop simulation immediately if we have stored positions
        // Just use it for dragging
        if (nodePositionsRef.current.size > 0) {
          simulation.stop();
        }

        // Define tick function - used only for dragging updates
        simulation.on('tick', () => {
          // Constrain nodes to bounds during simulation
          nodes.forEach((node) => {
            node.x = Math.max(10, Math.min(width - 10, node.x || width / 2));
            node.y = Math.max(10, Math.min(height - 10, node.y || height / 2));

            // Store valid positions
            if (isFinite(node.x) && isFinite(node.y)) {
              nodePositionsRef.current.set(node.id, { x: node.x, y: node.y });
            }
          });

          // Update node positions
          nodeGroup.selectAll('.node').attr('transform', getNodeTransform);

          // Update link paths
          linkGroup.selectAll('.link').attr('d', generateSafePath);
        });

        // Draw nodes
        const node = nodeGroup
          .selectAll('.node')
          .data(nodes)
          .join('g')
          .attr('class', 'node')
          .attr('transform', getNodeTransform)
          .call(createDragBehavior(simulation)); // Pass the simulation to the drag behavior

        // Add node circles
        node
          .append('circle')
          .attr('r', (d) => 4 + Math.sqrt(d.transactions || 1) * 1.5)
          .attr('fill', 'url(#node-gradient)')
          .attr('stroke', '#10151F')
          .attr('stroke-width', 1)
          .attr('filter', 'url(#glow)');

        // Add node labels
        node
          .append('g')
          .attr('class', 'label-group')
          .attr('transform', 'translate(0, -16)')
          .call((g) => {
            // Add label background
            g.append('rect')
              .attr('rx', 3)
              .attr('ry', 3)
              .attr('fill', 'rgba(0, 0, 0, 0.4)')
              .attr('width', (d) => (d.id ? d.id.length * 6.5 + 8 : 20))
              .attr('height', 16)
              .attr('x', (d) => -(d.id ? d.id.length * 6.5 + 8 : 20) / 2)
              .attr('y', -8);

            // Add text label
            g.append('text')
              .text((d) => d.id || '')
              .attr('text-anchor', 'middle')
              .attr('dy', '0.35em')
              .attr('font-size', '9px')
              .attr('fill', '#F8F9FA');
          });

        // Add transaction count indicators
        node
          .append('text')
          .attr('class', 'transaction-count')
          .attr('dy', 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', '7px')
          .attr('font-weight', 'bold')
          .attr('fill', '#FFFFFF')
          .text((d) => (d.transactions ? d.transactions : ''));

        // Add hover interactions for nodes
        node
          .on('mouseover', function (event, d) {
            // Highlight node
            d3.select(this)
              .select('circle')
              .transition()
              .duration(200)
              .attr('r', (d) => 5 + Math.sqrt(d.transactions || 1) * 1.5)
              .attr('stroke', 'rgba(247, 147, 26, 0.8)')
              .attr('stroke-width', 1.5);

            // Highlight connected links
            link
              .transition()
              .duration(200)
              .attr('stroke-opacity', (l) => {
                if (l.source.id === d.id || l.target.id === d.id) {
                  return 0.8;
                }
                return 0.1;
              })
              .attr('stroke-width', (l) => {
                if (l.source.id === d.id || l.target.id === d.id) {
                  return linkWidthScale(l.value || 1) + 0.5;
                }
                return linkWidthScale(l.value || 1);
              });
          })
          .on('mouseout', function () {
            // Reset node appearance
            d3.select(this)
              .select('circle')
              .transition()
              .duration(300)
              .attr('r', (d) => 4 + Math.sqrt(d.transactions || 1) * 1.5)
              .attr('stroke', '#10151F')
              .attr('stroke-width', 1);

            // Reset link appearance
            link
              .transition()
              .duration(300)
              .attr('stroke-opacity', 0.4)
              .attr('stroke-width', (d) => linkWidthScale(d.value || 1));
          });

        // Link hover interactions
        link
          .on('mouseover', function (event, d) {
            try {
              // Highlight the link
              d3.select(this)
                .transition()
                .duration(200)
                .attr('stroke-opacity', 0.9)
                .attr('stroke-width', linkWidthScale(d.value || 1) + 1);

              // Highlight connected nodes
              node
                .select('circle')
                .transition()
                .duration(200)
                .attr('opacity', (n) =>
                  n.id === d.source.id || n.id === d.target.id ? 1 : 0.3
                )
                .attr('stroke-width', (n) =>
                  n.id === d.source.id || n.id === d.target.id ? 1.5 : 1
                )
                .attr('stroke', (n) =>
                  n.id === d.source.id || n.id === d.target.id
                    ? 'rgba(247, 147, 26, 0.8)'
                    : '#10151F'
                );

              // Show tooltip only if coordinates are valid
              if (
                d.source &&
                d.target &&
                isFinite(d.source.x) &&
                isFinite(d.source.y) &&
                isFinite(d.target.x) &&
                isFinite(d.target.y)
              ) {
                const [x, y] = [
                  (d.source.x + d.target.x) / 2,
                  (d.source.y + d.target.y) / 2,
                ];

                // Create tooltip
                const tooltip = svg
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

                const text = tooltip
                  .append('text')
                  .attr('fill', 'white')
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'middle')
                  .attr('font-size', '8px')
                  .text(`${d.count || 0} tx, ${Math.round(d.value || 0)} sats`);

                // Size the background rectangle to fit the text
                try {
                  const textBBox = text.node()?.getBBox();
                  if (textBBox) {
                    tooltip
                      .select('rect')
                      .attr('width', textBBox.width + 10)
                      .attr('height', textBBox.height + 6)
                      .attr('x', -textBBox.width / 2 - 5)
                      .attr('y', -textBBox.height / 2 - 3);
                  }
                } catch (e) {
                  console.error('Error getting tooltip text bbox:', e);
                }

                tooltip.transition().duration(200).attr('opacity', 1);
              }
            } catch (error) {
              console.error('Error in link mouseover:', error);
            }
          })
          .on('mouseout', function () {
            try {
              // Reset link appearance
              d3.select(this)
                .transition()
                .duration(300)
                .attr('stroke-opacity', 0.4)
                .attr('stroke-width', (d) => linkWidthScale(d.value || 1));

              // Reset all nodes
              node
                .select('circle')
                .transition()
                .duration(300)
                .attr('opacity', 1)
                .attr('stroke', '#10151F')
                .attr('stroke-width', 1);

              // Remove tooltip
              svg.selectAll('.tooltip').remove();
            } catch (error) {
              console.error('Error in link mouseout:', error);
            }
          });

        // Add simplified legend
        const legend = svg
          .append('g')
          .attr('class', 'legend')
          .attr('transform', `translate(20, ${height - 40})`);

        legend
          .append('rect')
          .attr('width', 100)
          .attr('height', 30)
          .attr('fill', 'rgba(0, 0, 0, 0.4)')
          .attr('rx', 3);

        // Node legend
        legend
          .append('circle')
          .attr('cx', 15)
          .attr('cy', 11)
          .attr('r', 4)
          .attr('fill', 'url(#node-gradient)');

        legend
          .append('text')
          .attr('x', 25)
          .attr('y', 14)
          .attr('font-size', '8px')
          .attr('fill', 'white')
          .text('Node');

        // Link legend
        legend
          .append('line')
          .attr('x1', 10)
          .attr('y1', 24)
          .attr('x2', 20)
          .attr('y2', 24)
          .attr('stroke', 'url(#link-gradient)')
          .attr('stroke-width', 1.5);

        legend
          .append('text')
          .attr('x', 25)
          .attr('y', 27)
          .attr('font-size', '8px')
          .attr('fill', 'white')
          .text('Transaction');

        // Debug text with node count (remove in production)
        svg
          .append('text')
          .attr('x', 10)
          .attr('y', 15)
          .attr('font-size', '10px')
          .attr('fill', 'rgba(255,255,255,0.5)')
          .text(`Nodes: ${nodes.length}, Links: ${links.length}`);

        // Return cleanup function
        return () => {
          // Clean up any listeners or timers
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }

          // Stop simulation
          if (simulation) {
            simulation.stop();
          }

          // Clear simulation reference
          simulationRef.current = null;
        };
      } catch (e) {
        console.error('Error in renderGraph:', e);
        // Display error in SVG
        svg
          .append('text')
          .attr('x', containerRef.current.clientWidth / 2)
          .attr('y', 180)
          .attr('text-anchor', 'middle')
          .attr('fill', 'red')
          .text('Error rendering network graph. Try refreshing.');

        return () => {};
      }
    },
    [
      createDragBehavior,
      nodes,
      links,
      generateSafePath,
      getNodeTransform,
      FIXED_HEIGHT,
    ]
  );

  // Memoized props to ensure the hook only re-renders when necessary
  const dependencies = useMemo(() => {
    return [nodes, links, nodes?.length, links?.length];
  }, [nodes, links]);

  // Use our custom hook for D3 integration
  const { containerRef } = useD3(renderGraph, dependencies);

  // Handle empty state
  if (!nodes || !links || nodes.length === 0) {
    return (
      <div
        className='flex items-center justify-center h-64 bg-dark-node rounded-lg border border-lightning-blue/20 text-satoshi-white'
        ref={containerRef}>
        <p>Waiting for network data...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className='w-full p-2 relative overflow-hidden'
      style={{ height: `${FIXED_HEIGHT}px` }}
      role='presentation'
      aria-label='Network graph visualization'>
      {/* SVG will be inserted here by useD3 */}
    </div>
  );
};

export default NetworkGraph;
