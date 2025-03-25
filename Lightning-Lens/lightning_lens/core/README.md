# Lightning Lens - Core Framework

This directory contains the core standardization framework for the Lightning Lens system. The goal of this framework is to provide a consistent, reliable, and standardized way to build and connect the various components of the Lightning Lens system.

## Overview

The Lightning Lens core framework addresses several key challenges:

1. **Configuration Management**: Centralizing all configuration in one place
2. **Standardized Logging**: Consistent logging format and behavior across all services
3. **Service Registry**: Tracking all running services and their health status
4. **Error Handling**: Consistent error handling and error response formatting
5. **WebSocket Management**: Robust WebSocket client and server implementations

## Components

### 1. Configuration Manager (`config.js`)

The configuration manager centralizes all system settings, ports, paths, and other configurations in one place. All services should import this file to get their configuration settings.

**Example Usage:**

```javascript
const config = require('../core/config');

// Access configuration values
const httpPort = config.PORTS.HTTP_SERVER;
const logPath = config.getLogPath('my-service');

// Check if a port is available before binding
const isAvailable = await config.isPortAvailable(httpPort);
if (!isAvailable) {
  console.error(`Port ${httpPort} is already in use!`);
}
```

### 2. Logger (`logger.js`)

The logger provides consistent logging capabilities across all Lightning Lens services, supporting file logging, console output with color coding, and different log levels.

**Example Usage:**

```javascript
const { createLogger, LOG_LEVELS } = require('../core/logger');

// Create a logger for your service
const logger = createLogger({
  serviceName: 'my-service',
  logLevel: LOG_LEVELS.DEBUG, // Set to DEBUG, INFO, WARN, ERROR, or NONE
});

// Log messages at different levels
logger.debug('Detailed debugging information');
logger.info('Something noteworthy happened');
logger.warn('Warning: something might be wrong');
logger.error('An error occurred', {
  details: 'More information about the error',
});

// Change log level at runtime
logger.setLogLevel(LOG_LEVELS.WARN); // Now only WARN and ERROR will be logged
```

### 3. Service Registry (`service-registry.js`)

The service registry tracks all running services, their health status, and provides methods for health checks and service discovery.

**Example Usage:**

```javascript
const registry = require('../core/service-registry');

// Register your service
const myService = registry.registerService({
  name: 'http-server',
  type: registry.SERVICE_TYPES.HTTP,
  port: 8000,
  description: 'Main HTTP API server',
  status: registry.SERVICE_STATES.STARTING,
});

// Update service status when it changes
registry.updateService(myService.id, {
  status: registry.SERVICE_STATES.RUNNING,
});

// Check health of a specific service
const healthResult = await registry.checkServiceHealth(myService.id);

// Check health of all services
const allHealth = await registry.checkAllServicesHealth();

// Get all WebSocket services
const wsServices = registry.getServicesByType(registry.SERVICE_TYPES.WEBSOCKET);
```

### 4. Error Handler (`error-handler.js`)

The error handler provides consistent error handling, error response formatting, and error logging across all Lightning Lens services.

**Example Usage:**

```javascript
const {
  LightningError,
  ValidationError,
  NotFoundError,
  createErrorHandler,
  catchErrors,
  ERROR_TYPES,
} = require('../core/error-handler');

// Create an Express error handler middleware
app.use(
  createErrorHandler({
    logErrors: true,
    includeStackInResponse: process.env.NODE_ENV !== 'production',
  })
);

// Use specific error types
app.get('/api/resource/:id', (req, res, next) => {
  const resource = findResource(req.params.id);
  if (!resource) {
    // Return a standardized 404 error
    next(new NotFoundError(`Resource ${req.params.id} not found`));
    return;
  }
  res.json(resource);
});

// Validate input
app.post('/api/resource', (req, res, next) => {
  if (!req.body.name) {
    next(new ValidationError('Name is required', { field: 'name' }));
    return;
  }
  // ...
});

// Wrap async functions to catch errors
const getUser = catchErrors(async (id) => {
  // If this throws an error, it will be wrapped in a LightningError
  const user = await database.findUser(id);
  if (!user) {
    throw new NotFoundError(`User ${id} not found`);
  }
  return user;
}, ERROR_TYPES.DATABASE_ERROR);
```

### 5. WebSocket Manager (`websocket-manager.js`)

The WebSocket manager provides a standardized WebSocket client and server implementation with automatic reconnection, heartbeat, and message handling.

**Example Client Usage:**

```javascript
const { WebSocketClient } = require('../core/websocket-manager');

// Create a WebSocket client
const client = new WebSocketClient({
  url: 'ws://localhost:8768',
  name: 'my-client',
  reconnect: true,
  maxReconnectAttempts: 10,
});

// Handle events
client.on('open', () => {
  console.log('Connected to WebSocket server');

  // Send a message
  client.send({
    type: 'hello',
    data: { clientName: 'MyClient' },
  });
});

client.on('message', (message) => {
  console.log('Received message:', message);
});

client.on('close', (event) => {
  console.log(`Connection closed: ${event.code} ${event.reason}`);
});

client.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Connect to the server (if not already connecting)
client
  .connect()
  .then(() => console.log('Connection established'))
  .catch((error) => console.error('Connection failed:', error));

// Close the connection when done
client.close(1000, 'Done');
```

**Example Server Usage:**

