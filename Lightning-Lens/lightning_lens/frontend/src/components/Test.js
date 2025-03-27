import React from 'react';
import TransactionFlow from './visualizations/TransactionFlow';

// Sample transaction data with circular connections
const sampleData = [
  // Direct A to B
  { source: 'Node A', target: 'Node B', amount: 100, count: 2 },

  // Circular paths
  { source: 'Node B', target: 'Node C', amount: 75, count: 1 },
  { source: 'Node C', target: 'Node A', amount: 50, count: 1 },

  // More complex connections
  { source: 'Node A', target: 'Node D', amount: 200, count: 3 },
  { source: 'Node D', target: 'Node E', amount: 150, count: 2 },
  { source: 'Node E', target: 'Node B', amount: 125, count: 2 },

  // Self-loop (will be filtered)
  { source: 'Node F', target: 'Node F', amount: 25, count: 1 },

  // Another circular path
  { source: 'Node D', target: 'Node F', amount: 75, count: 1 },
  { source: 'Node F', target: 'Node A', amount: 50, count: 1 },
];

/**
 * Test component that renders the TransactionFlow with sample data
 * This helps verify the Sankey diagram visualization with circular connections
 */
const Test = () => {
  return (
    <div className='p-8 bg-dark-card min-h-screen'>
      <h1 className='text-2xl font-bold text-white mb-6'>
        Sankey Diagram Test with Circular Connections
      </h1>

      <div className='mb-4 p-4 bg-yellow-900/30 border border-yellow-600/50 rounded'>
        <p className='text-white text-sm'>
          This sample data contains various circular connections and self-loops
          to test the improved Sankey diagram visualization.
        </p>
      </div>

      <TransactionFlow flowData={sampleData} />
    </div>
  );
};

export default Test;
