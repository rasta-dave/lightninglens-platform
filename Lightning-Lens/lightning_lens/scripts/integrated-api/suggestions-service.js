/**
 * suggestions-service.js - WebSocket service for providing rebalancing suggestions
 *
 * This service uses the core architecture to provide a WebSocket endpoint
 * for sending rebalancing suggestions to the frontend in real-time.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Import core components
const config = require('../../core/config');
const { createLogger } = require('../../core/logger');
const registry = require('../../core/service-registry');
const { WebSocketServer } = require('../../core/websocket-manager');
const { LightningError } = require('../../core/error-handler');

// Create logger
const logger = createLogger({
  serviceName: 'suggestions-service',
  logLevel: 'info',
});

// Register service with registry
const suggestionsService = registry.registerService({
  name: 'suggestions-service',
  type: registry.SERVICE_TYPES.WEBSOCKET,
  port: config.PORTS.SUGGESTIONS_SERVICE,
  description: 'WebSocket service for rebalancing suggestions',
  status: registry.SERVICE_STATES.STARTING,
  healthCheckUrl: `http://localhost:${config.PORTS.SUGGESTIONS_SERVICE}/health`,
});

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const healthData = {
      service: 'suggestions-service',
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      connections: wsServer ? wsServer.getClientCount() : 0,
      uptime: process.uptime(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthData));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Create WebSocket server
const wsServer = new WebSocketServer({
  server,
  path: '/',
  name: 'suggestions-service',
  onConnection: (client) => {
    logger.info(`Client connected: ${client.id}`);

    // Send initial suggestions
    sendSuggestionsToClient(client.id);
  },
  onMessage: (client, message) => {
    logger.debug(`Received message from client ${client.id}:`, message);

    // Handle message based on type
    if (message.type === 'get_suggestions') {
      sendSuggestionsToClient(client.id);
    } else if (message.type === 'refresh') {
      broadcastSuggestions();
    }
  },
  onClose: (client, code, reason) => {
    logger.info(
      `Client ${client.id} disconnected with code ${code}: ${reason}`
    );
  },
});

/**
 * Load the latest prediction data
 * @returns {Promise<Array>} Predictions array
 */
async function loadLatestPredictions() {
  try {
    // First try to get predictions from HTTP server
    try {
      logger.info(
        `Fetching predictions from HTTP server: ${config.URLS.HTTP_SERVER}/api/predictions`
      );
      const response = await fetch(
        `${config.URLS.HTTP_SERVER}/api/predictions`
      );

      if (response.ok) {
        const data = await response.json();
        const predictions = data.predictions || [];
        logger.info(
          `Loaded ${predictions.length} predictions from HTTP server`
        );
        return predictions;
      } else {
        logger.warn(
          `Failed to fetch predictions from HTTP server: ${response.status}`
        );
      }
    } catch (error) {
      logger.warn(
        `Error fetching predictions from HTTP server: ${error.message}`
      );
    }

    // Fall back to file-based approach
    const dataDir = path.join(config.BASE_DIR, '..', '..', 'data');
    const predictionsDir = path.join(dataDir, 'predictions');

    if (!fs.existsSync(predictionsDir)) {
      fs.mkdirSync(predictionsDir, { recursive: true });
      logger.warn(`Created predictions directory: ${predictionsDir}`);
      return [];
    }

    // Look for the latest predictions file
    const predictionFiles = fs
      .readdirSync(predictionsDir)
      .filter((f) => f.startsWith('predictions_') && f.endsWith('.csv'));

    if (predictionFiles.length === 0) {
      logger.warn(`No prediction files found in ${predictionsDir}`);
      return [];
    }

    // Get the most recent file
    const latestFile = predictionFiles.sort().pop();
    const predictionsFile = path.join(predictionsDir, latestFile);

    // Read and parse CSV file
    const fileContent = fs.readFileSync(predictionsFile, 'utf-8');
    const lines = fileContent.split('\n').filter((line) => line.trim());

    // Extract headers
    const headers = lines[0].split(',').map((h) => h.trim());

    // Parse data rows
    const predictions = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      return headers.reduce((obj, header, i) => {
        obj[header] = values[i];
        return obj;
      }, {});
    });

    logger.info(
      `Loaded ${predictions.length} predictions from file: ${predictionsFile}`
    );
    return predictions;
  } catch (error) {
    logger.error(`Error loading predictions: ${error.message}`);
    return [];
  }
}

