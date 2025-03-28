import React, { useState, useMemo, useEffect, useCallback } from 'react';

// Component for displaying channel balance predictions and recommendations
const PredictionAnalysis = ({ predictions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'channel_id',
    direction: 'asc',
  });
  const [viewMode, setViewMode] = useState('all'); // 'all', 'critical', 'ok'
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [renderedData, setRenderedData] = useState([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 15;

  // Optimization: Filter and sort predictions using useMemo to prevent recalculation
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
      // Convert string numbers to actual numbers for proper numeric sorting
      const aVal =
        sortConfig.key.includes('ratio') ||
        sortConfig.key === 'adjustment_needed'
          ? parseFloat(a[sortConfig.key])
          : sortConfig.key === 'capacity'
          ? parseInt(a[sortConfig.key])
          : a[sortConfig.key];

      const bVal =
        sortConfig.key.includes('ratio') ||
        sortConfig.key === 'adjustment_needed'
          ? parseFloat(b[sortConfig.key])
          : sortConfig.key === 'capacity'
          ? parseInt(b[sortConfig.key])
          : b[sortConfig.key];

      if (aVal < bVal) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sortedPredictions;
  }, [predictions, searchTerm, sortConfig, viewMode]);

  // Get paginated results
  const paginatedPredictions = useMemo(() => {
    const startIndex = (currentPage - 1) * resultsPerPage;
    return filteredPredictions.slice(startIndex, startIndex + resultsPerPage);
  }, [filteredPredictions, currentPage]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.ceil(filteredPredictions.length / resultsPerPage);
  }, [filteredPredictions]);

  // Reset initial load state when predictions change
  useEffect(() => {
    if (predictions && predictions.length > 0) {
      // Use a short timeout to show loading state so users see it's working
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 300);

      // Clear the timeout on cleanup
      return () => clearTimeout(timer);
    }
  }, [predictions]);

  // Optimization: Use a separate effect to update the rendered data
  // This prevents the entire component from re-rendering when the table data changes
  useEffect(() => {
    setRenderedData(paginatedPredictions);
  }, [paginatedPredictions]);

  // Page navigation functions - Memoized callbacks to prevent recreation on render
  const goToPage = useCallback(
    (page) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    [totalPages]
  );

  const goToPreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, viewMode, sortConfig]);

  // Request a sort
  const requestSort = useCallback(
    (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
      }
      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

  // Helper to determine if channel balances need adjustment
  const getChannelStatus = useCallback((adjustmentNeeded) => {
    const adjustment = parseFloat(adjustmentNeeded);
    if (Math.abs(adjustment) < 0.1) {
      return { status: 'optimal', color: 'text-green-400' };
    } else if (Math.abs(adjustment) < 0.3) {
      return { status: 'acceptable', color: 'text-yellow-400' };
    } else {
      return { status: 'critical', color: 'text-red-400' };
    }
  }, []);

  // Calculate some metrics - Memoized to prevent recalculation
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

  // Render an improved loading state
  if (!predictions || predictions.length === 0 || isInitialLoad) {
    return (
      <div className='p-4 text-center'>
        <div className='animate-pulse flex flex-col items-center'>
          <div className='h-6 bg-gray-700 rounded w-3/4 mb-4'></div>
          <div className='h-32 bg-gray-700 rounded w-full mb-6'></div>
          <div className='flex flex-col items-center'>
            <p className='text-xl font-semibold text-gray-200 mb-2'>
              Loading ML Prediction Data
            </p>
            <p className='text-gray-400 mb-4'>
              Please wait while we retrieve and process the data...
            </p>
            <div className='relative w-64 h-3 bg-gray-700 rounded-full overflow-hidden'>
              <div className='absolute top-0 left-0 h-full bg-blue-600 rounded-full animate-pulse-progress'></div>
            </div>
          </div>
        </div>
        <style jsx>{`
          @keyframes pulse-progress {
            0% {
              width: 10%;
              left: 0;
            }
            50% {
              width: 40%;
              left: 30%;
            }
            100% {
              width: 10%;
              left: 90%;
            }
          }
          .animate-pulse-progress {
            animation: pulse-progress 2s infinite;
          }
        `}</style>
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
            {predictions[0]?.success_rate
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

      {/* Results Count and Pagination Info */}
      <div className='mb-4 flex justify-between items-center text-gray-400 text-sm'>
        <div>
          Showing{' '}
          {renderedData.length > 0 ? (currentPage - 1) * resultsPerPage + 1 : 0}
          -{Math.min(currentPage * resultsPerPage, filteredPredictions.length)}{' '}
          of {filteredPredictions.length} results
        </div>
      </div>

      {/* Predictions Table - Virtualized/optimized for large datasets */}
      <div className='overflow-x-auto overflow-y-hidden'>
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
            {renderedData.map((prediction, index) => {
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
                  {renderedData.length > 0
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
