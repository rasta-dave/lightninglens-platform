// cors_proxy.js - WebSocket and HTTP proxy with improved connection stability
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Process command line arguments
const args = process.argv.slice(2);
let PORT = 3003;
let HTTP_TARGET_PORT = 8000;
let ENHANCED_HTTP_PORT = 5000;
let WS_TARGET_PORT = 8768;

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && i + 1 < args.length) {
    PORT = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--target' && i + 1 < args.length) {
    const targetUrl = new URL(args[i + 1]);
    HTTP_TARGET_PORT = parseInt(targetUrl.port, 10);
    i++;
  } else if (args[i] === '--enhanced-target' && i + 1 < args.length) {
    const enhancedUrl = new URL(args[i + 1]);
    ENHANCED_HTTP_PORT = parseInt(enhancedUrl.port, 10);
    i++;
  } else if (args[i] === '--ws-target' && i + 1 < args.length) {
    const wsUrl = new URL(args[i + 1]);
    WS_TARGET_PORT = parseInt(wsUrl.port, 10);
    i++;
  }
}

// Create a logger
const logDir = path.join(__dirname, '../logs');
// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'cors_proxy.log');
const logger = {
  info: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[INFO] ${timestamp}: ${message}\n`;
    console.log(logMessage.trim());
    fs.appendFileSync(logFile, logMessage);
  },
  error: (message, error) => {
    const timestamp = new Date().toISOString();
    const errorDetails = error ? `\n${error.stack || error}` : '';
    const logMessage = `[ERROR] ${timestamp}: ${message}${errorDetails}\n`;
    console.error(logMessage.trim());
    fs.appendFileSync(logFile, logMessage);
  },
  warn: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[WARN] ${timestamp}: ${message}\n`;
    console.warn(logMessage.trim());
    fs.appendFileSync(logFile, logMessage);
  },
  debug: (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[DEBUG] ${timestamp}: ${message}\n`;
    // Uncomment to enable debug logging
    console.log(logMessage.trim());
    fs.appendFileSync(logFile, logMessage);
  },
};

// Configuration
const WS_PATH = '/ws';
const API_PATH = '/api';
const PING_INTERVAL = 15000; // 15 seconds
const CONNECTION_TIMEOUT = 10000; // 10 seconds

// Create Express app
const app = express();

// Enable CORS for all routes with more permissive settings
app.use(
  cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

// Create HTTP server
const server = http.createServer(app);

logger.info(`Starting CORS proxy on port ${PORT}`);
logger.info(`WebSocket target: ws://localhost:${WS_TARGET_PORT}`);
logger.info(`HTTP target: http://localhost:${HTTP_TARGET_PORT}`);
logger.info(`Enhanced HTTP target: http://localhost:${ENHANCED_HTTP_PORT}`);

// Track active connections
const activeConnections = {
  clients: new Map(),
  targets: new Map(),
  count: 0,
  lastError: null,
};

// Define route mappings to transform frontend requests to backend routes
const routeMappings = {
  // Frontend routes -> Backend routes
  '/api/network_state': '/api/network/state',
  '/api/predictions': '/api/dashboard', // Use dashboard data as predictions
  '/api/learning_metrics': '/api/performance', // Use performance data as learning metrics
};

// Define which endpoints should use the enhanced HTTP server
const enhancedEndpoints = [
  '/api/predictions',
  '/api/learning_metrics',
  '/api/dashboard',
];

// Function to transform request paths based on mappings
function transformRequestPath(path) {
  // Check if there's a direct mapping for this path
  if (routeMappings[path]) {
    logger.info(`Transforming request: ${path} -> ${routeMappings[path]}`);
    return routeMappings[path];
  }

  // If no mapping exists, return the original path
  return path;
}

// Function to determine which target port to use based on the request path
function getTargetPort(path) {
  // First normalize the path to check for enhanced endpoints
  const normalizedPath = path.split('?')[0]; // Remove query parameters

  if (
    enhancedEndpoints.some((endpoint) => normalizedPath.startsWith(endpoint))
  ) {
    logger.debug(
      `Using enhanced HTTP server (port ${ENHANCED_HTTP_PORT}) for ${path}`
    );
    return ENHANCED_HTTP_PORT;
  }

  logger.debug(
    `Using standard HTTP server (port ${HTTP_TARGET_PORT}) for ${path}`
  );
  return HTTP_TARGET_PORT;
}

// Add network state endpoint with improved error handling and caching
app.get('/api/network_state', (req, res) => {
  logger.info('Received request for network state');

  // Forward the request to the HTTP server using http module
  const options = {
    hostname: 'localhost',
    port: HTTP_TARGET_PORT, // Always use the standard HTTP server for network state
    path: transformRequestPath('/api/network_state'),
    method: 'GET',
    timeout: CONNECTION_TIMEOUT,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LightningLens-CORS-Proxy/1.0',
    },
  };

  // Add request ID for tracking
  const requestId =
    Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  logger.debug(`Network state request ${requestId} started`);

  const proxyReq = http.request(options, (proxyRes) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Add proxy information headers
    res.setHeader('X-Proxy-Date', new Date().toISOString());
    res.setHeader('X-Proxy-ID', requestId);

    // Set status code
    res.statusCode = proxyRes.statusCode;

    // Copy all headers from the target response
    Object.keys(proxyRes.headers).forEach((key) => {
      // Skip certain headers that we're setting ourselves
      if (
        ![
          'access-control-allow-origin',
          'access-control-allow-methods',
          'access-control-allow-headers',
          'access-control-allow-credentials',
        ].includes(key.toLowerCase())
      ) {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });

    // Collect data
    let data = '';
    let receivedLength = 0;

    proxyRes.on('data', (chunk) => {
      data += chunk;
      receivedLength += chunk.length;
      logger.debug(
        `Network state request ${requestId}: received ${receivedLength} bytes`
      );
    });

    proxyRes.on('end', () => {
      try {
        // Parse and send the JSON response
        const jsonData = JSON.parse(data);
        logger.info(
          `Network state request ${requestId} completed successfully`
        );

        // Add proxy timestamp to the response
        jsonData.proxy_timestamp = new Date().toISOString();
        jsonData.proxy_id = requestId;

        res.json(jsonData);
      } catch (error) {
        logger.error(
          `Error parsing network state JSON for request ${requestId}:`,
          error
        );

        // If we got a successful status code but invalid JSON, return 502 Bad Gateway
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          res.status(502).json({
            error: 'Invalid JSON response from upstream server',
            message: error.message,
            proxy_id: requestId,
            proxy_timestamp: new Date().toISOString(),
          });
        } else {
          // Otherwise just return the raw data with the original status code
          res.send(data);
        }
      }
    });
  });

  proxyReq.on('error', (error) => {
    logger.error(
      `Error fetching network state for request ${requestId}:`,
      error
    );

    // Provide a more detailed error response
    res.status(502).json({
      error: 'Failed to fetch network state',
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      proxy_id: requestId,
      proxy_timestamp: new Date().toISOString(),
      // Include connection details for debugging
      connection_details: {
        target_host: options.hostname,
        target_port: options.port,
        target_path: options.path,
        timeout: options.timeout,
      },
    });
  });

  // Add timeout handling
  proxyReq.on('timeout', () => {
    logger.error(
      `Network state request ${requestId} timed out after ${CONNECTION_TIMEOUT}ms`
    );
    proxyReq.destroy();

    res.status(504).json({
      error: 'Gateway Timeout',
      message: `Request to network state API timed out after ${CONNECTION_TIMEOUT}ms`,
      proxy_id: requestId,
      proxy_timestamp: new Date().toISOString(),
    });
  });

  // End the request
  proxyReq.end();
});

