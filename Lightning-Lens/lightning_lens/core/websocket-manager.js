/**
 * websocket-manager.js - Standardized WebSocket management for Lightning Lens
 *
 * Provides a standardized WebSocket client and server implementation
 * with automatic reconnection, heartbeat, and message handling.
 */

const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('./logger');
const config = require('./config');
const { LightningError, ERROR_TYPES } = require('./error-handler');

// Create a logger for WebSocket Manager
const logger = createLogger({ serviceName: 'websocket-manager' });

/**
 * WebSocketClient - A robust WebSocket client with reconnection
 */
class WebSocketClient {
  /**
   * Create a WebSocket client
   * @param {string|Object} options WebSocket URL or options object
   */
  constructor(options) {
    this.options = typeof options === 'string' ? { url: options } : options;

    // Set up default options
    this.url = this.options.url;
    this.reconnect = this.options.reconnect !== false;
    this.autoReconnectInterval =
      this.options.autoReconnectInterval || config.TIMEOUTS.RETRY_INTERVAL;
    this.maxReconnectAttempts =
      this.options.maxReconnectAttempts || config.TIMEOUTS.MAX_RETRIES;
    this.pingInterval =
      this.options.pingInterval || config.TIMEOUTS.PING_INTERVAL;
    this.timeoutInterval =
      this.options.timeoutInterval || config.TIMEOUTS.CONNECTION;
    this.clientId = this.options.clientId || uuidv4();
    this.name = this.options.name || 'ws-client';

    // Set up internal state
    this.ws = null;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.isConnecting = false;
    this.isClosed = false;
    this.forceClosed = false;
    this.lastPing = null;
    this.lastPong = null;
    this.pingTimeout = null;
    this.pingInterval = null;
    this.messageBuffer = [];
    this.maxBufferSize = this.options.maxBufferSize || 50;

    // Set up event callbacks
    this.eventHandlers = {
      open: [],
      message: [],
      close: [],
      error: [],
      reconnect: [],
      reconnecting: [],
      ping: [],
      pong: [],
    };

    // Create custom logger for this client
    this.logger = createLogger({
      serviceName: `ws-client-${this.name}`,
      logLevel: this.options.logLevel,
    });

    // Connect immediately if requested
    if (this.options.connectImmediately !== false) {
      this.connect();
    }
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise<WebSocket>} Promise resolving to WebSocket instance
   */
  connect() {
    if (this.isConnecting || this._connected) {
      this.logger.debug('Already connecting or connected');
      return Promise.resolve(this.ws);
    }

    this.isConnecting = true;
    this.logger.info(`Connecting to ${this.url}`);

    return new Promise((resolve, reject) => {
      try {
        const wsOptions = {
          handshakeTimeout: this.timeoutInterval,
          perMessageDeflate: false, // Disable compression for simplicity
          headers: {
            ...(this.options.headers || {}),
            'X-Client-ID': this.clientId,
          },
        };

        // Create WebSocket connection
        this.ws = new WebSocket(this.url, wsOptions);

        // Set timeout for connection
        const connectionTimeout = setTimeout(() => {
          if (!this._connected) {
            this.logger.error(
              `Connection attempt to ${this.url} timed out after ${this.timeoutInterval}ms`
            );
            this.ws.terminate();
            reject(
              new LightningError(
                'WebSocket connection timeout',
                ERROR_TYPES.TIMEOUT
              )
            );
          }
        }, this.timeoutInterval);

        // Handle successful connection
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.logger.info(`Connected to ${this.url}`);

          // Reset reconnect state
          this.reconnectAttempts = 0;
          this.isConnecting = false;

          if (!this._connected) {
            this._connected = true;
            this.emit('open', { timestamp: new Date() });

            if (typeof this.options.onOpen === 'function') {
              this.options.onOpen();
            }

            // Start the heartbeat
            this.startHeartbeat();

            // Send any buffered messages
            this.sendBufferedMessages();
          }

          resolve(this.ws);
        };

        // Handle messages
        this.ws.onmessage = (event) => {
          let message;
          try {
            // Try to parse as JSON
            message = JSON.parse(event.data);

            // If this is a heartbeat response, handle it specially
            if (message.type === 'pong') {
              this.lastPong = Date.now();
              this.emit('pong', { timestamp: this.lastPong });
              return;
            }
          } catch (e) {
            // Not JSON, use as-is
            message = event.data;
          }

          // Emit message event
          this.emit('message', message);
        };

        // Handle errors
        this.ws.onerror = (error) => {
          this.logger.error(`WebSocket error:`, error);

          // Only emit error if we're not automatically reconnecting,
          // or if we've exceeded max reconnection attempts
          if (
            !this.reconnect ||
            this.reconnectAttempts >= this.maxReconnectAttempts
          ) {
            this.emit('error', error);
          }

          // If we're still waiting for initial connection, reject the promise
          if (this.isConnecting) {
            clearTimeout(connectionTimeout);
            this.isConnecting = false;
            reject(error);
          }
        };

        // Handle connection close
        this.ws.onclose = (event) => {
          this.logger.info(
            `WebSocket closed: ${event.code} ${event.reason || ''}`
          );

          // Stop heartbeat
          this.stopHeartbeat();

          // Log close reason
          this.logger.info(
            `WebSocket closed: ${event.code} ${event.reason || ''}`
          );

          // Emit close event
          this.emit('close', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });

          // Reconnect if enabled and not deliberately closed
          if (this.reconnect && !this.forceClosed && !this.isClosed) {
            this.reconnect();
          }
        };
      } catch (error) {
        this.isConnecting = false;
        this.logger.error(`Failed to create WebSocket:`, error);
        reject(error);
      }
    });
  }

  /**
   * Try to reconnect to the server
   */
  reconnect() {
    if (
      !this.reconnect ||
      this.isReconnecting ||
      this._connected ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      return Promise.resolve(this);
    }

    this.reconnectAttempts++;

    // Check if we've exceeded max reconnect attempts
    if (
      this.maxReconnectAttempts &&
      this.reconnectAttempts > this.maxReconnectAttempts
    ) {
      this.logger.warn(
        `Maximum reconnection attempts (${this.maxReconnectAttempts}) reached, giving up`
      );
      this.emit(
        'error',
        new LightningError(
          `Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`,
          ERROR_TYPES.NETWORK
        )
      );
      return Promise.resolve(this);
    }

    // Calculate backoff time with exponential backoff
    const backoffTime = Math.min(
      this.autoReconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      30000 // Maximum 30 seconds
    );

    this.logger.info(
      `Reconnecting in ${Math.floor(backoffTime)}ms (attempt ${
        this.reconnectAttempts
      }/${this.maxReconnectAttempts || 'unlimited'})`
    );

    // Emit reconnecting event
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay: backoffTime,
    });

    // Schedule reconnection
    setTimeout(() => {
      if (this.isClosed || this.forceClosed) return;

      this.connect()
        .then(() => {
          this.emit('reconnect', {
            attempt: this.reconnectAttempts,
          });
        })
        .catch((error) => {
          this.logger.error(
            `Reconnection attempt ${this.reconnectAttempts} failed:`,
            error
          );
          // The reconnect will be rescheduled by the onclose handler
        });
    }, backoffTime);
  }

  /**
   * Deliberately close the connection
   * @param {number} code Close code
   * @param {string} reason Close reason
   */
  close(code = 1000, reason = 'Normal closure') {
    this.forceClosed = true;
    this.isClosed = true;

    this.stopHeartbeat();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.logger.info(`Closing connection: ${code} ${reason}`);
        this.ws.close(code, reason);
      } else {
        this.ws.terminate();
      }
    }
  }

  /**
   * Start the heartbeat mechanism to keep the connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Ensure we don't have duplicates

    this.lastPing = Date.now();

    // Send ping at regular intervals
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send an application-level ping (some servers don't support WebSocket pings)
        this.send({
          type: 'ping',
          timestamp: new Date().toISOString(),
          clientId: this.clientId,
        });

        this.lastPing = Date.now();
        this.emit('ping', { timestamp: this.lastPing });

        // Check if we've received a pong since the last ping
        if (
          this.lastPong &&
          this.lastPing - this.lastPong > this.pingInterval * 3
        ) {
          this.logger.warn(
            'No pong received for too long, considering connection dead'
          );
          this.ws.terminate();
        }
      }
    }, this.pingInterval);
  }

  /**
   * Stop the heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  /**
   * Send a message to the server
   * @param {Object|string} message Message to send
   * @returns {boolean} True if sent, false if buffered
   */
  send(message) {
    if (!this._connected) {
      this.bufferMessage(message);
      return false;
    }

    try {
      const data =
        typeof message === 'string' ? message : JSON.stringify(message);

      this.ws.send(data);
      return true;
    } catch (error) {
      this.logger.error(`Error sending message:`, error);
      this.bufferMessage(message);
      return false;
    }
  }

  /**
   * Add a message to the buffer to send later
   * @param {Object|string} message Message to buffer
   */
  bufferMessage(message) {
    if (this.messageBuffer.length < this.maxBufferSize) {
      this.messageBuffer.push(message);
      this.logger.debug(
        `Message buffered, buffer size: ${this.messageBuffer.length}`
      );
    } else {
      this.logger.warn(
        `Message buffer full (${this.maxBufferSize}), dropping message`
      );
    }
  }

  /**
   * Send all buffered messages
   */
  sendBufferedMessages() {
    if (this.messageBuffer.length > 0 && this._connected) {
      this.logger.debug(
        `Sending ${this.messageBuffer.length} buffered messages`
      );

      // Clone and clear the buffer before sending
      const messages = [...this.messageBuffer];
      this.messageBuffer = [];

      // Send all buffered messages
      messages.forEach((message) => this.send(message));
    }
  }

  /**
   * Check if the client is connected
   * @returns {boolean} True if connected, false otherwise
   */
  isConnected() {
    return this._connected === true;
  }

  /**
   * Register an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler
   * @returns {WebSocketClient} this instance for chaining
   */
  on(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    }
    return this;
  }

  /**
   * Remove an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler to remove
   * @returns {WebSocketClient} this instance for chaining
   */
  off(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (h) => h !== handler
      );
    }
    return this;
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event Event name
   * @param {Object} data Event data
   */
  emit(event, data) {
    if (this.eventHandlers[event]) {
      for (const handler of this.eventHandlers[event]) {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`Error in ${event} handler:`, error);
        }
      }
    }
  }
}

