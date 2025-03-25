import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const NetworkGraph = ({ nodes, links }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!nodes || !links || nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = 300;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Add background
    svg
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', '#121923') // lightning-dark
      .attr('rx', 8);

    // Define Bitcoin/Lightning gradients
    const defs = svg.append('defs');

    // Lightning gradient for links
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
      .attr('stop-color', '#7B3DFF');

    // Node gradient
    const nodeGradient = defs
      .append('linearGradient')
      .attr('id', 'node-gradient')
      .attr('gradientUnits', 'userSpaceOnUse');

    nodeGradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#F7931A'); // Bitcoin orange

    nodeGradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#FFD700'); // Channel yellow

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
      .attr('stdDeviation', '2.5')
      .attr('result', 'coloredBlur');

    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Create a simulation with several forces
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(height / 2).strength(0.1));

    // Define a color scale based on transaction count
    const maxTransactions = d3.max(nodes, (d) => d.transactions) || 1;
    const colorScale = d3
      .scaleLinear()
      .domain([0, maxTransactions / 2, maxTransactions])
      .range(['#3D8EF7', '#7B3DFF', '#F7931A']);

    // Create links
    const link = svg
      .append('g')
      .attr('stroke', 'url(#link-gradient)')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', (d) => Math.sqrt(d.value || 1) * 1.5)
      .attr('stroke-linecap', 'round');

    // Create nodes
    const node = svg
      .append('g')
      .attr('stroke', '#10151F') // dark-node color
      .attr('stroke-width', 1.5)
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => 5 + Math.sqrt(d.transactions || 1) * 2)
      .attr('fill', (d) => colorScale(d.transactions || 0))
      .attr('filter', 'url(#glow)')
      .call(drag(simulation));

    // Add node labels
    const labels = svg
      .append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text((d) => d.id)
      .style('font-size', '10px')
      .style('fill', '#F8F9FA') // satoshi-white
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)');

    // Add an invisible drag area (larger than the node)
    const nodeSelection = svg
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 15)
      .attr('fill', 'transparent')
      .call(drag(simulation));

    // Add transaction count labels
    const transactionLabels = svg
      .append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('dy', -10)
      .text((d) => (d.transactions ? d.transactions : ''))
      .style('font-size', '8px')
      .style('font-weight', 'bold')
      .style('fill', '#F8F9FA') // satoshi-white
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)');

    // Update positions on each simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => Math.max(5, Math.min(width - 5, d.source.x)))
        .attr('y1', (d) => Math.max(5, Math.min(height - 5, d.source.y)))
        .attr('x2', (d) => Math.max(5, Math.min(width - 5, d.target.x)))
        .attr('y2', (d) => Math.max(5, Math.min(height - 5, d.target.y)));

      node
        .attr('cx', (d) => Math.max(5, Math.min(width - 5, d.x)))
        .attr('cy', (d) => Math.max(5, Math.min(height - 5, d.y)));

      labels
        .attr('x', (d) => Math.max(5, Math.min(width - 5, d.x)))
        .attr('y', (d) => Math.max(5, Math.min(height - 5, d.y)));

      nodeSelection
        .attr('cx', (d) => Math.max(5, Math.min(width - 5, d.x)))
        .attr('cy', (d) => Math.max(5, Math.min(height - 5, d.y)));

      transactionLabels
        .attr('x', (d) => Math.max(5, Math.min(width - 5, d.x)))
        .attr('y', (d) => Math.max(5, Math.min(height - 5, d.y)));
    });

    // Add hover effects for nodes
    node
      .on('mouseover', function () {
        d3.select(this)
          .attr('stroke', '#F7931A') // Bitcoin orange
          .attr('stroke-width', 3);
      })
      .on('mouseout', function () {
        d3.select(this)
          .attr('stroke', '#10151F') // dark-node
          .attr('stroke-width', 1.5);
      });

    // Add pulsing animation for nodes with high transaction counts
    nodes.forEach((n, i) => {
      if (n.transactions > maxTransactions / 2) {
        svg
          .select(`circle:nth-child(${i + 1})`)
          .append('animate')
          .attr('attributeName', 'r')
          .attr(
            'values',
            `${5 + Math.sqrt(n.transactions || 1) * 2};${
              7 + Math.sqrt(n.transactions || 1) * 2
            };${5 + Math.sqrt(n.transactions || 1) * 2}`
          )
          .attr('dur', '1.5s')
          .attr('repeatCount', 'indefinite');
      }
    });

    // Cleanup on component unmount
    return () => {
      simulation.stop();
    };

    // Drag functions
    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
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
  }, [nodes, links]);

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
      className='h-full w-full rounded-lg overflow-hidden bg-node-background shadow-lightning-glow'>
      <svg ref={svgRef} className='w-full h-full'></svg>
    </div>
  );
};

export default NetworkGraph;
