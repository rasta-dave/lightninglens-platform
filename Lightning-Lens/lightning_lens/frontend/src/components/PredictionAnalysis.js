import React, { useState, useMemo, useEffect } from 'react';

// Sample data to use when no real predictions are available
const SAMPLE_PREDICTIONS = Array(50)
  .fill(null)
  .map((_, i) => ({
    channel_id: `sample_channel_${i + 1}`,
    capacity: `${Math.round(1000000 + Math.random() * 5000000)}`,
    balance_ratio: `${Math.random().toFixed(4)}`,
    optimal_ratio: `${Math.random().toFixed(4)}`,
    adjustment_needed: `${(Math.random() * 2 - 1).toFixed(4)}`,
    success_rate: '0.85',
  }));

// Component for displaying channel balance predictions and recommendations
const PredictionAnalysis = ({ predictions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'channel_id',
    direction: 'asc',
  });
  const [viewMode, setViewMode] = useState('all'); // 'all', 'critical', 'ok'
  const [useSampleData, setUseSampleData] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 15;

  useEffect(() => {
    // Log the predictions data for debugging
    console.log('PredictionAnalysis received predictions:', predictions);

    // If no predictions provided, switch to sample data after 5 seconds
    if (!predictions || predictions.length === 0) {
      const timer = setTimeout(() => {
        console.log('No predictions data after timeout, using sample data');
        setUseSampleData(true);
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      setUseSampleData(false);
    }
  }, [predictions]);

  // Use real or sample predictions based on availability
  const effectivePredictions = useMemo(() => {
    if (useSampleData) {
      return SAMPLE_PREDICTIONS;
    }
    return predictions || [];
  }, [predictions, useSampleData]);

  // Filter and sort predictions
  const filteredPredictions = useMemo(() => {
    if (!effectivePredictions || effectivePredictions.length === 0) return [];

    // First, filter by search term
    let filtered = effectivePredictions;

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
  }, [effectivePredictions, searchTerm, sortConfig, viewMode]);

  // Get paginated results
  const paginatedPredictions = useMemo(() => {
    const startIndex = (currentPage - 1) * resultsPerPage;
    return filteredPredictions.slice(startIndex, startIndex + resultsPerPage);
  }, [filteredPredictions, currentPage]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.ceil(filteredPredictions.length / resultsPerPage);
  }, [filteredPredictions]);

  // Page navigation functions
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const goToPreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, viewMode, sortConfig]);

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
    if (!effectivePredictions || effectivePredictions.length === 0)
      return { totalChannels: 0, criticalChannels: 0, optimalChannels: 0 };

    const total = effectivePredictions.length;
    const critical = effectivePredictions.filter(
      (p) => Math.abs(parseFloat(p.adjustment_needed)) > 0.3
    ).length;
    const optimal = effectivePredictions.filter(
      (p) => Math.abs(parseFloat(p.adjustment_needed)) < 0.1
    ).length;

    return {
      totalChannels: total,
      criticalChannels: critical,
      optimalChannels: optimal,
      criticalPercent: Math.round((critical / total) * 100),
      optimalPercent: Math.round((optimal / total) * 100),
    };
  }, [effectivePredictions]);

  // Get the unique nodes from the channel_ids
  const nodes = useMemo(() => {
    if (!effectivePredictions || effectivePredictions.length === 0)
      return new Set();

    const nodeSet = new Set();
    effectivePredictions.forEach((pred) => {
      const [source] = pred.channel_id.split('_');
      nodeSet.add(source);
    });

    return nodeSet;
  }, [effectivePredictions]);

  // Render a loading state if predictions aren't available and not using sample data
  if ((!predictions || predictions.length === 0) && !useSampleData) {
    return (
      <div className='p-4 text-center'>
        <div className='animate-pulse flex flex-col items-center'>
          <div className='h-6 bg-gray-700 rounded w-3/4 mb-4'></div>
          <div className='h-32 bg-gray-700 rounded w-full'></div>
          <p className='mt-4 text-gray-400'>Loading prediction data...</p>
          <button
            onClick={() => setUseSampleData(true)}
            className='mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors'>
            Use Sample Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-gray-800 rounded-lg shadow-md'>
      {useSampleData && (
        <div className='bg-yellow-800 text-yellow-100 p-2 mb-4 rounded-md text-sm'>
          <strong>Note:</strong> Using sample data since real prediction data is
          unavailable.
          <button
            onClick={() => setUseSampleData(false)}
            className='ml-4 px-2 py-1 bg-yellow-700 text-yellow-100 rounded-md hover:bg-yellow-600 transition-colors text-xs'>
            Try Real Data
          </button>
        </div>
      )}

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
            {effectivePredictions[0]?.success_rate
              ? `${parseFloat(effectivePredictions[0].success_rate) * 100}%`
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

      {/* Results Count and Pagination Info */}
      <div className='mb-4 flex justify-between items-center text-gray-400 text-sm'>
        <div>
          Showing{' '}
          {paginatedPredictions.length > 0
            ? (currentPage - 1) * resultsPerPage + 1
            : 0}
          -{Math.min(currentPage * resultsPerPage, filteredPredictions.length)}{' '}
          of {filteredPredictions.length} results
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
            {paginatedPredictions.map((prediction, index) => {
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

      {/* Pagination Controls */}
      {filteredPredictions.length > 0 && (
        <div className='mt-4 mb-2 flex justify-between items-center'>
          <div className='flex-1 flex justify-between sm:hidden'>
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-4 py-2 border border-gray-700 text-sm font-medium rounded-md text-gray-300 bg-gray-800 ${
                currentPage === 1
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-gray-700'
              }`}>
              Previous
            </button>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-700 text-sm font-medium rounded-md text-gray-300 bg-gray-800 ${
                currentPage === totalPages
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-gray-700'
              }`}>
              Next
            </button>
          </div>
          <div className='hidden sm:flex-1 sm:flex sm:items-center sm:justify-between'>
            <div>
              <p className='text-sm text-gray-400'>
                Showing{' '}
                <span className='font-medium'>
                  {paginatedPredictions.length > 0
                    ? (currentPage - 1) * resultsPerPage + 1
                    : 0}
                </span>{' '}
                to{' '}
                <span className='font-medium'>
                  {Math.min(
                    currentPage * resultsPerPage,
                    filteredPredictions.length
                  )}
                </span>{' '}
                of{' '}
                <span className='font-medium'>
                  {filteredPredictions.length}
                </span>{' '}
                results
              </p>
            </div>
            <div>
              <nav
                className='relative z-0 inline-flex rounded-md shadow-sm -space-x-px'
                aria-label='Pagination'>
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300 ${
                    currentPage === 1
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-700'
                  }`}>
                  <span className='sr-only'>Previous</span>
                  <svg
                    className='h-5 w-5'
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 20 20'
                    fill='currentColor'
                    aria-hidden='true'>
                    <path
                      fillRule='evenodd'
                      d='M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z'
                      clipRule='evenodd'
                    />
                  </svg>
                </button>

                {/* First Page */}
                {currentPage > 2 && (
                  <button
                    onClick={() => goToPage(1)}
                    className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700'>
                    1
                  </button>
                )}

                {/* Ellipsis if needed */}
                {currentPage > 3 && (
                  <span className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300'>
                    ...
                  </span>
                )}

                {/* Previous Page */}
                {currentPage > 1 && (
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700'>
                    {currentPage - 1}
                  </button>
                )}

                {/* Current Page */}
                <button className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-blue-600 text-sm font-medium text-white'>
                  {currentPage}
                </button>

                {/* Next Page */}
                {currentPage < totalPages && (
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700'>
                    {currentPage + 1}
                  </button>
                )}

                {/* Ellipsis if needed */}
                {currentPage < totalPages - 2 && (
                  <span className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300'>
                    ...
                  </span>
                )}

                {/* Last Page */}
                {currentPage < totalPages - 1 && (
                  <button
                    onClick={() => goToPage(totalPages)}
                    className='relative inline-flex items-center px-4 py-2 border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700'>
                    {totalPages}
                  </button>
                )}

                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-700 bg-gray-800 text-sm font-medium text-gray-300 ${
                    currentPage === totalPages
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-700'
                  }`}>
                  <span className='sr-only'>Next</span>
                  <svg
                    className='h-5 w-5'
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 20 20'
                    fill='currentColor'
                    aria-hidden='true'>
                    <path
                      fillRule='evenodd'
                      d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z'
                      clipRule='evenodd'
                    />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictionAnalysis;
