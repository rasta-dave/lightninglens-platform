/**
 * simple_data_server.js
 *
 * A minimal Express server that reads Lightning Network simulation data
 * and broadcasts it over WebSockets.
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const chokidar = require('chokidar');
const csv = require('csv-parser');

// Configuration
const PORT = process.env.PORT || 3005;
const DATA_DIR = path.join(__dirname, '../../../data/simulation');
const PREDICTIONS_DIR = path.join(__dirname, '../../../data/predictions');
const UPDATE_INTERVAL = 1000; // Send updates every 1 second
const FILE_CHECK_INTERVAL = 5000; // Check for new files every 5 seconds

// Create Express app and HTTP server
const app = express();
app.use(
  cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);
app.use(express.json());

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket health check endpoint
app.get('/ws-health', (req, res) => {
  if (wss && wss.clients && wss.clients.size >= 0) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      connections: wss.clients.size,
    });
  } else {
    res.status(503).json({
      status: 'error',
      message: 'WebSocket server is not available',
      timestamp: new Date().toISOString(),
    });
  }
});

// Endpoint to get all available simulation files
app.get('/api/simulations', (req, res) => {
  try {
    const files = findAllSimulationFiles();
    res.json({ simulations: files });
  } catch (error) {
    console.error('Error reading simulation files:', error);
    res.status(500).json({ error: 'Failed to read simulation files' });
  }
});

// Endpoint to switch to a specific simulation file
app.post('/api/switch-simulation', (req, res) => {
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'No file path provided' });
  }

  try {
    const fullPath = path.resolve(DATA_DIR, filePath);

    // Make sure the file exists and is in the allowed directory
    if (
      !fs.existsSync(fullPath) ||
      !fullPath.startsWith(path.resolve(DATA_DIR))
    ) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Load the selected simulation file
    loadSpecificSimulationFile(fullPath)
      .then(() => {
        res.json({
          success: true,
          message: `Switched to simulation file: ${path.basename(fullPath)}`,
        });
      })
      .catch((error) => {
        console.error('Error switching simulation:', error);
        res.status(500).json({ error: 'Failed to switch simulation file' });
      });
  } catch (error) {
    console.error('Error switching simulation:', error);
    res.status(500).json({ error: 'Failed to switch simulation file' });
  }
});

// Add routes for predictions
app.get('/api/predictions', (req, res) => {
  try {
    const files = findAllPredictionFiles();
    res.json({ predictions: files });
  } catch (error) {
    console.error('Error reading prediction files:', error);
    res.status(500).json({ error: 'Failed to read prediction files' });
  }
});

app.get('/api/latest-predictions', (req, res) => {
  try {
    if (!currentPredictions || currentPredictions.length === 0) {
      return res.status(404).json({ error: 'No predictions loaded yet' });
    }
    res.json({
      predictions: currentPredictions,
      filename: path.basename(latestPredictionFile),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error sending predictions:', error);
    res.status(500).json({ error: 'Failed to retrieve predictions' });
  }
});

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  // Allow all origins and additional WebSocket options for stability
  perMessageDeflate: false, // Disable per-message deflate to avoid potential issues
  clientTracking: true, // Track clients automatically
  maxPayload: 50 * 1024 * 1024, // 50MB max payload
  // WebSocket server configuration for better stability
  handleProtocols: (protocols) => {
    // Accept any protocol the client sends, or none
    return protocols ? protocols[0] : '';
  },
  verifyClient: (info) => {
    // Always accept connections - no need to verify
    return true;
  },
  // Add better connection timeout handling
  backlog: 100, // Maximum length of the connection queue
  maxReceivedFrameSize: 1024 * 1024, // 1MB max frame size
  maxReceivedMessageSize: 8 * 1024 * 1024, // 8MB max message size
  // Add TCP keep-alive to detect connection drops at TCP level
  keepAlive: true,
  keepAliveInterval: 15000, // 15 seconds
});

// Store connected clients with unique IDs
const clients = new Map();
let nextClientId = 1;

// Keep track of the latest simulation file
let latestSimulationFile = null;
let currentTransactions = [];
let lastSentIndex = -1;
let lastFileCheckTime = 0;
let isLoadingFile = false;

// For predictions
let latestPredictionFile = null;
let currentPredictions = [];
let isLoadingPredictions = false;

// Find all simulation files in the directory
function findAllSimulationFiles() {
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter(
        (file) =>
          file.startsWith('lightning_simulation_') && file.endsWith('.csv')
      )
      .map((file) => {
        const filePath = path.join(DATA_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: filePath,
          created: stats.birthtime,
          size: stats.size,
          modified: stats.mtime,
        };
      })
      .sort((a, b) => b.modified - a.modified); // Sort by most recently modified

    return files;
  } catch (error) {
    console.error('Error finding simulation files:', error);
    return [];
  }
}

// Find the most recent simulation file
function findLatestSimulationFile() {
  try {
    const files = findAllSimulationFiles();

    if (files.length > 0) {
      console.log(
        `Found latest simulation file: ${
          files[0].filename
        } (Modified: ${files[0].modified.toISOString()})`
      );
      return files[0].path;
    }

    console.log('No simulation files found');
    return null;
  } catch (error) {
    console.error('Error finding latest simulation file:', error);
    return null;
  }
}

// Check if file has actual data (not empty or just a header)
async function hasActualData(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const stats = fs.statSync(filePath);

      // If file is very small, it might just have headers
      if (stats.size < 50) {
        resolve(false);
      }

      // Read a small portion of the file to check
      const transactions = [];
      const readStream = fs
        .createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          transactions.push(data);
          // We just need to check if there's at least one transaction
          if (transactions.length >= 1) {
            readStream.destroy(); // Close the stream early
            resolve(true);
          }
        })
        .on('end', () => {
          resolve(transactions.length > 0);
        })
        .on('error', (error) => {
          console.error(`Error checking file ${filePath}:`, error);
          resolve(false);
        });

      // Add a timeout in case reading hangs
      setTimeout(() => {
        readStream.destroy();
        resolve(false);
      }, 2000);
    } catch (error) {
      console.error(`Error checking file ${filePath}:`, error);
      resolve(false);
    }
  });
}

// Read transactions from a CSV file
function readTransactionsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const transactions = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => transactions.push(data))
      .on('end', () => resolve(transactions))
      .on('error', (error) => reject(error));
  });
}

// Function to safely send message to client with error handling
function safeSend(client, message) {
  if (!client || client.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    client.send(message);
    return true;
  } catch (error) {
    console.error('Error sending message to client:', error);
    return false;
  }
}

// Broadcast transactions to all connected clients
function broadcastTransactions() {
  if (
    clients.size === 0 ||
    !latestSimulationFile ||
    currentTransactions.length === 0
  ) {
    return;
  }

  // Periodically check for new files (don't check every time to reduce system load)
  const now = Date.now();
  if (now - lastFileCheckTime > FILE_CHECK_INTERVAL) {
    lastFileCheckTime = now;
    checkForNewFiles();
  }

  // If we've sent all transactions, stop sending more
  if (lastSentIndex >= currentTransactions.length - 1) {
    // Instead of sending the last transaction again, just return
    return;
  }

  // Send the next transaction
  lastSentIndex++;
  const transaction = currentTransactions[lastSentIndex];

  const message = JSON.stringify({
    type: 'transaction',
    data: transaction,
    total: currentTransactions.length,
    current: lastSentIndex + 1,
  });

  // Track clients to remove from map if they're no longer connected
  const deadClients = [];

  clients.forEach((client, clientId) => {
    if (!safeSend(client, message)) {
      deadClients.push(clientId);
    }
  });

  // Remove dead clients from the map
  if (deadClients.length > 0) {
    console.log(`Removing ${deadClients.length} dead clients`);
    deadClients.forEach((clientId) => {
      clients.delete(clientId);
    });
  }
}

// Broadcast a notification about a new simulation file
function broadcastNewSimulationNotification(filename) {
  if (clients.size === 0) return;

  const message = JSON.stringify({
    type: 'new_simulation_available',
    filename: filename,
    timestamp: new Date().toISOString(),
  });

  const deadClients = [];
  clients.forEach((client, clientId) => {
    if (!safeSend(client, message)) {
      deadClients.push(clientId);
    }
  });

  // Remove dead clients
  if (deadClients.length > 0) {
    console.log(`Removing ${deadClients.length} dead clients`);
    deadClients.forEach((clientId) => {
      clients.delete(clientId);
    });
  }
}

// Load a specific simulation file
async function loadSpecificSimulationFile(filePath) {
  // Don't reload the same file unless forced
  if (filePath === latestSimulationFile && currentTransactions.length > 0) {
    console.log('Already using this simulation file');
    return;
  }

  if (isLoadingFile) {
    console.log('Already loading a file, skipping...');
    return;
  }

  isLoadingFile = true;

  try {
    console.log(`Loading transactions from ${filePath}`);

    // Check if the file has actual transaction data
    const hasData = await hasActualData(filePath);
    if (!hasData) {
      console.log(
        `File ${path.basename(
          filePath
        )} appears empty or has no transaction data, skipping...`
      );
      isLoadingFile = false;
      return;
    }

    latestSimulationFile = filePath;
    currentTransactions = await readTransactionsFromCSV(filePath);
    lastSentIndex = -1; // Reset index when loading new file

    console.log(
      `Loaded ${currentTransactions.length} transactions from ${path.basename(
        filePath
      )}`
    );

    // Broadcast file info to all clients
    const message = JSON.stringify({
      type: 'simulation_loaded',
      filename: path.basename(filePath),
      transactionCount: currentTransactions.length,
      timestamp: new Date().toISOString(),
    });

    const deadClients = [];
    clients.forEach((client, clientId) => {
      if (!safeSend(client, message)) {
        deadClients.push(clientId);
      }
    });

    // Remove dead clients
    if (deadClients.length > 0) {
      console.log(
        `Removing ${deadClients.length} dead clients during simulation load`
      );
      deadClients.forEach((clientId) => {
        clients.delete(clientId);
      });
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
  } finally {
    isLoadingFile = false;
  }
}

// Load transactions from the latest file
async function loadLatestTransactions() {
  const filePath = findLatestSimulationFile();

  if (!filePath) {
    console.log('No simulation file to load');
    return;
  }

  await loadSpecificSimulationFile(filePath);
}

// Check for new simulation files and load the latest one
async function checkForNewFiles() {
  if (isLoadingFile) {
    console.log('Already loading a file, skipping file check...');
    return;
  }

  const latestFile = findLatestSimulationFile();

  if (!latestFile) {
    return;
  }

  // If we haven't loaded a file yet, or if there's a newer file
  if (!latestSimulationFile || latestFile !== latestSimulationFile) {
    console.log(`New simulation file detected: ${path.basename(latestFile)}`);

    // Notify clients that a new file is available
    broadcastNewSimulationNotification(path.basename(latestFile));

    // Load the new file
    await loadSpecificSimulationFile(latestFile);
  }
}

// Watch for new simulation files
const watcher = chokidar.watch(DATA_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: false, // This will trigger 'add' events for existing files on startup
  awaitWriteFinish: {
    stabilityThreshold: 2000, // Wait for file to be stable for 2 seconds
    pollInterval: 100,
  },
});

watcher.on('add', async (filePath) => {
  if (filePath.endsWith('.csv') && filePath.includes('lightning_simulation_')) {
    console.log(`New simulation file detected: ${filePath}`);

    // Wait a moment to ensure the file is fully written
    setTimeout(async () => {
      // Check that the file has actual data
      const hasData = await hasActualData(filePath);
      if (hasData) {
        // Notify clients that a new file is available
        broadcastNewSimulationNotification(path.basename(filePath));

        // If this is the most recent file, load it
        const latestFile = findLatestSimulationFile();
        if (latestFile === filePath) {
          await loadSpecificSimulationFile(filePath);
        }
      } else {
        console.log(
          `File ${path.basename(
            filePath
          )} appears empty or has no transaction data, skipping...`
        );
      }
    }, 2000);
  }
});

watcher.on('change', async (filePath) => {
  if (
    filePath.endsWith('.csv') &&
    filePath.includes('lightning_simulation_') &&
    filePath === latestSimulationFile
  ) {
    console.log(`Current simulation file changed: ${path.basename(filePath)}`);

    // Wait a moment to ensure the file is fully written
    setTimeout(async () => {
      // Reload the current file if it's the one we're watching
      await loadSpecificSimulationFile(filePath);
    }, 2000);
  }
});

// Handle server-wide WebSocket events
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

wss.on('close', () => {
  console.log('WebSocket server closed');
  clearInterval(intervalId);
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientId = nextClientId++;
  console.log(`Client connected (ID: ${clientId})`);

  // Set up a unique client ID and timestamp
  ws.clientId = clientId;
  ws.connectionTime = Date.now();
  ws.isAlive = true;

  // Add the client to the map
  clients.set(clientId, ws);

  // Setup ping-pong heartbeat
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Handle client messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received message from client ${clientId}:`, data.type);

      // Process messages based on type
      switch (data.type) {
        case 'get_simulation_info':
          sendSimulationInfo(ws);
          break;
        case 'get_all_simulations':
          sendAllSimulations(ws);
          break;
        case 'switch_simulation':
          switchToSimulation(data.filename, ws);
          break;
        case 'check_for_new_files':
          checkForNewFiles()
            .then(() => {
              sendAllSimulations(ws);
            })
            .catch((error) => {
              console.error('Error checking for new files:', error);
            });
          break;
        case 'reset_simulation':
          resetSimulation(ws);
          break;
        case 'get_latest_predictions':
          sendLatestPredictions(ws);
          break;
        case 'check_for_new_predictions':
          checkForNewPredictionFiles()
            .then(() => {
              sendLatestPredictions(ws);
            })
            .catch((error) => {
              console.error('Error checking for new prediction files:', error);
            });
          break;
        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle disconnection
  ws.on('close', (code, reason) => {
    console.log(
      `Client disconnected (ID: ${clientId}), code: ${code}, reason: ${
        reason || 'No reason provided'
      }`
    );
    // Remove client from map
    clients.delete(clientId);
    console.log(`Active clients: ${clients.size}`);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    // Remove client on error
    clients.delete(clientId);
  });

  // Send welcome message
  safeSend(
    ws,
    JSON.stringify({
      type: 'welcome',
      message: 'Connected to Lightning Lens data stream',
      clientId: clientId,
      connections: clients.size,
    })
  );

  // Send simulation info if available
  if (latestSimulationFile) {
    sendSimulationInfo(ws);
  }
});

// Set up interval to broadcast transactions
const intervalId = setInterval(broadcastTransactions, UPDATE_INTERVAL);

// Ping interval to detect dead connections and clean them up
const pingInterval = setInterval(() => {
  console.log(`Checking client connections. Active clients: ${clients.size}`);

  const deadClients = [];

  clients.forEach((ws, clientId) => {
    if (ws.isAlive === false) {
      console.log(
        `Client ${clientId} is not responding to pings, terminating.`
      );
      deadClients.push(clientId);
      return ws.terminate();
    }

    // Mark as not alive, will be marked alive on pong response
    ws.isAlive = false;

    // Send ping
    try {
      ws.ping();
    } catch (error) {
      console.error(`Error pinging client ${clientId}:`, error);
      deadClients.push(clientId);
    }
  });

  // Clean up dead clients
  deadClients.forEach((clientId) => {
    clients.delete(clientId);
  });

  console.log(`Completed connection check. Active clients: ${clients.size}`);
}, 30000);

// Also set up a regular check for new files independent of transactions
const fileCheckInterval = setInterval(async () => {
  await checkForNewFiles();
}, 10000); // Check every 10 seconds

// Load initial transactions
loadLatestTransactions();

// Find all prediction files in the directory
function findAllPredictionFiles() {
  try {
    const files = fs
      .readdirSync(PREDICTIONS_DIR)
      .filter(
        (file) => file.startsWith('predictions_') && file.endsWith('.csv')
      )
      .map((file) => {
        const filePath = path.join(PREDICTIONS_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: filePath,
          created: stats.birthtime,
          size: stats.size,
          modified: stats.mtime,
        };
      })
      .sort((a, b) => b.modified - a.modified); // Sort by most recently modified

    return files;
  } catch (error) {
    console.error('Error finding prediction files:', error);
    return [];
  }
}

// Find the most recent prediction file
function findLatestPredictionFile() {
  try {
    const files = findAllPredictionFiles();

    if (files.length > 0) {
      console.log(
        `Found latest prediction file: ${
          files[0].filename
        } (Modified: ${files[0].modified.toISOString()})`
      );
      return files[0].path;
    }

    console.log('No prediction files found');
    return null;
  } catch (error) {
    console.error('Error finding latest prediction file:', error);
    return null;
  }
}

// Read predictions from a CSV file
function readPredictionsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const predictions = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => predictions.push(data))
      .on('end', () => resolve(predictions))
      .on('error', (error) => reject(error));
  });
}

// Load predictions from the latest file
async function loadLatestPredictions() {
  if (isLoadingPredictions) {
    console.log('Already loading predictions, skipping...');
    return;
  }

  const filePath = findLatestPredictionFile();
  if (!filePath) {
    console.log('No prediction file to load');
    return;
  }

  isLoadingPredictions = true;
  try {
    console.log(`Loading predictions from ${filePath}`);
    latestPredictionFile = filePath;
    currentPredictions = await readPredictionsFromCSV(filePath);
    console.log(
      `Loaded ${currentPredictions.length} predictions from ${path.basename(
        filePath
      )}`
    );

    // Broadcast to all clients that new predictions are available
    broadcast(
      JSON.stringify({
        type: 'predictions_loaded',
        filename: path.basename(filePath),
        predictionCount: currentPredictions.length,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error('Error loading predictions:', error);
  } finally {
    isLoadingPredictions = false;
  }
}

// Check for new prediction files
async function checkForNewPredictionFiles() {
  if (isLoadingPredictions) {
    console.log('Already loading predictions, skipping check...');
    return;
  }

  const latestFile = findLatestPredictionFile();
  if (!latestFile) {
    return;
  }

  // If we haven't loaded a file yet, or if there's a newer file
  if (!latestPredictionFile || latestFile !== latestPredictionFile) {
    console.log(`New prediction file detected: ${path.basename(latestFile)}`);
    await loadLatestPredictions();
  }
}

// Helper function to send simulation info to a client
function sendSimulationInfo(client) {
  if (latestSimulationFile) {
    safeSend(
      client,
      JSON.stringify({
        type: 'simulation_loaded',
        filename: path.basename(latestSimulationFile),
        transactionCount: currentTransactions.length,
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    safeSend(
      client,
      JSON.stringify({
        type: 'no_simulation',
        message: 'No simulation data available',
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// Helper function to send all simulations to a client
function sendAllSimulations(client) {
  const files = findAllSimulationFiles();
  safeSend(
    client,
    JSON.stringify({
      type: 'all_simulations',
      simulations: files.map((file) => ({
        filename: file.filename,
        created: file.created,
        modified: file.modified,
        size: file.size,
        isCurrent: file.path === latestSimulationFile,
      })),
    })
  );
}

// Helper function to switch to a specific simulation
function switchToSimulation(filename, client) {
  if (!filename) {
    safeSend(
      client,
      JSON.stringify({
        type: 'simulation_switched',
        success: false,
        error: 'No filename provided',
      })
    );
    return;
  }

  const filePath = path.join(DATA_DIR, filename);

  if (fs.existsSync(filePath)) {
    loadSpecificSimulationFile(filePath)
      .then(() => {
        // Broadcast to all clients that the simulation has changed
        broadcast(
          JSON.stringify({
            type: 'simulation_switched',
            filename,
            success: true,
          })
        );
      })
      .catch((error) => {
        console.error(`Error switching to simulation ${filename}:`, error);
        safeSend(
          client,
          JSON.stringify({
            type: 'simulation_switched',
            filename,
            success: false,
            error: 'Failed to load simulation file',
          })
        );
      });
  } else {
    safeSend(
      client,
      JSON.stringify({
        type: 'simulation_switched',
        filename,
        success: false,
        error: 'File not found',
      })
    );
  }
}

// Helper function to reset the simulation
function resetSimulation(client) {
  lastSentIndex = -1;
  console.log('Simulation reset to beginning');

  // Broadcast the reset to all clients
  broadcast(
    JSON.stringify({
      type: 'simulation_reset',
      message: 'Simulation reset to beginning',
    })
  );
}

// Broadcast to all clients
function broadcast(message) {
  if (clients.size === 0) return;

  console.log(`Broadcasting to ${clients.size} clients`);

  // Track clients to remove if they're no longer connected
  const deadClients = [];

  clients.forEach((client, clientId) => {
    if (client.readyState === WebSocket.OPEN) {
      if (!safeSend(client, message)) {
        deadClients.push(clientId);
      }
    } else {
      // Client is in CLOSING or CLOSED state
      console.log(
        `Client ${clientId} is in state ${client.readyState}, removing from clients list`
      );
      deadClients.push(clientId);
    }
  });

  // Remove dead clients from the map
  deadClients.forEach((clientId) => {
    clients.delete(clientId);
  });
}

// Helper function to send latest predictions to a client
function sendLatestPredictions(client) {
  if (latestPredictionFile && currentPredictions.length > 0) {
    safeSend(
      client,
      JSON.stringify({
        type: 'predictions_data',
        filename: path.basename(latestPredictionFile),
        predictions: currentPredictions,
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    safeSend(
      client,
      JSON.stringify({
        type: 'no_predictions',
        message: 'No prediction data available',
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// Also set up a regular check for new prediction files
const predictionCheckInterval = setInterval(async () => {
  await checkForNewPredictionFiles();
}, 15000); // Check every 15 seconds

// Load initial predictions
loadLatestPredictions();

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Watching for new simulation files in: ${DATA_DIR}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');

  // Clear intervals
  clearInterval(intervalId);
  clearInterval(pingInterval);
  clearInterval(fileCheckInterval);
  clearInterval(predictionCheckInterval);

  // Close watcher
  watcher.close().then(() => {
    console.log('File watcher closed');

    // Close all client connections
    for (const client of clients.values()) {
      try {
        client.terminate();
      } catch (err) {
        console.error('Error terminating client during shutdown:', err);
      }
    }

    // Close server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});
