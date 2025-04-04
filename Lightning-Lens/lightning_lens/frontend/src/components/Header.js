import React from 'react';

const Header = ({ connectionStatus, simulationInfo }) => {
  const statusColors = {
    connected: 'text-node-green',
    connecting: 'text-channel-yellow',
    disconnected: 'text-warning-red',
    error: 'text-warning-red',
  };

  const statusLabels = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Connection Error',
  };

  return (
    <header className='bg-gradient-to-r from-lightning-dark to-dark-node shadow-lg border-b border-lightning-blue border-opacity-20'>
      <div className='container mx-auto px-4 py-3'>
        <div className='flex justify-between items-center'>
          <div className='flex items-center space-x-3'>
            <div className='flex items-center'>
              <img
                src='/images/lightnings.svg'
                alt='Lightning Lens Logo'
                className='w-8 h-8 mr-2 filter drop-shadow-xl'
              />
              <h1 className='text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-bitcoin-orange to-lightning-blue'>
                Lightning Lens
              </h1>
            </div>
            <span className='text-lightning-blue opacity-50 px-2'>|</span>
            <div className='text-sm font-semibold text-satoshi-white'>
              Simulation Dashboard
            </div>
          </div>

          <div className='flex items-center space-x-4'>
            {simulationInfo && (
              <div className='hidden md:block text-sm'>
                <span className='text-gray-400'>Simulation: </span>
                <span className='font-semibold text-satoshi-white'>
                  {simulationInfo.filename}
                </span>
                <span className='mx-2 text-lightning-blue opacity-50'>•</span>
                <span className='text-gray-400'>Transactions: </span>
                <span className='font-semibold text-satoshi-white'>
                  {simulationInfo.transactionCount}
                </span>
              </div>
            )}

            <div className='flex items-center'>
              <div
                className={`h-2 w-2 rounded-full animate-pulse ${
                  connectionStatus === 'connected'
                    ? 'bg-node-green'
                    : connectionStatus === 'connecting'
                    ? 'bg-channel-yellow'
                    : 'bg-warning-red'
                } mr-2 shadow-lightning-glow`}></div>
              <span
                className={`text-sm font-medium ${statusColors[connectionStatus]}`}>
                {statusLabels[connectionStatus]}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
