import React, { useMemo } from 'react';
import StatCard from './StatCard';

const NetworkHealthDashboard = ({
  nodes = [],
  links = [],
  transactions = [],
  predictions = [],
}) => {
  // Calculate network health metrics
  const metrics = useMemo(() => {
    // Network size metrics
    const activeNodes = nodes.length;
    const activeChannels = links.length;

    // Calculate average transactions per node
    const txPerNode =
      activeNodes > 0
        ? Math.round((transactions.length / activeNodes) * 10) / 10
        : 0;

    // Calculate network density - ratio of actual connections to possible connections
    // Formula: density = 2 * |E| / (|V| * (|V| - 1)) where |E| is number of edges and |V| is number of vertices
    const maxPossibleLinks =
      activeNodes > 1 ? (activeNodes * (activeNodes - 1)) / 2 : 0;
    const networkDensity =
      maxPossibleLinks > 0
        ? Math.round((activeChannels / maxPossibleLinks) * 100)
        : 0;

    // Calculate channel balance metrics from predictions if available
    let avgCapacity = 0;
    let optimalBalancePercentage = 0;
    let criticalChannelsPercentage = 0;

    if (predictions && predictions.length > 0) {
      // Average channel capacity
      avgCapacity = Math.round(
        predictions.reduce((sum, p) => sum + parseFloat(p.capacity || 0), 0) /
          predictions.length
      );

      // Percentage of channels with optimal balance
      const optimalChannels = predictions.filter(
        (p) =>
          Math.abs(
            parseFloat(p.balance_ratio || 0) -
              parseFloat(p.optimal_ratio || 0.5)
          ) < 0.15
      );
      optimalBalancePercentage = Math.round(
        (optimalChannels.length / predictions.length) * 100
      );

      // Percentage of channels with critical imbalance
      const criticalChannels = predictions.filter(
        (p) =>
          Math.abs(
            parseFloat(p.balance_ratio || 0) -
              parseFloat(p.optimal_ratio || 0.5)
          ) > 0.35
      );
      criticalChannelsPercentage = Math.round(
        (criticalChannels.length / predictions.length) * 100
      );
    }

    // Calculate success rate from transactions
    const successfulTx = transactions.filter(
      (tx) => tx.success === 'True'
    ).length;
    const successRate =
      transactions.length > 0
        ? Math.round((successfulTx / transactions.length) * 100)
        : 0;

    return {
      activeNodes,
      activeChannels,
      txPerNode,
      networkDensity,
      avgCapacity,
      optimalBalancePercentage,
      criticalChannelsPercentage,
      successRate,
    };
  }, [nodes, links, transactions, predictions]);

  return (
    <div className='mb-6'>
      <div className='flex items-center mb-4'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-6 w-6 mr-2 text-blue-400'
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
        <h2 className='text-xl font-semibold text-blue-300'>
          Network Health Dashboard
        </h2>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <StatCard
          title='Active Nodes'
          value={metrics.activeNodes}
          color='blue'
          icon={
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
              />
            </svg>
          }
          subtext='Lightning network nodes'
        />

        <StatCard
          title='Active Channels'
          value={metrics.activeChannels}
          color='purple'
          icon={
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z'
              />
            </svg>
          }
          subtext={`Network density: ${metrics.networkDensity}%`}
        />

        <StatCard
          title='Tx Success Rate'
          value={`${metrics.successRate}%`}
          color={
            metrics.successRate > 90
              ? 'green'
              : metrics.successRate > 70
              ? 'yellow'
              : 'red'
          }
          icon={
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
          }
          subtext={`${transactions.length} total transactions`}
          trend={
            metrics.successRate > 95
              ? 'up'
              : metrics.successRate < 80
              ? 'down'
              : 'neutral'
          }
          trendLabel={
            metrics.successRate > 95
              ? '+5%'
              : metrics.successRate < 80
              ? '-10%'
              : '±0%'
          }
        />

        <StatCard
          title='Channel Balance Health'
          value={`${metrics.optimalBalancePercentage}%`}
          color={
            metrics.optimalBalancePercentage > 70
              ? 'green'
              : metrics.optimalBalancePercentage > 50
              ? 'yellow'
              : 'red'
          }
          icon={
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3'
              />
            </svg>
          }
          subtext={`${metrics.criticalChannelsPercentage}% channels need rebalancing`}
          trend={
            metrics.optimalBalancePercentage > 75
              ? 'up'
              : metrics.optimalBalancePercentage < 50
              ? 'down'
              : 'neutral'
          }
          trendLabel={
            metrics.optimalBalancePercentage > 75
              ? '+8%'
              : metrics.optimalBalancePercentage < 50
              ? '-12%'
              : '±0%'
          }
        />
      </div>
    </div>
  );
};

export default NetworkHealthDashboard;