```javascript
const { WebSocketServer } = require('../core/websocket-manager');

// Create a WebSocket server
const server = new WebSocketServer({
  port: 8768,
  path: '/ws',
  name: 'my-server',
});

// Handle events
server.on('connection', (event) => {
  const { client } = event;
  console.log(`Client connected: ${client.id} from ${client.ip}`);
});

server.on('message', (event) => {
  const { client, message } = event;
  console.log(`Message from ${client.id}:`, message);

  // Send a response to this client
  server.sendToClient(client.id, {
    type: 'response',
    data: { received: true },
  });

  // Broadcast to all clients
  server.broadcast({
    type: 'announcement',
    data: { message: `Client ${client.id} sent a message` },
  });
});

server.on('close', (event) => {
  console.log(`Client ${event.client.id} disconnected`);
});

// Start the server
server
  .start()
  .then(() => console.log('Server started'))
  .catch((error) => console.error('Failed to start server:', error));

// Stop the server when done
server
  .stop()
  .then(() => console.log('Server stopped'))
  .catch((error) => console.error('Failed to stop server:', error));
```

## Integrating with Existing Code

To integrate the core framework with existing Lightning Lens components:

1. **Replace direct configuration with imports from `config.js`**

   - Replace hardcoded ports, paths, and other settings with references to the configuration module

2. **Replace custom logging with the standardized logger**

   - Replace console.log, console.error, etc. with the appropriate logger methods

3. **Register services with the service registry**

   - Add service registration to each service's startup code
   - Update service status as it changes (starting, running, stopping, etc.)

4. **Use standardized error handling**

   - Replace custom error handling with the standardized error handler
   - Use the appropriate error types for different error conditions

5. **Replace custom WebSocket code with the WebSocket manager**
   - Replace custom WebSocket client and server implementations with the standardized WebSocket manager

## Example Migration

Here's an example of migrating an existing service to use the core framework:

**Before:**

```javascript
const express = require('express');
const WebSocket = require('ws');

const PORT = 8000;
const WS_PORT = 8768;

// Create Express app
const app = express();

// Set up routes
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok' });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    console.log('Received message:', message);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log(`WebSocket server listening on port ${WS_PORT}`);
```

**After:**

```javascript
const express = require('express');
const config = require('../core/config');
const { createLogger } = require('../core/logger');
const registry = require('../core/service-registry');
const { WebSocketServer } = require('../core/websocket-manager');
const { createErrorHandler } = require('../core/error-handler');

// Create logger
const logger = createLogger({ serviceName: 'api-server' });

// Create Express app
const app = express();

// Add error handler middleware
app.use(createErrorHandler({ logger }));

// Set up routes
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok' });
});

// Register HTTP service
const httpService = registry.registerService({
  name: 'http-server',
  type: registry.SERVICE_TYPES.HTTP,
  port: config.PORTS.HTTP_SERVER,
  description: 'Main HTTP API server',
  status: registry.SERVICE_STATES.STARTING,
});

// Start HTTP server
const server = app.listen(config.PORTS.HTTP_SERVER, () => {
  logger.info(`Server listening on port ${config.PORTS.HTTP_SERVER}`);

  // Update service status
  registry.updateService(httpService.id, {
    status: registry.SERVICE_STATES.RUNNING,
  });
});

// Create WebSocket server
const wss = new WebSocketServer({
  port: config.PORTS.WEBSOCKET_SERVER,
  name: 'ws-server',
});

// Register WebSocket service
const wsService = registry.registerService({
  name: 'websocket-server',
  type: registry.SERVICE_TYPES.WEBSOCKET,
  port: config.PORTS.WEBSOCKET_SERVER,
  description: 'WebSocket server for real-time updates',
  status: registry.SERVICE_STATES.STARTING,
});

// Handle WebSocket events
wss.on('connection', (event) => {
  logger.info(`Client connected: ${event.client.id}`);
});

wss.on('message', (event) => {
  logger.info(`Received message from ${event.client.id}:`, event.message);
});

wss.on('close', (event) => {
  logger.info(`Client disconnected: ${event.client.id}`);
});

// Start WebSocket server
wss
  .start()
  .then(() => {
    logger.info(
      `WebSocket server listening on port ${config.PORTS.WEBSOCKET_SERVER}`
    );

    // Update service status
    registry.updateService(wsService.id, {
      status: registry.SERVICE_STATES.RUNNING,
    });
  })
  .catch((error) => {
    logger.error('Failed to start WebSocket server:', error);

    // Update service status
    registry.updateService(wsService.id, {
      status: registry.SERVICE_STATES.ERROR,
      lastError: error.message,
    });
  });

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Shutting down services...');

  // Update service status
  registry.updateService(httpService.id, {
    status: registry.SERVICE_STATES.STOPPING,
  });
  registry.updateService(wsService.id, {
    status: registry.SERVICE_STATES.STOPPING,
  });

  // Stop WebSocket server
  await wss.stop();

  // Close HTTP server
  server.close();

  logger.info('All services stopped');
  process.exit(0);
});
```

## Best Practices

1. **Always import configuration from the config module**

   - Never hardcode ports, paths, or other configuration values

2. **Use the appropriate log level**

   - DEBUG: Detailed debugging information
   - INFO: General information about system operation
   - WARN: Warning messages that might indicate a problem
   - ERROR: Error messages that require attention

3. **Register all services with the service registry**

   - This allows for centralized monitoring and management

4. **Use the standardized error types**

   - This ensures consistent error responses across all services

5. **Use the WebSocket manager for all WebSocket communication**

   - This ensures reliable and standardized WebSocket connections

6. **Handle process termination gracefully**
   - Update service status and close connections properly

## Contributing

When adding new components to the Lightning Lens system, please follow these guidelines:

1. Use the core framework for configuration, logging, error handling, and WebSocket communication
2. Register your service with the service registry
3. Follow the established patterns and conventions
4. Update this documentation if you add new core functionality

## Further Reading

For more detailed information on each component, please see the comments and documentation in the individual files.
