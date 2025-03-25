/**
 * config.js - Centralized configuration for Lightning Lens
 *
 * This file serves as a single source of truth for all configuration
 * settings across the Lightning Lens system. All services should import
 * this file to get their configuration settings.
 */

const path = require('path');
const fs = require('fs');

// Base paths
const BASE_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const SCRIPTS_DIR = path.join(BASE_DIR, 'scripts');
const DATA_DIR = path.join(BASE_DIR, 'data');
const FRONTEND_DIR = path.join(BASE_DIR, 'frontend');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Port configurations
const PORTS = {
  // Frontend
  FRONTEND: 3000,

  // API Services
  CORS_PROXY: 3003,
  HTTP_SERVER: 8000,
  WEBSOCKET_SERVER: 8768,
  SUGGESTIONS_SERVICE: 8767,
  SIMULATION_SERVICE: 8766,

  // Other services can be added here
};

// Timeouts and intervals
const TIMEOUTS = {
  CONNECTION: 10000, // 10 seconds
  PING_INTERVAL: 15000, // 15 seconds
  RETRY_INTERVAL: 1000, // 1 second
  MAX_RETRIES: 12, // Maximum connection retry attempts
};

// URL configurations
const URLS = {
  HTTP_SERVER: `http://localhost:${PORTS.HTTP_SERVER}`,
  WEBSOCKET_SERVER: `ws://localhost:${PORTS.WEBSOCKET_SERVER}`,
  CORS_PROXY: `http://localhost:${PORTS.CORS_PROXY}`,
  SUGGESTIONS_SERVICE: `ws://localhost:${PORTS.SUGGESTIONS_SERVICE}`,
  FRONTEND: `http://localhost:${PORTS.FRONTEND}`,
};

// API Endpoints
const API_ENDPOINTS = {
  NETWORK_STATE: '/api/network/state',
  PREDICTIONS: '/api/dashboard',
  LEARNING_METRICS: '/api/performance',
  STATUS: '/api/status',

  // Frontend routes to backend mappings
  ROUTE_MAPPINGS: {
    '/api/network_state': '/api/network/state',
    '/api/predictions': '/api/dashboard',
    '/api/learning_metrics': '/api/performance',
  },
};

// WebSocket message types
const WS_MESSAGE_TYPES = {
  CONNECTION_STATUS: 'connection_status',
  STATE_UPDATE: 'state_update',
  PREDICTION: 'prediction',
  TRANSACTION: 'transaction',
  CHANNEL_STATE: 'channel_state',
  LEARNING_METRICS: 'learning_metrics',
  SIMULATION_STATUS: 'simulation_status',
  PING: 'ping',
  PONG: 'pong',
};

// Export configuration
module.exports = {
  // Paths
  BASE_DIR,
  LOGS_DIR,
  SCRIPTS_DIR,
  DATA_DIR,
  FRONTEND_DIR,

  // Service configurations
  PORTS,
  URLS,
  TIMEOUTS,
  API_ENDPOINTS,
  WS_MESSAGE_TYPES,

  // Helper to get log file path
  getLogPath: (serviceName) => path.join(LOGS_DIR, `${serviceName}.log`),

  // Helper to check if a port is available
  isPortAvailable: async (port) => {
    return new Promise((resolve) => {
      const net = require('net');
      const server = net.createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port);
    });
  },

  // Generate a unique request ID
  generateRequestId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },
};
