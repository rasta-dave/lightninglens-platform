/**
 * service-registry.js - Service registry for Lightning Lens
 *
 * Centralizes tracking of all running services, their health status,
 * and provides methods for health checks and service discovery.
 */

const http = require('http');
const WebSocket = require('ws');
const config = require('./config');
const { createLogger } = require('./logger');

// Create a logger for the service registry
const logger = createLogger({ serviceName: 'service-registry' });

// Service states
const SERVICE_STATES = {
  UNKNOWN: 'unknown',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
};

// Service types
const SERVICE_TYPES = {
  HTTP: 'http',
  WEBSOCKET: 'websocket',
  STANDALONE: 'standalone',
};

// Registry of all services
const services = new Map();

/**
 * Register a service with the registry
 * @param {Object} serviceInfo Service information
 * @returns {Object} Registered service object
 */
function registerService(serviceInfo) {
  const defaultInfo = {
    id: config.generateRequestId(),
    name: 'unknown-service',
    type: SERVICE_TYPES.STANDALONE,
    description: '',
    port: null,
    status: SERVICE_STATES.UNKNOWN,
    startTime: new Date(),
    lastChecked: null,
    lastError: null,
    healthCheckUrl: null,
    endpoints: [],
    metadata: {},
  };

  // Merge with provided info
  const service = { ...defaultInfo, ...serviceInfo };

  // Auto-generate health check URL if possible
  if (!service.healthCheckUrl && service.port) {
    if (service.type === SERVICE_TYPES.HTTP) {
      service.healthCheckUrl = `http://localhost:${service.port}/api/status`;
    }
  }

  // Store in registry
  services.set(service.id, service);

  logger.info(`Registered service: ${service.name} (${service.id})`, {
    port: service.port,
    type: service.type,
  });

  return service;
}

/**
 * Update a service's status and information
 * @param {string} serviceId ID of the service to update
 * @param {Object} updateInfo Information to update
 * @returns {Object|null} Updated service or null if not found
 */
function updateService(serviceId, updateInfo) {
  if (!services.has(serviceId)) {
    logger.warn(`Attempted to update non-existent service: ${serviceId}`);
    return null;
  }

  const service = services.get(serviceId);
  const updatedService = { ...service, ...updateInfo };

  // If status is changing, log it
  if (updateInfo.status && updateInfo.status !== service.status) {
    logger.info(
      `Service ${service.name} status changed: ${service.status} -> ${updateInfo.status}`
    );
  }

  services.set(serviceId, updatedService);
  return updatedService;
}

/**
 * Deregister a service from the registry
 * @param {string} serviceId ID of the service to deregister
 * @returns {boolean} True if service was deregistered, false if not found
 */
function deregisterService(serviceId) {
  if (!services.has(serviceId)) {
    logger.warn(`Attempted to deregister non-existent service: ${serviceId}`);
    return false;
  }

  const service = services.get(serviceId);
  logger.info(`Deregistering service: ${service.name} (${serviceId})`);
  services.delete(serviceId);
  return true;
}

/**
 * Check the health of a service
 * @param {string} serviceId ID of the service to check
 * @returns {Promise<Object>} Health check result
 */
