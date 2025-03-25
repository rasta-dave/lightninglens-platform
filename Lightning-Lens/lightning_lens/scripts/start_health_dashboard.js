#!/usr/bin/env node
/**
 * start_health_dashboard.js
 *
 * Script to start the Lightning Lens health dashboard server
 */

const path = require('path');
const { startHealthDashboard } = require('../core/health-dashboard');
const { createLogger } = require('../core/logger');

// Create logger
const logger = createLogger({ serviceName: 'health-dashboard-starter' });

// Default port
const PORT = process.env.HEALTH_DASHBOARD_PORT || 3030;

// Parse command line arguments
const args = process.argv.slice(2);
let port = PORT;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[i + 1], 10);
    if (isNaN(port)) {
      console.error('Invalid port specified');
      process.exit(1);
    }
    i++; // Skip the next argument
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Lightning Lens Health Dashboard

Usage: node start_health_dashboard.js [options]

Options:
  --port, -p <port>   Port to run the dashboard on (default: ${PORT})
  --help, -h          Show this help message
`);
    process.exit(0);
  }
}

// Start the dashboard
logger.info(`Starting health dashboard on port ${port}...`);

startHealthDashboard({ port })
  .then((dashboard) => {
    logger.info(`Health dashboard started at ${dashboard.dashboardUrl}`);

    // Handle process termination
    const shutdown = async () => {
      logger.info('Shutting down health dashboard...');
      try {
        await dashboard.stop();
        logger.info('Health dashboard stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error stopping health dashboard:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((error) => {
    logger.error('Failed to start health dashboard:', error);
    process.exit(1);
  });
