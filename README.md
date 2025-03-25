# ⚡ LightningLens Platform ⚡

<img src="./images/lightnings.svg" width="200" alt="Lightning Lens Logo" />

A comprehensive solution for optimizing Lightning Network liquidity through AI analysis.

## Overview

Lightning Lens Platform combines two components:

- **Lightning Network Simulation**: A Docker-based testnet simulation environment
- **Lightning Lens AI Analysis**: Machine learning tools for channel optimization

The platform automatically collects transaction data, analyzes network patterns, and provides intelligent rebalancing suggestions to optimize liquidity distribution across channels.

## System Architecture

```
┌───────────────────────────────────────┐      ┌─────────────────────────────────────┐
│      Lightning Network Simulation      │      │          Lightning Lens AI          │
├───────────────────────────────────────┤      ├─────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐   │      │  ┌─────────────┐    ┌─────────────┐ │
│  │  Lightning  │    │  WebSocket  │   │      │  │  WebSocket  │    │    Model    │ │
│  │    Nodes    │◄──►│   Server    │◄──┼──────┼─►│   Client    │◄──►│  Processor  │ │
│  └─────────────┘    └─────────────┘   │      │  └─────────────┘    └─────────────┘ │
│        ▲                  ▲           │      │                           │         │
│        │                  │           │      │                           │         │
│        ▼                  │           │      │                           ▼         │
│  ┌─────────────┐    ┌─────────────┐   │      │  ┌─────────────┐    ┌─────────────┐ │
│  │ Transaction │    │ Rebalancing │◄──┼──────┼──┤ Suggestions │◄───┤   Online    │ │
│  │  Generator  │───►│   Engine    │   │      │  │  Generator  │    │   Learner   │ │
│  └─────────────┘    └─────────────┘   │      │  └─────────────┘    └─────────────┘ │
│        │                              │      │                           ▲         │
│        ▼                              │      │                           │         │
│  ┌─────────────┐    ┌─────────────┐   │      │                           │         │
│  │   Channel   │───►│   Feature   │───┼──────┼─►                         │         │
│  │    State    │    │   Adapter   │   │      │                           │         │
│  └─────────────┘    └─────────────┘   │      │                           │         │
└───────────────────────────────────────┘      └───────────────────────────┼─────────┘
                                                                  ┌─────────┴────────┐
                                                                  │  Trained Model   │
                                                                  │    & Scaler      │
                                                                  └──────────────────┘
                                                                           │
                                                                           ▼
                                                                  ┌──────────────────┐
                                                                  │     React UI     │
                                                                  │    Dashboard     │
                                                                  └──────────────────┘
```

## Installation

### Quick Setup (Recommended)

Use the provided setup script to automatically create environments and install dependencies:

Git clone

```bash
git clone --recurse-submodules https://github.com/rasta-dave/lightning-lens-platform.git
```

```bash
# Make the script executable
chmod +x setup_environments.sh

# Run the setup script
./setup_environments.sh
```

### Manual Installation

If you prefer to set up manually:

1. Install the requirements:

```bash
pip install -r requirements.txt
```

2. Set up the PYTHONPATH:

```bash
export PYTHONPATH=$PYTHONPATH:/path/to/LIGHTNING-LENS:/path/to/LIGHTNING-LENS/Lightning-Lens/lightning_lens
```

### Docker Requirements

The Lightning Network simulation requires Docker and Docker Compose:

```bash
# Install Docker (Ubuntu example)
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Verify installation
docker --version
docker-compose --version
```

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

## Workflow

To run the complete system with Lightning Lens:

```bash

-----------------------------------------
-----------------------------------------
-----------------------------------------

1.
# Pruning old containers and restarts everything from scratch
# Takes approx. 5 min
./setup-nodes-continue.sh

2.
./start.sh

npm run

./stop.sh
# Stop script

3.
# THIS
./start-simple-dashboard.sh


./start_simulation.sh
-----------------------------------------
-----------------------------------------
-----------------------------------------

# Start data processing pipeline
./process_data.sh
# What this does:
# Convert the raw JSON data to CSV
# Transform the transaction data
# Generate features from the transformed data
# Train the initial model
# Report the path to your newly trained model


#Frontend display
./setup_dependencies.sh

./start_proxy.sh

npm start
```

## Services and Ports

The Lightning Lens platform consists of several interconnected services:

| Service              | Port | Description                                |
| -------------------- | ---- | ------------------------------------------ |
| WebSocket Server     | 8768 | Sends data from the simulation             |
| HTTP Server          | 8000 | Main API server for the backend            |
| Enhanced HTTP Server | 5000 | Advanced API server for learning dashboard |
| Adapter Proxy        | 8001 | Transforms data between systems            |
| WebSocket Client     | 8766 | Receives data from the simulation          |
| Suggestions Service  | 8767 | Provides rebalancing suggestions           |
| CORS Proxy           | 3003 | Handles CORS and API routing               |
| Frontend             | 3000 | React dashboard UI                         |

IMPORTANT: The frontend connects to the CORS Proxy at:

