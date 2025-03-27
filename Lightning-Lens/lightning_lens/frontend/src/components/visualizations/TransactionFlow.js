import React, { useState, useEffect, useMemo } from 'react';
import SankeyDiagram from './SankeyDiagram';
import TabularView from './TabularView';
import { filterCyclicLinks } from '../../utils/graphUtils';
import { defaultPerformanceSettings } from '../../utils/visualizationSettings';

/**
 * TransactionFlow component that visualizes transaction flows.
 * This is a refactored version that separates visualization logic into sub-components.
 */
const TransactionFlow = ({ flowData }) => {
  // State to track visualization data and settings
  const [filteredLinkCount, setFilteredLinkCount] = useState(0);
  const [totalLinkCount, setTotalLinkCount] = useState(0);
  const [circularConnectionPercentage, setCircularConnectionPercentage] =
    useState(0);
  const [performanceSettings] = useState(defaultPerformanceSettings);

  // Track both views for smooth switching
  const [activeView, setActiveView] = useState('both'); // 'both', 'sankey', or 'tabular'

  // Process data for Sankey diagram
  const { nodes, links, safeFlowData, skippedLinkCount } = useMemo(() => {
    if (!flowData || flowData.length === 0) {
      return {
        nodes: [],
        links: [],
        safeFlowData: [],
        skippedLinkCount: 0,
      };
    }

    // Get all unique source and target nodes
    const nodeSet = new Set();
    flowData.forEach((item) => {
      nodeSet.add(item.source);
      nodeSet.add(item.target);
    });

    // Convert to array of node objects
    const nodes = Array.from(nodeSet).map((id) => ({ id }));

    // Filter out links that create cycles
    const { safeFlowData, skippedLinkCount, totalLinkCount } =
      filterCyclicLinks(flowData, nodes);

    // Update state with filtered link count
    setFilteredLinkCount(skippedLinkCount);
    setTotalLinkCount(totalLinkCount);

    // Create links array for Sankey
    const links = safeFlowData.map((item) => ({
      source: nodes.findIndex((n) => n.id === item.source),
      target: nodes.findIndex((n) => n.id === item.target),
      value: item.amount || 1,
      originalData: item,
    }));

    return {
      nodes,
      links,
      safeFlowData,
      skippedLinkCount,
    };
  }, [flowData]);

  // Calculate circular connection percentage whenever filtered link count changes
  useEffect(() => {
    if (totalLinkCount > 0) {
      const percentage = Math.round((filteredLinkCount / totalLinkCount) * 100);
      setCircularConnectionPercentage(percentage);
    }
  }, [filteredLinkCount, totalLinkCount]);

  // Handle empty state
  if (!flowData || flowData.length === 0) {
    return (
      <div className='flex items-center justify-center h-96 bg-dark-node rounded-lg border border-lightning-blue/20 text-satoshi-white'>
        <p>Waiting for transaction flow data...</p>
      </div>
    );
  }

  // Toggle between visualization modes
  const toggleView = () => {
    setActiveView((prev) => {
      if (prev === 'both') return 'sankey';
      if (prev === 'sankey') return 'tabular';
      return 'both';
    });
  };

  return (
    <div className='relative space-y-6'>
      {/* Toggle Button */}
      <div className='flex justify-end mb-2'>
        <button
          onClick={toggleView}
          className='px-4 py-1 bg-gradient-to-r from-bitcoin-orange to-lightning-blue text-white rounded-md shadow-md hover:opacity-90 transition-opacity text-sm'>
          {activeView === 'both'
            ? 'Show Sankey Only'
            : activeView === 'sankey'
            ? 'Show Tabular Only'
            : 'Show Both Views'}
        </button>
      </div>

      {/* Sankey Diagram Section */}
      {(activeView === 'both' || activeView === 'sankey') && (
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
              <h2 className='dashboard-header'>
                Transaction Flow (Sankey View)
              </h2>
            </div>

            <SankeyDiagram
              flowData={flowData}
              nodes={nodes}
              links={links}
              skippedLinkCount={skippedLinkCount}
              totalLinkCount={totalLinkCount}
              performanceSettings={performanceSettings}
            />

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
      )}

      {/* Table View Section */}
      {(activeView === 'both' || activeView === 'tabular') && (
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
              <h2 className='dashboard-header'>
                Transaction Flow (Table View)
              </h2>
            </div>

            <TabularView
              flowData={flowData}
              performanceSettings={performanceSettings}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionFlow;