async function checkServiceHealth(serviceId) {
  if (!services.has(serviceId)) {
    return { status: SERVICE_STATES.UNKNOWN, error: 'Service not found' };
  }

  const service = services.get(serviceId);
  const result = {
    status: service.status,
    lastChecked: new Date(),
    responseTime: null,
    error: null,
  };

  // Update last checked time
  updateService(serviceId, { lastChecked: result.lastChecked });

  if (!service.healthCheckUrl) {
    // No health check URL, can't check health
    return result;
  }

  const startTime = Date.now();

  try {
    // Check HTTP services
    if (service.type === SERVICE_TYPES.HTTP) {
      const healthResult = await checkHttpHealth(service.healthCheckUrl);
      result.status = healthResult.status
        ? SERVICE_STATES.RUNNING
        : SERVICE_STATES.ERROR;
      result.error = healthResult.error;
      result.responseTime = Date.now() - startTime;
      result.data = healthResult.data;
    }
    // Check WebSocket services
    else if (service.type === SERVICE_TYPES.WEBSOCKET) {
      const healthResult = await checkWebSocketHealth(service.port);
      result.status = healthResult.status
        ? SERVICE_STATES.RUNNING
        : SERVICE_STATES.ERROR;
      result.error = healthResult.error;
      result.responseTime = Date.now() - startTime;
    }
  } catch (error) {
    result.status = SERVICE_STATES.ERROR;
    result.error = error.message;
    logger.error(`Health check failed for ${service.name}: ${error.message}`);
  }

  // Update service status in registry
  updateService(serviceId, {
    status: result.status,
    lastChecked: result.lastChecked,
    lastError: result.error
      ? {
          message: result.error,
          time: result.lastChecked,
        }
      : service.lastError,
  });

  return result;
}

/**
 * Check health of all registered services
 * @returns {Promise<Object>} Results of all health checks
 */
async function checkAllServicesHealth() {
  const results = {};
  const promises = [];

  for (const [serviceId, service] of services.entries()) {
    promises.push(
      checkServiceHealth(serviceId).then((result) => {
        results[serviceId] = {
          name: service.name,
          status: result.status,
          responseTime: result.responseTime,
          error: result.error,
          lastChecked: result.lastChecked,
        };
      })
    );
  }

  await Promise.all(promises);
  return results;
}

/**
 * Check HTTP service health
 * @param {string} url Health check URL
 * @returns {Promise<Object>} Health check result
 */
function checkHttpHealth(url) {
  return new Promise((resolve) => {
    const request = http.get(
      url,
      { timeout: config.TIMEOUTS.CONNECTION },
      (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve({
              status: response.statusCode >= 200 && response.statusCode < 300,
              data: jsonData,
              error: null,
            });
          } catch (error) {
            resolve({
              status: response.statusCode >= 200 && response.statusCode < 300,
              data: data,
              error: `Invalid JSON response: ${error.message}`,
            });
          }
        });
      }
    );

    request.on('error', (error) => {
      resolve({ status: false, error: error.message });
    });

    request.on('timeout', () => {
      request.destroy();
      resolve({ status: false, error: 'Connection timed out' });
    });
  });
}

/**
 * Check WebSocket service health
 * @param {number} port Port the WebSocket service is running on
 * @returns {Promise<Object>} Health check result
 */
function checkWebSocketHealth(port) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.terminate();
        }
        resolve({ status: false, error: 'Connection timed out' });
      }, config.TIMEOUTS.CONNECTION);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close(1000, 'Health check completed');
        resolve({ status: true, error: null });
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.terminate();
        }
        resolve({ status: false, error: error.message });
      });
    } catch (error) {
      resolve({ status: false, error: error.message });
    }
  });
}

/**
 * Get all registered services
 * @returns {Array} Array of all services
 */
function getAllServices() {
  return Array.from(services.values());
}

/**
 * Get a service by ID
 * @param {string} serviceId ID of the service to get
 * @returns {Object|null} Service object or null if not found
 */
function getService(serviceId) {
  return services.has(serviceId) ? services.get(serviceId) : null;
}

/**
 * Find services by criteria
 * @param {Function} filterFn Filter function to match services
 * @returns {Array} Array of matching services
 */
function findServices(filterFn) {
  return Array.from(services.values()).filter(filterFn);
}

/**
 * Get services by type
 * @param {string} type Service type
 * @returns {Array} Array of services of the specified type
 */
function getServicesByType(type) {
  return findServices((service) => service.type === type);
}

// Export the service registry functions and constants
module.exports = {
  registerService,
  updateService,
  deregisterService,
  checkServiceHealth,
  checkAllServicesHealth,
  getAllServices,
  getService,
  findServices,
  getServicesByType,
  SERVICE_STATES,
  SERVICE_TYPES,
};
