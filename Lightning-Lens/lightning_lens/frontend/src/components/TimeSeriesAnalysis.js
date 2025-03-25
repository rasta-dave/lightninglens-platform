import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

const TimeSeriesAnalysis = ({ transactions = [], nodes = [], links = [] }) => {
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const chartRef = useRef(null);
  const svgRef = useRef(null);
  const [chartInitialized, setChartInitialized] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('success_rate');

  // Process transactions into time series data
  useEffect(() => {
    if (!transactions || transactions.length === 0) return;

    // Group transactions into time buckets (every 5 transactions)
    const bucketSize = 5;
    const buckets = [];

    for (let i = 0; i < transactions.length; i += bucketSize) {
      const bucketTransactions = transactions.slice(
        Math.max(0, i - bucketSize + 1),
        i + 1
      );

      if (bucketTransactions.length === 0) continue;

      // Calculate metrics for this time bucket
      const successCount = bucketTransactions.filter(
        (tx) => tx.success === 'True'
      ).length;
      const successRate = (successCount / bucketTransactions.length) * 100;

      // Find unique nodes involved in these transactions
      const involvedNodes = new Set();
      bucketTransactions.forEach((tx) => {
        involvedNodes.add(tx.sender);
        involvedNodes.add(tx.receiver);
      });

      // Calculate average transaction value
      const avgTxValue =
        bucketTransactions.reduce(
          (sum, tx) => sum + parseFloat(tx.amount || 0),
          0
        ) / bucketTransactions.length;

      // Identify the most recent transaction's timestamp for this bucket
      const latestTimestamp = i;

      buckets.push({
        timestamp: latestTimestamp,
        success_rate: successRate,
        active_nodes: involvedNodes.size,
        avg_tx_value: avgTxValue,
        tx_volume: bucketTransactions.length,
        bucket_index: Math.floor(i / bucketSize),
      });
    }

    setTimeSeriesData(buckets);
  }, [transactions]);

  // Initialize and update the chart
  useEffect(() => {
    if (!timeSeriesData || timeSeriesData.length < 2 || !chartRef.current)
      return;

    // Clear previous chart if necessary
    const shouldClearChart = chartRef.current.querySelector('svg') === null;

    if (shouldClearChart) {
      d3.select(chartRef.current).selectAll('*').remove();
    }

    // Set up dimensions
    const margin = { top: 20, right: 40, bottom: 30, left: 60 };
    const width = chartRef.current.clientWidth - margin.left - margin.right;
    const height = 220 - margin.top - margin.bottom;

    let svg;

    // Create or select SVG
    if (shouldClearChart) {
      // Create new SVG
      svg = d3
        .select(chartRef.current)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // Store the svg reference
      svgRef.current = svg;

      // Add background
      svg
        .append('rect')
        .attr('class', 'chart-background')
        .attr('x', -margin.left)
        .attr('y', -margin.top)
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('fill', '#1f2937')
        .attr('rx', 8);

      // Create gradient for area
      const defs = svg.append('defs');
      const gradient = defs
        .append('linearGradient')
        .attr('id', 'area-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#3b82f6')
        .attr('stop-opacity', 0.8);

      gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#3b82f6')
        .attr('stop-opacity', 0.1);

      // Add groups for various chart elements
      svg.append('g').attr('class', 'grid-lines');
      svg
        .append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`);
      svg.append('g').attr('class', 'y-axis');
      svg.append('g').attr('class', 'path-container');
      svg.append('g').attr('class', 'area-container');
      svg.append('g').attr('class', 'dots-container');

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
        .style('fill', '#e5e7eb');

      // Add chart title
      svg
        .append('text')
        .attr('class', 'chart-title')
        .attr('x', width / 2)
        .attr('y', -margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('fill', '#e5e7eb');

      setChartInitialized(true);
    } else {
      // Select existing SVG
      svg = svgRef.current;
    }

    // Get metric name for display
    const metricNames = {
      success_rate: 'Success Rate (%)',
      active_nodes: 'Active Nodes',
      avg_tx_value: 'Avg Transaction Value',
      tx_volume: 'Transaction Volume',
    };

    // Update chart title
    svg
      .select('.chart-title')
      .text(`Time Series: ${metricNames[selectedMetric]}`);

    // Update y axis label
    svg.select('.y-axis-label').text(metricNames[selectedMetric]);

    // Create scales
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(timeSeriesData, (d) => d.timestamp)])
      .range([0, width]);

    // Get the minimum and maximum y values with padding
    const yMin = d3.min(timeSeriesData, (d) => d[selectedMetric]) * 0.9;
    const yMax = d3.max(timeSeriesData, (d) => d[selectedMetric]) * 1.1;

    const y = d3
      .scaleLinear()
      .domain([yMin > 0 ? 0 : yMin, yMax])
      .range([height, 0]);

    // Update grid lines
    svg
      .select('.grid-lines')
      .attr('stroke', '#374151')
      .attr('stroke-opacity', 0.2)
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(''));

    // Update axes
    svg
      .select('.x-axis')
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((d) => `${d}`)
      )
      .attr('color', '#9ca3af')
      .selectAll('text')
      .style('fill', '#d1d5db');

    svg
      .select('.y-axis')
      .call(d3.axisLeft(y))
      .attr('color', '#9ca3af')
      .selectAll('text')
      .style('fill', '#d1d5db');

    // Create line generator
    const line = d3
      .line()
      .x((d) => x(d.timestamp))
      .y((d) => y(d[selectedMetric]))
      .curve(d3.curveMonotoneX);

    // Create area generator
    const area = d3
      .area()
      .x((d) => x(d.timestamp))
      .y0(height)
      .y1((d) => y(d[selectedMetric]))
      .curve(d3.curveMonotoneX);

    // Update area
    const areaContainer = svg.select('.area-container');
    const areaPath = areaContainer
      .selectAll('.area-path')
      .data([timeSeriesData]);

    areaPath.exit().remove();

    areaPath
      .enter()
      .append('path')
      .attr('class', 'area-path')
      .merge(areaPath)
      .attr('fill', 'url(#area-gradient)')
      .attr('opacity', 0.5)
      .transition()
      .duration(500)
      .attr('d', area);

    // Update line
    const pathContainer = svg.select('.path-container');
    const path = pathContainer.selectAll('.line-path').data([timeSeriesData]);

    path.exit().remove();

    path
      .enter()
      .append('path')
      .attr('class', 'line-path')
      .merge(path)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .transition()
      .duration(500)
      .attr('d', line);

    // Update dots
    const dotsContainer = svg.select('.dots-container');
    const dots = dotsContainer.selectAll('.data-point').data(timeSeriesData);

    dots.exit().transition().duration(300).attr('r', 0).remove();

    dots
      .enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('cx', (d) => x(d.timestamp))
      .attr('cy', (d) => y(d[selectedMetric]))
      .attr('r', 0)
      .attr('fill', '#3b82f6')
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 2)
      .merge(dots)
      .transition()
      .duration(500)
      .attr('cx', (d) => x(d.timestamp))
      .attr('cy', (d) => y(d[selectedMetric]))
      .attr('r', 4);

    // Add tooltip functionality
    const tooltip = d3.select(chartRef.current).selectAll('.tooltip').data([0]);
    const newTooltip = tooltip
      .enter()
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background-color', 'rgba(17, 24, 39, 0.9)')
      .style('color', '#e5e7eb')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 10)
      .style('box-shadow', '0 4px 6px rgba(0, 0, 0, 0.3)')
      .style('border', '1px solid #4b5563');

    const mergedTooltip = newTooltip.merge(tooltip);

    svg
      .selectAll('.data-point')
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('r', 6)
          .attr('fill', '#60a5fa');

        mergedTooltip
          .style('opacity', 1)
          .html(
            `
            <div>
              <div style="font-weight: bold; margin-bottom: 4px;">Time: ${
                d.timestamp
              }</div>
              <div style="margin-bottom: 2px;">${
                metricNames[selectedMetric]
              }: ${d[selectedMetric].toFixed(2)}</div>
              <div style="font-size: 10px; color: #9ca3af;">Bucket #${
                d.bucket_index
              }</div>
            </div>
          `
          )
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 15}px`);
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(100)
          .attr('r', 4)
          .attr('fill', '#3b82f6');

        mergedTooltip.transition().duration(100).style('opacity', 0);
      });
  }, [timeSeriesData, selectedMetric, chartInitialized]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartInitialized) {
        // Reset chart on window resize
        d3.select(chartRef.current).selectAll('*').remove();
        setChartInitialized(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chartInitialized]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        d3.select(chartRef.current).selectAll('*').remove();
      }
    };
  }, []);

  // Handle metric change
  const handleMetricChange = (metric) => {
    setSelectedMetric(metric);
  };

  return (
    <div className='mb-6'>
      <div className='flex items-center mb-4'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-6 w-6 mr-2 text-indigo-400'
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
        <h2 className='text-xl font-semibold text-indigo-300'>
          Time Series Analysis
        </h2>
      </div>

      <div className='mb-4 flex flex-wrap gap-2'>
        <button
          onClick={() => handleMetricChange('success_rate')}
          className={`px-3 py-1 rounded-md text-sm ${
            selectedMetric === 'success_rate'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}>
          Success Rate
        </button>
        <button
          onClick={() => handleMetricChange('active_nodes')}
          className={`px-3 py-1 rounded-md text-sm ${
            selectedMetric === 'active_nodes'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}>
          Active Nodes
        </button>
        <button
          onClick={() => handleMetricChange('avg_tx_value')}
          className={`px-3 py-1 rounded-md text-sm ${
            selectedMetric === 'avg_tx_value'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}>
          Avg Transaction Value
        </button>
        <button
          onClick={() => handleMetricChange('tx_volume')}
          className={`px-3 py-1 rounded-md text-sm ${
            selectedMetric === 'tx_volume'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}>
          Transaction Volume
        </button>
      </div>

      {timeSeriesData.length < 2 ? (
        <div className='flex items-center justify-center h-48 bg-gray-800 rounded-lg border border-gray-700 text-gray-400'>
          <svg
            className='animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-500'
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
          <span>Waiting for more transaction data...</span>
        </div>
      ) : (
        <div className='w-full h-60 bg-gray-800 rounded-lg'>
          <div ref={chartRef} className='w-full h-full relative'></div>
        </div>
      )}
    </div>
  );
};

export default TimeSeriesAnalysis;