// Add healthcheck endpoint for status checks
app.get('/healthcheck', (req, res) => {
  logger.info('Received healthcheck request');

  // Return status info with connection counts
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    proxy: {
      version: '1.0',
      uptime: process.uptime(),
      connections: {
        active: activeConnections.count,
        clients: activeConnections.clients.size,
        targets: activeConnections.targets.size,
      },
      lastError: activeConnections.lastError,
      ports: {
        proxy: PORT,
        http: HTTP_TARGET_PORT,
        enhanced: ENHANCED_HTTP_PORT,
        websocket: WS_TARGET_PORT,
      },
    },
  });
});

// Add predictions endpoint
app.get('/api/predictions', (req, res) => {
  logger.info('Received request for predictions');

  // Forward the request to the HTTP server using http module
  const options = {
    hostname: 'localhost',
    port: HTTP_TARGET_PORT,
    path: transformRequestPath('/api/predictions'),
    method: 'GET',
    timeout: CONNECTION_TIMEOUT,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LightningLens-CORS-Proxy/1.0',
    },
  };

  // Add request ID for tracking
  const requestId =
    Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  logger.debug(`Predictions request ${requestId} started`);

  const httpReq = http.request(options, (httpRes) => {
    let responseData = '';

    httpRes.on('data', (chunk) => {
      responseData += chunk;
    });

    httpRes.on('end', () => {
      if (httpRes.statusCode === 200) {
        try {
          const jsonData = JSON.parse(responseData);

          // Set appropriate headers
          res.set({
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });

          // Return the data
          res.status(200).send(jsonData);
          logger.debug(
            `Predictions request ${requestId} completed successfully`
          );
        } catch (error) {
          logger.error(`Error parsing predictions response: ${error.message}`);
          // Instead of returning 500, return empty prediction data
          res.status(200).json({
            predictions: [],
            message: 'Could not parse prediction data, using empty dataset',
            status: 'warning',
          });
        }
      } else {
        logger.warn(
          `Predictions request failed with status: ${httpRes.statusCode}`
        );
        // Instead of forwarding the error, return empty prediction data
        res.status(200).json({
          predictions: [],
          message: `Backend returned status ${httpRes.statusCode}`,
          status: 'warning',
        });
      }
    });
  });

  httpReq.on('error', (error) => {
    logger.error(`Error in predictions request: ${error.message}`);
    // Return empty prediction data instead of an error
    res.status(200).json({
      predictions: [],
      message: `Backend connection failed: ${error.message}`,
      status: 'warning',
    });
  });

  httpReq.end();
});

