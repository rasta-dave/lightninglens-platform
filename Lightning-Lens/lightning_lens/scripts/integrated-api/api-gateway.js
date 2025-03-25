const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Import core components
const config = require('../../core/config');
const { createLogger } = require('../../core/logger');
const registry = require('../../core/service-registry');
const {
  WebSocketServer,
  WebSocketClient,
} = require('../../core/websocket-manager');
const {
  createErrorHandler,
  LightningError,
  NotFoundError,
} = require('../../core/error-handler');

// Create logger for the API gateway
const logger = createLogger({
  serviceName: 'api-gateway',
  logLevel: 'info',
});

// Create Express app with error handling
const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS, PUT, DELETE'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Create HTTP server
const server = http.createServer(app);

// Register service with the registry
const gatewayService = registry.registerService({
  name: 'api-gateway',
  type: registry.SERVICE_TYPES.HTTP,
  port: config.PORTS.CORS_PROXY,
  description: 'API Gateway for Lightning Lens',
  status: registry.SERVICE_STATES.STARTING,
  healthCheckUrl: `http://localhost:${config.PORTS.CORS_PROXY}/api/health`,
});

// Create a WebSocket client to connect to the main WebSocket server
const wsClient = new WebSocketClient({
  url: config.URLS.WEBSOCKET_SERVER,
  name: 'api-gateway-ws-client',
  reconnect: true,
  maxReconnectAttempts: 30,
  onOpen: () => {
    logger.info(
      `Connected to WebSocket server at ${config.URLS.WEBSOCKET_SERVER}`
    );
  },
  onMessage: (message) => {
    logger.debug('Received message from WebSocket server', message);
    // Forward to connected clients
    if (wsServer) {
      wsServer.broadcast(message);
    }
  },
  onClose: (code, reason) => {
    logger.warn(`WebSocket connection closed with code ${code}: ${reason}`);
  },
  onError: (error) => {
    logger.error('WebSocket client error:', error);
  },
});

// Create a WebSocket server for clients to connect to
const wsServer = new WebSocketServer({
  server: server,
  path: '/ws',
  name: 'api-gateway-ws-server',
  onConnection: (client) => {
    logger.info(`Client connected: ${client.id}`);

    // Send connection status
    wsServer.sendToClient(client.id, {
      type: 'connection_status',
      data: {
        status: wsClient.isConnected() ? 'connected' : 'connecting',
        message: wsClient.isConnected()
          ? 'Connected to WebSocket server'
          : 'Connecting to WebSocket server...',
        timestamp: new Date().toISOString(),
      },
    });
  },
  onMessage: (client, message) => {
    logger.debug(`Received message from client ${client.id}`, message);

    // Forward to WebSocket server if connected
    if (wsClient.isConnected()) {
      wsClient.send(message);
    } else {
      logger.warn(
        'Cannot forward client message: WebSocket server not connected'
      );
    }
  },
  onClose: (client, code, reason) => {
    logger.info(
      `Client ${client.id} disconnected with code ${code}: ${reason}`
    );
  },
});

// Define route mappings
const routeMappings = {
  '/api/network_state': '/api/network/state',
  '/api/predictions': '/api/dashboard',
  '/api/learning_metrics': '/api/performance',
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthData = {
    service: 'api-gateway',
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    connections: {
      webSocketServer: wsClient.isConnected() ? 'connected' : 'disconnected',
      clients: wsServer.getClientCount(),
    },
    uptime: process.uptime(),
  };

  res.json(healthData);

  // Update service registry
  registry.updateService(gatewayService.id, {
    status: registry.SERVICE_STATES.RUNNING,
    lastChecked: new Date(),
  });
});

// Status endpoint
app.get('/api/status', async (req, res) => {
  try {
    // Get status of all services from registry
    const servicesHealth = await registry.checkAllServicesHealth();

    res.json({
      status: 'success',
      gateway: {
        uptime: process.uptime(),
        connections: {
          webSocketServer: wsClient.isConnected()
            ? 'connected'
            : 'disconnected',
          clients: wsServer.getClientCount(),
        },
      },
      services: servicesHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching service status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch service status',
      timestamp: new Date().toISOString(),
    });
  }
});

// Network state endpoint
app.get('/api/network_state', async (req, res) => {
  try {
    const targetUrl = `${config.URLS.HTTP_SERVER}${routeMappings['/api/network_state']}`;
    logger.info(`Forwarding request to ${targetUrl}`);

    const response = await fetch(targetUrl);
    const data = await response.json();

    res.json(data);
  } catch (error) {
    logger.error('Error fetching network state:', error);
    res.status(502).json({
      status: 'error',
      message: 'Failed to fetch network state data',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Predictions endpoint
app.get('/api/predictions', async (req, res) => {
  try {
    const targetUrl = `${config.URLS.HTTP_SERVER}${routeMappings['/api/predictions']}`;
    logger.info(`Forwarding predictions request to ${targetUrl}`);

    const response = await fetch(targetUrl);
    const data = await response.json();

    res.json(data);
  } catch (error) {
    logger.error('Error fetching predictions:', error);
    res.status(200).json({
      status: 'error',
      message: 'Failed to fetch prediction data',
      predictions: [],
      timestamp: new Date().toISOString(),
    });
  }
});

// Learning metrics endpoint
app.get('/api/learning_metrics', async (req, res) => {
  try {
    const targetUrl = `${config.URLS.HTTP_SERVER}${routeMappings['/api/learning_metrics']}`;
    logger.info(`Forwarding learning metrics request to ${targetUrl}`);

    const response = await fetch(targetUrl);
    const data = await response.json();

    res.json(data);
  } catch (error) {
    logger.error('Error fetching learning metrics:', error);
    res.status(200).json({
      status: 'info',
      message: 'No performance metrics available yet',
      timestamp: new Date().toISOString(),
    });
  }
});

// Generic API proxy for other endpoints
app.use('/api', async (req, res) => {
  const targetPath = routeMappings[req.path] || req.path;
  const targetUrl = `${config.URLS.HTTP_SERVER}${targetPath}`;

  logger.info(`Proxying request to ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...req.headers,
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error(`Error proxying request to ${targetUrl}:`, error);
    res.status(502).json({
      status: 'error',
      message: 'Failed to proxy request',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Add the error handler middleware (should be the last middleware)
app.use(createErrorHandler({ logger }));

// Start the server
const PORT = config.PORTS.CORS_PROXY;
server.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);

  // Update service status
  registry.updateService(gatewayService.id, {
    status: registry.SERVICE_STATES.RUNNING,
  });

  // Connect to WebSocket server
  wsClient
    .connect()
    .then(() => {
      logger.info('Successfully connected to WebSocket server');
    })
    .catch((error) => {
      logger.error('Failed to connect to WebSocket server:', error);
    });
});

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Shutting down API Gateway...');

  // Update service status
  registry.updateService(gatewayService.id, {
    status: registry.SERVICE_STATES.STOPPING,
  });

  // Close WebSocket server
  if (wsServer) {
    try {
      await wsServer.stop();
      logger.info('WebSocket server stopped');
    } catch (error) {
      logger.error('Error stopping WebSocket server:', error);
    }
  }

  // Close WebSocket client
  if (wsClient) {
    try {
      await wsClient.close();
      logger.info('WebSocket client closed');
    } catch (error) {
      logger.error('Error closing WebSocket client:', error);
    }
  }

  // Deregister service
  registry.deregisterService(gatewayService.id);

  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    logger.warn('Forcing exit after timeout');
    process.exit(1);
  }, 5000);
});
