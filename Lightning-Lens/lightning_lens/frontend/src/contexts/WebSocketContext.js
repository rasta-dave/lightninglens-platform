import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

// Context for WebSocket connections
const WebSocketContext = createContext(null);

// Global store for WebSocket connections (singleton pattern)
const globalWebSocketStore = {
  activeConnections: {},
  add(id, connection) {
    this.activeConnections[id] = connection;
    console.log(`Added connection to global store: ${id}`);
  },
  get(id) {
    return this.activeConnections[id];
  },
  remove(id) {
    if (this.activeConnections[id]) {
      console.log(`Removing connection from global store: ${id}`);
      delete this.activeConnections[id];
    }
  },
  cleanup() {
    Object.keys(this.activeConnections).forEach((id) => {
      const conn = this.activeConnections[id];
      if (conn && conn.socket) {
        try {
          if (conn.socket.readyState === WebSocket.OPEN) {
            console.log(`Global cleanup closing connection: ${id}`);
            conn.socket.close(1000, 'Global cleanup');
          }
        } catch (err) {
          console.error(`Error closing connection ${id}:`, err);
        }
      }
      delete this.activeConnections[id];
    });
  },
};

// Register global cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalWebSocketStore.cleanup();
  });
}

export const WebSocketProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const connectionIdRef = useRef(`connection-${Date.now()}`);
  const connectingRef = useRef(false);
  const unmountedRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const statusRef = useRef('disconnected');
  const messageQueueRef = useRef([]);
  const sendFnRef = useRef(null);
  const messageHandlersRef = useRef({});

  // Initialize connection to WebSocket server
  const initializeWebSocket = useCallback((url) => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    // Clean up any existing connection
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch (err) {
        console.error('Error closing WebSocket:', err);
      }
      wsRef.current = null;
    }

    console.log(`Connecting to WebSocket: ${url}`);
    setConnectionStatus('connecting');
    statusRef.current = 'connecting';

    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;

      // Create the send function
      const sendFn = (data) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return false;
        }
        try {
          socket.send(data);
          return true;
        } catch (err) {
          console.error('Error sending message:', err);
          return false;
        }
      };

      socket.onopen = (event) => {
        console.log(`WebSocket connection established`);
        connectingRef.current = false;
        reconnectCountRef.current = 0;
        statusRef.current = 'connected';
        setConnectionStatus('connected');
        sendFnRef.current = sendFn;

        // Add to global store
        globalWebSocketStore.add(connectionIdRef.current, {
          socket,
          sendFn,
          timestamp: Date.now(),
        });

        // Process any queued messages
        setTimeout(() => {
          if (messageQueueRef.current.length > 0) {
            const queueCopy = [...messageQueueRef.current];
            messageQueueRef.current = [];
            queueCopy.forEach((evt) => processMessage(evt));
          }
        }, 0);

        setLastMessage({
          type: 'open',
          send: sendFn,
        });
      };

      socket.onmessage = (event) => {
        if (unmountedRef.current) return;

        // Update the lastMessage
        setLastMessage({
          data: event.data,
          send: sendFnRef.current,
          timestamp: Date.now(),
        });

        // If not connected yet, queue the message
        if (statusRef.current !== 'connected') {
          messageQueueRef.current.push(event);
          return;
        }

        processMessage(event);
      };

      socket.onclose = (event) => {
        if (unmountedRef.current) return;

        console.log(
          `WebSocket connection closed (code: ${event.code}, reason: ${
            event.reason || 'No reason provided'
          })`
        );

        connectingRef.current = false;
        statusRef.current = 'disconnected';
        wsRef.current = null;
        setConnectionStatus('disconnected');

        // Remove from global store if it was a normal closure
        if (event.code === 1000) {
          globalWebSocketStore.remove(connectionIdRef.current);
        }

        // Attempt to reconnect for abnormal closures
        if (event.code !== 1000 && !unmountedRef.current) {
          const delay = Math.min(
            1000 * Math.pow(1.5, Math.min(reconnectCountRef.current, 10)),
            30000
          );
          console.log(`Attempting to reconnect in ${delay}ms...`);

          reconnectCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!unmountedRef.current) {
              initializeWebSocket(url);
            }
          }, delay);
        }
      };

      socket.onerror = (error) => {
        if (unmountedRef.current) return;

        console.error('WebSocket error:', error);
        statusRef.current = 'error';
        setConnectionStatus('error');
        // Error handling is done in onclose
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      connectingRef.current = false;
      statusRef.current = 'error';
      setConnectionStatus('error');

      // Try to reconnect after an error
      const delay = 2000;
      reconnectCountRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          initializeWebSocket(url);
        }
      }, delay);
    }
  }, []);

  // Process incoming WebSocket messages
  const processMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      const handler = messageHandlersRef.current[data.type];

      if (handler) {
        handler(data);
      } else {
        console.log(`No handler for message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }, []);

  // Register a message handler
  const registerMessageHandler = useCallback((type, handler) => {
    messageHandlersRef.current[type] = handler;

    // Return a function to unregister the handler
    return () => {
      delete messageHandlersRef.current[type];
    };
  }, []);

  // Send a message through the WebSocket
  const sendMessage = useCallback((data) => {
    // Find active connection in global store
    const globalConn = globalWebSocketStore.get(connectionIdRef.current);
    if (globalConn && globalConn.sendFn) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      return globalConn.sendFn(payload);
    }

    // Fall back to local reference
    if (!sendFnRef.current) {
      console.log('Cannot send message: No send function available');
      return false;
    }

    if (statusRef.current !== 'connected') {
      console.log(
        `Cannot send message: Connection not ready (${statusRef.current})`
      );
      return false;
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    return sendFnRef.current(payload);
  }, []);

  // Function to manually reconnect
  const reconnect = useCallback(
    (url) => {
      console.log('Manual reconnection triggered');
      reconnectCountRef.current = 0;

      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Remove from global store to force a fresh connection
      globalWebSocketStore.remove(connectionIdRef.current);

      // Close existing connection
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
          }
        } catch (err) {
          console.error('Error closing WebSocket during reconnect:', err);
        }
        wsRef.current = null;
      }

      // Slight delay before reconnecting
      setTimeout(() => {
        if (!unmountedRef.current) {
          initializeWebSocket(url);
        }
      }, 500);
    },
    [initializeWebSocket]
  );

  // Cleanup on unmount
  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;

      // Don't clean up if connection is stored globally
      const globalConn = globalWebSocketStore.get(connectionIdRef.current);
      if (!globalConn && wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
          }
        } catch (err) {
          console.error('Error closing WebSocket during cleanup:', err);
        }
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Context value
  const contextValue = {
    connectionStatus,
    lastMessage,
    sendMessage,
    reconnect,
    initializeWebSocket,
    registerMessageHandler,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook for using the WebSocket context
export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      'useWebSocketContext must be used within a WebSocketProvider'
    );
  }
  return context;
};
