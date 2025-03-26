import React from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

const Header = () => {
  const { connectionStatus } = useWebSocketContext();

  return (
    <header className='bg-gradient-to-r from-blue-900 to-purple-900 text-white p-4 shadow-lg border-b border-blue-700'>
      <div className='container mx-auto flex justify-between items-center'>
        <div className='flex items-center'>
          <img
            src='/images/lightnings.svg'
            alt='Lightning Lens Logo'
            className='h-8 w-8 mr-2'
          />
          <h1 className='text-2xl font-bold'>LightningLens Dashboard</h1>
        </div>
        <div className='flex items-center'>
          {connectionStatus === 'connected' ? (
            <span className='text-green-300 flex items-center bg-green-900/30 px-3 py-1 rounded-full'>
              <span className='inline-block h-3 w-3 rounded-full bg-green-400 mr-2 animate-pulse'></span>
              Connected
            </span>
          ) : (
            <span className='text-red-300 flex items-center bg-red-900/30 px-3 py-1 rounded-full'>
              <span className='inline-block h-3 w-3 rounded-full bg-red-400 mr-2'></span>
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