/**
 * Send suggestions to a specific client
 * @param {string} clientId Client ID to send suggestions to
 */
async function sendSuggestionsToClient(clientId) {
  try {
    const predictions = await loadLatestPredictions();

    if (predictions.length === 0) {
      wsServer.sendToClient(clientId, {
        type: 'error',
        error: 'No predictions available',
      });
      return;
    }

    // Convert to suggestions format
    const suggestions = predictions
      .map((prediction) => {
        // Extract data with appropriate fallbacks
        const channelId = prediction.channel_id || prediction.channel || '';
        const currentRatio = parseFloat(
          prediction.balance_ratio || prediction.current_ratio || 0.5
        );
        const optimalRatio = parseFloat(
          prediction.optimal_ratio || prediction.predicted_ratio || 0.5
        );
        const adjustmentNeeded = parseFloat(
          prediction.adjustment_needed || optimalRatio - currentRatio
        );

        return {
          channel_id: channelId,
          current_ratio: currentRatio,
          optimal_ratio: optimalRatio,
          adjustment_needed: adjustmentNeeded,
          significant: Math.abs(adjustmentNeeded) > 0.1,
        };
      })
      // Only include channels that need significant adjustment
      .filter((suggestion) => Math.abs(suggestion.adjustment_needed) > 0.05);

    wsServer.sendToClient(clientId, {
      type: 'suggestions',
      suggestions: suggestions,
      count: suggestions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      `Error sending suggestions to client ${clientId}: ${error.message}`
    );
    wsServer.sendToClient(clientId, {
      type: 'error',
      error: `Failed to send suggestions: ${error.message}`,
    });
  }
}

/**
 * Broadcast suggestions to all connected clients
 */
async function broadcastSuggestions() {
  try {
    const predictions = await loadLatestPredictions();

    if (predictions.length === 0) {
      return;
    }

    // Convert to suggestions format
    const suggestions = predictions
      .map((prediction) => {
        // Extract data with appropriate fallbacks
        const channelId = prediction.channel_id || prediction.channel || '';
        const currentRatio = parseFloat(
          prediction.balance_ratio || prediction.current_ratio || 0.5
        );
        const optimalRatio = parseFloat(
          prediction.optimal_ratio || prediction.predicted_ratio || 0.5
        );
        const adjustmentNeeded = parseFloat(
          prediction.adjustment_needed || optimalRatio - currentRatio
        );

        return {
          channel_id: channelId,
          current_ratio: currentRatio,
          optimal_ratio: optimalRatio,
          adjustment_needed: adjustmentNeeded,
          significant: Math.abs(adjustmentNeeded) > 0.1,
        };
      })
      // Only include channels that need significant adjustment
      .filter((suggestion) => Math.abs(suggestion.adjustment_needed) > 0.05);

    wsServer.broadcast({
      type: 'suggestions',
      suggestions: suggestions,
      count: suggestions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Error broadcasting suggestions: ${error.message}`);
  }
}

// Start the server
const PORT = config.PORTS.SUGGESTIONS_SERVICE;
server.listen(PORT, () => {
  logger.info(`Suggestions service running on port ${PORT}`);

  // Update service status
  registry.updateService(suggestionsService.id, {
    status: registry.SERVICE_STATES.RUNNING,
  });

  // Start periodic broadcast
  setInterval(broadcastSuggestions, 30000); // Broadcast every 30 seconds
});

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Shutting down suggestions service...');

  // Update service status
  registry.updateService(suggestionsService.id, {
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

  // Deregister service
  registry.deregisterService(suggestionsService.id);

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
