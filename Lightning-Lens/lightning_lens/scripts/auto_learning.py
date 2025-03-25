#!/usr/bin/env python3
"""
Automated Learning System for Lightning Lens

This script implements an autonomous learning system that:
1. Monitors the simulation for new data
2. Automatically processes data when new transactions are detected
3. Updates the model based on learning from successful rebalancing operations
4. Provides adaptive parameter recommendations for the simulation
"""

import os
import sys
import time
import json
import glob
import logging
import argparse
import subprocess
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import threading
import requests
import signal
import traceback

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("AutoLearning")

# Define paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
MODELS_DIR = os.path.join(DATA_DIR, "models")
SCRIPTS_DIR = os.path.join(BASE_DIR, "Lightning-Lens/lightning_lens/scripts")

# Ensure directories exist
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Global variables
running = True
last_processed_time = datetime.now()
learning_interval = 300  # 5 minutes
min_transactions_to_process = 50
simulation_api_url = "http://localhost:8000/api"

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Lightning Lens Automated Learning System')
    parser.add_argument('--interval', type=int, default=300,
                        help='Learning interval in seconds (default: 300)')
    parser.add_argument('--min-transactions', type=int, default=50,
                        help='Minimum number of transactions to trigger processing (default: 50)')
    parser.add_argument('--api-url', type=str, default="http://localhost:8000/api",
                        help='URL of the HTTP API (default: http://localhost:8000/api)')
    parser.add_argument('--daemon', action='store_true',
                        help='Run as a daemon process')
    return parser.parse_args()