// Add learning metrics endpoint
app.get('/api/learning_metrics', (req, res) => {
  logger.info('Received request for learning metrics');

  // Forward the request to the HTTP server using http module
  const options = {
    hostname: 'localhost',
    port: HTTP_TARGET_PORT,
    path: transformRequestPath('/api/learning_metrics'),
    method: 'GET',
    timeout: CONNECTION_TIMEOUT,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LightningLens-CORS-Proxy/1.0',
    },
  };

  // Add request ID for tracking
  const requestId =
    Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  logger.debug(`Learning metrics request ${requestId} started`);

  const httpReq = http.request(options, (httpRes) => {
    let responseData = '';

    httpRes.on('data', (chunk) => {
      responseData += chunk;
    });

    httpRes.on('end', () => {
      if (httpRes.statusCode === 200) {
        try {
          const jsonData = JSON.parse(responseData);

          // Set appropriate headers
          res.set({
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });

          // Return the data
          res.status(200).send(jsonData);
          logger.debug(
            `Learning metrics request ${requestId} completed successfully`
          );
        } catch (error) {
          logger.error(
            `Error parsing learning metrics response: ${error.message}`
          );
          // Return default metrics instead of error
          res.status(200).json({
            message: 'No performance metrics available yet',
            status: 'info',
          });
        }
      } else {
        logger.warn(
          `Learning metrics request failed with status: ${httpRes.statusCode}`
        );
        // Return default metrics instead of forwarding the error
        res.status(200).json({
          message: 'No performance metrics available yet',
          status: 'info',
        });
      }
    });
  });

  httpReq.on('error', (error) => {
    logger.error(`Error in learning metrics request: ${error.message}`);
    // Return default metrics instead of error
    res.status(200).json({
      message: 'No performance metrics available yet',
      status: 'info',
    });
  });

  httpReq.end();
});