/**
 * WebSocketServer - A robust WebSocket server implementation
 */
class WebSocketServer {
  /**
   * Create a WebSocket server
   * @param {Object} options Server options
   */
  constructor(options = {}) {
    this.options = options;

    // Set up default options
    this.port = this.options.port || 8080;
    this.path = this.options.path || '/';
    this.pingInterval =
      this.options.pingInterval || config.TIMEOUTS.PING_INTERVAL;
    this.name = this.options.name || 'ws-server';

    // Set up internal state
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.isRunning = false;
    this.httpServer = null;

    // Event handlers
    this.eventHandlers = {
      connection: [],
      message: [],
      close: [],
      error: [],
      listening: [],
    };

    // Create custom logger for this server
    this.logger = createLogger({
      serviceName: `ws-server-${this.name}`,
      logLevel: this.options.logLevel,
    });
  }

  /**
   * Start the WebSocket server
   * @returns {Promise<WebSocketServer>} Promise resolving to this server instance
   */
  start() {
    if (this.isRunning) {
      return Promise.resolve(this);
    }

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server if not provided
        if (this.options.server) {
          this.httpServer = this.options.server;
        } else {
          this.httpServer = http.createServer();

          // Handle HTTP server errors
          this.httpServer.on('error', (error) => {
            this.logger.error(`HTTP server error:`, error);
            this.emit('error', error);
          });
        }

        // Create WebSocket server
        this.wss = new WebSocket.Server({
          server: this.httpServer,
          path: this.path,
          clientTracking: true,
          perMessageDeflate: false, // Disable compression for simplicity
        });

        // Handle WebSocket connection
        this.wss.on('connection', (ws, request) => {
          this.handleConnection(ws, request);
        });

        // Handle WebSocket server errors
        this.wss.on('error', (error) => {
          this.logger.error(`WebSocket server error:`, error);
          this.emit('error', error);
        });

        // Start listening if we created the HTTP server
        if (!this.options.server) {
          this.httpServer.listen(this.port, () => {
            this.isRunning = true;
            this.logger.info(`WebSocket server listening on port ${this.port}`);
            this.emit('listening', { port: this.port });
            resolve(this);
          });
        } else {
          this.isRunning = true;
          this.logger.info(`WebSocket server attached to existing HTTP server`);
          this.emit('listening', { port: 'using existing server' });
          resolve(this);
        }
      } catch (error) {
        this.logger.error(`Failed to start WebSocket server:`, error);
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   * @returns {Promise<void>} Promise resolving when server is stopped
   */
  stop() {
    if (!this.isRunning) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Close all client connections
      for (const client of this.clients.values()) {
        try {
          client.ws.close(1000, 'Server shutting down');
        } catch (error) {
          this.logger.error(`Error closing client connection:`, error);
        }
      }

      // Close WebSocket server
      if (this.wss) {
        this.wss.close((err) => {
          if (err) {
            this.logger.error(`Error closing WebSocket server:`, err);
            reject(err);
            return;
          }

          // Only close HTTP server if we created it
          if (this.httpServer && !this.options.server) {
            this.httpServer.close((err) => {
              if (err) {
                this.logger.error(`Error closing HTTP server:`, err);
                reject(err);
                return;
              }

              this.isRunning = false;
              this.logger.info(`WebSocket server stopped`);
              resolve();
            });
          } else {
            this.isRunning = false;
            this.logger.info(`WebSocket server stopped`);
            resolve();
          }
        });
      } else {
        this.isRunning = false;
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws WebSocket connection
   * @param {http.IncomingMessage} request HTTP request
   */
  handleConnection(ws, request) {
    // Generate a unique client ID
    const clientId = request.headers['x-client-id'] || uuidv4();

    // Store client info
    const client = {
      ws,
      id: clientId,
      ip: request.socket.remoteAddress,
      connectTime: Date.now(),
      isAlive: true,
      lastPing: null,
      lastPong: null,
      messagesSent: 0,
      messagesReceived: 0,
      headers: request.headers,
      url: request.url,
      pingTimeout: null,
    };

    this.clients.set(clientId, client);
    this.logger.info(`Client connected: ${clientId} from ${client.ip}`);

    // Set up ping interval for this client
    client.pingTimeout = this.setupPing(ws, clientId);

    // Handle pong messages
    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPong = Date.now();
    });

    // Handle application-level pong messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'pong') {
          client.isAlive = true;
          client.lastPong = Date.now();
          return; // Don't process pongs as normal messages
        }

        // Count received messages
        client.messagesReceived++;

        // Emit message event with client info and parsed message
        this.emit('message', {
          client: {
            id: clientId,
            ip: client.ip,
          },
          message,
          raw: data,
        });
      } catch (error) {
        // Not JSON or error parsing, treat as raw message
        client.messagesReceived++;

        this.emit('message', {
          client: {
            id: clientId,
            ip: client.ip,
          },
          message: data,
          raw: data,
        });
      }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      // Clear ping timeout
      if (client.pingTimeout) {
        clearTimeout(client.pingTimeout);
      }

