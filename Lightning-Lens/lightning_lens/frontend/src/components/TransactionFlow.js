import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const TransactionFlow = ({ flowData }) => {
  const chartRef = useRef(null);
  const previousDataRef = useRef([]);

  useEffect(() => {
    if (!flowData || flowData.length === 0 || !chartRef.current) return;

    // Store a copy of the previous data for comparison
    const previousData = previousDataRef.current;
    previousDataRef.current = [...flowData];

    // Clear previous chart if it's a full redraw situation
    // (only for the first render or if we need to rebuild the entire chart)
    const shouldClearChart = chartRef.current.querySelector('svg') === null;

    if (shouldClearChart) {
      d3.select(chartRef.current).selectAll('*').remove();
    }

    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = chartRef.current.clientWidth - margin.left - margin.right;
    const height = 220 - margin.top - margin.bottom;

    let svg;

    // Create or select SVG
    if (shouldClearChart) {
      // Create new SVG if needed
      svg = d3
        .select(chartRef.current)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // Add background
      svg
        .append('rect')
        .attr('class', 'chart-background')
        .attr('x', -margin.left)
        .attr('y', -margin.top)
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('fill', '#1A2233') // node-background
        .attr('rx', 8);

      // Create gradient for bars
      const defs = svg.append('defs');

      // Lightning gradient for bars
      const gradient = defs
        .append('linearGradient')
        .attr('id', 'bar-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#F7931A'); // Bitcoin orange
      gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#3D8EF7'); // Lightning blue

      // Add glow filter
      const filter = defs
        .append('filter')
        .attr('id', 'glow-bar')
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

      // Create groups for various chart elements
      svg.append('g').attr('class', 'grid-lines');
      svg
        .append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`);
      svg.append('g').attr('class', 'y-axis');
      svg.append('g').attr('class', 'bars-container');
      svg.append('g').attr('class', 'labels-container');

      // Add y axis label
      svg
        .append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 15)
        .attr('x', -height / 2)
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', '#F8F9FA') // satoshi-white
        .text('Amount (sats)');

      // Add chart title
      svg
        .append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('fill', '#F8F9FA') // satoshi-white
        .text('Top 10 Transaction Flows');
    } else {
      // Select existing SVG if already created
      svg = d3.select(chartRef.current).select('svg').select('g');
    }

    // Sort data by amount
    const sortedData = [...flowData]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Create x scale with consistent domain
    const x = d3
      .scaleBand()
      .domain(sortedData.map((d) => `${d.source}-${d.target}`))
      .range([0, width])
      .padding(0.2);

    // Create y scale
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(sortedData, (d) => d.amount) * 1.1])
      .range([height, 0]);

    // Update grid lines
    svg
      .select('.grid-lines')
      .attr('stroke', '#232F46') // channel-panel color
      .attr('stroke-opacity', 0.2)
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(''));

    // Update x axis
    svg
      .select('.x-axis')
      .call(d3.axisBottom(x))
      .attr('color', '#7B3DFF') // lightning-purple
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end')
      .style('font-size', '8px')
      .style('fill', '#F8F9FA'); // satoshi-white

    // Update y axis
    svg
      .select('.y-axis')
      .call(d3.axisLeft(y))
      .attr('color', '#7B3DFF') // lightning-purple
      .selectAll('text')
      .style('fill', '#F8F9FA'); // satoshi-white

    // Select bars container
    const barsContainer = svg.select('.bars-container');

    // UPDATE: Bind data to bars using key function
    const bars = barsContainer
      .selectAll('.bar')
      .data(sortedData, (d) => `${d.source}-${d.target}`);

    // EXIT: Remove bars that no longer exist
    bars
      .exit()
      .transition()
      .duration(500)
      .attr('y', height)
      .attr('height', 0)
      .remove();

    // ENTER: Add new bars
    bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(`${d.source}-${d.target}`))
      .attr('y', height) // Start from bottom
      .attr('width', x.bandwidth())
      .attr('height', 0) // Start with zero height
      .attr('fill', 'url(#bar-gradient)')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('filter', 'url(#glow-bar)')
      .attr('opacity', 0.9)
      .transition()
      .duration(800)
      .attr('y', (d) => y(d.amount))
      .attr('height', (d) => height - y(d.amount));

    // UPDATE: Update existing bars
    bars
      .transition()
      .duration(800)
      .attr('x', (d) => x(`${d.source}-${d.target}`))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.amount))
      .attr('height', (d) => height - y(d.amount));

    // Select labels container
    const labelsContainer = svg.select('.labels-container');

    // UPDATE: Bind data to labels
    const labels = labelsContainer
      .selectAll('.label')
      .data(sortedData, (d) => `${d.source}-${d.target}`);

    // EXIT: Remove labels that no longer exist
    labels.exit().transition().duration(500).style('opacity', 0).remove();

    // ENTER: Add new labels
    labels
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', (d) => x(`${d.source}-${d.target}`) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.amount) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '9px')
      .style('fill', '#F8F9FA') // satoshi-white
      .style('opacity', 0)
      .text((d) => `${d.count}`)
      .transition()
      .duration(800)
      .style('opacity', 1);

    // UPDATE: Update existing labels
    labels
      .transition()
      .duration(800)
      .attr('x', (d) => x(`${d.source}-${d.target}`) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.amount) - 5)
      .text((d) => `${d.count}`);
  }, [flowData]);

  // Remove the ID-related useEffect that was causing the issue
  useEffect(() => {
    // Clean up function to remove the chart when component unmounts
    return () => {
      if (chartRef.current) {
        d3.select(chartRef.current).selectAll('*').remove();
      }
    };
  }, []);

  if (!flowData || flowData.length === 0) {
    return (
      <div className='flex items-center justify-center h-48 bg-dark-node rounded-lg border border-lightning-blue/20 text-satoshi-white'>
        <svg
          className='animate-spin -ml-1 mr-3 h-5 w-5 text-lightning-blue'
          xmlns='http://www.w3.org/2000/svg'
          fill='none'
          viewBox='0 0 24 24'>
          <circle
            className='opacity-25'
            cx='12'
            cy='12'
            r='10'
            stroke='currentColor'
            strokeWidth='4'></circle>
          <path
            className='opacity-75'
            fill='currentColor'
            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
        </svg>
        <span>Waiting for payment flow data...</span>
      </div>
    );
  }

  return (
    <div
      className='w-full h-[250px] bg-node-background rounded-lg overflow-hidden'
      ref={chartRef}></div>
  );
};

export default TransactionFlow;