// Add an improved status endpoint to check if CORS proxy and backend services are working
// This must come BEFORE the general proxy middleware
app.get('/api/status', (req, res) => {
  logger.info('Received status check request');

  // Generate a unique request ID for tracking
  const requestId =
    Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

  // Prepare response object
  const statusResponse = {
    status: 'online',
    service: 'cors-proxy',
    version: '1.1.0',
    request_id: requestId,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    active_connections: activeConnections.count,
    proxiedEndpoints: {
      http: `http://localhost:${HTTP_TARGET_PORT}/api`,
      ws: `ws://localhost:${WS_TARGET_PORT}`,
      wsStatus: 'checking',
      httpStatus: 'checking',
      lastError: activeConnections.lastError,
    },
  };

  // Track if we've sent the response
  let responseSent = false;

  // Function to send response if not already sent
  const sendResponse = () => {
    if (!responseSent) {
      responseSent = true;
      res.json(statusResponse);
      logger.info(
        `Status check complete: WS=${statusResponse.proxiedEndpoints.wsStatus}, HTTP=${statusResponse.proxiedEndpoints.httpStatus}`
      );
    }
  };

  // Set a master timeout to ensure we always respond
  const masterTimeout = setTimeout(() => {
    if (!responseSent) {
      logger.warn(`Status check ${requestId} timed out after 3000ms`);
      sendResponse();
    }
  }, 3000);

  // Check if the WebSocket server is available
  logger.debug(
    `Checking WebSocket server availability on port ${WS_TARGET_PORT}`
  );

  // Use a more robust WebSocket check with proper error handling
  const wsCheck = new WebSocket(`ws://localhost:${WS_TARGET_PORT}`, {
    handshakeTimeout: 2000, // 2 second timeout for handshake
    followRedirects: true,
    headers: {
      'User-Agent': 'LightningLens-CORS-Proxy/1.0',
      'X-Request-ID': requestId,
    },
  });

  // Track WebSocket check completion
  let wsCheckComplete = false;

  // Handle WebSocket connection success
  wsCheck.onopen = () => {
    logger.debug(`WebSocket connection to port ${WS_TARGET_PORT} successful`);
    statusResponse.proxiedEndpoints.wsStatus = 'available';
    wsCheckComplete = true;

    // Send a test message to verify the connection is fully functional
    try {
      wsCheck.send(
        JSON.stringify({
          type: 'connection_test',
          timestamp: new Date().toISOString(),
          request_id: requestId,
        })
      );

      // Set a timeout to close the connection if we don't get a response
      setTimeout(() => {
        try {
          if (wsCheck.readyState === WebSocket.OPEN) {
            wsCheck.close(1000, 'Status check complete');
          }
        } catch (e) {
          logger.error('Error closing WebSocket after test message:', e);
        }
      }, 1000);
    } catch (e) {
      logger.error('Error sending test message to WebSocket:', e);
      wsCheck.close(1000, 'Error sending test message');
    }
  };

  // Handle WebSocket messages
  wsCheck.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      logger.debug(`Received WebSocket test response: ${data.type}`);

      // Close the connection now that we've confirmed it works
      wsCheck.close(1000, 'Status check complete');
    } catch (e) {
      logger.error('Error parsing WebSocket message:', e);
    }
  };

  // Handle WebSocket errors
  wsCheck.onerror = (error) => {
    logger.error(`WebSocket status check error:`, error);
    statusResponse.proxiedEndpoints.wsStatus = 'unavailable';
    statusResponse.proxiedEndpoints.lastWsError = error
      ? error.message
      : 'Unknown error';
    wsCheckComplete = true;

    try {
      if (wsCheck.readyState !== WebSocket.CLOSED) {
        wsCheck.terminate();
      }
    } catch (e) {
      logger.error('Error terminating WebSocket connection:', e);
    }
  };

  // Handle WebSocket connection close
  wsCheck.onclose = (event) => {
    logger.debug(
      `Test connection closed with code ${event.code} [${requestId}]`
    );

    // If it closed with code 1000 (normal) or 1001 (going away), consider it available
    const isAvailable =
      (event.code === 1000 || event.code === 1001) && wsCheckComplete;

    if (isAvailable) {
      statusResponse.proxiedEndpoints.wsStatus = 'available';
    } else {
      statusResponse.proxiedEndpoints.wsStatus = 'unavailable';
      statusResponse.proxiedEndpoints.lastWsError = `Closed with code ${event.code}`;
    }

    checkAllComplete();
  };

  // Also check HTTP endpoint availability
  logger.debug(`Checking HTTP server availability on port ${HTTP_TARGET_PORT}`);

  // Track HTTP check completion
  let httpCheckComplete = false;

  // Make a request to the HTTP server
  const httpCheck = http.request(
    {
      hostname: 'localhost',
      port: HTTP_TARGET_PORT,
      path: '/api/status',
      method: 'GET',
      timeout: 2000,
      headers: {
        'User-Agent': 'LightningLens-CORS-Proxy/1.0',
        'X-Request-ID': requestId,
      },
    },
    (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        // Consider any 2xx status code as available
        if (response.statusCode >= 200 && response.statusCode < 300) {
          statusResponse.proxiedEndpoints.httpStatus = 'available';
        } else {
          statusResponse.proxiedEndpoints.httpStatus = 'error';
          statusResponse.proxiedEndpoints.lastHttpError = `HTTP ${response.statusCode}`;
        }

        httpCheckComplete = true;
        checkAllComplete();
      });
    }
  );

  httpCheck.on('error', (error) => {
    logger.error(`HTTP status check error:`, error);
    statusResponse.proxiedEndpoints.httpStatus = 'unavailable';
    statusResponse.proxiedEndpoints.lastHttpError = error.message;
    httpCheckComplete = true;
    checkAllComplete();
  });

  httpCheck.on('timeout', () => {
    logger.warn('HTTP status check timed out');
    httpCheck.destroy();
    statusResponse.proxiedEndpoints.httpStatus = 'timeout';
    httpCheckComplete = true;
    checkAllComplete();
  });

  httpCheck.end();

  // Function to check if all checks are complete
  function checkAllComplete() {
    if (wsCheckComplete && httpCheckComplete) {
      clearTimeout(masterTimeout);
      sendResponse();
    }
  }

  // If the status is still checking after 1000ms, send the response anyway
  // This prevents hanging the request if there are issues
  setTimeout(() => {
    if (!responseSent) {
      logger.warn(
        `Status check ${requestId} partial timeout - sending available data`
      );
      sendResponse();
    }
  }, 1000);
});

// HTTP Proxy middleware for the Lightning HTTP API
app.use(
  '/api',
  createProxyMiddleware({
    // Use a function for the target to dynamically select the appropriate port
    router: (req) => {
      const port = getTargetPort(req.url);
      return `http://localhost:${port}`;
    },
    changeOrigin: true,
    pathRewrite: {
      '^/api': '/api', // Keep /api prefix when forwarding
    },
    // Don't proxy /api/status and /api/network/state requests as we handle them directly
    filter: function (pathname, req) {
      return pathname !== '/api/status' && pathname !== '/api/network/state';
    },
    onProxyRes: function (proxyRes, req, res) {
      // Add CORS headers to proxied responses
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Access-Control-Allow-Methods'] =
        'GET, POST, PUT, DELETE';
      proxyRes.headers['Access-Control-Allow-Headers'] =
        'Content-Type, Authorization';

      // Log the successful proxy
      const targetPort = getTargetPort(req.url);
      logger.debug(`Proxied ${req.method} ${req.url} to port ${targetPort}`);
    },
    onError: function (err, req, res) {
      logger.error(`Proxy error for ${req.method} ${req.url}: ${err.message}`);

      // Send a graceful error response
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });

      res.end(
        JSON.stringify({
          error: 'Bad Gateway',
          message: 'Could not connect to the target server',
          code: 502,
          path: req.url,
          timestamp: new Date().toISOString(),
        })
      );
    },
    // Add timeout to prevent hanging requests
    proxyTimeout: 10000,
    timeout: 10000,
  })
);

