import React, { useCallback } from 'react';
import useD3 from '../../hooks/improved/useD3';
import * as d3 from 'd3';
import { defaultPerformanceSettings } from '../../utils/visualizationSettings';
import { groupTransactionsByPair } from '../../utils/graphUtils';

/**
 * TabularView component for displaying transaction flows in a tabular format.
 * This component is extracted from TransactionFlow for better modularity.
 */
const TabularView = ({
  flowData,
  performanceSettings = defaultPerformanceSettings,
}) => {
  // Create the tabular visualization
  const { containerRef } = useD3(
    useCallback(
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
        const rows = groupTransactionsByPair(flowData);

        // Only show top rows based on settings
        const shownRows = rows.slice(0, performanceSettings.maxTableRows);

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
        if (rows.length > performanceSettings.maxTableRows) {
          table
            .append('text')
            .attr('x', width / 2)
            .attr('y', totalY + 30)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', 'rgba(255, 255, 255, 0.7)')
            .text(
              `Showing top ${performanceSettings.maxTableRows} of ${rows.length} transaction pairs`
            );
        }
      },
      [flowData, performanceSettings]
    ),
    [flowData]
  );

  // Tabular view has empty state handling in parent component
  return (
    <div
      ref={containerRef}
      className='w-full p-2 relative overflow-hidden'
      style={{ height: '400px' }}
      role='presentation'
      aria-label='Transaction flow tabular visualization'>
      {/* SVG will be inserted here by useD3 */}
    </div>
  );
};

export default TabularView;
