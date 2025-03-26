import React from 'react';
import { render, screen } from '@testing-library/react';
import NetworkGraph from '../components/improved/NetworkGraph';

describe('NetworkGraph Component', () => {
  test('renders empty state message when no data is provided', () => {
    render(<NetworkGraph nodes={[]} links={[]} />);
    expect(screen.getByText(/waiting for network data/i)).toBeInTheDocument();
  });

  test('renders with minimal graph data', () => {
    const nodes = [
      { id: 'node1', transactions: 5 },
      { id: 'node2', transactions: 3 },
    ];

    const links = [{ source: 'node1', target: 'node2', value: 100, count: 2 }];

    render(<NetworkGraph nodes={nodes} links={links} />);

    // Instead of accessing DOM nodes directly, we can check if the container is rendered
    // by looking for a div element with a specific class or data attribute
    const graphContainer = screen.getByRole('presentation', { hidden: true });
    expect(graphContainer).toBeInTheDocument();

    // useD3 hook will create SVG within the container, but in a test environment
    // D3 operations may not run fully. We're mostly checking that the component renders
    // without errors.
  });
});
