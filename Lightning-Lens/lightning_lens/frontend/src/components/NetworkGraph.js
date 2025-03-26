import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

const NetworkGraph = ({ nodes, links }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const persistentLinksRef = useRef([]);
  const lastTimeRef = useRef(0); // For throttling animation
  const nodeMapRef = useRef(new Map()); // Store references to node objects by ID

  useEffect(() => {
    if (!nodes || !links || nodes.length === 0) return;

    // Update nodeMap with current nodes - this is critical for keeping links connected
    nodeMapRef.current.clear();
    nodes.forEach((node) => {
      nodeMapRef.current.set(node.id, node);
    });

    // Update existing links to reference current node objects
    persistentLinksRef.current.forEach((link) => {
      if (typeof link.source === 'object' && link.source.id) {
        // If we have the new node object, update the reference
        if (nodeMapRef.current.has(link.source.id)) {
          link.source = nodeMapRef.current.get(link.source.id);
        }
      }
      if (typeof link.target === 'object' && link.target.id) {
        if (nodeMapRef.current.has(link.target.id)) {
          link.target = nodeMapRef.current.get(link.target.id);
        }
      }
    });

    // More efficient link merging with proper node references
    const existingLinkIds = new Set();
    persistentLinksRef.current.forEach((link) => {
      if (
        typeof link.source === 'object' &&
        link.source.id &&
        typeof link.target === 'object' &&
        link.target.id
      ) {
        existingLinkIds.add(`${link.source.id}-${link.target.id}`);
        existingLinkIds.add(`${link.target.id}-${link.source.id}`);
      }
    });

    // Only add links that don't already exist, and ensure they reference current node objects
    let hasNewLinks = false;
    links.forEach((link) => {
      const sourceId =
        typeof link.source === 'object' ? link.source.id : link.source;
      const targetId =
        typeof link.target === 'object' ? link.target.id : link.target;

      // Make sure we have node objects for both source and target
      const sourceNode = nodeMapRef.current.get(sourceId);
      const targetNode = nodeMapRef.current.get(targetId);

      if (!sourceNode || !targetNode) return; // Skip if we can't find the nodes

      const linkId = `${sourceId}-${targetId}`;
      const reverseLinkId = `${targetId}-${sourceId}`;

      if (!existingLinkIds.has(linkId) && !existingLinkIds.has(reverseLinkId)) {
        // Create a new link with references to the current node objects
        const newLink = {
          ...link,
          source: sourceNode,
          target: targetNode,
        };
        persistentLinksRef.current.push(newLink);
        hasNewLinks = true;
      } else {
        // Update existing link values if needed
        const existingLink = persistentLinksRef.current.find(
          (l) =>
            (l.source.id === sourceId && l.target.id === targetId) ||
            (l.source.id === targetId && l.target.id === sourceId)
        );

        if (existingLink) {
          existingLink.value = Math.max(existingLink.value, link.value || 0);
          existingLink.count = (existingLink.count || 0) + (link.count || 0);
          // Ensure it references current node objects
          existingLink.source = sourceNode;
          existingLink.target = targetNode;
        }
      }
    });

    // Only keep the most recent 30 links to improve performance
    if (persistentLinksRef.current.length > 30) {
      persistentLinksRef.current = persistentLinksRef.current.slice(-30);
    }

    // Skip re-rendering if we have no new links
    if (
      persistentLinksRef.current.length === 0 ||
      (!hasNewLinks && svgRef.current.querySelector('svg'))
    ) {
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = 350;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Add background with less DOM elements
    svg
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', '#121923')
      .attr('rx', 8);

    // Define gradients with fewer stops
    const defs = svg.append('defs');

    // Link gradient - simplified
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

    // Node gradient - simplified
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

    // Simplified glow filter
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

    // More optimized simulation setup - now using the current nodes and persistentLinks
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(persistentLinksRef.current)
          .id((d) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .alphaDecay(0.05);

    // Compute scales only once
    const maxLinkValue =
      d3.max(persistentLinksRef.current, (d) => d.value) || 1;
    const linkWidthScale = d3
      .scaleLinear()
      .domain([1, maxLinkValue])
      .range([0.8, 2.5])
      .clamp(true);

    // Create element groups
    const linkGroup = svg.append('g').attr('class', 'links');
    const particleGroup = svg.append('g').attr('class', 'particles');
    const nodeGroup = svg.append('g').attr('class', 'nodes');

    // Create links with fewer attributes
    const link = linkGroup
      .selectAll('.link')
      .data(persistentLinksRef.current)
      .join('path')
      .attr('class', 'link')
      .attr('stroke', 'url(#link-gradient)')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', (d) => linkWidthScale(d.value || 1))
      .attr('fill', 'none')
      .attr('stroke-linecap', 'round')
      .attr('data-source', (d) => d.source.id)
      .attr('data-target', (d) => d.target.id);

    // Optimize flow particles - fewer particles
    persistentLinksRef.current.forEach((d) => {
      // Only 1-2 particles per link for better performance
      const particleCount = Math.min(
        2,
        Math.max(1, Math.floor((d.count || 1) / 5))
      );

      // Create particles for each link
      const particles = particleGroup
        .append('g')
        .attr('class', 'flow-particle-group')
        .attr('data-source', d.source.id)
        .attr('data-target', d.target.id)
        .selectAll('.flow-particle')
        .data(d3.range(particleCount))
        .join('circle')
        .attr('class', 'flow-particle')
        .attr('r', 1.5)
        .attr('fill', 'white')
        .attr('opacity', 0.6);
    });

    // Create nodes with optimized rendering
    const node = nodeGroup
      .selectAll('.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .call(drag(simulation));

    // Add node circles
    node
      .append('circle')
      .attr('r', (d) => 4 + Math.sqrt(d.transactions || 1) * 1.5)
      .attr('fill', 'url(#node-gradient)')
      .attr('stroke', '#10151F')
      .attr('stroke-width', 1)
      .attr('filter', 'url(#glow)');

    // Simplified label groups with fewer elements
    const labels = node
      .append('g')
      .attr('class', 'label-group')
      .attr('transform', 'translate(0, -16)');

    // Add label background for better readability
    labels
      .append('rect')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', 'rgba(0, 0, 0, 0.4)')
      .attr('width', (d) => d.id.length * 6.5 + 8)
      .attr('height', 16)
      .attr('x', (d) => -(d.id.length * 6.5 + 8) / 2)
      .attr('y', -8);

    // Add text label
    labels
      .append('text')
      .text((d) => d.id)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '9px')
      .attr('fill', '#F8F9FA')
      .attr('pointer-events', 'none');

    // Add transaction count indicators
    node
      .append('text')
      .attr('dy', 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '7px')
      .attr('font-weight', 'bold')
      .attr('fill', '#FFFFFF')
      .text((d) => (d.transactions ? d.transactions : ''))
      .attr('pointer-events', 'none');

    // Add hover interactions with debounced transitions
    node
      .on('mouseover', function (event, d) {
        // Highlight node
        d3.select(this)
          .select('circle')
          .transition()
          .duration(200)
          .attr('stroke', 'rgba(247, 147, 26, 0.8)')
          .attr('stroke-width', 1.5)
          .attr('r', (d) => 5 + Math.sqrt(d.transactions || 1) * 1.5);

        // Highlight connected links
        link
          .transition()
          .duration(200)
          .attr('stroke-opacity', (l) => {
            if (l.source.id === d.id || l.target.id === d.id) {
              return 0.7;
            }
            return 0.1;
          })
          .attr('stroke-width', (l) => {
            if (l.source.id === d.id || l.target.id === d.id) {
              return linkWidthScale(l.value || 1) + 0.5;
            }
            return linkWidthScale(l.value || 1);
          });

        // Highlight connected nodes
        node
          .select('circle')
          .transition()
          .duration(200)
          .attr('opacity', (n) => {
            const isConnected = persistentLinksRef.current.some(
              (l) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.source.id === n.id && l.target.id === d.id)
            );
            return isConnected || n.id === d.id ? 1 : 0.3;
          });

        // Show labels only for this node and connected nodes
        labels
          .transition()
          .duration(200)
          .attr('opacity', (n) => {
            const isConnected = persistentLinksRef.current.some(
              (l) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.source.id === n.id && l.target.id === d.id)
            );
            return isConnected || n.id === d.id ? 1 : 0.1;
          });
      })
      .on('mouseout', function () {
        // Reset node appearance
        node
          .select('circle')
          .transition()
          .duration(300)
          .attr('stroke', '#10151F')
          .attr('stroke-width', 1)
          .attr('opacity', 1)
          .attr('r', (d) => 4 + Math.sqrt(d.transactions || 1) * 1.5);

        // Reset link appearance
        link
          .transition()
          .duration(300)
          .attr('stroke-opacity', 0.3)
          .attr('stroke-width', (d) => linkWidthScale(d.value || 1));

        // Show all labels
        labels.transition().duration(300).attr('opacity', 0.9);
      });

    // Add interaction for links
    link
      .on('mouseover', function (event, d) {
        // Highlight the link
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-opacity', 0.7)
          .attr('stroke-width', linkWidthScale(d.value || 1) + 1);

        // Highlight connected nodes
        node
          .select('circle')
          .transition()
          .duration(200)
          .attr('opacity', (n) => {
            return n.id === d.source.id || n.id === d.target.id ? 1 : 0.3;
          })
          .attr('stroke-width', (n) => {
            return n.id === d.source.id || n.id === d.target.id ? 1.5 : 1;
          })
          .attr('stroke', (n) => {
            return n.id === d.source.id || n.id === d.target.id
              ? 'rgba(247, 147, 26, 0.8)'
              : '#10151F';
          });

        // Only show labels for connected nodes
        labels
          .transition()
          .duration(200)
          .attr('opacity', (n) => {
            return n.id === d.source.id || n.id === d.target.id ? 1 : 0.1;
          });

        // Show transaction info tooltip
        const [x, y] = [
          (d.source.x + d.target.x) / 2,
          (d.source.y + d.target.y) / 2,
        ];

        // Create or update tooltip - optimized tooltip creation
        let tooltip = svg.select('.tooltip');
        if (tooltip.empty()) {
          // First create the tooltip group without transition
          tooltip = svg
            .append('g')
            .attr('class', 'tooltip')
            .attr('transform', `translate(${x}, ${y})`)
            .attr('opacity', 0);

          // Add the background rectangle
          tooltip
            .append('rect')
            .attr('rx', 3)
            .attr('ry', 3)
            .attr('fill', 'rgba(0, 0, 0, 0.7)')
            .attr('stroke', 'rgba(247, 147, 26, 0.6)')
            .attr('stroke-width', 0.5);

          // Add the text element
          tooltip
            .append('text')
            .attr('fill', 'white')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '8px');

          // Apply the transition
          tooltip.transition().duration(200).attr('opacity', 1);
        } else {
          // Update existing tooltip
          tooltip.attr('transform', `translate(${x}, ${y})`).attr('opacity', 1);
        }

        const text = tooltip
          .select('text')
          .text(`${d.count || 0} tx, ${Math.round(d.value || 0)} sats`);

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
        // Reset link appearance
        d3.select(this)
          .transition()
          .duration(300)
          .attr('stroke-opacity', 0.3)
          .attr('stroke-width', (d) => linkWidthScale(d.value || 1));

        // Reset all nodes
        node
          .select('circle')
          .transition()
          .duration(300)
          .attr('opacity', 1)
          .attr('stroke', '#10151F')
          .attr('stroke-width', 1);

        // Show all labels again
        labels.transition().duration(300).attr('opacity', 0.9);

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

    // Update positions on each simulation tick - optimized
    simulation.on('tick', () => {
      // Update link paths - now these should correctly follow the nodes
      link.attr('d', (d) => {
        // Ensure we're using the latest coordinates from the node objects
        const sourceX = Math.max(5, Math.min(width - 5, d.source.x));
        const sourceY = Math.max(5, Math.min(height - 5, d.source.y));
        const targetX = Math.max(5, Math.min(width - 5, d.target.x));
        const targetY = Math.max(5, Math.min(height - 5, d.target.y));

        // Create a curved path
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const dr = Math.sqrt(dx * dx + dy * dy) * 2;

        // For self-loops (if any)
        if (d.source.id === d.target.id) {
          return `M${sourceX},${sourceY} A30,30 0 1,1 ${sourceX + 1},${
            sourceY + 1
          }`;
        }

        return `M${sourceX},${sourceY} A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
      });

      // Update node positions
      node.attr('transform', (d) => {
        const x = Math.max(5, Math.min(width - 5, d.x));
        const y = Math.max(5, Math.min(height - 5, d.y));
        return `translate(${x}, ${y})`;
      });

      // Update flow particles to follow the links as nodes move
      particleGroup.selectAll('.flow-particle-group').each(function () {
        const group = d3.select(this);
        const sourceId = group.attr('data-source');
        const targetId = group.attr('data-target');

        // Find the corresponding link
        const linkData = persistentLinksRef.current.find(
          (l) => l.source.id === sourceId && l.target.id === targetId
        );

        if (!linkData) return;

        // Find the path element
        const path = svg.select(
          `path.link[data-source="${sourceId}"][data-target="${targetId}"]`
        );

        if (path.empty()) return;

        const pathNode = path.node();
        const pathLength = pathNode.getTotalLength();

        // Update particles
        group.selectAll('.flow-particle').each(function (_, i) {
          const particle = d3.select(this);
          const offset = (i / 2) * pathLength;
          const currentTime = Date.now() / 3000;
          const position = pathNode.getPointAtLength(
            (offset + currentTime * pathLength) % pathLength
          );

          particle.attr('transform', `translate(${position.x}, ${position.y})`);
        });
      });
    });

    // More efficient continuous animation function using throttling
    function continuousParticleAnimation(timestamp) {
      // Throttle updates to improve performance
      if (timestamp - lastTimeRef.current < 33) {
        animationRef.current = requestAnimationFrame(
          continuousParticleAnimation
        );
        return;
      }

      lastTimeRef.current = timestamp;

      // Get all particle groups
      const particleGroups = d3.selectAll('.flow-particle-group');

      // Process each group - this now uses current data rather than rendered elements
      particleGroups.each(function () {
        const group = d3.select(this);
        const sourceId = group.attr('data-source');
        const targetId = group.attr('data-target');

        // Find the corresponding link
        const linkData = persistentLinksRef.current.find(
          (l) => l.source.id === sourceId && l.target.id === targetId
        );

        if (!linkData) return;

        // Find the path element
        const path = svg.select(
          `path.link[data-source="${sourceId}"][data-target="${targetId}"]`
        );

        if (path.empty()) return;

        const pathNode = path.node();
        const pathLength = pathNode.getTotalLength();

        // Only update visible particles
        if (path.attr('stroke-opacity') < 0.2) return;

        // Update particle positions using current path data
        group.selectAll('.flow-particle').each(function (_, i) {
          const particle = d3.select(this);
          const offset = (i / 2) * pathLength;
          const currentTime = Date.now() / 3000;
          const position = pathNode.getPointAtLength(
            (offset + currentTime * pathLength) % pathLength
          );

          particle.attr('transform', `translate(${position.x}, ${position.y})`);
        });
      });

      animationRef.current = requestAnimationFrame(continuousParticleAnimation);
    }

    // Start animation with throttling
    animationRef.current = requestAnimationFrame(continuousParticleAnimation);

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

    // Cleanup
    return () => {
      if (simulation) simulation.stop();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [nodes, links]);

  // Optimized drag functions
  function drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.2).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;

      // When a node is dragged, its links should follow - this is handled automatically
      // by the simulation tick function because we're properly referencing the node objects
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return d3
      .drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }

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
      className='w-full h-full p-2 relative overflow-hidden'>
      <svg
        ref={svgRef}
        className='w-full h-full'
        style={{ minHeight: '300px' }}
      />
    </div>
  );
};

export default NetworkGraph;