// WebSocket server for proxying WebSocket connections
const wss = new WebSocket.Server({
  server,
  path: WS_PATH,
  perMessageDeflate: false, // Disable compression for better performance
  maxPayload: 10 * 1024 * 1024, // 10MB max message size
  clientTracking: true, // Track clients for cleanup
});

// Rate limiting configuration
const RATE_LIMIT = {
  messageInterval: 500, // Minimum ms between messages (throttle to max 2 messages per second)
  maxPingsPerMinute: 4, // Limit ping messages to 4 per minute
  binaryMessagesEnabled: false, // Don't forward binary messages to avoid JSON parse errors
};

// Handle WebSocket connections
wss.on('connection', function (clientWs, request) {
  // Generate a unique connection ID
  const connectionId = `m${Date.now().toString(36)}${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  // Create a connection to the target WebSocket server with retry mechanism
  let targetWs = null;
  let targetConnectRetries = 0;
  const MAX_TARGET_CONNECT_RETRIES = 3;

  // Rate limiting state
  let lastMessageTime = 0;
  let messageQueue = [];
  let pingCount = 0;
  let pingCountResetTimer = null;

  // Reset ping count every minute
  pingCountResetTimer = setInterval(() => {
    pingCount = 0;
  }, 60000);

  function connectToTarget() {
    if (targetConnectRetries >= MAX_TARGET_CONNECT_RETRIES) {
      logger.error(
        `Failed to connect to target WebSocket after ${MAX_TARGET_CONNECT_RETRIES} attempts [${connectionId}]`
      );
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message:
              'Failed to connect to WebSocket server after multiple attempts',
            timestamp: new Date().toISOString(),
          })
        );
      }
      return;
    }

    targetWs = new WebSocket(`ws://localhost:${WS_TARGET_PORT}`);
    targetConnectRetries++;

    // Set a connection timeout
    const connectTimeout = setTimeout(() => {
      if (targetWs && targetWs.readyState !== WebSocket.OPEN) {
        logger.warn(
          `Target WebSocket connection timeout [${connectionId}], attempt ${targetConnectRetries}`
        );
        targetWs.terminate();
        // Try to reconnect after a short delay
        setTimeout(connectToTarget, 1000);
      }
    }, 5000);

    targetWs.on('open', function () {
      clearTimeout(connectTimeout);
      targetConnected = true;
      if (activeConnections.clients.has(connectionId)) {
        activeConnections.clients.get(connectionId).targetConnected = true;
      }
      logger.debug(`Target WebSocket connected [${connectionId}]`);

      // Forward any pending messages with rate limiting
      processMessageQueue();

      // Start ping interval after successful connection
      startPingInterval();
    });

    // Set up other event handlers for targetWs
    targetWs.on('message', handleTargetMessage);
    targetWs.on('close', handleTargetClose);
    targetWs.on('error', handleTargetError);
  }

  // Process messages in the queue with rate limiting
  function processMessageQueue() {
    if (messageQueue.length === 0) return;

    const now = Date.now();
    if (
      now - lastMessageTime >= RATE_LIMIT.messageInterval &&
      targetConnected &&
      targetWs &&
      targetWs.readyState === WebSocket.OPEN
    ) {
      const message = messageQueue.shift();
      try {
        targetWs.send(message);
        messagesSentToTarget++;
        if (activeConnections.clients.has(connectionId)) {
          activeConnections.clients.get(connectionId).messagesSent++;
        }
        lastMessageTime = now;
      } catch (e) {
        logger.error(`Error forwarding queued message [${connectionId}]`, e);
      }

      // Schedule next message processing
      if (messageQueue.length > 0) {
        setTimeout(processMessageQueue, RATE_LIMIT.messageInterval);
      }
    } else if (messageQueue.length > 0) {
      // If we can't send now, schedule for later
      setTimeout(processMessageQueue, RATE_LIMIT.messageInterval);
    }
  }

  let targetConnected = false;
  let clientClosed = false;
  let targetClosed = false;
  const pendingMessages = [];

  // Store start time for connection duration tracking
  const startTime = Date.now();

  // Message counters
  let messagesSentToTarget = 0;
  let messagesReceivedFromTarget = 0;

  // Setup ping interval
  let pingInterval = null;
  let pingTimeout = null;

  // Store connections in tracking map
  activeConnections.clients.set(connectionId, {
    client: clientWs,
    target: null, // Will be set after successful connection
    startTime: startTime,
    pingInterval: pingInterval,
    pingTimeout: pingTimeout,
    messagesSent: 0,
    messagesReceived: 0,
    targetConnected: false,
  });
  activeConnections.count++;

  logger.info(`New WebSocket connection [${connectionId}]`);

  // Attempt to establish initial connection
  connectToTarget();

  // Handler functions to keep code organized
  function handleTargetMessage(message) {
    if (clientClosed) {
      logger.debug(
        `Target message received after client closed [${connectionId}]`
      );
      return;
    }

    try {
      // Reset ping timer when we get any message from target
      resetPingTimer();

      // Skip binary messages if disabled (to avoid JSON parse errors)
      if (message instanceof Buffer && !RATE_LIMIT.binaryMessagesEnabled) {
        logger.debug(`Skipping binary message (disabled) [${connectionId}]`);
        return;
      }

      // Apply rate limiting for messages from target to client
      const now = Date.now();
      if (now - lastMessageTime >= RATE_LIMIT.messageInterval) {
        // Send to client if we're not rate limited
        clientWs.send(message);
        messagesReceivedFromTarget++;
        if (activeConnections.clients.has(connectionId)) {
          activeConnections.clients.get(connectionId).messagesReceived++;
        }
        lastMessageTime = now;
      } else {
        // We're sending too fast - skip non-essential messages to avoid overloading
        // Try to parse message to see if it's important
        let isImportant = true;
        try {
          if (typeof message === 'string') {
            const msgObj = JSON.parse(message);
            // Skip additional pings and non-essential message types
            isImportant = !['ping', 'heartbeat', 'pong'].includes(msgObj.type);
          }
        } catch (e) {
          // If we can't parse, assume it's important
          isImportant = true;
        }

        if (isImportant) {
          // If it's important, queue it for sending later
          messageQueue.push(message);
          // Make sure queue is being processed
          setTimeout(processMessageQueue, RATE_LIMIT.messageInterval);
        }
      }
    } catch (e) {
      logger.error(
        `Error forwarding message from target to client [${connectionId}]`,
        e
      );
    }
  }

  function handleTargetClose(code, reason) {
    targetClosed = true;
    logger.info(`Target WebSocket disconnected from proxy`);

    // If client is still connected and we haven't exceeded retries, attempt to reconnect to target
    if (!clientClosed && targetConnectRetries < MAX_TARGET_CONNECT_RETRIES) {
      logger.info(
        `Attempting to reconnect to target WebSocket [${connectionId}]`
      );
      setTimeout(connectToTarget, 1000);
    } else {
      // Clean up the connection
      cleanupConnection('target', code, reason);
    }
  }

  function handleTargetError(error) {
    logger.error(`Target WebSocket error [${connectionId}]`, error);

    // Don't immediately close - let the onclose handler deal with reconnection
    if (targetWs && targetWs.readyState !== WebSocket.CLOSED) {
      try {
        targetWs.close(1006, 'Error occurred');
      } catch (e) {
        logger.error(
          `Error closing target connection after error [${connectionId}]`,
          e
        );
        targetWs.terminate();
      }
    }
  }

  // Handle messages from client to target
  clientWs.on('message', function (message) {
    if (targetClosed && targetConnectRetries >= MAX_TARGET_CONNECT_RETRIES) {
      logger.debug(
        `Client message received after target closed and max retries reached [${connectionId}]`
      );
      return;
    }

    try {
      // Skip binary messages if disabled
      if (message instanceof Buffer && !RATE_LIMIT.binaryMessagesEnabled) {
        logger.debug(
          `Skipping binary message from client (disabled) [${connectionId}]`
        );
        return;
      }

      // Try to parse message to see if it's a ping/pong before forwarding
      let msgObj;
      try {
        if (typeof message === 'string') {
          msgObj = JSON.parse(message.toString());
        } else {
          // For binary messages, don't try to parse
          msgObj = null;
        }
      } catch (e) {
        // Not JSON, treat as raw message
        msgObj = null;
      }

      if (msgObj && msgObj.type === 'ping') {
        // Rate limit ping messages
        pingCount++;
        if (pingCount > RATE_LIMIT.maxPingsPerMinute) {
          // Too many pings, ignore
          logger.debug(
            `Rate limiting ping messages [${connectionId}], count: ${pingCount}`
          );
          return;
        }

        // If it's a ping, respond with a pong and don't forward
        try {
          clientWs.send(
            JSON.stringify({
              type: 'pong',
              timestamp: new Date().toISOString(),
              echo: msgObj.timestamp,
            })
          );
        } catch (e) {
          logger.error(`Error sending pong response [${connectionId}]`, e);
        }

        // Reset ping timer if we got a ping from client
        resetPingTimer();

        return;
      } else if (msgObj && msgObj.type === 'connection_status') {
        // If it's a connection status message, acknowledge it
        try {
          clientWs.send(
            JSON.stringify({
              type: 'connection_status',
              status: targetConnected ? 'connected' : 'connecting',
              timestamp: new Date().toISOString(),
              proxy_info: {
                id: connectionId,
                uptime: Math.floor((Date.now() - startTime) / 1000),
                target_connected: targetConnected,
              },
            })
          );
        } catch (e) {
          logger.error(
            `Error sending connection status response [${connectionId}]`,
            e
          );
        }
      }

      // Forward message to target with rate limiting
      if (
        targetConnected &&
        targetWs &&
        targetWs.readyState === WebSocket.OPEN
      ) {
        const now = Date.now();
        if (now - lastMessageTime >= RATE_LIMIT.messageInterval) {
          targetWs.send(message);
          messagesSentToTarget++;
          if (activeConnections.clients.has(connectionId)) {
            activeConnections.clients.get(connectionId).messagesSent++;
          }
          lastMessageTime = now;
        } else {
          // Queue message for later if we're rate limited
          messageQueue.push(message);
          // Ensure queue processing is scheduled
          if (messageQueue.length === 1) {
            setTimeout(
              processMessageQueue,
              RATE_LIMIT.messageInterval - (now - lastMessageTime)
            );
          }
        }
      } else {
        // Queue message to be sent when target connects
        pendingMessages.push(message);
        logger.debug(
          `Message queued (target not connected) [${connectionId}], queue size: ${pendingMessages.length}`
        );

        // If queue gets too large, drop oldest messages
        if (pendingMessages.length > 50) {
          pendingMessages.shift();
          logger.warn(
            `Message queue overflow, dropping oldest message [${connectionId}]`
          );
        }
      }
    } catch (e) {
      // Processing error
      logger.error(`Error processing client message [${connectionId}]`, e);
    }
  });

  // Handle client disconnection
  clientWs.on('close', function (code, reason) {
    clientClosed = true;
    logger.info(`WebSocket client disconnected from proxy`);

    // Clean up the connection
    cleanupConnection('client', code, reason);
  });

  // Handle client errors
  clientWs.on('error', function (error) {
    logger.error(`Client WebSocket error [${connectionId}]`, error);

    // Let the onclose handler deal with cleanup
  });

  // Function to clean up connection resources
  function cleanupConnection(source, code, reason) {
    // If connection info exists
    if (activeConnections.clients.has(connectionId)) {
      const connInfo = activeConnections.clients.get(connectionId);

      // Log connection stats
      logger.info(
        `Cleaning up ${source} on client disconnect WebSocket connection [${connectionId}] [target-${connectionId}]`
      );
      logger.info(
        `Connection stats for ${source} on client disconnect [${connectionId}]: duration=${Math.floor(
          (Date.now() - startTime) / 1000
        )}s, messages sent=${messagesSentToTarget}, received=${messagesReceivedFromTarget}`
      );

      // Clean up ping interval
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

      // Clean up ping timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
      }

      // Clear ping count reset timer
      if (pingCountResetTimer) {
        clearInterval(pingCountResetTimer);
        pingCountResetTimer = null;
      }

      // Clear message queue
      messageQueue = [];

      // Clean up connections based on which side disconnected
      if (source === 'client') {
        // Client disconnected, close target if it's still open
        if (
          !targetClosed &&
          targetWs &&
          targetWs.readyState !== WebSocket.CLOSED
        ) {
          logger.debug(
            `Closing target on client disconnect WebSocket connection [${connectionId}]`
          );
          try {
            targetWs.close(1000, 'Client disconnected');
          } catch (e) {
            logger.error(
              `Error closing target connection [${connectionId}]`,
              e
            );
            // Force terminate if close fails
            targetWs.terminate();
          }
        }
      } else if (source === 'target') {
        // Target disconnected, close client if it's still open and we've exceeded retry attempts
        if (
          !clientClosed &&
          clientWs.readyState !== WebSocket.CLOSED &&
          targetConnectRetries >= MAX_TARGET_CONNECT_RETRIES
        ) {
          logger.debug(
            `Closing client after max target reconnect attempts [${connectionId}]`
          );
          try {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                message: 'Unable to maintain connection to WebSocket server',
                timestamp: new Date().toISOString(),
              })
            );
            clientWs.close(1001, 'Target disconnected permanently');
          } catch (e) {
            logger.error(
              `Error closing client connection [${connectionId}]`,
              e
            );
          }
        }
      }

      // If both client and target are closed or max retries reached
      if (
        clientClosed &&
        (targetClosed || targetConnectRetries >= MAX_TARGET_CONNECT_RETRIES)
      ) {
        // Remove from active connections map
        activeConnections.clients.delete(connectionId);
        activeConnections.count--;
      }
    }
  }

  // Function to start ping interval
  function startPingInterval() {
    // Clear any existing ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
    }

    // Start new ping interval - reduced frequency to avoid overwhelming the client
    pingInterval = setInterval(() => {
      // Only send pings if connections are open
      if (targetConnected && !targetClosed && !clientClosed) {
        try {
          // Only send pings if we haven't exceeded our rate limit
          pingCount++;
          if (pingCount <= RATE_LIMIT.maxPingsPerMinute) {
            // Send ping to client
            clientWs.send(
              JSON.stringify({
                type: 'ping',
                timestamp: new Date().toISOString(),
              })
            );

            // Set ping timeout - if no activity within 5 seconds, consider connection dead
            if (pingTimeout) {
              clearTimeout(pingTimeout);
            }

            pingTimeout = setTimeout(() => {
              logger.warn(`Ping timeout for connection [${connectionId}]`);

              // Check if connections are still alive
              let clientAlive = false;
              let targetAlive = false;

              try {
                clientAlive =
                  clientWs && clientWs.readyState === WebSocket.OPEN;
                targetAlive =
                  targetWs && targetWs.readyState === WebSocket.OPEN;
              } catch (e) {
                logger.error(
                  `Error checking connection status [${connectionId}]`,
                  e
                );
              }

              if (!clientAlive || !targetAlive) {
                // Force cleanup
                cleanupConnection('timeout', 1001, 'Ping timeout');
              } else {
                // Connections still seem to be open but not responding to pings
                logger.warn(
                  `Connections appear open but not responding to pings [${connectionId}]`
                );
                // Try sending another ping instead of immediately closing, but don't flood
                if (pingCount <= RATE_LIMIT.maxPingsPerMinute) {
                  try {
                    clientWs.send(
                      JSON.stringify({
                        type: 'ping',
                        timestamp: new Date().toISOString(),
                        retry: true,
                      })
                    );
                  } catch (e) {
                    logger.error(
                      `Error sending retry ping [${connectionId}]`,
                      e
                    );
                    cleanupConnection(
                      'timeout',
                      1001,
                      'Ping timeout - retry failed'
                    );
                  }
                }
              }
            }, 5000);
          }
        } catch (e) {
          logger.error(`Error sending ping [${connectionId}]`, e);
          cleanupConnection('error', 1001, 'Error sending ping');
        }
      }
    }, 30000); // Reduced ping frequency from 15s to 30s to reduce overhead

    // Store ping interval reference in connection info
    if (activeConnections.clients.has(connectionId)) {
      activeConnections.clients.get(connectionId).pingInterval = pingInterval;
    }
  }

  // Function to reset ping timer (called when any activity is detected)
  function resetPingTimer() {
    if (pingTimeout) {
      clearTimeout(pingTimeout);
      pingTimeout = null;
    }
  }

  // Update connection info with target WebSocket reference
  if (activeConnections.clients.has(connectionId)) {
    activeConnections.clients.get(connectionId).target = targetWs;
  }
});

