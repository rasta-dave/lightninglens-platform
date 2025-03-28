import React from 'react';
import { useSimulation } from '../../contexts/SimulationContext';

const NewSimulationNotification = () => {
  const { newSimulationNotification, switchToSimulation, clearNotification } =
    useSimulation();

  // If there's no notification, don't render anything
  if (!newSimulationNotification) {
    return null;
  }

  return (
    <div className='bg-channel-panel border-l-4 border-channel-yellow p-4 mb-4 mx-4 mt-4 rounded shadow-lightning-glow'>
      <div className='flex justify-between items-center'>
        <div>
          <p className='font-bold text-satoshi-white'>
            New Simulation Data Available
          </p>
          <p className='text-lightning-blue'>
            {newSimulationNotification.filename}{' '}
            <span className='text-channel-yellow'>
              (
              {new Date(
                newSimulationNotification.timestamp
              ).toLocaleTimeString()}
              )
            </span>
          </p>
        </div>
        <div className='flex space-x-2'>
          <button
            onClick={() =>
              switchToSimulation(newSimulationNotification.filename)
            }
            className='lightning-btn'>
            View Now
          </button>
          <button
            onClick={clearNotification}
            className='px-3 py-1 bg-dark-node hover:bg-opacity-90 text-satoshi-white rounded transition-all duration-200 focus:ring-2 focus:ring-lightning-purple focus:ring-opacity-50 focus:outline-none'>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewSimulationNotification;
