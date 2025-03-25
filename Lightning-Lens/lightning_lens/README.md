# Under Construction

# Lightning Lens 🔍⚡

A minimalistic AI-powered tool for optimizing Lightning Network node liquidity through machine learning prediction and analysis.

[![Simulation Environment](https://img.shields.io/badge/Simulation_Environment-Lightning_Lens_Simulation-blue)](https://github.com/rasta-dave/lightning-lens-simulation)

This project works with the Lightning Network simulation environment provided by the [Lightning Lens Simulation](https://github.com/rasta-dave/lightning-lens-simulation) repository.

## Project Ecosystem

This repository contains the AI analysis and prediction components. For the complete system:

- **[Lightning Lens Simulation](https://github.com/rasta-dave/lightning-lens-simulation)**: The companion repository that provides the Lightning Network simulation environment with Docker-based nodes and realistic payment patterns.
- **Current Repository**: The machine learning model that analyzes data from the simulation and provides rebalancing recommendations.
- **Frontend Visualization**: A React-based dashboard for visualizing network operations, channel balances, and AI-powered optimization suggestions.

All components are designed to work together to create a complete Lightning Network optimization system.

## Overview

Lightning Lens is a prototype that uses machine learning to help optimize channel liquidity inside of a Lightning Network simulation. It analyzes network patterns, predicts optimal liquidity levels, and provides actionable recommendations for channel management.

## Related Projects

This project works with the [Lightning Lens Simulation](https://github.com/rasta-dave/lightning-lens-simulation) repository, which provides the Lightning Network simulation environment.

## Initial Setup

Follow these steps when setting up LightningLens for the first time:

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Create Necessary Directories

```bash
mkdir -p data/{raw,processed,models} visualizations
```

### 3. Fix the Feature Generation Script

This one-time fix ensures the feature generation script works correctly:

```bash
python scripts/final_fix.py
```

### 4. Frontend Visualization (Optional)

To set up the frontend visualization dashboard:

```bash
cd frontend
npm install
npm start
```

This will start the React development server at http://localhost:3000, providing a visual interface to monitor your Lightning Network and view AI-powered optimization suggestions.

For more details, see the [Frontend README](frontend/README.md).

## Complete Workflow (First-Time Setup)

### Phase 1: Data Collection and Simulation

To collect data and run the simulation, you need to start multiple components:

```bash
# ======= Inside of the Lightning Network Simulation directory =======

# 1. (Inside of simulation directory): Start the WebSocket server (simulation side)
python scripts/websocket_server.py

# ======= Inside of the LightningLens directory =======

# 2. Start the HTTP server (receives data, serves predictions, and handles continuous learning)
python -m scripts.http_server

# 3. Start the WebSocket client (connects to simulation)
python -m scripts.websocket_client

# 4. Start the adapter proxy (transforms data between systems)
python scripts/adapter_proxy.py

# ======= Inside of the Lightning Network Simulation directory =======
# 5. Start the simulation
python scripts/simulate_network.py

# 6. Generate predictions
python -m scripts.auto_generate_predictions

# ======= Monitor and visualize the continuous learning process =======
# 7. Visualize how model recommendations evolve over time
python -m scripts.visualize_model_evolution

# 8. Generate a dashboard to monitor learning progress
python -m scripts.learning_dashboard


# 9. (Optional) Force model retraining
curl -X POST http://localhost:5001/api/retrain

# 10. (Optional) View performance metrics
curl http://localhost:5001/api/performance

# 11. (Optional) Generate and view the dashboard
curl http://localhost:5001/api/dashboard
# Then open data/dashboard/index.html in your browser



```

# If you are a first-time user, let the simulation run for at least 10 minutes to collect sufficient data. This is necessary for creating the initial model.

The components work together:

1. The **simulation** generates Lightning Network transactions and channel states
2. The **WebSocket server** broadcasts this data
3. The **WebSocket client** receives the data from the simulation
4. The **adapter proxy** transforms the data into the format needed by the model
5. The **HTTP server** stores the data and will later serve predictions

### Phase 2: Data Processing Pipeline

After collecting data, process it to train your model:

#### Step 1: Convert Raw Data to CSV

```bash
python scripts/convert_raw_data.py
```

This processes the JSON data collected during simulation and creates:

- `data/processed/transactions_YYYYMMDD_HHMMSS.csv`
- `data/processed/channel_states_YYYYMMDD_HHMMSS.csv`

#### Step 2: Transform Transaction Data

```bash
python scripts/transform_transactions.py --input data/processed/transactions_YYYYMMDD_HHMMSS.csv
```

This adds required fields to the transaction data and creates:

- `data/processed/transformed_transactions_YYYYMMDD_HHMMSS.csv`

#### Step 3: Generate Features

```bash
python scripts/generate_features.py --input data/processed/transformed_transactions_YYYYMMDD_HHMMSS.csv
```

This analyzes the transaction patterns and creates:

- `data/processed/features_YYYYMMDD_HHMMSS.csv`

#### Step 4: Train the Initial Model

```bash
python -m scripts.train_initial_model
```

This trains a machine learning model on the features and creates:

- `data/models/model_initial_YYYYMMDD_HHMMSS.pkl`
- `data/models/scaler_initial_YYYYMMDD_HHMMSS.pkl`

## Daily Usage (After Initial Setup)

If you've already completed the initial setup and have a trained model, follow these steps to start LightningLens for your daily usage:

### 1. Start the System with Your Trained Model

```bash
# Inside of the LightningLens directory:

# Terminal 1: Start the HTTP server (receives data and serves predictions)
python src/scripts/http_server.py

# Terminal 2: Start the WebSocket client (connects to simulation)
python src/scripts/websocket_client.py

# Terminal 3: Start the adapter proxy (transforms data between systems)
python src/scripts/adapter_proxy.py

# =======================================

# Inside of the Lightning Network Simulation directory:

# Terminal 1: Start the WebSocket server (simulation side)
python scripts/websocket_server.py

# Terminal 2: Start the simulation
python scripts/simulation.py

# =======================================

# Back in the LightningLens directory:

# Terminal 4: Run the prediction workflow after the simulation has been running for awhile
python -m scripts.prediction_workflow
```

### 2. Monitor and Analyze

- Check the HTTP server logs for predictions and recommendations
- Monitor the simulation for improved channel liquidity
- Visualizations will be generated in the `visualizations/` directory

### 3. Periodic Retraining (Optional)

To improve your model with new data collected during operation:

```bash
# Convert any new raw data
python scripts/convert_raw_data.py

# Transform new transaction data
python scripts/transform_transactions.py --input data/processed/transactions_YYYYMMDD_HHMMSS.csv

# Generate features from transformed data
python scripts/generate_features.py --input data/processed/transformed_transactions_YYYYMMDD_HHMMSS.csv

# Train a new model
python -m scripts.train_initial_model
```

### 4. Shutting Down

To properly shut down the system:

1. Stop the simulation
2. Stop the WebSocket server
3. Stop the adapter proxy
4. Stop the WebSocket client
5. Stop the HTTP server

## System Architecture

LightningLens and the Lightning Network simulation interact as follows:

```
┌───────────────────────────────────────────────┐      ┌─────────────────────────────────────────┐
│                                               │      │                                         │
│       Lightning Network Simulation            │      │           LightningLens Model           │
│                                               │      │                                         │
├───────────────────────────────────────────────┤      ├─────────────────────────────────────────┤
│                                               │      │                                         │
│  ┌─────────────┐       ┌─────────────┐        │      │  ┌─────────────┐       ┌─────────────┐  │
│  │             │       │             │        │      │  │             │       │             │  │
│  │  Lightning  │       │  WebSocket  │        │      │  │  WebSocket  │       │    Model    │  │
│  │    Nodes    │◄─────►│   Server    │◄───────┼──────┼─►│   Client    │◄─────►│  Processor  │  │
│  │             │       │             │        │      │  │             │       │             │  │
│  └─────────────┘       └─────────────┘        │      │  └─────────────┘       └─────────────┘  │
│         ▲                     ▲               │      │                               │         │
│         │                     │               │      │                               │         │
│         │                     │               │      │                               │         │
│         ▼                     │               │      │                               ▼         │
│  ┌─────────────┐       ┌─────────────┐        │      │  ┌─────────────┐       ┌─────────────┐  │
│  │             │       │             │        │      │  │             │       │             │  │
│  │ Transaction │       │ Rebalancing │◄───────┼──────┼──┤ Suggestions │◄──────┤   Online    │  │
│  │  Generator  │──────►│   Engine    │        │      │  │  Generator  │       │   Learner   │  │
│  │             │       │             │        │      │  │             │       │             │  │
│  └─────────────┘       └─────────────┘        │      │  └─────────────┘       └─────────────┘  │
│         │                                     │      │                               ▲         │
│         ▼                                     │      │                               │         │
│  ┌─────────────┐       ┌─────────────┐        │      │                               │         │
│  │             │       │             │        │      │                               │         │
│  │   Channel   │──────►│   Feature   │────────┼──────┼─►                             │         │
│  │    State    │       │   Adapter   │        │      │                               │         │
│  │             │       │             │        │      │                               │         │
│  └─────────────┘       └─────────────┘        │      │                               │         │
│                                               │      │                               │         │
└───────────────────────────────────────────────┘      └───────────────────────────────┼─────────┘
                                                                                       │
                                                                              ┌────────┴─────────┐
                                                                              │                  │
                                                                              │  Trained Model   │
                                                                              │    & Scaler      │
                                                                              │                  │
                                                                              └──────────────────┘
```

### Component Roles

1. **WebSocket Server**: Broadcasts simulation data (transactions, channel states)
2. **WebSocket Client**: Receives data from the simulation
3. **Adapter Proxy**: Transforms data between simulation and model formats
4. **HTTP Server**: Hosts the model and serves predictions
5. **Simulation**: Generates realistic Lightning Network behavior

### Data Flow

1. **Simulation to Model:**

   - Channel state updates (balances, capacities)
   - Transaction data (sender, receiver, amount, success)
   - Network topology information

2. **Model to Simulation:**
   - Rebalancing suggestions (source node, target node, amount)
   - Confidence scores for each suggestion
   - Optimal balance ratios for each channel

## Improving Your Model

### Collect More Data

The more data you have, the better your model will perform:

1. Run your simulation longer
2. Process more HTTP data files
3. Retrain your model with the larger dataset

### Benefits of More Data

- **Better pattern recognition**: More transactions reveal more patterns
- **More diverse scenarios**: Different network conditions and transaction patterns
- **Higher accuracy**: More training examples lead to better predictions
- **Better generalization**: Less overfitting to specific patterns

### Retraining with New Data

When you have new data:

```bash
# Example workflow with new data
python scripts/convert_raw_data.py
python scripts/transform_transactions.py --input data/processed/transactions_YYYYMMDD_HHMMSS.csv
python scripts/generate_features.py --input data/processed/transformed_transactions_YYYYMMDD_HHMMSS.csv
python -m scripts.train_initial_model
```

## Continuous Learning System

Lightning Lens includes a sophisticated continuous learning system that automatically improves the model as new data becomes available. The system:

1. **Collects Data**: Continuously gathers channel state and transaction data
2. **Generates Predictions**: Regularly predicts optimal channel balances
3. **Retrains the Model**: Automatically retrains on new data every 30 minutes
4. **Adapts Learning Rate**: Adjusts how quickly the model learns based on performance
5. **Tracks Performance**: Monitors how well the model is performing over time
6. **Visualizes Progress**: Creates charts showing how the model evolves

### Monitoring the Learning Process

You can monitor the continuous learning process in several ways:

1. **Dashboard**: Access the learning dashboard at `http://localhost:5000/api/dashboard`
2. **Performance Metrics**: Check current performance at `http://localhost:5000/api/performance`
3. **Prediction Files**: Review prediction files in `data/predictions/`
4. **Visualizations**: See model evolution charts in `data/visualizations/`

### Manually Triggering Actions

You can manually trigger various actions:

- **Generate Predictions**: `python -m scripts.generate_predictions`
- **Visualize Evolution**: `python -m scripts.visualize_model_evolution`
- **Generate Dashboard**: `python -m scripts.learning_dashboard`
- **Force Retraining**: `curl -X POST http://localhost:5000/api/retrain`

## Troubleshooting

### Missing Fields in Transaction Data

If you get a `KeyError` for fields like 'sender' or 'receiver':

```bash
python scripts/transform_transactions.py --input data/processed/transactions_YYYYMMDD_HHMMSS.csv
```

### Input Parameter Not Recognized

If the script ignores your input parameter:

```bash
python scripts/final_fix.py
```

### Checking Transaction Data Format

To validate your transaction data:

```bash
python scripts/check_transaction_fields.py --input your_file.csv
```

### WebSocket Connection Issues

If the WebSocket client can't connect to the server:

1. Ensure the WebSocket server is running
2. Check that the port numbers match (default: 8765)
3. Verify there are no firewall issues blocking the connection

### Adapter Proxy Problems

If data isn't being properly transformed:

1. Check the adapter logs for errors
2. Verify the data format from the simulation
3. Ensure the adapter is configured to match both systems

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

### Visualization

After analysis, you'll find visualization files in the `visualizations/` directory:

- Balance distribution charts
- Optimal vs. current balance comparisons
- Rebalancing recommendations
- Feature importance analysis
- Detailed recommendation reports

## Prediction Workflow

LightningLens provides a streamlined workflow for generating predictions, creating visualizations, and managing prediction files:

### Complete Workflow

Run the complete workflow with a single command:

```bash
# Run the default workflow (generate 1 prediction, visualize, and keep 20 most recent files)
python -m scripts.prediction_workflow

# Generate multiple predictions with a 10-minute interval
python -m scripts.prediction_workflow --count 3 --interval 10

# Generate detailed visualizations
python -m scripts.prediction_workflow --detailed

# Archive old files instead of deleting them
python -m scripts.prediction_workflow --archive
```

### Customizing the Workflow

You can skip specific steps of the workflow:

```bash
# Skip prediction generation (only visualize and archive)
python -m scripts.prediction_workflow --skip-generate

# Skip visualization (only generate and archive)
python -m scripts.prediction_workflow --skip-visualize

# Skip archiving (only generate and visualize)
python -m scripts.prediction_workflow --skip-archive
```

### Managing Prediction Files

To manually manage prediction files:

```bash
# Keep the 20 most recent prediction files and delete the rest
python -m scripts.archive_predictions --keep 20

# Archive old files instead of deleting them
python -m scripts.archive_predictions --keep 20 --archive
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License
