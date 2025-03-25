#!/usr/bin/env python3
"""
LightningLens WebSocket Client

Connects to a Lightning Network simulation via WebSocket, processes transaction data,
and provides rebalancing suggestions based on ML predictions.
"""

import asyncio
import json
import logging
import os
import pandas as pd
import websockets # type: ignore
from datetime import datetime
import argparse
import numpy as np
import sys
from pathlib import Path
import pickle
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/client_ws.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("LightningLens")

# Define minimal classes for basic functionality if imports fail
class ModelTrainer:
    def predict(self, model, features):
        return [0.5] * len(features)
        
class FeatureProcessor:
    def process_features(self, data):
        return pd.DataFrame(data) if not isinstance(data, pd.DataFrame) else data
    
class OnlineLearner:
    def __init__(self, model_path=None):
        self.is_fitted = False
    
    def add_transaction(self, data):
        return False
        
    def add_channel_state(self, data):
        return False
    
def load_config():
    return {}

# Try to import actual implementations if available
try:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '../..'))
    
    # Add necessary paths to Python path
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    
    try:
        from lightning_lens.src.models.trainer import ModelTrainer
        from lightning_lens.src.models.features import FeatureProcessor
        from lightning_lens.src.utils.config import load_config
        from lightning_lens.src.models.online_learner import OnlineLearner
        logger.info("Successfully imported Lightning Lens modules")
    except ImportError:
        # Fall back to direct imports
        sys.path.insert(0, os.path.abspath(os.path.join(script_dir, '..')))
        from src.models.trainer import ModelTrainer
        from src.models.features import FeatureProcessor
        from src.utils.config import load_config
        from src.models.online_learner import OnlineLearner
        logger.info("Successfully imported from src directly")
except Exception as e:
    logger.warning(f"Could not import Lightning Lens modules: {str(e)}. Using minimal implementations.")

# Add the lightning_lens directory to the path
script_dir = os.path.dirname(os.path.abspath(__file__))
lens_dir = os.path.abspath(os.path.join(script_dir, '..'))
sys.path.insert(0, lens_dir)

# Add path handling for data and config files
import os

# First try the absolute path to the root data directory
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

# Function to read and process the simulation transaction data
def read_simulation_data(file_path=None):
    """Read transaction data from simulation CSV files"""
    if file_path is None:
        # Get the most recent simulation file
        simulation_dir = get_data_path('simulation')
        files = sorted([os.path.join(simulation_dir, f) for f in os.listdir(simulation_dir) 
                       if f.startswith('lightning_simulation_') and f.endswith('.csv')],
                      key=os.path.getmtime, reverse=True)
        
        if not files:
            logger.warning("No simulation data files found")
            return pd.DataFrame()
            
        file_path = files[0]
    
    try:
        logger.info(f"Reading simulation data from {file_path}")
        df = pd.read_csv(file_path)
        
        # Process the data into a format suitable for the client
        if not df.empty:
            logger.info(f"Loaded {len(df)} transactions from simulation data")
            return df
        else:
            logger.warning("Simulation data file is empty")
            return pd.DataFrame()
    except Exception as e:
        logger.error(f"Error reading simulation data: {str(e)}")
        return pd.DataFrame()

