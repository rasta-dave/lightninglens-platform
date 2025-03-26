import React, { useState } from 'react';
import { useSimulation } from '../../contexts/SimulationContext';

const SimulationControls = ({ showPredictionsTab, setShowPredictionsTab }) => {
  const {
    simulationInfo,
    totalTransactions,
    currentPosition,
    userSelectedFile,
    allSimulations,
    switchSimulation,
    resetSimulation,
    viewLatestSimulation,
  } = useSimulation();

  const [showSimulationList, setShowSimulationList] = useState(false);

  const toggleSimulationList = () => {
    setShowSimulationList(!showSimulationList);
  };

  return (
    <div className='container mx-auto p-4 mb-4 bg-node-background shadow-lightning-glow rounded-lg mt-4 border border-lightning-blue border-opacity-20'>
      <div className='flex justify-between items-center flex-wrap'>
        <div>
          <div className='flex items-center'>
            <h2 className='text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-bitcoin-orange to-lightning-blue'>
              {simulationInfo
                ? simulationInfo.filename
                : 'No simulation data loaded'}
            </h2>

            {/* Add indicator when user has manually selected a file */}
            {userSelectedFile && (
              <span className='ml-3 text-xs px-2 py-1 bg-yellow-600 text-white rounded-full'>
                Manual Selection
              </span>
            )}
          </div>

          <p className='text-satoshi-white'>
            {totalTransactions > 0
              ? `Transactions: ${currentPosition} / ${totalTransactions}`
              : 'No transaction data yet'}
            {totalTransactions > 0 && currentPosition >= totalTransactions && (
              <span className='ml-2 text-node-green font-semibold'>
                (Simulation Complete)
              </span>
            )}
          </p>
        </div>

        <div className='flex space-x-2 mt-2 sm:mt-0'>
          <button onClick={resetSimulation} className='bitcoin-btn'>
            <span className='flex items-center'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-4 w-4 mr-1'
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
              Restart
            </span>
          </button>

          <button onClick={toggleSimulationList} className='lightning-btn'>
            <span className='flex items-center'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-4 w-4 mr-1'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M4 6h16M4 12h16M4 18h7'
                />
              </svg>
              {showSimulationList
                ? 'Hide Simulation Data'
                : 'Show Simulation Data'}
            </span>
          </button>

          <button
            onClick={viewLatestSimulation}
            className='px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:bg-opacity-90 text-satoshi-white rounded transition-all duration-200 shadow-lightning-glow focus:outline-none'>
            <span className='flex items-center'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-4 w-4 mr-1'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              View Latest
            </span>
          </button>

          <button
            onClick={() => setShowPredictionsTab(!showPredictionsTab)}
            className={`px-4 py-2 ${
              showPredictionsTab
                ? 'bg-lightning-purple'
                : 'bg-gradient-to-r from-lightning-start to-lightning-end'
            } hover:bg-opacity-90 text-satoshi-white rounded transition-all duration-200 shadow-lightning-glow focus:outline-none`}>
            <span className='flex items-center'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-4 w-4 mr-1'
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
              {showPredictionsTab ? 'Hide ML Analytics' : 'Show ML Analytics'}
            </span>
          </button>
        </div>
      </div>

      {/* Simulation List Dropdown */}
      {showSimulationList && (
        <div className='mt-4 border border-lightning-blue border-opacity-20 rounded-lg p-2 max-h-60 overflow-y-auto bg-dark-node'>
          <h3 className='font-semibold text-lg mb-2 text-lightning-blue'>
            Available Simulation Data
          </h3>
          {allSimulations.length === 0 ? (
            <p className='text-gray-400'>No simulation data found</p>
          ) : (
            <ul className='divide-y divide-lightning-blue/10'>
              {allSimulations.map((sim) => (
                <li
                  key={sim.filename}
                  className={`p-2 cursor-pointer hover:bg-node-background transition-colors duration-150 ${
                    simulationInfo && simulationInfo.filename === sim.filename
                      ? 'bg-lightning-blue/10'
                      : ''
                  }`}
                  onClick={() => switchSimulation(sim.filename)}>
                  <div className='flex justify-between items-center'>
                    <div>
                      <span
                        className={`font-medium ${
                          simulationInfo &&
                          simulationInfo.filename === sim.filename
                            ? 'text-lightning-blue'
                            : 'text-satoshi-white'
                        }`}>
                        {sim.filename}
                      </span>
                      <p className='text-sm text-gray-400'>
                        Modified: {new Date(sim.modified).toLocaleString()}
                      </p>
                    </div>
                    {simulationInfo &&
                      simulationInfo.filename === sim.filename && (
                        <span className='text-xs px-2 py-1 bg-gradient-to-r from-bitcoin-orange to-lightning-blue text-satoshi-white rounded-full'>
                          Current
                        </span>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default SimulationControls;
