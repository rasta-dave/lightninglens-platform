#!/usr/bin/env python3
"""
HTTP Server for LightningLens

This script starts an HTTP server that receives channel state and transaction updates,
processes them using the model, and provides recommendations.
"""

import os
import sys
import argparse
import logging
import json
import pickle
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS  # Import CORS
import pandas as pd
import numpy as np

# Add path handling for data and config files
import os

# First try the absolute path to the root data directory
ROOT_DATA_DIR = '/media/shahazzad/new1/KOD/LIGHTNING-LENS/data'
ROOT_CONFIG_DIR = '/media/shahazzad/new1/KOD/LIGHTNING-LENS/configs'

# Function to find a file or directory in data locations
def get_data_path(relative_path):
    # Try root location first
    root_path = os.path.join(ROOT_DATA_DIR, relative_path)
    if os.path.exists(root_path):
        return root_path
        
    # Fall back to package path if it exists
    package_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'data', relative_path
    )
    if os.path.exists(package_path):
        return package_path
        
    # Default to root path even if it doesn't exist yet
    return root_path

# Function to find config files
def get_config_path(config_file):
    # Try root location first
    root_config = os.path.join(ROOT_CONFIG_DIR, config_file)
    if os.path.exists(root_config):
        return root_config
        
    # Fall back to package path
    package_config = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'configs', config_file
    )
    if os.path.exists(package_config):
        return package_config
        
    return root_config

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import the model and online learning modules
try:
    # Try the direct import first
    from src.models.online_learner import OnlineLearner
