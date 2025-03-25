import React, { useState, useMemo } from 'react';

// Component for displaying channel balance predictions and recommendations
const PredictionAnalysis = ({ predictions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'channel_id',
    direction: 'asc',
  });
  const [viewMode, setViewMode] = useState('all'); // 'all', 'critical', 'ok'

  // Filter and sort predictions
  const filteredPredictions = useMemo(() => {
    if (!predictions || predictions.length === 0) return [];

    // First, filter by search term
    let filtered = predictions;

    if (searchTerm) {
      const lowercaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((pred) =>
        pred.channel_id.toLowerCase().includes(lowercaseSearch)
      );
    }

    // Filter by view mode
    if (viewMode === 'critical') {
      filtered = filtered.filter(
        (pred) => Math.abs(parseFloat(pred.adjustment_needed)) > 0.3
      );
    } else if (viewMode === 'ok') {
      filtered = filtered.filter(
        (pred) => Math.abs(parseFloat(pred.adjustment_needed)) <= 0.3
      );
    }

    // Then, sort by the specified configuration
    const sortedPredictions = [...filtered].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sortedPredictions;
  }, [predictions, searchTerm, sortConfig, viewMode]);

  // Request a sort
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Helper to determine if channel balances need adjustment
  const getChannelStatus = (adjustmentNeeded) => {
    const adjustment = parseFloat(adjustmentNeeded);
    if (Math.abs(adjustment) < 0.1) {
      return { status: 'optimal', color: 'text-green-400' };
    } else if (Math.abs(adjustment) < 0.3) {
      return { status: 'acceptable', color: 'text-yellow-400' };
    } else {
      return { status: 'critical', color: 'text-red-400' };
    }
  };

  // Calculate some metrics
  const metrics = useMemo(() => {
    if (!predictions || predictions.length === 0)
      return { totalChannels: 0, criticalChannels: 0, optimalChannels: 0 };

    const total = predictions.length;
    const critical = predictions.filter(
      (p) => Math.abs(parseFloat(p.adjustment_needed)) > 0.3
    ).length;
    const optimal = predictions.filter(
      (p) => Math.abs(parseFloat(p.adjustment_needed)) < 0.1
    ).length;

    return {
      totalChannels: total,
      criticalChannels: critical,
      optimalChannels: optimal,
      criticalPercent: Math.round((critical / total) * 100),
      optimalPercent: Math.round((optimal / total) * 100),
    };
  }, [predictions]);

  // Get the unique nodes from the channel_ids
  const nodes = useMemo(() => {
    if (!predictions || predictions.length === 0) return new Set();

    const nodeSet = new Set();
    predictions.forEach((pred) => {
      const [source] = pred.channel_id.split('_');
      nodeSet.add(source);
    });

    return nodeSet;
  }, [predictions]);

  // Render a loading state if predictions aren't available
  if (!predictions || predictions.length === 0) {
    return (
      <div className='p-4 text-center'>
        <div className='animate-pulse flex flex-col items-center'>
          <div className='h-6 bg-gray-700 rounded w-3/4 mb-4'></div>
          <div className='h-32 bg-gray-700 rounded w-full'></div>
          <p className='mt-4 text-gray-400'>Loading prediction data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-gray-800 rounded-lg shadow-md'>
      {/* Summary Metrics */}
      <div className='mb-6 grid grid-cols-1 md:grid-cols-4 gap-4'>
        <div className='bg-blue-900/30 p-4 rounded-lg shadow border border-blue-800'>
          <h3 className='text-lg font-semibold text-blue-300'>
            Total Channels
          </h3>
          <p className='text-3xl font-bold text-blue-200'>
            {metrics.totalChannels}
          </p>
          <p className='text-sm text-blue-400'>Across {nodes.size} nodes</p>
        </div>

        <div className='bg-red-900/30 p-4 rounded-lg shadow border border-red-800'>
          <h3 className='text-lg font-semibold text-red-300'>
            Critical Balance
          </h3>
          <p className='text-3xl font-bold text-red-200'>
            {metrics.criticalChannels}
          </p>
          <p className='text-sm text-red-400'>
            {metrics.criticalPercent}% of channels need rebalancing
          </p>
        </div>

        <div className='bg-green-900/30 p-4 rounded-lg shadow border border-green-800'>
          <h3 className='text-lg font-semibold text-green-300'>
            Optimal Balance
          </h3>
          <p className='text-3xl font-bold text-green-200'>
            {metrics.optimalChannels}
          </p>
          <p className='text-sm text-green-400'>
            {metrics.optimalPercent}% of channels well-balanced
          </p>
        </div>

        <div className='bg-purple-900/30 p-4 rounded-lg shadow border border-purple-800'>
          <h3 className='text-lg font-semibold text-purple-300'>
            Success Rate
          </h3>
          <p className='text-3xl font-bold text-purple-200'>
            {predictions[0].success_rate
              ? `${parseFloat(predictions[0].success_rate) * 100}%`
              : 'N/A'}
          </p>
          <p className='text-sm text-purple-400'>ML model confidence</p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className='mb-4 flex flex-wrap items-center gap-4'>
        <div className='flex-grow'>
          <input
            type='text'
            placeholder='Search channels...'
            className='w-full p-2 border border-gray-600 rounded bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className='flex space-x-2'>
          <button
            onClick={() => setViewMode('all')}
            className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
              viewMode === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}>
            All
          </button>
          <button
            onClick={() => setViewMode('critical')}
            className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
              viewMode === 'critical'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}>
            Critical
          </button>
          <button
            onClick={() => setViewMode('ok')}
            className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
              viewMode === 'ok'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}>
            Good
          </button>
        </div>
      </div>

      {/* Predictions Table */}
      <div className='overflow-x-auto'>
        <table className='min-w-full divide-y divide-gray-700'>
          <thead className='bg-gray-900'>
            <tr>
              <th
                className='px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors duration-150'
                onClick={() => requestSort('channel_id')}>
                Channel ID
                {sortConfig.key === 'channel_id' && (
                  <span className='ml-1'>
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th
                className='px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors duration-150'
                onClick={() => requestSort('capacity')}>
                Capacity
                {sortConfig.key === 'capacity' && (
                  <span className='ml-1'>
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th
                className='px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors duration-150'
                onClick={() => requestSort('balance_ratio')}>
                Balance Ratio
                {sortConfig.key === 'balance_ratio' && (
                  <span className='ml-1'>
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th
                className='px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors duration-150'
                onClick={() => requestSort('optimal_ratio')}>
                Optimal Ratio
                {sortConfig.key === 'optimal_ratio' && (
                  <span className='ml-1'>
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th
                className='px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors duration-150'
                onClick={() => requestSort('adjustment_needed')}>
                Adjustment
                {sortConfig.key === 'adjustment_needed' && (
                  <span className='ml-1'>
                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider'>
                Status
              </th>
            </tr>
          </thead>
          <tbody className='bg-gray-800 divide-y divide-gray-700'>
            {filteredPredictions.map((prediction, index) => {
              const channelStatus = getChannelStatus(
                prediction.adjustment_needed
              );
              return (
                <tr
                  key={index}
                  className='hover:bg-gray-750 transition-colors duration-150'>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div className='text-sm font-medium text-gray-300'>
                      {prediction.channel_id}
                    </div>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div className='text-sm text-gray-300'>
                      {parseInt(prediction.capacity).toLocaleString()} sats
                    </div>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div className='flex items-center'>
                      <div className='w-24 bg-gray-700 rounded-full h-2.5'>
                        <div
                          className='bg-blue-600 h-2.5 rounded-full'
                          style={{
                            width: `${
                              parseFloat(prediction.balance_ratio) * 100
                            }%`,
                          }}></div>
                      </div>
                      <div className='ml-2 text-sm text-gray-300'>
                        {(parseFloat(prediction.balance_ratio) * 100).toFixed(
                          1
                        )}
                        %
                      </div>
                    </div>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div className='flex items-center'>
                      <div className='w-24 bg-gray-700 rounded-full h-2.5'>
                        <div
                          className='bg-green-600 h-2.5 rounded-full'
                          style={{
                            width: `${
                              parseFloat(prediction.optimal_ratio) * 100
                            }%`,
                          }}></div>
                      </div>
                      <div className='ml-2 text-sm text-gray-300'>
                        {(parseFloat(prediction.optimal_ratio) * 100).toFixed(
                          1
                        )}
                        %
                      </div>
                    </div>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div
                      className={`text-sm font-medium ${
                        parseFloat(prediction.adjustment_needed) > 0
                          ? 'text-red-400'
                          : parseFloat(prediction.adjustment_needed) < 0
                          ? 'text-blue-400'
                          : 'text-gray-400'
                      }`}>
                      {parseFloat(prediction.adjustment_needed) > 0
                        ? `+${(
                            parseFloat(prediction.adjustment_needed) * 100
                          ).toFixed(1)}%`
                        : `${(
                            parseFloat(prediction.adjustment_needed) * 100
                          ).toFixed(1)}%`}
                    </div>
                    <div className='text-xs text-gray-500'>
                      {parseFloat(prediction.adjustment_needed) > 0
                        ? 'Needs more remote balance'
                        : parseFloat(prediction.adjustment_needed) < 0
                        ? 'Needs more local balance'
                        : 'Perfect balance'}
                    </div>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        channelStatus.status === 'optimal'
                          ? 'bg-green-900 text-green-200'
                          : channelStatus.status === 'acceptable'
                          ? 'bg-yellow-900 text-yellow-200'
                          : 'bg-red-900 text-red-200'
                      }`}>
                      {channelStatus.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Empty State */}
        {filteredPredictions.length === 0 && (
          <div className='text-center py-8 text-gray-400'>
            No prediction data matching your filters.
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictionAnalysis;
