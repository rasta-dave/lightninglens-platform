import { useEffect, useRef } from 'react';

// Comment out or remove the WebSocket connection code
// const [websocketRef, setWebsocketRef] = useState(null);
// const [websocketState, setWebsocketState] = useState('initial');

const useLightningData = () => {
  const websocketRef = useRef(null);

  useEffect(() => {
    return () => {
      // Clean up any remaining WebSocket references
      if (websocketRef.current) {
        websocketRef.current.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // ... rest of the hook implementation
};

export default useLightningData;