- HTTP API: http://localhost:3003/api
- WebSocket: ws://localhost:3003/ws

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

# //////////////////////////////////////////////////////////////////////////////

## System Components

### 1. Lightning Network Simulation

The simulation creates a Docker-based testnet with multiple Lightning Network nodes:

- **Network Structure**: A five-node network (Alice, Bob, Carol, Dave, Eve) with interconnected channels
- **Transaction Generator**: Creates realistic payment patterns between nodes
- **Channel State Monitoring**: Tracks balance changes in real-time
- **WebSocket Server**: Broadcasts channel and transaction data to the AI analysis component

### 2. Lightning Lens AI Analysis

The AI component analyzes network behavior and provides optimization recommendations:

- **Data Collection**: Captures and processes real-time network data
- **Feature Engineering**: Extracts meaningful patterns from transaction history
- **Model Training**: Learns optimal channel balance strategies
- **Prediction Engine**: Generates recommended rebalancing actions
- **Continuous Learning**: Improves over time with new data

### 3. Enhanced Services

The platform includes critical backend services for reliable operation:

- **Enhanced HTTP Server**: Serves advanced API endpoints for learning dashboard predictions and metrics
- **CORS Proxy**: Resolves cross-origin issues and routes requests between frontend and backend services

For detailed information on these services, see the [Enhanced Services Documentation](docs/ENHANCED_SERVICES.md).

### 4. React Frontend Dashboard

![Lightning Lens Platform](./images/platform.png)

The platform includes a modern React-based dashboard for visualization and monitoring:

- **Real-time Network Visualization**: Interactive graph of Lightning Network nodes and channels
- **Channel Balance Monitoring**: Visual indicators of current balances and optimal states
- **Rebalancing Recommendations**: Display of AI-suggested rebalancing actions
- **Performance Metrics**: Charts showing model accuracy and improvement over time
- **Transaction History**: Searchable log of all network transactions
- **Alert System**: Notifications for imbalanced channels or failed payments

To start the frontend:

```bash
# Navigate to the frontend directory
cd Lightning-Lens/lightning_lens/frontend

# Install dependencies (first time only)
npm install

# Start the development server
npm start
```

The dashboard will be available at http://localhost:3000

## Data Processing Pipeline

The platform includes a comprehensive data processing pipeline:

1. **Data Collection**: Raw transaction and channel data is collected in JSON format
2. **Data Conversion**: JSON data is processed into structured CSV files
3. **Transformation**: Additional fields and metrics are added to the transaction data
4. **Feature Generation**: Transaction patterns are analyzed to create ML features
5. **Model Training**: Features are used to train the optimization model
6. **Prediction**: The model provides rebalancing recommendations

To run the pipeline after collecting data:

```bash
# Run the entire pipeline
./process_data.sh
```

## Troubleshooting

### Docker Issues

If Docker containers aren't working correctly:

```bash
# Clean up any stale containers
docker-compose down -v

# Remove potentially corrupted container configuration
docker system prune -f

# Restart from scratch
docker-compose up -d
```

### Module Import Errors

If you encounter `ModuleNotFoundError`:

1. Set the PYTHONPATH:

   ```bash
   export PYTHONPATH=$PYTHONPATH:/path/to/LIGHTNING-LENS:/path/to/LIGHTNING-LENS/Lightning-Lens/lightning_lens
   ```

2. Install the package in development mode:
   ```bash
   cd Lightning-Lens/lightning_lens
   pip install -e .
   ```

### Frontend Issues

If you encounter problems with the React frontend:

1. Clear npm cache and reinstall dependencies:

   ```bash
   cd Lightning-Lens/lightning_lens/frontend
   rm -rf node_modules
   npm cache clean --force
   npm install
   ```

2. Ensure the API endpoints are accessible:

   ```bash
   # Test the HTTP server API
   curl http://localhost:5001/api/status
   ```

3. Check browser console for CORS or other errors

## Frontend Features

### Dashboard Layout

The frontend dashboard provides an intuitive interface with several key sections:

- **Network Graph**: Central visualization of the Lightning Network topology
- **Channel Panel**: Detailed information about selected channels
- **Transaction Log**: Real-time feed of payments across the network
- **Metrics Panel**: Key performance indicators and statistics
- **Recommendation Panel**: AI-generated rebalancing suggestions

### Technologies Used

The frontend is built with modern web technologies:

- **React**: For component-based UI architecture
- **Tailwind CSS**: For responsive and customizable styling
- **D3.js**: For interactive data visualizations
- **WebSockets**: For real-time data updates
- **Chart.js**: For performance metric charts

### Building for Production

To create a production build of the frontend:

```bash
cd Lightning-Lens/lightning_lens/frontend
npm run build
```

The optimized build will be available in the `build` directory, ready to be served by your preferred web server.

## Advanced Usage

### Custom Feature Generation

```bash
python scripts/new_generate_features.py --input your_transactions.csv --output your_features.csv
```

### Using Multiple Models

```bash
# Start server with a specific model
python -m src.scripts.http_server --model data/models/your_model.pkl --port 5001
```

## License

This project is licensed under the MIT License.
