import React, { useState, useEffect } from 'react';
import { useSimulation } from '../../contexts/SimulationContext';

// Tooltip component
const Tooltip = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className='relative'
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}>
      {children}
      {isVisible && (
        <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded shadow-lg whitespace-nowrap z-10'>
          {content}
          <div className='absolute top-full left-1/2 transform -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-transparent border-t-gray-900'></div>
        </div>
      )}
    </div>
  );
};

const SimulationControls = ({ showPredictionsTab, setShowPredictionsTab }) => {
  const {
    allSimulations,
    simulationInfo,
    switchToSimulation,
    resetSimulation,
    isLoading,
    newSimulationNotification,
    userSelectedFile,
    isPredictionsLoading,
    requestPredictionData,
  } = useSimulation();

  const [showDropdown, setShowDropdown] = useState(false);

  // Automatically load the latest simulation when component mounts if no simulation is loaded
  useEffect(() => {
    if (!simulationInfo && allSimulations && allSimulations.length > 0) {
      // Find the most recent simulation
      const latestSim =
        allSimulations.find((sim) => sim.isCurrent) || allSimulations[0];
      console.log('Auto-loading latest simulation:', latestSim.filename);
      switchToSimulation(latestSim.filename, true);
    }
  }, [simulationInfo, allSimulations, switchToSimulation]);

  const handleSelectFile = (filename) => {
    console.log('User selected simulation file:', filename);
    switchToSimulation(filename, true);
    setShowDropdown(false);
  };

  // Toggle ML Analytics panel and fetch predictions if needed
  const togglePredictions = () => {
    if (!showPredictionsTab && !isPredictionsLoading) {
      // Request fresh prediction data when user toggles on the analytics
      requestPredictionData();
    }
    setShowPredictionsTab(!showPredictionsTab);
  };

  // Log available simulations
  useEffect(() => {
    if (allSimulations && allSimulations.length > 0) {
      console.log('Available simulations:', allSimulations);
    }
  }, [allSimulations]);

  return (
    <div className='bg-gray-800 shadow-md mb-6 sticky top-0 z-10'>
      <div className='container mx-auto py-3 px-4 flex flex-wrap items-center justify-between gap-4'>
        {/* Current Simulation Info */}
        <div className='flex items-center space-x-4'>
          <div className='text-gray-300'>
            <span className='text-sm font-semibold mr-1'>Simulation:</span>
            {simulationInfo ? (
              <span className='bg-gray-700 px-2 py-1 rounded text-xs font-mono'>
                {simulationInfo.filename}
              </span>
            ) : (
              <span className='text-gray-500 text-xs italic'>
                No data loaded
              </span>
            )}
          </div>

          {/* Simulation Dropdown */}
          <div className='relative'>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={isLoading}
              className={`px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center space-x-1 ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}>
              <span>Select Simulation</span>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className={`h-4 w-4 transition-transform duration-200 ${
                  showDropdown ? 'transform rotate-180' : ''
                }`}
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M19 9l-7 7-7-7'
                />
              </svg>
            </button>

            {showDropdown && (
              <div className='absolute left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-20'>
                <div className='py-1 max-h-96 overflow-y-auto'>
                  {allSimulations.length > 0 ? (
                    allSimulations.map((sim) => (
                      <button
                        key={sim.filename}
                        onClick={() => handleSelectFile(sim.filename)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center justify-between ${
                          sim.isCurrent ? 'bg-blue-900/30 text-blue-300' : ''
                        } ${
                          userSelectedFile === sim.filename
                            ? 'text-green-300'
                            : ''
                        }`}>
                        <span className='truncate'>{sim.filename}</span>
                        {sim.isCurrent && (
                          <span className='text-xs bg-blue-800 text-blue-200 px-1.5 py-0.5 rounded'>
                            Current
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className='px-4 py-2 text-sm text-gray-400'>
                      No simulations available
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reset Button */}
          <Tooltip content='Reset to beginning of simulation'>
            <button
              onClick={resetSimulation}
              disabled={isLoading || !simulationInfo}
              className={`px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm ${
                isLoading || !simulationInfo
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-4 w-4 inline mr-1'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                />
              </svg>
              Reset
            </button>
          </Tooltip>
        </div>

        {/* Right Controls */}
        <div className='flex items-center space-x-4'>
          {/* Loading Indicator */}
          {isLoading && (
            <div className='text-gray-300 flex items-center'>
              <div className='animate-spin mr-2 h-4 w-4 text-white'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
              </div>
              <span className='text-sm'>Loading...</span>
            </div>
          )}

          {/* ML Analytics Button - CSS only version without framer-motion */}
          <Tooltip content='Show ML-powered channel balance analytics'>
            <button
              onClick={togglePredictions}
              className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center transform hover:scale-105 active:scale-95 ${
                showPredictionsTab
                  ? 'bg-gradient-to-r from-purple-700 to-blue-600 text-white'
                  : 'bg-gradient-to-r from-purple-800/40 to-blue-700/40 hover:from-purple-700/70 hover:to-blue-600/70 text-gray-100'
              }`}
              style={{
                boxShadow: showPredictionsTab
                  ? '0 0 15px rgba(124, 58, 237, 0.5)'
                  : 'none',
              }}>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-5 w-5 mr-2'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={1.5}
                  d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
                />
              </svg>
              <span>ML Analytics</span>

              {/* Loading spinner for predictions specifically */}
              {isPredictionsLoading && (
                <div className='ml-2 animate-spin h-4 w-4 text-white'>
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                    />
                  </svg>
                </div>
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;
