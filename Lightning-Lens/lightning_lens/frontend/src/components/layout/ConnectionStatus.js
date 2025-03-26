import React from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

const ConnectionStatus = () => {
  const { connectionStatus, reconnect } = useWebSocketContext();

  // Only show the component when there's a connection issue
  if (!(connectionStatus === 'error' || connectionStatus === 'disconnected')) {
    return null;
  }

  return (
    <div className='fixed bottom-4 right-4 bg-red-900/40 border-l-4 border-red-500 text-red-200 p-4 rounded shadow-lg'>
      <p className='font-bold'>Connection Lost</p>
      <p>Attempting to reconnect automatically...</p>
      <button
        onClick={() => reconnect('ws://localhost:3005')}
        className='mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-4 rounded transition-colors duration-200'>
        Reconnect Now
      </button>
    </div>
  );
};

export default ConnectionStatus;
