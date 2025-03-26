import React from 'react';
import { render, screen } from '@testing-library/react';
import TransactionFlow from '../components/improved/TransactionFlow';

describe('TransactionFlow Component', () => {
  test('renders empty state message when no data is provided', () => {
    render(<TransactionFlow flowData={[]} />);
    expect(
      screen.getByText(/waiting for transaction flow data/i)
    ).toBeInTheDocument();
  });

  test('renders with minimal flow data', () => {
    const flowData = [
      {
        key: 'node1-node2',
        source: 'node1',
        target: 'node2',
        amount: 100,
        count: 2,
      },
      {
        key: 'node2-node3',
        source: 'node2',
        target: 'node3',
        amount: 50,
        count: 1,
      },
    ];

    render(<TransactionFlow flowData={flowData} />);

    // Check if the component renders properly
    const flowContainer = screen.getByRole('presentation', {
      name: /transaction flow visualization/i,
    });
    expect(flowContainer).toBeInTheDocument();
  });
});
