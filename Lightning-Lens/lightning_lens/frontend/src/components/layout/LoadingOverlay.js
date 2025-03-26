import React from 'react';
import { useSimulation } from '../../contexts/SimulationContext';

const LoadingOverlay = () => {
  const { isLoading } = useSimulation();

  // If not loading, don't render anything
  if (!isLoading) {
    return null;
  }

  return (
    <div className='fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50'>
      <div className='bg-dark-node p-6 rounded-lg shadow-lightning-glow flex flex-col items-center'>
        <div className='w-16 h-16 border-4 border-t-lightning-blue border-r-lightning-purple border-b-bitcoin-orange border-l-channel-yellow rounded-full animate-spin mb-4'></div>
        <p className='text-lightning-blue text-lg font-semibold'>
          Loading simulation data...
        </p>
      </div>
    </div>
  );
};

export default LoadingOverlay;
