#!/usr/bin/env python3
"""
LightningLens Suggestions Service

This service generates channel rebalancing suggestions based on real-time transaction data.
It uses the online learner to continuously update the model with new transaction data.
"""

import asyncio
import json
import logging
import os
import pandas as pd
import requests
import sys
import time
from datetime import datetime
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/suggestions_service.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("SuggestionsService")

# Add the current directory to the path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(script_dir, '../..'))

# Add necessary paths to Python path
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Try to import actual implementations
try:
    try:
        from lightning_lens.src.models.online_learner import OnlineLearner
        from lightning_lens.src.models.trainer import ModelTrainer
        from lightning_lens.src.models.features import FeatureProcessor
        logger.info("Successfully imported Lightning Lens modules")
    except ImportError:
        # Fall back to direct imports
        sys.path.insert(0, os.path.abspath(os.path.join(script_dir, '..')))
        from src.models.online_learner import OnlineLearner
        from src.models.trainer import ModelTrainer
        from src.models.features import FeatureProcessor
        logger.info("Successfully imported from src directly")
except Exception as e:
    logger.error(f"Failed to import required modules: {str(e)}")
    sys.exit(1)

# Configuration
HTTP_SERVER_URL = "http://localhost:5000/api"
POLL_INTERVAL_SECONDS = 10  # How often to check for new data
MINIMUM_TRANSACTIONS = 5  # Minimum number of transactions before generating suggestions
MODEL_FILE = "data/models/latest_model.pkl"
SCALER_FILE = "data/models/scaler.pkl"

# First try the absolute path to the root data directory
ROOT_DATA_DIR = '/media/shahazzad/new3/KOD/LIGHTNING-LENS/data'

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

def load_simulation_data():
    """Load transaction data from simulation CSV files"""
    # Get the most recent simulation file
    simulation_dir = get_data_path('simulation')
    if not os.path.exists(simulation_dir):
        logger.warning(f"Simulation directory not found: {simulation_dir}")
        return pd.DataFrame()
        
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

