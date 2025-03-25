import React, { useState, useRef, useEffect } from 'react';

const MAX_CONNECTION_ATTEMPTS = 15;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

const useSuggestions = () => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const connectionAttempts = useRef(0);
  const websocketRef = useRef(null);
  const reconnectTimeout = useRef(null);
  const isMounted = useRef(true);

  const connect = () => {
    if (
      !isMounted.current ||
      connectionState === 'connecting' ||
      connectionState === 'connected'
    ) {
      return;
    }

    setConnectionState('connecting');
    websocketRef.current = new WebSocket('ws://localhost:8767');

    websocketRef.current.onopen = () => {
      if (!isMounted.current) return;
      console.log('[WS:INFO] Connection established');
      setConnectionState('connected');
      connectionAttempts.current = 0;
    };

    websocketRef.current.onmessage = (message) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(message.data);
        console.log('[WS:DEBUG] Message received:', data);
        // Handle messages
      } catch (error) {
        console.error('[WS:ERROR] Message parsing error:', error);
      }
    };

    websocketRef.current.onerror = (error) => {
      if (!isMounted.current) return;
      console.error('[WS:ERROR] WebSocket error:', error);
      handleDisconnection();
    };

    websocketRef.current.onclose = (event) => {
      if (!isMounted.current) return;
      console.warn(`[WS:WARN] Connection closed with code ${event.code}`);
      handleDisconnection(event.code);
    };
  };

  const handleDisconnection = (code = 1006) => {
    if (code === 1000) {
      // Normal closure
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('reconnecting');
    scheduleReconnect();
  };

  const scheduleReconnect = () => {
    if (
      !isMounted.current ||
      connectionAttempts.current >= MAX_CONNECTION_ATTEMPTS
    ) {
      console.error('[WS:ERROR] Max connection attempts reached');
      setConnectionState('disconnected');
      return;
    }

    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, connectionAttempts.current),
      MAX_RECONNECT_DELAY
    );

    console.log(`[WS:INFO] Scheduling reconnect in ${delay}ms`);
    connectionAttempts.current += 1;

    reconnectTimeout.current = setTimeout(() => {
      if (isMounted.current) {
        connect();
      }
    }, delay);
  };

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      if (websocketRef.current) {
        websocketRef.current.close(1000, 'Component unmounting');
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, []);

  return {
    connectionState,
    // ... other return values
  };
};

export default useSuggestions;