class LightningLensClient:
    """Client that connects to Lightning Network simulation and provides rebalancing suggestions"""
    
    def __init__(self, websocket_uri="ws://localhost:8768", model_path=None, scaler_path=None):
        """Initialize the client with model paths and WebSocket URI"""
        self.websocket_uri = websocket_uri
        self.channel_data = {}  # Store latest channel data
        self.transaction_history = []  # Store recent transactions
        self.feature_processor = FeatureProcessor()
        self.trainer = ModelTrainer()
        self.config = load_config()
        self.websocket = None
        
        # Try to load simulation data if available
        self.simulation_data = read_simulation_data()
        
        if model_path is None:
            model_path = get_data_path('models/latest_model.pkl')
        
        if scaler_path is None:
            scaler_path = get_data_path('models/scaler.pkl')
        
        self.model_path = model_path
        self.scaler_path = scaler_path
        
        # Load model if it exists
        try:
            if os.path.exists(model_path):
                with open(model_path, 'rb') as f:
                    self.model = pickle.load(f)
                logger.info(f"Loaded model from {model_path}")
            else:
                logger.warning("No models found. Will use default balance targets.")
                self.model = None
                
            if os.path.exists(scaler_path):
                with open(scaler_path, 'rb') as f:
                    self.scaler = pickle.load(f)
                logger.info(f"Loaded scaler from {scaler_path}")
            else:
                logger.warning("No scaler found. Feature scaling disabled.")
                self.scaler = None
        except Exception as e:
            logger.warning(f"Error loading model: {str(e)}")
            self.model = None
            self.scaler = None
        
        # Add online learner
        self.online_learner = OnlineLearner(model_path=model_path)
        logger.info("Initialized online learning module")
    
    async def connect(self):
        """Connect to the WebSocket server and process messages"""
        logger.info(f"Connecting to {self.websocket_uri}...")
        
        try:
            async with websockets.connect(self.websocket_uri) as websocket:
                self.websocket = websocket
                logger.info("Connected to Lightning Network simulation")
                
                # Send initial message
                await websocket.send(json.dumps({
                    "type": "register",
                    "client": "lightning_lens",
                    "message": "LightningLens AI optimization connected"
                }))
                
                # Process incoming messages
                async for message in websocket:
                    try:
                        await self.process_message(message)
                    except json.JSONDecodeError:
                        logger.error(f"Invalid JSON received: {message}")
                    except Exception as e:
                        logger.error(f"Error processing message: {e}")
                        logger.error(traceback.format_exc())
        
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
            # Try to reconnect after a delay
            logger.info("Attempting to reconnect in 5 seconds...")
            await asyncio.sleep(5)
            await self.connect()
    
    async def process_message(self, message):
        """Process incoming WebSocket messages"""
        data = json.loads(message)
        message_type = data.get('type', data.get('event_type', 'unknown'))
        
        logger.info(f"Received message of type: {message_type}")
        
        if message_type == 'transaction':
            # Process transaction
            transaction = data.get('transaction', data.get('data', {}))
            sender = transaction.get('sender', 'unknown')
            receiver = transaction.get('receiver', 'unknown')
            
            logger.info(f"Received transaction: {sender} -> {receiver}")
            
            # Update channel data if available
            if 'channels' in data:
                self.update_channel_data(data.get("channels", {}))
            
            # Store transaction in history
            self.transaction_history.append({
                "timestamp": data.get("timestamp", datetime.now().isoformat()),
                "sender": sender,
                "receiver": receiver,
                "amount": transaction.get("amount", 0),
                "success": transaction.get("success", True)
            })
            
            # Limit history size
            if len(self.transaction_history) > 100:
                self.transaction_history = self.transaction_history[-100:]
            
            # Add to online learner
            model_updated = self.online_learner.add_transaction(data)
            if model_updated:
                logger.info("Online model updated with new transaction data")
            
            # Generate suggestions using online model if available
            if self.online_learner.is_fitted:
                suggestions = self.generate_suggestions()
                await self.send_suggestions(suggestions)
        
        elif message_type == 'channel_update' or message_type == 'channel_state':
            # Process channel state
            logger.info("Received channel snapshot")
            channels = data.get("channels", data.get("data", {}))
            if channels:
                self.update_channel_data(channels)
                
                # Add to online learner
                model_updated = self.online_learner.add_channel_state(data)
                if model_updated:
                    logger.info("Online model updated with new channel state data")
        
        elif message_type == "request_suggestions":
            # Explicit request for suggestions
            logger.info("Received request for suggestions")
            suggestions = self.generate_suggestions()
            await self.send_suggestions(suggestions)
            
        elif message_type == "state_update":
            # Full state update from server
            state_data = data.get("data", {})
            logger.info("Received full state update")
            
            if "channels" in state_data:
                self.update_channel_data(state_data["channels"])
                
            if "transactions" in state_data:
                # Clear history and replace with new data
                self.transaction_history = state_data["transactions"][-100:] if state_data["transactions"] else []
                logger.info(f"Updated transaction history with {len(self.transaction_history)} transactions")
        
        elif message_type == "connection_status":
            # Connection status update
            status = data.get("data", {}).get("status", "unknown")
            logger.info(f"Connection status: {status}")
    
    def update_channel_data(self, channels):
        """Update stored channel data with new information"""
        if not channels:
            logger.warning("Received empty channel data")
            return
            
        for node, channel_list in channels.items():
            self.channel_data[node] = channel_list
            
        # Save latest channel state to file for debugging
        try:
            os.makedirs(get_data_path('processed'), exist_ok=True)
            with open(get_data_path('processed/latest_channel_state.json'), 'w') as f:
                json.dump(self.channel_data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving channel state: {e}")
    
    def generate_suggestions(self):
        """Generate rebalancing suggestions based on channel data and model predictions"""
        if not self.channel_data:
            logger.warning("No channel data available for generating suggestions")
            return []
        
        suggestions = []
        
        # Convert channel data to features
        features_df = self.prepare_features()
        
        if features_df is None or features_df.empty:
            logger.warning("Could not prepare features from channel data")
            return []
        
        # Make predictions if model is available
        if self.model and hasattr(self, 'scaler') and self.scaler:
            try:
                predictions = self.trainer.predict(self.model, features_df)
                features_df['predicted_optimal_ratio'] = predictions
                features_df['adjustment_needed'] = predictions - features_df['balance_ratio']
            except Exception as e:
                logger.error(f"Error making predictions: {e}")
                # Fall back to default balance target
                features_df['predicted_optimal_ratio'] = 0.5
                features_df['adjustment_needed'] = 0.5 - features_df['balance_ratio']
        else:
            # Use default balance target of 0.5 (balanced channels)
            features_df['predicted_optimal_ratio'] = 0.5
            features_df['adjustment_needed'] = 0.5 - features_df['balance_ratio']
        
        # Find channels that need significant rebalancing
        threshold = self.config.get('rebalancing', {}).get('threshold_pct', 10) / 100
        rebalance_candidates = features_df[abs(features_df['adjustment_needed']) > threshold]
        
        # Sort by adjustment magnitude (largest first)
        rebalance_candidates = rebalance_candidates.sort_values(by='adjustment_needed', key=abs, ascending=False)
        
        # Generate suggestions for top 3 channels
        for _, row in rebalance_candidates.head(3).iterrows():
            channel_id = row['channel_id']
            adjustment = row['adjustment_needed']
            
            # Find nodes for this channel
            from_node = None
            to_node = None
            
            for node, channels in self.channel_data.items():
                for channel in channels:
                    if str(channel_id) in str(channel):
                        from_node = node
                        # Find the remote node
                        for other_node in self.channel_data.keys():
                            if other_node != node:
                                to_node = other_node
                                break
                        break
                if from_node and to_node:
                    break
            
            if not from_node or not to_node:
                logger.warning(f"Could not identify nodes for channel {channel_id}")
                continue
            
            # Calculate amount to rebalance (as percentage of capacity)
            capacity = features_df.loc[features_df['channel_id'] == channel_id, 'capacity'].values[0]
            amount = int(abs(adjustment) * capacity)
            
            # Apply min/max constraints
            min_tx = self.config.get('rebalancing', {}).get('min_tx_value_sats', 10000)
            max_tx = self.config.get('rebalancing', {}).get('max_tx_value_sats', 1000000)
            amount = max(min_tx, min(max_tx, amount))
            
            # Determine direction
            if adjustment < 0:  # Too much local balance
                suggestion = {
                    "from_node": from_node,
                    "to_node": to_node,
                    "amount": amount,
                    "reason": f"Channel is {abs(adjustment)*100:.1f}% too full on local side"
                }
            else:  # Too little local balance
                suggestion = {
                    "from_node": to_node,
                    "to_node": from_node,
                    "amount": amount,
                    "reason": f"Channel is {abs(adjustment)*100:.1f}% too empty on local side"
                }
            
            suggestions.append(suggestion)
        
        return suggestions
    
    def prepare_features(self):
        """Convert channel data to features for model input"""
        rows = []
        timestamp = datetime.now()
        
        for node, channels in self.channel_data.items():
            for channel in channels:
                try:
                    # Extract channel data
                    capacity = int(channel.get('capacity', 0))
                    local_balance = int(channel.get('local_balance', 0))
                    remote_balance = int(channel.get('remote_balance', 0))
                    remote_pubkey = channel.get('remote_pubkey', '')
                    
                    # Skip channels with zero capacity
                    if capacity == 0:
                        continue
                    
                    # Calculate balance ratio
                    balance_ratio = local_balance / capacity if capacity > 0 else 0.5
                    
                    # Create row
                    row = {
                        'channel_id': f"{node}_{remote_pubkey[:8]}",
                        'timestamp': timestamp,
                        'capacity': capacity,
                        'local_balance': local_balance,
                        'remote_balance': remote_balance,
                        'remote_pubkey': remote_pubkey,
                        'balance_ratio': balance_ratio
                    }
                    rows.append(row)
                except Exception as e:
                    logger.error(f"Error processing channel data: {e}")
        
        if not rows:
            return None
        
        # Create DataFrame
        df = pd.DataFrame(rows)
        
        # Process features
        try:
            features_df = self.feature_processor.process_features(df)
            return features_df
        except Exception as e:
            logger.error(f"Error processing features: {e}")
            return None
    
    async def send_suggestions(self, suggestions):
        """Send rebalancing suggestions back to the server"""
        if not suggestions:
            return
        
        logger.info(f"Sending {len(suggestions)} rebalancing suggestions")
        
        try:
            message = {
                "type": "suggestions",
                "client": "lightning_lens",
                "timestamp": datetime.now().isoformat(),
                "suggestions": suggestions
            }
            
            if self.websocket:
                await self.websocket.send(json.dumps(message))
                logger.info("Suggestions sent successfully")
            else:
                logger.error("Cannot send suggestions: WebSocket connection not established")
        except Exception as e:
            logger.error(f"Error sending suggestions: {e}")

async def main():
    """Main function to run the WebSocket client"""
    parser = argparse.ArgumentParser(description="LightningLens WebSocket Client")
    parser.add_argument("--uri", default="ws://localhost:8768", help="WebSocket URI")
    parser.add_argument("--model", help="Path to custom model (optional)")
    parser.add_argument("--scaler", help="Path to custom scaler (optional)")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    # Set logging level based on verbose flag
    if args.verbose:
        logger.setLevel(logging.DEBUG)
        logger.debug("Verbose logging enabled")
    
    # Create data directories if they don't exist
    Path("data/models").mkdir(parents=True, exist_ok=True)
    Path("data/processed").mkdir(parents=True, exist_ok=True)
    
    # Initialize and run client
    client = LightningLensClient(
        websocket_uri=args.uri,
        model_path=args.model,
        scaler_path=args.scaler if args.scaler else (args.model.replace('model_', 'scaler_') if args.model else None)
    )
    
    await client.connect()

if __name__ == "__main__":
    asyncio.run(main()) 