/**
 * health-dashboard.js - Health monitoring dashboard for Lightning Lens
 *
 * Provides a simple HTTP server that displays the health status of all
 * registered services in the Lightning Lens system.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const config = require('./config');
const { createLogger } = require('./logger');
const registry = require('./service-registry');
const { createErrorHandler } = require('./error-handler');
const { WebSocketServer } = require('./websocket-manager');

// Create logger
const logger = createLogger({ serviceName: 'health-dashboard' });

// Default port
const DEFAULT_PORT = 3030;

/**
 * Start the health dashboard server
 * @param {Object} options Server options
 * @returns {Promise<Object>} Server object
 */
async function startHealthDashboard(options = {}) {
  const port = options.port || DEFAULT_PORT;

  // Check if port is available
  const isPortAvailable = await config.isPortAvailable(port);
  if (!isPortAvailable) {
    throw new Error(`Port ${port} is already in use`);
  }

  // Create Express app
  const app = express();

  // Serve static files
  app.use(express.static(path.join(__dirname, 'public')));

  // Enable JSON parsing
  app.use(express.json());

  // Add health dashboard service to registry
  const dashboardService = registry.registerService({
    name: 'health-dashboard',
    type: registry.SERVICE_TYPES.HTTP,
    port,
    description: 'Health monitoring dashboard for Lightning Lens',
    status: registry.SERVICE_STATES.STARTING,
  });

  // Create HTTP server
  const server = http.createServer(app);

  // Create WebSocket server for real-time updates
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    name: 'health-dashboard-ws',
  });

  // Set up WebSocket events
  wss.on('connection', (event) => {
    const { client } = event;
    logger.info(`Dashboard client connected: ${client.id}`);

    // Send current health status
    registry.checkAllServicesHealth().then((healthData) => {
      wss.sendToClient(client.id, {
        type: 'health_status',
        data: healthData,
        timestamp: new Date().toISOString(),
      });
    });
  });

  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    const healthData = await registry.checkAllServicesHealth();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: healthData,
    });
  });

  // Dashboard HTML
  app.get('/', (req, res) => {
    res.send(generateDashboardHtml());
  });

  // Service details endpoint
  app.get('/api/services/:id', async (req, res, next) => {
    const service = registry.getService(req.params.id);
    if (!service) {
      return next(new Error(`Service ${req.params.id} not found`));
    }

    const healthData = await registry.checkServiceHealth(req.params.id);
    res.json({
      service,
      health: healthData,
    });
  });

  // All services endpoint
  app.get('/api/services', (req, res) => {
    const services = registry.getAllServices();
    res.json({ services });
  });

  // Add error handler
  app.use(createErrorHandler({ logger }));

  // Start health check polling
  let healthCheckInterval;
  const startHealthCheckPolling = () => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
    }

    healthCheckInterval = setInterval(async () => {
      try {
        const healthData = await registry.checkAllServicesHealth();

        // Broadcast health status to all connected clients
        wss.broadcast({
          type: 'health_status',
          data: healthData,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error during health check polling:', error);
      }
    }, 10000); // Poll every 10 seconds
  };

  // Start the server
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      logger.info(`Health dashboard listening on port ${port}`);

      // Update service status
      registry.updateService(dashboardService.id, {
        status: registry.SERVICE_STATES.RUNNING,
      });

      // Start health check polling
      startHealthCheckPolling();

      // Start WebSocket server
      wss
        .start()
        .then(() => {
          logger.info('Health dashboard WebSocket server started');

          // Return server object
          resolve({
            server,
            wss,
            app,
            port,
            dashboardUrl: `http://localhost:${port}`,
            stop: async () => {
              // Clear health check interval
              if (healthCheckInterval) {
                clearInterval(healthCheckInterval);
              }

              // Update service status
              registry.updateService(dashboardService.id, {
                status: registry.SERVICE_STATES.STOPPING,
              });

              // Stop WebSocket server
              await wss.stop();

              // Close HTTP server
              return new Promise((resolve, reject) => {
                server.close((err) => {
                  if (err) {
                    logger.error('Error closing health dashboard server:', err);
                    reject(err);
                    return;
                  }

                  logger.info('Health dashboard server stopped');

                  // Deregister service
                  registry.deregisterService(dashboardService.id);

                  resolve();
                });
              });
            },
          });
        })
        .catch(reject);
    });

    server.on('error', (error) => {
      logger.error('Error starting health dashboard server:', error);
      reject(error);
    });
  });
}

/**
 * Generate the dashboard HTML
 * @returns {string} Dashboard HTML
 */
function generateDashboardHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lightning Lens Health Dashboard</title>
  <style>
    :root {
      --primary-color: #4a6bae;
      --secondary-color: #3a5999;
      --accent-color: #5b7fe7;
      --text-color: #333;
      --bg-color: #f5f7fa;
      --card-bg: #fff;
      --border-color: #ddd;
      --success-color: #28a745;
      --warning-color: #ffc107;
      --error-color: #dc3545;
      --unknown-color: #6c757d;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background-color: var(--primary-color);
      color: white;
      padding: 1rem;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    
    header h1 {
      margin: 0;
      font-size: 1.8rem;
      display: flex;
      align-items: center;
    }
    
    header h1 svg {
      margin-right: 10px;
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    
    .service-card {
      background-color: var(--card-bg);
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      padding: 20px;
      transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
    }
    
    .service-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }
    
    .service-card h2 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 1.2rem;
    }
    
    .service-card .description {
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 15px;
    }
    
    .service-card .status {
      font-weight: bold;
      margin-bottom: 10px;
      padding: 5px 10px;
      border-radius: 4px;
      display: inline-block;
    }
    
    .service-card .details {
      font-size: 0.9rem;
    }
    
    .service-card .details p {
      margin: 5px 0;
    }
    
    .status-running {
      background-color: var(--success-color);
      color: white;
    }
    
    .status-starting {
      background-color: var(--warning-color);
      color: white;
    }
    
    .status-stopping {
      background-color: var(--warning-color);
      color: white;
    }
    
    .status-error {
      background-color: var(--error-color);
      color: white;
    }
    
    .status-unknown {
      background-color: var(--unknown-color);
      color: white;
    }
    
    .service-card .error {
      color: var(--error-color);
      margin-top: 10px;
      padding: 10px;
      background-color: rgba(220, 53, 69, 0.1);
      border-radius: 4px;
    }
    
    .refresh-button {
      background-color: var(--accent-color);
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      margin-top: 20px;
    }
    
    .refresh-button:hover {
      background-color: var(--secondary-color);
    }
    
    .last-updated {
      font-size: 0.8rem;
      color: #666;
      margin-top: 20px;
    }
    
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border-color);
      font-size: 0.8rem;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 12C7 13.6569 8.34315 15 10 15H13C14.6569 15 16 13.6569 16 12C16 10.3431 14.6569 9 13 9H10C8.34315 9 7 7.65685 7 6C7 4.34315 8.34315 3 10 3H13C14.6569 3 16 4.34315 16 6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 3V22" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Lightning Lens Health Dashboard
      </h1>
    </div>
  </header>
  
  <div class="container">
    <div id="dashboard-content">
      <div id="service-dashboard" class="dashboard">
        <p>Loading services...</p>
      </div>
      
      <p class="last-updated">Last updated: <span id="last-updated-time">Never</span></p>
      
      <button id="refresh-button" class="refresh-button">Refresh Now</button>
    </div>
  </div>
  
  <footer>
    <div class="container">
      <p>&copy; ${new Date().getFullYear()} Lightning Lens - Health Dashboard v1.0.0</p>
    </div>
  </footer>
  
  <script>
    // WebSocket connection for real-time updates
    let socket;
    let reconnectInterval;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    
    // Connect to WebSocket
    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = \`\${protocol}//\${host}/ws\`;
      
      console.log(\`Connecting to WebSocket at \${wsUrl}...\`);
      
      socket = new WebSocket(wsUrl);
      
      socket.onopen = function() {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
          reconnectInterval = null;
        }
      };
      
      socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'health_status') {
          updateDashboard(data.data);
          document.getElementById('last-updated-time').textContent = new Date(data.timestamp).toLocaleString();
        }
      };
      
      socket.onclose = function() {
        console.log('WebSocket connection closed');
        
        // Try to reconnect if not at max attempts
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
          
          console.log(\`Reconnecting in \${Math.floor(delay / 1000)} seconds (attempt \${reconnectAttempts}/\${MAX_RECONNECT_ATTEMPTS})...\`);
          
          if (reconnectInterval) {
            clearTimeout(reconnectInterval);
          }
          
          reconnectInterval = setTimeout(connectWebSocket, delay);
        } else {
          console.error('Maximum reconnection attempts reached');
        }
      };
      
      socket.onerror = function(error) {
        console.error('WebSocket error:', error);
      };
    }
    
    // Update dashboard with health data
    function updateDashboard(healthData) {
      const dashboard = document.getElementById('service-dashboard');
      dashboard.innerHTML = '';
      
      if (!healthData || Object.keys(healthData).length === 0) {
        dashboard.innerHTML = '<p>No services registered</p>';
        return;
      }
      
      for (const [serviceId, serviceHealth] of Object.entries(healthData)) {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        
        const statusClass = \`status-\${serviceHealth.status.toLowerCase()}\`;
        
        serviceCard.innerHTML = \`
          <h2>\${serviceHealth.name}</h2>
          <div class="description">\${serviceHealth.description || 'No description'}</div>
          <div class="status \${statusClass}">\${serviceHealth.status}</div>
          <div class="details">
            <p><strong>Response Time:</strong> \${serviceHealth.responseTime ? \`\${serviceHealth.responseTime}ms\` : 'N/A'}</p>
            <p><strong>Last Checked:</strong> \${serviceHealth.lastChecked ? new Date(serviceHealth.lastChecked).toLocaleString() : 'Never'}</p>
          </div>
          \${serviceHealth.error ? \`<div class="error"><strong>Error:</strong> \${serviceHealth.error}</div>\` : ''}
        \`;
        
        dashboard.appendChild(serviceCard);
      }
    }
    
    // Fetch health data from API
    async function fetchHealthData() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        const data = await response.json();
        updateDashboard(data.services);
        document.getElementById('last-updated-time').textContent = new Date(data.timestamp).toLocaleString();
      } catch (error) {
        console.error('Error fetching health data:', error);
      }
    }
    
    // Set up event listeners
    document.addEventListener('DOMContentLoaded', function() {
      // Connect to WebSocket for real-time updates
      connectWebSocket();
      
      // Initial fetch of health data
      fetchHealthData();
      
      // Set up manual refresh button
      document.getElementById('refresh-button').addEventListener('click', fetchHealthData);
    });
  </script>
</body>
</html>
  `;
}

module.exports = {
  startHealthDashboard,
};
