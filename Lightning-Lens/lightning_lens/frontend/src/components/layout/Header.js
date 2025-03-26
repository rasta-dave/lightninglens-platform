import React from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

const Header = () => {
  const { connectionStatus } = useWebSocketContext();

  return (
    <header className='bg-gradient-to-r from-bitcoin-orange/90 to-lightning-blue/90 text-white p-4 shadow-lg border-b border-bitcoin-orange/30'>
      <div className='container mx-auto flex justify-between items-center'>
        <div className='flex items-center'>
          <img
            src='/images/lightnings.svg'
            alt='Lightning Lens Logo'
            className='h-8 w-8 mr-2'
          />
          <h1 className='text-2xl font-bold text-satoshi-white'>
            LightningLens Dashboard
          </h1>
        </div>
        <div className='flex items-center'>
          {connectionStatus === 'connected' ? (
            <span className='text-satoshi-white flex items-center bg-node-green/30 px-3 py-1 rounded-full border border-node-green/50'>
              <span className='inline-block h-3 w-3 rounded-full bg-node-green mr-2 animate-pulse'></span>
              Connected
            </span>
          ) : (
            <span className='text-satoshi-white flex items-center bg-warning-red/30 px-3 py-1 rounded-full border border-warning-red/50'>
              <span className='inline-block h-3 w-3 rounded-full bg-warning-red mr-2'></span>
              {connectionStatus === 'connecting'
                ? 'Connecting...'
                : connectionStatus === 'disconnected'
                ? 'Disconnected'
                : 'Error'}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