      this.logger.info(
        `Client disconnected: ${clientId}, code: ${code}, reason: ${
          reason || 'none'
        }`
      );

      // Remove client from clients map
      this.clients.delete(clientId);

      // Emit close event
      this.emit('close', {
        client: {
          id: clientId,
          ip: client.ip,
          connectTime: client.connectTime,
          disconnectTime: Date.now(),
          messagesSent: client.messagesSent,
          messagesReceived: client.messagesReceived,
        },
        code,
        reason,
      });
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
      this.logger.error(`WebSocket error for client ${clientId}:`, error);

      // Emit error event
      this.emit('error', {
        client: {
          id: clientId,
          ip: client.ip,
        },
        error,
      });
    });

    // Emit connection event
    this.emit('connection', {
      client: {
        id: clientId,
        ip: client.ip,
      },
      request,
      ws,
    });
  }

  /**
   * Set up ping/pong for a client connection
   * @param {WebSocket} ws WebSocket connection
   * @param {string} clientId Client ID
   * @returns {number} Timeout ID
   */
  setupPing(ws, clientId) {
    const client = this.clients.get(clientId);
    if (!client) return null;

    // Clear any existing timeout
    if (client.pingTimeout) {
      clearTimeout(client.pingTimeout);
    }

    // Set up a timeout to check if client is still alive
    return setTimeout(() => {
      if (!this.clients.has(clientId)) return;

      if (!client.isAlive) {
        this.logger.warn(
          `Client ${clientId} not responding to pings, terminating connection`
        );
        return ws.terminate();
      }

      client.isAlive = false;
      client.lastPing = Date.now();

      try {
        // Send WebSocket-level ping
        ws.ping();

        // Also send application-level ping for clients that might not support WebSocket pings
        this.sendToClient(clientId, {
          type: 'ping',
          timestamp: new Date().toISOString(),
          serverId: this.name,
        });
      } catch (error) {
        this.logger.error(`Error sending ping to client ${clientId}:`, error);
      }

      // Set up the next ping
      client.pingTimeout = this.setupPing(ws, clientId);
    }, this.pingInterval);
  }

  /**
   * Send a message to a specific client
   * @param {string} clientId Client ID
   * @param {Object|string} message Message to send
   * @returns {boolean} True if sent, false if client not found or error
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data =
        typeof message === 'string' ? message : JSON.stringify(message);

      client.ws.send(data);
      client.messagesSent++;
      return true;
    } catch (error) {
      this.logger.error(`Error sending message to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param {Object|string} message Message to broadcast
   * @param {Function} filter Filter function to determine which clients receive the message
   * @returns {number} Number of clients the message was sent to
   */
  broadcast(message, filter = null) {
    const data =
      typeof message === 'string' ? message : JSON.stringify(message);

    let count = 0;

    for (const [clientId, client] of this.clients.entries()) {
      // Skip clients that don't pass the filter
      if (filter && !filter(client)) {
        continue;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(data);
          client.messagesSent++;
          count++;
        } catch (error) {
          this.logger.error(`Error broadcasting to client ${clientId}:`, error);
        }
      }
    }

    return count;
  }

  /**
   * Register an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler
   * @returns {WebSocketServer} this instance for chaining
   */
  on(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    }
    return this;
  }

  /**
   * Remove an event handler
   * @param {string} event Event name
   * @param {Function} handler Event handler to remove
   * @returns {WebSocketServer} this instance for chaining
   */
  off(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (h) => h !== handler
      );
    }
    return this;
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event Event name
   * @param {Object} data Event data
   */
  emit(event, data) {
    if (this.eventHandlers[event]) {
      for (const handler of this.eventHandlers[event]) {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`Error in ${event} handler:`, error);
        }
      }
    }
  }

  /**
   * Get the number of connected clients
   * @returns {number} Client count
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get all connected clients
   * @returns {Array} Array of client objects
   */
  getConnectedClients() {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      ip: client.ip,
      connectTime: client.connectTime,
      messagesSent: client.messagesSent,
      messagesReceived: client.messagesReceived,
    }));
  }
}

// Export WebSocket utilities
module.exports = {
  WebSocketClient,
  WebSocketServer,
};
