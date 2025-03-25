#!/usr/bin/env python3
"""
Enhanced HTTP Server for LightningLens

This script provides an enhanced HTTP API with real-time data streaming capabilities
for the Lightning Lens dashboard. It integrates with the real-time data server
to provide live updates to the frontend.
"""

import os
import sys
import argparse
import logging
import json
import pickle
import threading
import time
import queue
import importlib.util
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import pandas as pd
import numpy as np

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/enhanced_http_server.log", mode='a'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("EnhancedHTTPServer")

# Try to import the learning_dashboard module
try:
    from scripts.learning_dashboard.predictions import get_predictions as dashboard_get_predictions
    from scripts.learning_dashboard.predictions import get_metrics as dashboard_get_metrics
    from scripts.learning_dashboard.predictions import predict_optimal_balance
    LEARNING_DASHBOARD_AVAILABLE = True
    logger.info("Learning dashboard module loaded successfully")
except ImportError as e:
    logger.warning(f"Learning dashboard module not available: {e}")
    LEARNING_DASHBOARD_AVAILABLE = False
    
    # Define dummy functions for predictions and metrics
    def dashboard_get_predictions():
        return []
        
    def dashboard_get_metrics():
        return {}
        
    def predict_optimal_balance(local_balance, remote_balance, capacity):
        return capacity / 2  # Default to 50/50 balance

# Configuration
HOST = '0.0.0.0'  # Listen on all interfaces
PORT = 5000       # Default port
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',  # Allow all origins
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}
ROOT_DATA_DIR = '/media/shahazzad/new3/KOD/LIGHTNING-LENS/data'
ROOT_CONFIG_DIR = '/media/shahazzad/new3/KOD/LIGHTNING-LENS/configs'

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

# Try to import the real-time data server
realtime_server = None
try:
    # Try to import the realtime_data_server module
    spec = importlib.util.spec_from_file_location(
        "realtime_data_server", 
        os.path.join(os.path.dirname(__file__), "realtime_data_server.py")
    )
    realtime_server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(realtime_server)
    logger.info("Successfully imported realtime_data_server module")
except Exception as e:
    logger.warning(f"Could not import realtime_data_server module: {str(e)}")
    realtime_server = None

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

# Make sure logs directory exists
os.makedirs("logs", exist_ok=True)
logger = logging.getLogger("EnhancedHTTPServer")

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

# Global variables
model = None
online_learner = None
data_buffer = []
buffer_lock = threading.Lock()
last_model_update = None
performance_metrics = {
    'accuracy': 0.0,
    'precision': 0.0,
    'recall': 0.0,
    'f1_score': 0.0,
    'last_updated': None
}

# Event queues for SSE
sse_clients = {
    'network': queue.Queue(),
    'transactions': queue.Queue(),
    'channels': queue.Queue(),
    'metrics': queue.Queue(),
    'predictions': queue.Queue(),
    'anomalies': queue.Queue(),
    'learning': queue.Queue()
}

# Cache for the latest data
data_cache = {
    'network_state': {},
    'transactions': [],
    'channel_balances': {},
    'metrics': {},
    'predictions': [],
    'anomalies': [],
    'learning_metrics': {}
}

# Import asyncio for event loop handling
import asyncio

# Function to push updates to the real-time data server
def push_to_realtime_server(update_type, data):
    """Push updates to the real-time data server if available"""
    if realtime_server:
        try:
            # Store the data in the appropriate cache
            if update_type == 'network_state':
                realtime_server.network_state = data
            elif update_type == 'transactions':
                realtime_server.transactions = data
            elif update_type == 'channels':
                realtime_server.channel_balances = data
            elif update_type == 'metrics':
                realtime_server.metrics = data
            elif update_type == 'predictions':
                realtime_server.predictions = data
            elif update_type == 'anomalies':
                realtime_server.anomalies = data
            elif update_type == 'learning':
                realtime_server.learning_metrics = data
            
            # Log the update
            logger.info(f"Updated {update_type} data in real-time server cache")
        except Exception as e:
            logger.error(f"Error pushing to real-time data server: {str(e)}")