class SuggestionsService:
    """Service to generate rebalancing suggestions"""
    
    def __init__(self):
        """Initialize the service"""
        self.online_learner = OnlineLearner(
            model_path=get_data_path('models/latest_model.pkl'),
            buffer_size=1000,
            min_samples_for_update=20,
            update_interval=10
        )
        logger.info("Initialized online learning module")
        
        self.transaction_count = 0
        self.feature_processor = FeatureProcessor()
        self.trainer = ModelTrainer()
        self.channel_data = {}
        
        # Try to load simulation data
        self.simulation_data = load_simulation_data()
        
        # Create directories if they don't exist
        os.makedirs(get_data_path('models'), exist_ok=True)
        os.makedirs(get_data_path('predictions'), exist_ok=True)
        os.makedirs(get_data_path('processed'), exist_ok=True)
    
    async def fetch_transactions(self):
        """Fetch recent transactions from the HTTP server"""
        try:
            response = requests.get(f"{HTTP_SERVER_URL}/dashboard")
            if response.status_code == 200:
                data = response.json()
                transactions = data.get('transactions', [])
                logger.info(f"Fetched {len(transactions)} transactions from server")
                return transactions
            else:
                logger.warning(f"Error fetching transactions: HTTP {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error fetching transactions: {str(e)}")
            return []
    
    async def fetch_channels(self):
        """Fetch channel data from the HTTP server"""
        try:
            response = requests.get(f"{HTTP_SERVER_URL}/channels")
            if response.status_code == 200:
                data = response.json()
                channels = data.get('channels', {})
                logger.info(f"Fetched channel data for {len(channels)} nodes")
                return channels
            else:
                logger.warning(f"Error fetching channels: HTTP {response.status_code}")
                return {}
        except Exception as e:
            logger.error(f"Error fetching channels: {str(e)}")
            return {}
    
    def generate_suggestions(self, channels):
        """Generate rebalancing suggestions based on channel data and model predictions"""
        if not channels:
            logger.warning("No channel data available for generating suggestions")
            return []
        
        suggestions = []
        
        # Convert channel data to features
        features_df = self.prepare_features(channels)
        
        if features_df is None or features_df.empty:
            logger.warning("Could not prepare features from channel data")
            return []
        
        # Make predictions using the online learner's model
        try:
            if self.online_learner.is_fitted:
                predictions = self.online_learner.predict(features_df)
                features_df['predicted_optimal_ratio'] = predictions
            else:
                # Use default balance target of 0.5 (balanced channels)
                logger.warning("Online learner not fitted yet, using default balance targets")
                features_df['predicted_optimal_ratio'] = 0.5
        except Exception as e:
            logger.error(f"Error making predictions: {str(e)}")
            features_df['predicted_optimal_ratio'] = 0.5
        
        # Calculate adjustment needed
        features_df['adjustment_needed'] = features_df['predicted_optimal_ratio'] - features_df['balance_ratio']
        
        # Find channels that need significant rebalancing (>10% imbalance)
        threshold = 0.1  # 10%
        rebalance_candidates = features_df[abs(features_df['adjustment_needed']) > threshold]
        
        # Sort by adjustment magnitude (largest first)
        rebalance_candidates = rebalance_candidates.sort_values(by='adjustment_needed', key=abs, ascending=False)
        
        # Generate suggestions for top 3 channels
        for _, row in rebalance_candidates.head(3).iterrows():
            channel_id = row['channel_id']
            adjustment = row['adjustment_needed']
            
            # Extract node information from channel_id (format: node_remotepubkey)
            parts = channel_id.split('_')
            if len(parts) < 2:
                continue
                
            from_node = parts[0]
            
            # Find the other node (this is simplified, in reality would need proper lookup)
            to_node = None
            for node in channels.keys():
                if node != from_node:
                    to_node = node
                    break
            
            if not to_node:
                continue
            
            # Calculate amount to rebalance (as percentage of capacity)
            capacity = row['capacity']
            amount = int(abs(adjustment) * capacity)
            
            # Apply min/max constraints
            min_tx = 10000  # 10k sats minimum
            max_tx = 1000000  # 1M sats maximum
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
    
    def prepare_features(self, channels):
        """Convert channel data to features for model input"""
        rows = []
        timestamp = datetime.now()
        
        for node, channel_list in channels.items():
            for channel in channel_list:
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
                    logger.error(f"Error processing channel data: {str(e)}")
        
        if not rows:
            return None
        
        # Create DataFrame
        df = pd.DataFrame(rows)
        
        # Process features
        try:
            features_df = self.feature_processor.process_features(df)
            return features_df
        except Exception as e:
            logger.error(f"Error processing features: {str(e)}")
            return df  # Return original dataframe if processing fails
    
    async def process_simulation_data(self):
        """Process simulation data to train the model"""
        if self.simulation_data.empty:
            logger.warning("No simulation data available to process")
            return
        
        logger.info(f"Processing {len(self.simulation_data)} rows of simulation data")
        
        # Keep track of how many updates were performed
        update_count = 0
        
        # Process each row in the simulation data
        for _, row in self.simulation_data.iterrows():
            try:
                if row['type'] == 'payment':
                    # Create a transaction object
                    transaction = {
                        "event_type": "transaction",
                        "timestamp": row['timestamp'],
                        "transaction": {
                            "sender": row['sender'],
                            "receiver": row['receiver'],
                            "amount": row['amount'],
                            "success": True if str(row['success']).lower() == 'true' else False,
                            "fee": row['fee'],
                            "description": row['description']
                        }
                    }
                    
                    # Try to extract channel data if available
                    try:
                        if "channel_after" in row and row["channel_after"]:
                            channel_data = json.loads(row["channel_after"].replace('\"', '"'))
                            if channel_data:
                                transaction["channels"] = channel_data
                    except Exception as e:
                        logger.error(f"Error parsing channel data: {str(e)}")
                    
                    # Add to online learner
                    if self.online_learner.add_transaction(transaction):
                        update_count += 1
            except Exception as e:
                logger.error(f"Error processing simulation row: {str(e)}")
                logger.error(traceback.format_exc())
        
        logger.info(f"Processed simulation data: {update_count} model updates performed")
        
        # Save the updated model
        if update_count > 0:
            self.online_learner.save_model()
            logger.info("Saved updated model from simulation data")
    
    async def send_suggestions(self, suggestions):
        """Send rebalancing suggestions to the HTTP server"""
        if not suggestions:
            return
        
        try:
            data = {
                "suggestions": suggestions,
                "timestamp": datetime.now().isoformat(),
                "model_version": self.online_learner.model_version if hasattr(self.online_learner, 'model_version') else "v1"
            }
            
            response = requests.post(f"{HTTP_SERVER_URL}/suggestions", json=data)
            if response.status_code == 200:
                logger.info(f"Successfully sent {len(suggestions)} suggestions to server")
            else:
                logger.warning(f"Error sending suggestions: HTTP {response.status_code}")
        except Exception as e:
            logger.error(f"Error sending suggestions: {str(e)}")
    
    async def run(self):
        """Main service loop"""
        logger.info("Starting suggestions service loop")
        
        # First, process simulation data to train the model
        await self.process_simulation_data()
        
        while True:
            try:
                # Fetch recent transactions
                transactions = await self.fetch_transactions()
                
                # Update the online learner with new transactions
                for transaction in transactions:
                    if self.online_learner.add_transaction(transaction):
                        self.transaction_count += 1
                
                # Fetch latest channel data
                channels = await self.fetch_channels()
                
                # Only generate suggestions if we have enough data
                if self.transaction_count >= MINIMUM_TRANSACTIONS or self.online_learner.is_fitted:
                    # Generate and send suggestions
                    suggestions = self.generate_suggestions(channels)
                    await self.send_suggestions(suggestions)
                else:
                    logger.info(f"Waiting for more data before generating suggestions. Current count: {self.transaction_count}/{MINIMUM_TRANSACTIONS}")
                
                # Save model periodically
                if self.transaction_count % 10 == 0 and self.transaction_count > 0:
                    self.online_learner.save_model()
                    logger.info(f"Saved model after {self.transaction_count} transactions")
            
            except Exception as e:
                logger.error(f"Error in service loop: {str(e)}")
                logger.error(traceback.format_exc())
                
            # Wait before next poll
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

async def main():
    """Main function to run the suggestions service"""
    service = SuggestionsService()
    await service.run()

if __name__ == "__main__":
    asyncio.run(main()) 