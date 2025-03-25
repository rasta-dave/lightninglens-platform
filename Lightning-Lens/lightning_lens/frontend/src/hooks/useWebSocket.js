import { useState, useEffect, useRef, useCallback } from 'react';

// Create a global store for WebSocket connections
// This will persist even if the components unmount and remount
const globalWebSocketStore = {
  activeConnections: {},
  add(id, connection) {
    this.activeConnections[id] = connection;
    // Only log if debug mode is enabled
    if (connection.debug) {
      console.log(`Added connection to global store: ${id}`);
      console.log(
        `Active connections: ${Object.keys(this.activeConnections).length}`
      );
    }
  },
  get(id) {
    return this.activeConnections[id];
  },
  remove(id) {
    if (this.activeConnections[id]) {
      // Always log removal for debugging purposes
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

export const useWebSocket = ({
  url,
  onOpen,
  onMessage,
  onClose,
  onError,
  skipConnection = false,
  connectionId = null, // Add connectionId parameter
  debug = false, // Add debug parameter to control verbosity
}) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const connectingRef = useRef(false);
  const unmountedRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const statusRef = useRef('disconnected'); // Track status in a ref for immediate access
  const messageQueueRef = useRef([]); // Store messages that arrive before we're ready
  const baseReconnectDelay = 1000; // Initial reconnect delay in ms
  const urlRef = useRef(url); // Store the URL in a ref to compare in cleanup
  const sendFnRef = useRef(null); // Store the current send function for direct access
  const debugRef = useRef(debug); // Store debug setting

  // Helper function for conditional logging
  const logDebug = useCallback((message, always = false) => {
    if (debugRef.current || always) {
      console.log(message);
    }
  }, []);

  // Generate a stable connection ID that will be the same across remounts
  const stableId = connectionId || `ws-${url}`;
  const connectionIdRef = useRef(stableId);

  // Track if we're actively in the connect function (to prevent recursive calls)
  const connectingInProgressRef = useRef(false);

  // Track if connections should be skipped
  const skipConnectionRef = useRef(skipConnection);

  // Track if the component was mounted multiple times (for React StrictMode detection)
  const mountCountRef = useRef(0);

  // Update the skipConnection ref when the prop changes
  useEffect(() => {
    skipConnectionRef.current = skipConnection;
  }, [skipConnection]);

  // Update the debug ref when the prop changes
  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  // Update the status ref whenever the state changes
  useEffect(() => {
    statusRef.current = connectionStatus;
  }, [connectionStatus]);

  // Function to clean WebSocket URL to prevent duplicate timestamps
  const getCleanUrl = useCallback((baseUrl) => {
    // First remove any existing timestamp parameter if it exists
    let cleanUrl = baseUrl;
    if (cleanUrl.includes('?t=')) {
      // Extract the base URL without the timestamp
      cleanUrl = cleanUrl.split('?')[0];
    }
    // Add a fresh timestamp
    return `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  }, []);

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = () => {
    const attempt = Math.min(reconnectCountRef.current, 10);
    const delay = baseReconnectDelay * Math.pow(1.5, attempt);
    return Math.min(delay, 30000); // Max 30 seconds
  };

  // External send function that can be used directly
  const sendMessage = useCallback(
    (data) => {
      // First check the global store for an active connection
      const globalConn = globalWebSocketStore.get(connectionIdRef.current);
      if (globalConn && globalConn.sendFn) {
        return globalConn.sendFn(data);
      }

      // Fall back to local reference if global not available
      if (!sendFnRef.current) {
        logDebug('Cannot send message: No send function available');
        return false;
      }

      if (statusRef.current !== 'connected') {
        logDebug(
          `Cannot send message: Connection not ready (${statusRef.current})`
        );
        return false;
      }

      return sendFnRef.current(data);
    },
    [logDebug]
  );

  // Clean up function to properly close WebSocket connection
  const cleanupWebSocket = useCallback(() => {
    // Clear any connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Clear any reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear message queue
    messageQueueRef.current = [];

    const socket = wsRef.current;

    // Check if we have a global connection that should be preserved
    const globalConn = globalWebSocketStore.get(connectionIdRef.current);
    if (globalConn && globalConn.socket && !unmountedRef.current) {
      logDebug(
        `Preserving global WebSocket connection (ID: ${connectionIdRef.current})`
      );
      // Don't close the socket - it will be reused
      return;
    }

    // Clear the reference first to prevent any new messages from being sent
    wsRef.current = null;

    // Don't clear the send function until we have a new one to replace it
    // This avoids errors if external code tries to send during reconnection
    if (socket) {
      // Remove all event listeners to prevent memory leaks
      try {
        socket.onopen = null;
        socket.onclose = null;
        socket.onmessage = null;
        socket.onerror = null;

        // Only attempt to close the socket if it's in an open or connecting state
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          logDebug(
            `Closing WebSocket connection (ID: ${connectionIdRef.current})`,
            true
          );
          socket.close(1000, 'Intentional closure before new connection');
        }
      } catch (err) {
        console.error('Error cleaning up WebSocket:', err);
      }
    }

    // Remove from global store if we're truly disconnecting
    if (unmountedRef.current) {
      globalWebSocketStore.remove(connectionIdRef.current);
    }

    connectingRef.current = false;
    connectingInProgressRef.current = false;
  }, [logDebug]);

  // Creating a send function that can be reused
  const createSendFn = useCallback(
    (socket) => {
      return (data) => {
        if (!socket) {
          logDebug('Cannot send: socket is null');
          return false;
        }

        if (socket.readyState !== WebSocket.OPEN) {
          logDebug('Cannot send: socket not open', socket.readyState);
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
    },
    [logDebug]
  );

  // Function to process any queued messages
  const processMessageQueue = useCallback(() => {
    if (
      messageQueueRef.current.length > 0 &&
      wsRef.current &&
      statusRef.current === 'connected'
    ) {
      logDebug(`Processing ${messageQueueRef.current.length} queued messages`);

      // Get a local copy of the queue and clear the ref
      const queueCopy = [...messageQueueRef.current];
      messageQueueRef.current = [];

      // Process each queued message
      queueCopy.forEach((evt) => {
        if (onMessage) {
          onMessage(evt);
        }
      });
    }
  }, [onMessage, logDebug]);

  // Connect to WebSocket server
  const connectWebSocket = useCallback(() => {
    // Before creating a new connection, check if we have one in the global store
    const existingConnection = globalWebSocketStore.get(
      connectionIdRef.current
    );
    if (existingConnection && existingConnection.socket) {
      logDebug(
        `Reusing existing WebSocket connection from global store (ID: ${connectionIdRef.current})`
      );

      // Set local refs to the global socket
      wsRef.current = existingConnection.socket;
      sendFnRef.current = existingConnection.sendFn;

      // Update state references - BUT DON'T UPDATE STATE DIRECTLY HERE
      // This was causing an infinite loop - only update the ref
      statusRef.current = 'connected';

      // Don't call setConnectionStatus here - it causes re-renders
      // setConnectionStatus('connected');  <-- This line was causing the infinite loop

      // Set lastMessage with the send function but don't trigger a re-render
      // if it's not necessary
      if (lastMessage === null || !lastMessage.send) {
        setLastMessage({
          send: existingConnection.sendFn,
        });
      }

      // Process any queued messages
      setTimeout(processMessageQueue, 0);

      // If the connection is already established, call onOpen to notify listeners
      if (onOpen && existingConnection.socket.readyState === WebSocket.OPEN) {
        onOpen({ type: 'reused-connection' }, existingConnection.sendFn);
      }

      // AFTER all the setup is done, update the UI state once
      // Use requestAnimationFrame to break the potential render cycle
      if (connectionStatus !== 'connected') {
        requestAnimationFrame(() => {
          setConnectionStatus('connected');
        });
      }

      return;
    }

    // Skip connection if the skipConnection flag is set
    if (skipConnectionRef.current) {
      logDebug(
        `Skipping WebSocket connection as instructed (ID: ${connectionIdRef.current})`
      );
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (connectingRef.current || connectingInProgressRef.current) {
      logDebug(
        `Already attempting to connect, skipping duplicate request (ID: ${connectionIdRef.current})`
      );
      return;
    }

    // Set flag to prevent recursive calls during this function execution
    connectingInProgressRef.current = true;

    // Check if component is unmounted
    if (unmountedRef.current) {
      logDebug(
        `Component unmounted, skipping connection attempt (ID: ${connectionIdRef.current})`
      );
      connectingInProgressRef.current = false;
      return;
    }

    // Clean up any existing connection first, but with a small delay to prevent race conditions
    if (wsRef.current) {
      logDebug(
        `Cleaning up existing connection before creating a new one (ID: ${connectionIdRef.current})`
      );
      cleanupWebSocket();

      // Add a small delay to ensure the previous connection is properly cleaned up
      connectionTimeoutRef.current = setTimeout(() => {
        // Only proceed if we haven't been unmounted
        if (!unmountedRef.current) {
          initiateNewConnection();
        } else {
          connectingInProgressRef.current = false;
        }
      }, 100);
    } else {
      // No existing connection, so create one immediately
      initiateNewConnection();
    }

    function initiateNewConnection() {
      // Set connecting state and status
      connectingRef.current = true;
      setConnectionStatus('connecting');
      statusRef.current = 'connecting';

      logDebug(
        `Connecting to WebSocket: ${url} (ID: ${connectionIdRef.current})`
      );

      try {
        // Store URL for reference
        urlRef.current = url;

        // Create a new WebSocket connection
        const socket = new WebSocket(url);
        wsRef.current = socket;

        // Create the send function, but don't assign it to the ref until connected
        const sendFn = createSendFn(socket);

        // Set up event handlers
        socket.onopen = (event) => {
          // Check if we got unmounted during connection
          if (unmountedRef.current) {
            logDebug(
              `Connection opened but component unmounted, closing (ID: ${connectionIdRef.current})`,
              true
            );
            socket.close(1000, 'Component unmounted');
            connectingInProgressRef.current = false;
            return;
          }

          // Check if this is still the current socket
          if (socket !== wsRef.current) {
            logDebug(
              `Connection opened but socket reference changed, ignoring (ID: ${connectionIdRef.current})`
            );
            socket.close(1000, 'Socket reference changed');
            connectingInProgressRef.current = false;
            return;
          }

          logDebug(
            `WebSocket connection opened successfully (ID: ${connectionIdRef.current})`,
            true
          );

          // Update state references before calling any callbacks
          connectingRef.current = false;
          reconnectCountRef.current = 0;
          statusRef.current = 'connected';
          connectingInProgressRef.current = false;

          // NOW assign the send function ref (only when we're sure the connection is established)
          sendFnRef.current = sendFn;

          // Add to global store
          globalWebSocketStore.add(connectionIdRef.current, {
            socket: socket,
            sendFn: sendFn,
            timestamp: Date.now(),
            debug: debugRef.current,
          });

          // Set the lastMessage with send function
          setLastMessage({
            send: sendFn,
          });

          // Then update connection status
          setConnectionStatus('connected');

          // Process any queued messages
          setTimeout(processMessageQueue, 0);

          // Then call the user's callback with the send function
          if (onOpen) {
            onOpen(event, sendFn);
          }
        };

        socket.onmessage = (event) => {
          if (unmountedRef.current) return;
          if (socket !== wsRef.current) return; // Ignore messages from old connections

          // Update the lastMessage object with the new data
          setLastMessage({
            data: event.data,
            send: sendFnRef.current,
          });

          // If we're not fully connected yet, queue the message
          if (statusRef.current !== 'connected') {
            logDebug(
              `Message received before connected status, queueing (ID: ${connectionIdRef.current})`
            );
            messageQueueRef.current.push(event);
            return;
          }

          // Process messages if connected
          if (onMessage) {
            onMessage(event);
          }
        };

        socket.onclose = (event) => {
          if (unmountedRef.current) return;
          if (socket !== wsRef.current) return; // Ignore close events from old connections

          // Always log connection closure (important for debugging)
          console.log(
            `WebSocket connection closed (code: ${event.code}, reason: ${
              event.reason || 'No reason provided'
            }, ID: ${connectionIdRef.current})`
          );

          // Update state references
          connectingRef.current = false;
          statusRef.current = 'disconnected';

          // Only clear the WebSocket reference if it's still this socket
          if (wsRef.current === socket) {
            wsRef.current = null;
            // Remove from global store if it was a normal closure
            if (event.code === 1000) {
              globalWebSocketStore.remove(connectionIdRef.current);
            }
          }

          setConnectionStatus('disconnected');
          connectingInProgressRef.current = false;

          // Call user's onClose handler
          if (onClose) {
            onClose(event);
          }

          // Only attempt to reconnect for abnormal closures (not 1000 = normal closure)
          // and if we're not unmounted or skipping connections
          if (
            event.code !== 1000 &&
            !unmountedRef.current &&
            !skipConnectionRef.current
          ) {
            const delay = getReconnectDelay();
            logDebug(
              `Attempting to reconnect in ${delay}ms... (ID: ${connectionIdRef.current})`,
              true
            );

            reconnectCountRef.current += 1;
            reconnectTimeoutRef.current = setTimeout(() => {
              // Double-check we're still mounted
              if (!unmountedRef.current && !skipConnectionRef.current) {
                connectWebSocket();
              }
            }, delay);
          }
        };

        socket.onerror = (error) => {
          if (unmountedRef.current) return;
          if (socket !== wsRef.current) return; // Ignore errors from old connections

          // Always log errors
          console.error(
            `WebSocket error (ID: ${connectionIdRef.current}):`,
            error
          );

          // Update connection status
          statusRef.current = 'error';
          setConnectionStatus('error');
          connectingInProgressRef.current = false;

          // Call user's onError handler
          if (onError) {
            onError(error);
          }

          // We don't need to handle reconnection here, as onclose will be called after an error
        };
      } catch (error) {
        console.error(
          `Error creating WebSocket connection (ID: ${connectionIdRef.current}):`,
          error
        );

        // Update state references
        connectingRef.current = false;
        statusRef.current = 'error';
        setConnectionStatus('error');
        connectingInProgressRef.current = false;

        if (onError) {
          onError(error);
        }

        // Try to reconnect after an error with a delay
        const delay = getReconnectDelay();
        logDebug(
          `Attempting to reconnect in ${delay}ms after error... (ID: ${connectionIdRef.current})`,
          true
        );

        reconnectCountRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!unmountedRef.current && !skipConnectionRef.current) {
            connectWebSocket();
          }
        }, delay);
      }
    }
  }, [
    url,
    onOpen,
    onMessage,
    onClose,
    onError,
    cleanupWebSocket,
    createSendFn,
    processMessageQueue,
    logDebug,
  ]);

  // Function to manually reconnect (for user-triggered reconnects)
  const reconnect = useCallback(() => {
    logDebug(
      `Manual reconnection triggered (ID: ${connectionIdRef.current})`,
      true
    );
    reconnectCountRef.current = 0; // Reset the reconnect counter
    skipConnectionRef.current = false; // Force connection even if it was previously skipped

    // Remove from global store to force a fresh connection
    globalWebSocketStore.remove(connectionIdRef.current);
    cleanupWebSocket();

    // Slight delay before reconnecting
    setTimeout(() => {
      if (!unmountedRef.current) {
        connectWebSocket();
      }
    }, 500);
  }, [cleanupWebSocket, connectWebSocket, logDebug]);

  // Handle React StrictMode which mounts components twice in development
  useEffect(() => {
    mountCountRef.current += 1;

    logDebug(
      `WebSocket hook mounted (count: ${mountCountRef.current}, ID: ${connectionIdRef.current})`
    );

    // Mark component as mounted
    unmountedRef.current = false;

    // If we have a valid URL and aren't skipping connections, connect now
    if (url && !skipConnectionRef.current) {
      connectWebSocket();
    }

    // Clean up on unmount
    return () => {
      logDebug(`WebSocket hook unmounting (ID: ${connectionIdRef.current})`);
      unmountedRef.current = true;

      // Don't actually clean up the WebSocket if it's stored globally
      // We want it to persist across unmounts
      const globalConn = globalWebSocketStore.get(connectionIdRef.current);
      if (!globalConn) {
        cleanupWebSocket();
      }
    };
  }, [url, connectWebSocket, cleanupWebSocket, logDebug]);

  return {
    connectionStatus,
    lastMessage,
    reconnect,
    sendMessage,
  };
};