def run_script(script_name, args=None):
    """Run a Python script with arguments"""
    cmd = [sys.executable, os.path.join(SCRIPTS_DIR, script_name)]
    if args:
        cmd.extend(args)
        
    logger.info(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        logger.info(f"Output: {result.stdout.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Error running {script_name}: {e}")
        logger.error(f"Error output: {e.stderr}")
        return False

def get_latest_file(directory, pattern):
    """Get the latest file matching the pattern in the directory"""
    files = glob.glob(os.path.join(directory, pattern))
    if not files:
        return None
    return max(files, key=os.path.getmtime)

def count_new_transactions():
    """Count new transactions since last processing"""
    try:
        # Get the latest simulation data file
        latest_sim_file = get_latest_file(os.path.join(DATA_DIR, "simulation"), "lightning_simulation_*.csv")
        
        if not latest_sim_file:
            logger.warning("No simulation data files found")
            return 0
            
        # Get file modification time
        file_mtime = datetime.fromtimestamp(os.path.getmtime(latest_sim_file))
        
        # If file is older than last processing, no new transactions
        if file_mtime < last_processed_time:
            return 0
            
        # Read the CSV file
        df = pd.read_csv(latest_sim_file)
        
        # Filter transactions after last processing
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        new_transactions = df[df['timestamp'] > last_processed_time.isoformat()]
        
        return len(new_transactions)
    except Exception as e:
        logger.error(f"Error counting new transactions: {e}")
        return 0

def process_data():
    """Run the data processing pipeline"""
    global last_processed_time
    
    logger.info("Starting data processing pipeline")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Step 1: Convert raw JSON data to CSV
    logger.info("Step 1: Converting raw JSON data to CSV")
    if not run_script("convert_raw_data.py"):
        logger.error("Failed to convert raw data")
        return False
    
    # Step 2: Transform transaction data
    transactions_csv = get_latest_file(PROCESSED_DIR, "transactions_*.csv")
    if not transactions_csv:
        logger.error("No transaction CSV files found")
        return False
        
    logger.info("Step 2: Transforming transaction data")
    if not run_script("transform_transactions.py", ["--input", transactions_csv]):
        logger.error("Failed to transform transaction data")
        return False
    
    # Step 3: Generate features
    transformed_csv = get_latest_file(PROCESSED_DIR, "transformed_transactions_*.csv")
    if not transformed_csv:
        logger.error("No transformed transaction CSV files found")
        return False
        
    logger.info("Step 3: Generating features")
    if not run_script("generate_features.py", ["--input", transformed_csv]):
        logger.error("Failed to generate features")
        return False
    
    # Step 4: Train or update the model
    logger.info("Step 4: Training/updating the model")
    if not run_script("train_initial_model.py"):
        logger.error("Failed to train the model")
        return False
    
    # Update the last processed time
    last_processed_time = datetime.now()
    
    logger.info("Data processing pipeline completed successfully")
    
    # Generate predictions using the new model
    logger.info("Generating predictions with the new model")
    if not run_script("generate_predictions.py"):
        logger.error("Failed to generate predictions")
        return False
    
    # Analyze successful rebalancing operations
    analyze_rebalancing_success()
    
    return True

def analyze_rebalancing_success():
    """Analyze successful rebalancing operations to learn patterns"""
    try:
        # Get the latest transformed transactions
        transformed_csv = get_latest_file(PROCESSED_DIR, "transformed_transactions_*.csv")
        if not transformed_csv:
            logger.error("No transformed transaction CSV files found")
            return False
            
        # Load the data
        df = pd.read_csv(transformed_csv)
        
        # Filter for rebalance operations
        rebalance_df = df[df['type'] == 'rebalance']
        
        if len(rebalance_df) == 0:
            logger.info("No rebalance operations found to analyze")
            return False
            
        # Calculate success rate
        success_rate = rebalance_df['success'].mean()
        logger.info(f"Rebalance success rate: {success_rate:.2%}")
        
        # Analyze successful rebalancing patterns
        successful_rebalance = rebalance_df[rebalance_df['success'] == True]
        
        if len(successful_rebalance) == 0:
            logger.info("No successful rebalance operations found")
            return False
            
        # Calculate average balance ratios before successful rebalancing
        if 'sender_balance_before' in successful_rebalance.columns and 'capacity' in successful_rebalance.columns:
            successful_rebalance['sender_ratio_before'] = successful_rebalance['sender_balance_before'] / successful_rebalance['capacity']
            avg_sender_ratio = successful_rebalance['sender_ratio_before'].mean()
            logger.info(f"Average sender balance ratio before successful rebalance: {avg_sender_ratio:.2f}")
            
            # Recommend optimal rebalance threshold based on successful operations
            recommend_rebalance_parameters(avg_sender_ratio)
        
        return True
    except Exception as e:
        logger.error(f"Error analyzing rebalancing success: {e}")
        traceback.print_exc()
        return False

def recommend_rebalance_parameters(optimal_ratio):
    """Recommend optimal parameters for the simulation based on learning"""
    try:
        # Calculate recommended rebalance threshold
        # If optimal ratio is 0.5, we want to rebalance when it deviates by more than 15%
        recommended_threshold = max(0.15, abs(0.5 - optimal_ratio))
        
        # Calculate recommended rebalance amount
        # If threshold is large, we want to rebalance more aggressively
        recommended_amount = min(0.3, max(0.1, recommended_threshold))
        
        logger.info(f"Recommended rebalance threshold: {recommended_threshold:.2f}")
        logger.info(f"Recommended rebalance amount: {recommended_amount:.2f}")
        
        # Save recommendations to a file
        recommendations = {
            "timestamp": datetime.now().isoformat(),
            "optimal_ratio": optimal_ratio,
            "rebalance_threshold": recommended_threshold,
            "rebalance_amount": recommended_amount
        }
        
        os.makedirs(os.path.join(DATA_DIR, "recommendations"), exist_ok=True)
        with open(os.path.join(DATA_DIR, "recommendations", "latest.json"), 'w') as f:
            json.dump(recommendations, f, indent=2)
            
        # Try to send recommendations to the simulation
        try:
            response = requests.post(
                f"{simulation_api_url}/update-parameters",
                json=recommendations,
                timeout=5
            )
            if response.status_code == 200:
                logger.info("Successfully sent parameter recommendations to simulation")
            else:
                logger.warning(f"Failed to send recommendations: HTTP {response.status_code}")
        except Exception as e:
            logger.warning(f"Error sending recommendations to simulation: {e}")
        
        return True
    except Exception as e:
        logger.error(f"Error recommending parameters: {e}")
        return False

def detect_anomalies():
    """Detect anomalies in the network that might require attention"""
    try:
        # Get the latest channel states
        channel_file = get_latest_file(PROCESSED_DIR, "channel_states_*.csv")
        if not channel_file:
            logger.warning("No channel state files found")
            return False
            
        # Load the data
        df = pd.read_csv(channel_file)
        
        # Check for severely imbalanced channels (below 10% or above 90%)
        imbalanced = df[(df['balance_ratio'] < 0.1) | (df['balance_ratio'] > 0.9)]
        
        if len(imbalanced) > 0:
            logger.warning(f"Detected {len(imbalanced)} severely imbalanced channels")
            
            # Log the top 5 most imbalanced channels
            imbalanced['imbalance'] = imbalanced['balance_ratio'].apply(lambda x: min(x, 1-x))
            top_imbalanced = imbalanced.sort_values('imbalance').head(5)
            
            for _, row in top_imbalanced.iterrows():
                logger.warning(f"Channel {row['channel_id']}: balance ratio {row['balance_ratio']:.2f}")
                
            # Try to send anomaly alert to the simulation
            try:
                response = requests.post(
                    f"{simulation_api_url}/anomaly-alert",
                    json={"imbalanced_channels": top_imbalanced['channel_id'].tolist()},
                    timeout=5
                )
                if response.status_code == 200:
                    logger.info("Successfully sent anomaly alert to simulation")
                else:
                    logger.warning(f"Failed to send anomaly alert: HTTP {response.status_code}")
            except Exception as e:
                logger.warning(f"Error sending anomaly alert to simulation: {e}")
        
        return True
    except Exception as e:
        logger.error(f"Error detecting anomalies: {e}")
        return False

def check_and_process():
    """Check for new data and process if needed"""
    try:
        # Count new transactions
        new_transaction_count = count_new_transactions()
        logger.info(f"Found {new_transaction_count} new transactions since last processing")
        
        # Process if we have enough new transactions
        if new_transaction_count >= min_transactions_to_process:
            logger.info(f"Processing data ({new_transaction_count} new transactions)")
            process_data()
        else:
            logger.info(f"Not enough new transactions to process (need {min_transactions_to_process})")
            
        # Detect anomalies regardless of processing
        detect_anomalies()
    except Exception as e:
        logger.error(f"Error in check_and_process: {e}")
        traceback.print_exc()

def learning_loop():
    """Main learning loop"""
    global running
    
    while running:
        try:
            logger.info(f"Running learning cycle (interval: {learning_interval}s)")
            check_and_process()
            
            # Sleep until next interval
            for _ in range(learning_interval):
                if not running:
                    break
                time.sleep(1)
        except Exception as e:
            logger.error(f"Error in learning loop: {e}")
            traceback.print_exc()
            time.sleep(60)  # Wait a minute before retrying after an error

def signal_handler(sig, frame):
    """Handle Ctrl+C to gracefully exit"""
    global running
    logger.info("Shutting down...")
    running = False

def main():
    """Main function"""
    global learning_interval, min_transactions_to_process, simulation_api_url, running
    
    # Parse arguments
    args = parse_args()
    learning_interval = args.interval
    min_transactions_to_process = args.min_transactions
    simulation_api_url = args.api_url
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("Starting Lightning Lens Automated Learning System")
    logger.info(f"Learning interval: {learning_interval} seconds")
    logger.info(f"Minimum transactions to process: {min_transactions_to_process}")
    logger.info(f"API URL: {simulation_api_url}")
    
    if args.daemon:
        logger.info("Running as daemon process")
        
        # Create a daemon thread
        thread = threading.Thread(target=learning_loop)
        thread.daemon = True
        thread.start()
        
        # Keep the main thread alive
        while running:
            time.sleep(1)
    else:
        # Run in the main thread
        learning_loop()
    
    logger.info("Lightning Lens Automated Learning System stopped")

if __name__ == "__main__":
    main()