# Function to push updates to SSE clients
def push_to_sse(update_type, data):
    """Push updates to SSE clients"""
    if update_type in sse_clients:
        message = json.dumps({
            'type': update_type,
            'data': data,
            'timestamp': datetime.now().isoformat()
        })
        sse_clients[update_type].put(message)

# API endpoint for server status
@app.route('/api/status', methods=['GET'])
def api_status():
    """Return the status of the API server"""
    return jsonify({
        'status': 'online',
        'version': '2.0.0',
        'timestamp': datetime.now().isoformat(),
        'features': {
            'real_time': realtime_server is not None,
            'sse': True,
            'model_version': getattr(model, 'version', 'unknown') if model else 'not_loaded',
            'online_learning': online_learner is not None
        }
    })

# API endpoint for receiving parameter updates from auto-learning system
@app.route('/api/update-parameters', methods=['POST'])
def update_parameters():
    """Receive parameter recommendations from the auto-learning system"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Log the received parameters
        logger.info(f"Received parameter update: {data}")
        
        # Store the parameters
        parameter_file = get_data_path('parameters/latest_recommendations.json')
        os.makedirs(os.path.dirname(parameter_file), exist_ok=True)
        
        with open(parameter_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        # Push to real-time data server
        push_to_realtime_server('learning', {
            'type': 'parameter_update',
            'parameters': data,
            'timestamp': datetime.now().isoformat()
        })
        
        # Push to SSE clients
        push_to_sse('learning', {
            'type': 'parameter_update',
            'parameters': data,
            'timestamp': datetime.now().isoformat()
        })
        
        return jsonify({
            'status': 'success',
            'message': 'Parameters updated successfully',
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error updating parameters: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for receiving anomaly alerts
@app.route('/api/anomaly-alert', methods=['POST'])
def anomaly_alert():
    """Receive anomaly alerts from the auto-learning system"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Log the received anomaly
        logger.info(f"Received anomaly alert: {data}")
        
        # Add timestamp if not present
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now().isoformat()
        
        # Store the anomaly
        anomaly_file = get_data_path('anomalies/latest_anomalies.json')
        os.makedirs(os.path.dirname(anomaly_file), exist_ok=True)
        
        # Load existing anomalies
        existing_anomalies = []
        if os.path.exists(anomaly_file):
            try:
                with open(anomaly_file, 'r') as f:
                    existing_anomalies = json.load(f)
            except:
                existing_anomalies = []
        
        # Add new anomaly
        if not isinstance(existing_anomalies, list):
            existing_anomalies = []
        
        existing_anomalies.append(data)
        
        # Keep only the last 100 anomalies
        existing_anomalies = existing_anomalies[-100:]
        
        with open(anomaly_file, 'w') as f:
            json.dump(existing_anomalies, f, indent=2)
        
        # Push to real-time data server
        push_to_realtime_server('anomalies', data)
        
        # Push to SSE clients
        push_to_sse('anomalies', data)
        
        return jsonify({
            'status': 'success',
            'message': 'Anomaly alert received',
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error processing anomaly alert: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for network state
@app.route('/api/network_state', methods=['GET'])
def get_network_state():
    """Return the current network state for the frontend"""
    try:
        # Get the latest network state
        network_state = {}
        
        # Load channel balances
        channel_file = get_data_path('channels/latest_channel_state.json')
        if os.path.exists(channel_file):
            try:
                with open(channel_file, 'r') as f:
                    channel_balances = json.load(f)
                network_state['channelBalances'] = channel_balances
            except Exception as e:
                logger.error(f"Error loading channel state: {str(e)}")
                network_state['channelBalances'] = {}
        else:
            network_state['channelBalances'] = {}
        
        # Load transactions
        tx_file = get_data_path('transactions/latest_transactions.json')
        if os.path.exists(tx_file):
            try:
                with open(tx_file, 'r') as f:
                    transactions = json.load(f)
                network_state['transactions'] = transactions
            except Exception as e:
                logger.error(f"Error loading transactions: {str(e)}")
                network_state['transactions'] = []
        else:
            network_state['transactions'] = []
        
        # Load nodes
        nodes_file = get_data_path('nodes/latest_nodes.json')
        if os.path.exists(nodes_file):
            try:
                with open(nodes_file, 'r') as f:
                    nodes = json.load(f)
                network_state['nodes'] = nodes
            except Exception as e:
                logger.error(f"Error loading nodes: {str(e)}")
                network_state['nodes'] = []
        else:
            network_state['nodes'] = []
        
        # Get simulation status
        status_file = get_data_path('status/simulation_status.json')
        if os.path.exists(status_file):
            try:
                with open(status_file, 'r') as f:
                    status = json.load(f)
                network_state['status'] = status.get('status', 'unknown')
            except Exception as e:
                logger.error(f"Error loading simulation status: {str(e)}")
                network_state['status'] = 'unknown'
        else:
            network_state['status'] = 'unknown'
        
        # Add timestamp
        network_state['timestamp'] = datetime.now().isoformat()
        
        # Update cache
        data_cache['network_state'] = network_state
        
        return jsonify(network_state)
    
    except Exception as e:
        logger.error(f"Error getting network state: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for channel balances
@app.route('/api/channel_balances', methods=['GET'])
def get_channel_balances():
    """Return the current channel balances"""
    try:
        # Load channel balances
        channel_file = get_data_path('channels/latest_channel_state.json')
        if os.path.exists(channel_file):
            try:
                with open(channel_file, 'r') as f:
                    channel_balances = json.load(f)
            except Exception as e:
                logger.error(f"Error loading channel state: {str(e)}")
                channel_balances = {}
        else:
            channel_balances = {}
        
        # Update cache
        data_cache['channel_balances'] = channel_balances
        
        return jsonify({
            'channelBalances': channel_balances,
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting channel balances: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for transactions
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Return transactions with optional filtering and pagination"""
    try:
        # Get query parameters
        limit = request.args.get('limit', default=100, type=int)
        offset = request.args.get('offset', default=0, type=int)
        status = request.args.get('status', default=None, type=str)
        
        # Load transactions
        tx_file = get_data_path('transactions/latest_transactions.json')
        if os.path.exists(tx_file):
            try:
                with open(tx_file, 'r') as f:
                    transactions = json.load(f)
            except Exception as e:
                logger.error(f"Error loading transactions: {str(e)}")
                transactions = []
        else:
            transactions = []
        
        # Apply filters
        if status:
            transactions = [tx for tx in transactions if tx.get('status') == status]
        
        # Get total count
        total_count = len(transactions)
        
        # Apply pagination
        transactions = transactions[offset:offset+limit]
        
        # Update cache
        if not status and offset == 0:
            data_cache['transactions'] = transactions
        
        return jsonify({
            'transactions': transactions,
            'count': len(transactions),
            'total': total_count,
            'offset': offset,
            'limit': limit,
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting transactions: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for model predictions
@app.route('/api/predictions', methods=['GET'])
def get_predictions():
    """Get model predictions for channel balances"""
    try:
        channel_id = request.args.get('channel_id')
        
        if LEARNING_DASHBOARD_AVAILABLE:
            # Get predictions from the learning dashboard module
            predictions = dashboard_get_predictions()
            
            # Filter by channel_id if provided
            if channel_id:
                predictions = [p for p in predictions if p.get('channel_id') == channel_id]
            
            return jsonify({
                'status': 'success',
                'predictions': predictions,
                'timestamp': datetime.now().isoformat()
            })
        else:
            # Fallback to cached predictions if available
            if data_cache['predictions']:
                predictions = data_cache['predictions']
                if channel_id:
                    predictions = [p for p in predictions if p.get('channel_id') == channel_id]
                
                return jsonify({
                    'status': 'success',
                    'predictions': predictions,
                    'timestamp': datetime.now().isoformat()
                })
            else:
                return jsonify({
                    'status': 'info',
                    'message': 'No predictions available yet',
                    'timestamp': datetime.now().isoformat()
                })
    except Exception as e:
        logger.error(f"Error getting predictions: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        })

# API endpoint for model performance metrics
@app.route('/api/performance', methods=['GET'])
def get_performance():
    """Get model performance metrics"""
    try:
        if LEARNING_DASHBOARD_AVAILABLE:
            # Get metrics using the learning_dashboard module
            metrics = dashboard_get_metrics()
            
            if metrics:
                # Update the cache
                data_cache['metrics'] = metrics
                
                # Push to real-time server
                push_to_realtime_server('metrics', metrics)
                
                # Push to SSE clients
                push_to_sse('metrics', metrics)
                
                return jsonify({
                    'status': 'success',
                    'metrics': metrics,
                    'timestamp': datetime.now().isoformat()
                })
            else:
                return jsonify({
                    'status': 'info',
                    'message': 'No performance metrics available yet',
                    'timestamp': datetime.now().isoformat()
                })
        else:
            # Fallback to cached metrics if available
            if data_cache['metrics']:
                return jsonify({
                    'status': 'success',
                    'metrics': data_cache['metrics'],
                    'timestamp': datetime.now().isoformat()
                })
            else:
                return jsonify({
                    'status': 'info',
                    'message': 'No performance metrics available yet',
                    'timestamp': datetime.now().isoformat()
                })
    except Exception as e:
        logger.error(f"Error getting performance metrics: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        })

# API endpoint for anomalies
@app.route('/api/anomalies', methods=['GET'])
def get_anomalies():
    """Return detected anomalies"""
    try:
        # Load anomalies
        anomaly_file = get_data_path('anomalies/latest_anomalies.json')
        if os.path.exists(anomaly_file):
            try:
                with open(anomaly_file, 'r') as f:
                    anomalies = json.load(f)
            except Exception as e:
                logger.error(f"Error loading anomalies: {str(e)}")
                anomalies = []
        else:
            anomalies = []
        
        # Update cache
        data_cache['anomalies'] = anomalies
        
        return jsonify({
            'anomalies': anomalies,
            'count': len(anomalies),
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting anomalies: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for learning metrics
@app.route('/api/learning_metrics', methods=['GET'])
def get_learning_metrics():
    """Return learning system metrics"""
    try:
        # Load learning metrics
        metrics_file = get_data_path('learning/learning_metrics.json')
        if os.path.exists(metrics_file):
            try:
                with open(metrics_file, 'r') as f:
                    learning_metrics = json.load(f)
            except Exception as e:
                logger.error(f"Error loading learning metrics: {str(e)}")
                learning_metrics = {}
        else:
            learning_metrics = {}
        
        # Add default values if not present
        if 'model_version' not in learning_metrics:
            learning_metrics['model_version'] = getattr(model, 'version', 'unknown') if model else 'not_loaded'
        
        if 'last_update' not in learning_metrics:
            learning_metrics['last_update'] = last_model_update.isoformat() if last_model_update else None
        
        if 'learning_rate' not in learning_metrics:
            learning_metrics['learning_rate'] = getattr(online_learner, 'learning_rate', 0.01) if online_learner else 0.01
        
        # Update cache
        data_cache['learning_metrics'] = learning_metrics
        
        return jsonify({
            'metrics': learning_metrics,
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting learning metrics: {str(e)}")
        return jsonify({'error': str(e)}), 500

# API endpoint for dashboard data
@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_data():
    """Get all data needed for the dashboard"""
    try:
        # Collect all the data
        data = {
            'network_state': data_cache['network_state'],
            'transactions': data_cache['transactions'][-50:] if data_cache['transactions'] else [],
            'channel_balances': data_cache['channel_balances'],
            'metrics': data_cache['metrics'],
            'anomalies': data_cache['anomalies'],
            'learning_metrics': data_cache['learning_metrics'],
        }
        
        # Add predictions
        if LEARNING_DASHBOARD_AVAILABLE:
            data['predictions'] = dashboard_get_predictions()
        else:
            data['predictions'] = data_cache['predictions']
            
        # Calculate optimal balances for channels
        if 'channel_balances' in data and data['channel_balances']:
            for channel_id, channel_data in data['channel_balances'].items():
                try:
                    local_balance = channel_data.get('local_balance', 0)
                    remote_balance = channel_data.get('remote_balance', 0)
                    capacity = channel_data.get('capacity', local_balance + remote_balance)
                    
                    # Calculate optimal balance
                    optimal_balance = predict_optimal_balance(local_balance, remote_balance, capacity)
                    
                    # Add to channel data
                    channel_data['optimal_balance'] = optimal_balance
                    channel_data['balance_diff'] = abs(local_balance - optimal_balance)
                    channel_data['balance_diff_percent'] = (abs(local_balance - optimal_balance) / capacity) * 100 if capacity > 0 else 0
                    
                except Exception as e:
                    logger.error(f"Error calculating optimal balance for channel {channel_id}: {str(e)}")
        
        return jsonify({
            'status': 'success',
            'data': data,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting dashboard data: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'timestamp': datetime.now().isoformat()
        })

# API endpoint for SSE
@app.route('/api/events/<stream_type>', methods=['GET'])
def stream_events(stream_type):
    """Stream events using Server-Sent Events (SSE)"""
    if stream_type not in sse_clients:
        return jsonify({'error': 'Invalid stream type'}), 400
    
    def event_stream():
        client_queue = queue.Queue()
        
        # Add this client's queue to the set of queues for this stream type
        sse_clients[stream_type] = client_queue
        
        try:
            # Send initial data
            if stream_type == 'network':
                yield f"data: {json.dumps(data_cache['network_state'])}\n\n"
            elif stream_type == 'transactions':
                yield f"data: {json.dumps(data_cache['transactions'][-100:])}\n\n"
            elif stream_type == 'channels':
                yield f"data: {json.dumps(data_cache['channel_balances'])}\n\n"
            elif stream_type == 'metrics':
                yield f"data: {json.dumps(data_cache['metrics'])}\n\n"
            elif stream_type == 'predictions':
                yield f"data: {json.dumps(data_cache['predictions'])}\n\n"
            elif stream_type == 'anomalies':
                yield f"data: {json.dumps(data_cache['anomalies'])}\n\n"
            elif stream_type == 'learning':
                yield f"data: {json.dumps(data_cache['learning_metrics'])}\n\n"
            
            # Stream events
            while True:
                message = client_queue.get()
                yield f"data: {message}\n\n"
        
        except GeneratorExit:
            # Client disconnected
            if stream_type in sse_clients:
                del sse_clients[stream_type]
    
    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    )

# Function to parse command line arguments
def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Enhanced HTTP Server for Lightning Lens')
    parser.add_argument('--host', type=str, default='0.0.0.0',
                       help='Host to bind the HTTP server to')
    parser.add_argument('--port', type=int, default=8000,
                       help='Port to run the HTTP server on')
    parser.add_argument('--model', type=str, default=None,
                       help='Path to the trained model file')
    parser.add_argument('--debug', action='store_true',
                       help='Run in debug mode')
    return parser.parse_args()

# Function to load the model
def load_model(model_path=None):
    """Load a trained ML model for prediction"""
    global model, last_model_update
    
    try:
        if not model_path:
            # Try to find the latest model
            model_dir = get_data_path('models')
            if os.path.exists(model_dir):
                model_files = [f for f in os.listdir(model_dir) if f.endswith('.pkl')]
                if model_files:
                    # Get the most recent model file
                    model_path = os.path.join(model_dir, sorted(model_files)[-1])
        
        if model_path and os.path.exists(model_path):
            logger.info(f"Loading model from {model_path}")
            with open(model_path, 'rb') as f:
                model = pickle.load(f)
            last_model_update = datetime.now()
            logger.info(f"Model loaded successfully: {type(model).__name__}")
            return True
        else:
            logger.warning(f"Model file not found: {model_path}")
            return False
    
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")
        return False

# Function to calculate performance metrics
def calculate_performance_metrics():
    """Calculate current model performance metrics"""
    global performance_metrics
    
    try:
        # Load validation data
        validation_file = get_data_path('validation/validation_results.json')
        if os.path.exists(validation_file):
            with open(validation_file, 'r') as f:
                validation_data = json.load(f)
            
            # Extract metrics
            performance_metrics = {
                'accuracy': validation_data.get('accuracy', 0.0),
                'precision': validation_data.get('precision', 0.0),
                'recall': validation_data.get('recall', 0.0),
                'f1_score': validation_data.get('f1_score', 0.0),
                'last_updated': datetime.now().isoformat()
            }
            
            logger.info(f"Performance metrics calculated: {performance_metrics}")
            
            # Push to real-time data server
            push_to_realtime_server('metrics', performance_metrics)
            
            # Push to SSE clients
            push_to_sse('metrics', performance_metrics)
            
            return True
        else:
            logger.warning(f"Validation file not found: {validation_file}")
            return False
    
    except Exception as e:
        logger.error(f"Error calculating performance metrics: {str(e)}")
        return False

# Function to run background tasks
def background_tasks():
    """Run background tasks periodically"""
    while True:
        try:
            # Use application context for Flask operations
            with app.app_context():
                # Recalculate performance metrics
                calculate_performance_metrics()
                
                # For functions that normally require request context,
                # we'll call their internal functionality directly or skip them
                # in the background task
                
                # Update cached data that doesn't require request context
                try:
                    # Load network state data
                    network_state_file = get_data_path('network/state.json')
                    if os.path.exists(network_state_file):
                        with open(network_state_file, 'r') as f:
                            network_data = json.load(f)
                            if realtime_server:
                                # Use a synchronous wrapper for the async function
                                push_to_realtime_server('network_state', network_data)
                except Exception as e:
                    logger.error(f"Error updating network state: {str(e)}")
                
                # Update other cached data similarly
                try:
                    # Load predictions data
                    predictions_dir = get_data_path('predictions')
                    if os.path.exists(predictions_dir):
                        prediction_files = sorted([f for f in os.listdir(predictions_dir) if f.endswith('.csv')])
                        if prediction_files:
                            latest_file = os.path.join(predictions_dir, prediction_files[-1])
                            predictions_df = pd.read_csv(latest_file)
                            predictions_data = predictions_df.to_dict(orient='records')
                            if realtime_server:
                                # Use a synchronous wrapper for the async function
                                push_to_realtime_server('predictions', predictions_data)
                except Exception as e:
                    logger.error(f"Error updating predictions: {str(e)}")
            
            # Sleep for 30 seconds
            time.sleep(30)
        
        except Exception as e:
            logger.error(f"Error in background tasks: {str(e)}")
            time.sleep(10)  # Sleep for 10 seconds on error

# Main function
def main():
    """Main function"""
    args = parse_args()
    
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    # Load the model
    load_model(args.model)
    
    # Start background tasks
    bg_thread = threading.Thread(target=background_tasks, daemon=True)
    bg_thread.start()
    
    # Print startup message
    print(f"Starting Enhanced HTTP Server on {args.host}:{args.port}")
    
    # Start the Flask app
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)

if __name__ == "__main__":
    main()