// Add status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    proxyTimestamp: new Date().toISOString(),
    activeConnections: activeConnections.count,
    serverInfo: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    target: {
      http: `http://localhost:${HTTP_TARGET_PORT}`,
      enhancedHttp: `http://localhost:${ENHANCED_HTTP_PORT}`,
      websocket: `ws://localhost:${WS_TARGET_PORT}`,
    },
  });
});

// Start the server
server.listen(PORT, () => {
  logger.info(`CORS Proxy started on port ${PORT}`);
  logger.info(`HTTP target: http://localhost:${HTTP_TARGET_PORT}`);
  logger.info(`Enhanced HTTP target: http://localhost:${ENHANCED_HTTP_PORT}`);
  logger.info(`WebSocket target: ws://localhost:${WS_TARGET_PORT}`);

  // Log active connections every 30 seconds
  setInterval(() => {
    logger.debug(`Active WebSocket connections: ${activeConnections.count}`);
  }, 30000);
});

// Handle server errors
server.on('error', (error) => {
  logger.error(`Server error:`, error);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception:`, error);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled rejection:`, reason);
});

// Graceful shutdown
function shutdown() {
  logger.info('Shutting down CORS proxy...');

  // Close all active WebSocket connections
  if (activeConnections.clients.size > 0) {
    logger.info(
      `Closing ${activeConnections.clients.size} WebSocket connections...`
    );

    for (const [id, conn] of activeConnections.clients.entries()) {
      try {
        if (conn.client && conn.client.readyState !== WebSocket.CLOSED) {
          conn.client.close(1001, 'Server shutting down');
        }
        if (conn.target && conn.target.readyState !== WebSocket.CLOSED) {
          conn.target.close(1001, 'Server shutting down');
        }
      } catch (e) {
        logger.error(`Error closing WebSocket connection [${id}]`, e);
      }
    }
  }

  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds if server doesn't close gracefully
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

// Register shutdown handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