except ModuleNotFoundError:
    # Fallback to other import paths
    try:
        from lightning_lens.src.models.online_learner import OnlineLearner
    except ModuleNotFoundError:
        from ..src.models.online_learner import OnlineLearner

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("lightning_lens_http.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("LightningLensHTTP")

app = Flask(__name__)

# Enable CORS for all routes
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Add CORS headers to every response
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# Add a status endpoint for health checks
@app.route('/api/status', methods=['GET'])
def api_status():
    """
    Return the status of the API server for health checks
    Used by monitoring tools and the startup script to verify the server is running
    """
    return jsonify({
        'status': 'online',
        'timestamp': datetime.now().isoformat(),
        'model_loaded': model is not None,
        'version': '1.0.0'
    })

@app.route('/api/update-parameters', methods=['POST'])
def update_parameters():
    """
    Receive parameter recommendations from the auto-learning system
    These parameters can be used to optimize the simulation's rebalancing strategy
    """
    try:
        data = request.json
        logger.info(f"Received parameter recommendations: {data}")
        
        # Save the recommendations to a file
        os.makedirs(get_data_path('recommendations'), exist_ok=True)
        with open(get_data_path('recommendations/latest.json'), 'w') as f:
            json.dump(data, f, indent=2)
            
        # Forward the recommendations to the simulation if needed
        try:
            # This would be implemented if the simulation has an API endpoint for this
            pass
        except Exception as e:
            logger.warning(f"Error forwarding recommendations to simulation: {str(e)}")
            
        return jsonify({
            'status': 'success',
            'message': 'Parameter recommendations received and saved'
        })
    except Exception as e:
        logger.error(f"Error processing parameter recommendations: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/anomaly-alert', methods=['POST'])
def anomaly_alert():
    """
    Receive anomaly alerts from the auto-learning system
    These alerts can be used to trigger targeted rebalancing in the simulation
    """
    try:
        data = request.json
        logger.info(f"Received anomaly alert: {data}")
        
        # Save the alert to a file
        os.makedirs(get_data_path('alerts'), exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(get_data_path(f'alerts/anomaly_{timestamp}.json'), 'w') as f:
            json.dump(data, f, indent=2)
            
        # Forward the alert to the simulation if needed
        try:
            # This would be implemented if the simulation has an API endpoint for this
            pass
        except Exception as e:
            logger.warning(f"Error forwarding anomaly alert to simulation: {str(e)}")
            
        return jsonify({
            'status': 'success',
            'message': 'Anomaly alert received and saved'
        })
    except Exception as e:
        logger.error(f"Error processing anomaly alert: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# Global variables
model = None
online_learner = None
data_buffer = []
last_save_time = time.time()
last_retrain_time = time.time()
transaction_success_rates = []  # Track success rates over time
model_performance_metrics = []  # Track various performance metrics

# Try to import the learning_dashboard module, but gracefully handle if it's not available
try:
    from scripts.learning_dashboard.predictions import get_predictions, get_metrics
    LEARNING_DASHBOARD_AVAILABLE = True
    logger.info("Learning dashboard module loaded successfully")
except ImportError as e:
    logger.warning(f"Learning dashboard module not available: {e}")
    LEARNING_DASHBOARD_AVAILABLE = False
    
    # Define dummy functions for predictions and metrics
    def get_predictions():
        return []
        
    def get_metrics():
        return {}

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='LightningLens HTTP Server')
    parser.add_argument('--model', type=str, default='data/models/model_initial_20250305_144628.pkl',
                        help='Path to the trained model file')
    parser.add_argument('--port', type=int, default=5002,
                        help='Port to run the HTTP server on')
    return parser.parse_args()

def load_model(model_path=None):
    """Load a trained ML model for prediction"""
    if model_path is None:
        model_path = get_data_path('models/model_initial_20250305_144628.pkl')
    
    logger.info(f"Using model: {model_path}")
    try:
        with open(model_path, 'rb') as f:
            model = pickle.load(f)
        return model
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")
        return None

def save_data():
    """Save received channel data to disk"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = get_data_path(f'raw/http_data_{timestamp}.json')
    
    # Make sure the directory exists
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    with open(filename, 'w') as f:
        json.dump(data_buffer, f)
    logger.info(f"Saved data to {filename}")
    
    return filename

def retrain_model():
    """Retrain the model using accumulated data"""
    global model, online_learner, last_retrain_time, model_performance_metrics
    
    if not online_learner:
        return
    
    try:
        # Calculate current performance metrics before retraining
        current_metrics = calculate_performance_metrics()
        
        # Retrain the model
        logger.info("Retraining model with new data...")
        online_learner.retrain()
        model = online_learner.get_model()
        
        # Save the retrained model
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_filename = f"data/models/model_retrained_{timestamp}.pkl"
        scaler_filename = f"data/models/scaler_retrained_{timestamp}.pkl"
        
        os.makedirs(os.path.dirname(model_filename), exist_ok=True)
        
        with open(model_filename, 'wb') as f:
            pickle.dump(model, f)
        
        # Save the scaler if available
        if hasattr(online_learner, 'scaler') and online_learner.scaler is not None:
            with open(scaler_filename, 'wb') as f:
                pickle.dump(online_learner.scaler, f)
            logger.info(f"Scaler saved to {scaler_filename}")
        
        logger.info(f"Retrained model saved to {model_filename}")
        last_retrain_time = time.time()
        
        # Calculate new performance metrics after retraining
        new_metrics = calculate_performance_metrics()
        
        # Calculate improvement
        improvement = {
            'timestamp': timestamp,
            'before': current_metrics,
            'after': new_metrics,
            'improvement': {
                k: new_metrics.get(k, 0) - current_metrics.get(k, 0)
                for k in new_metrics.keys()
            }
        }
        
        # Store metrics
        model_performance_metrics.append(improvement)
        
        # Save metrics to file
        with open('data/models/performance_metrics.json', 'w') as f:
            json.dump(model_performance_metrics, f, indent=2)
        
        # Log improvement
        logger.info(f"Model improvement: {improvement['improvement']}")
        
    except Exception as e:
        logger.error(f"Error retraining model: {str(e)}")

def calculate_performance_metrics():
    """Calculate current model performance metrics"""
    try:
        # Get the latest predictions
        latest_predictions = pd.read_csv('data/predictions/latest_predictions.csv')
        
        # Calculate metrics
        metrics = {
            'avg_adjustment': abs(latest_predictions['adjustment_needed']).mean(),
            'max_adjustment': abs(latest_predictions['adjustment_needed']).max(),
            'balanced_channels': (abs(latest_predictions['adjustment_needed']) < 0.1).mean(),
            'severely_imbalanced': (abs(latest_predictions['adjustment_needed']) > 0.4).mean()
        }
        
        return metrics
    except Exception as e:
        logger.error(f"Error calculating performance metrics: {str(e)}")
        return {}

def background_tasks():
    """Run background tasks periodically"""
    global model, online_learner, last_save_time, last_retrain_time
    
    last_prediction_time = 0
    prediction_interval = 300  # Generate predictions every 5 minutes
    
    while True:
        # Save data every 5 minutes
        if time.time() - last_save_time >= 300:  # 5 minutes
            save_data()
        
        # Retrain model every 30 minutes
        if time.time() - last_retrain_time >= 1800:  # 30 minutes
            retrain_model()
        
        # Generate predictions periodically
        current_time = time.time()
        if current_time - last_prediction_time > prediction_interval:
            try:
                logger.info("Generating predictions...")
                # Import here to avoid circular imports
                from scripts.generate_predictions import generate_predictions
                if generate_predictions():
                    logger.info("Predictions generated successfully")
                    
                    # Also generate visualizations
                    try:
                        from scripts.visualize_model_evolution import visualize_model_evolution
                        if visualize_model_evolution():
                            logger.info("Model evolution visualizations generated")
                    except Exception as viz_error:
                        logger.error(f"Error generating visualizations: {str(viz_error)}")
                else:
                    logger.warning("Failed to generate predictions")
                last_prediction_time = current_time
            except Exception as e:
                logger.error(f"Error generating predictions: {str(e)}")
        
        time.sleep(10)  # Check every 10 seconds

@app.route('/api/update', methods=['POST'])
def update():
    """Receive channel state or transaction updates"""
    try:
        data = request.json
        event_type = data.get('event_type', 'unknown')
        
        logger.info(f"Received {event_type} update")
        
        # Add to data buffer
        data_buffer.append(data)
        
        # Process with model
        if model and online_learner:
            try:
                # Prepare features manually since OnlineLearner doesn't have prepare_features
                features = [
                    data.get('capacity', 0),
                    data.get('local_balance', 0),
                    data.get('remote_balance', 0),
                    data.get('balance_ratio', 0.0),
                    data.get('tx_count', 0),
                    data.get('success_rate', 1.0),
                    data.get('avg_amount', 0)
                ]
                
                # Make prediction
                prediction = model.predict([features])[0]
                
                # Update model with new data (if update method exists)
                if hasattr(online_learner, 'update'):
                    online_learner.update(features, prediction)
                
                return jsonify({
                    "status": "success",
                    "prediction": float(prediction),
                    "message": "Update processed successfully"
                })
            
            except Exception as e:
                logger.error(f"Error preparing features: {str(e)}")
                return jsonify({
                    "status": "success",
                    "message": "Update received but not processed due to feature mismatch"
                })
        
        return jsonify({
            "status": "success",
            "message": "Update received"
        })
    
    except Exception as e:
        logger.error(f"Error processing update: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/performance', methods=['GET'])
def get_performance():
    """Get model performance metrics."""
    try:
        if not LEARNING_DASHBOARD_AVAILABLE:
            logger.warning("Learning dashboard module not available for performance metrics")
            return jsonify({
                "status": "info",
                "message": "No performance metrics available yet"
            })
            
        # Get metrics using the learning_dashboard module
        metrics = get_metrics()
        
        if not metrics:
            return jsonify({
                "status": "info",
                "message": "No performance metrics available yet"
            })
            
        # Return the metrics
        return jsonify({
            "status": "success",
            "metrics": metrics
        })
        
    except Exception as e:
        logger.error(f"Error getting performance metrics: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        })

@app.route('/api/dashboard', methods=['GET'])
def generate_dashboard():
    """Generate a dashboard of predictions and recommendations."""
    try:
        if not LEARNING_DASHBOARD_AVAILABLE:
            logger.warning("Learning dashboard module not available for dashboard generation")
            return jsonify({
                "status": "error",
                "message": "Learning dashboard module not available",
                "predictions": []
            })
            
        # Get predictions using the learning_dashboard module
        predictions = get_predictions()
        
        # Return the predictions
        return jsonify({
            "status": "success",
            "predictions": predictions
        })
        
    except Exception as e:
        logger.error(f"Error generating dashboard: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e),
            "predictions": []
        })

@app.route('/api/network/state', methods=['GET'])
def get_network_state():
    """Return the current network state for the frontend"""
    try:
        # Create a response with channels and transactions
        # This is the main endpoint the frontend uses for initial data
        response = {
            "status": "success",
            "channels": {},  # Initialize with empty channels
            "transactions": [],  # Initialize with empty transactions
            "nodes": ["lnd-alice", "lnd-bob", "lnd-carol", "lnd-dave", "lnd-eve"],  # Example nodes
            "simulationStatus": "running"
        }
        
        # Add mock channels if we don't have real data yet
        if not response["channels"]:
            # Create some mock channel data
            nodes = response["nodes"]
            mock_channels = {}
            
            for i, node in enumerate(nodes):
                # Connect each node to 2 others
                next_node = nodes[(i + 1) % len(nodes)]
                next_next_node = nodes[(i + 2) % len(nodes)]
                
                # First channel
                mock_channels[f"{node}-{next_node}"] = {
                    "capacity": 1000000,
                    "localBalance": 500000,
                    "remoteBalance": 500000,
                    "percentageUtilized": 50,
                    "timestamp": datetime.now().isoformat()
                }
                
                # Second channel
                mock_channels[f"{node}-{next_next_node}"] = {
                    "capacity": 1000000,
                    "localBalance": 600000,
                    "remoteBalance": 400000,
                    "percentageUtilized": 60,
                    "timestamp": datetime.now().isoformat()
                }
            
            response["channels"] = mock_channels
        
        # Add mock transactions if we don't have real data
        if not response["transactions"]:
            # Create some mock transactions
            mock_transactions = []
            nodes = response["nodes"]
            
            for i in range(20):
                sender = nodes[i % len(nodes)]
                receiver = nodes[(i + 2) % len(nodes)]
                
                # Use datetime.now() - timedelta(minutes=i) for the timestamp
                timestamp = (datetime.now() - timedelta(minutes=i)).isoformat()
                
                mock_transactions.append({
                    "id": f"mock-tx-{i}",
                    "timestamp": timestamp,
                    "sender": sender,
                    "receiver": receiver,
                    "amount": 50000 + (i * 1000),
                    "fee": 100 + (i * 10),
                    "type": "regular",
                    "status": "success" if i % 4 != 0 else "failed",
                    "route": [sender, nodes[(i + 1) % len(nodes)], receiver]
                })
            
            response["transactions"] = mock_transactions
        
        return jsonify(response)
    
    except Exception as e:
        logger.error(f"Error getting network state: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

def main():
    """Main function"""
    global model, online_learner
    
    # Parse command line arguments
    args = parse_args()
    
    # Load the model
    model = load_model(args.model)
    
    # Initialize online learning with custom parameters
    online_learner = OnlineLearner(
        model_path=args.model,
        buffer_size=500,           # Increase for more data before retraining
        min_samples_for_update=50, # Minimum samples needed to trigger retraining
        update_interval=15         # Minutes between update attempts
    )
    logger.info("Initialized online learning module")
    
    # Load the model again (in case online_learner modified it)
    model = load_model(args.model)
    
    # Start background tasks
    bg_thread = threading.Thread(target=background_tasks, daemon=True)
    bg_thread.start()
    logger.info("Background tasks started")
    
    # Start the Flask app
    app.run(host='0.0.0.0', port=args.port, debug=False)

if __name__ == "__main__":
    main() 