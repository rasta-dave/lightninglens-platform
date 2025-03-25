#!/usr/bin/env python3
"""
Streamlined Data Processing Pipeline for Lightning-Lens

This script combines all data processing steps into a single workflow:
1. Convert raw JSON data to CSV
2. Transform transaction data
3. Generate features 
4. Train the initial model
"""

import os
import sys
import glob
import argparse
import subprocess
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("DataProcessingPipeline")

# Define paths
BASE_DIR = "/media/shahazzad/new1/KOD/LIGHTNING-LENS"
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
MODELS_DIR = os.path.join(DATA_DIR, "models")
SCRIPTS_DIR = os.path.join(BASE_DIR, "Lightning-Lens/lightning_lens/scripts")

# Ensure directories exist
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Lightning-Lens Data Processing Pipeline')
    parser.add_argument('--skip-convert', action='store_true', help='Skip JSON to CSV conversion')
    parser.add_argument('--skip-transform', action='store_true', help='Skip transaction transformation')
    parser.add_argument('--skip-features', action='store_true', help='Skip feature generation')
    parser.add_argument('--skip-training', action='store_true', help='Skip model training')
    parser.add_argument('--raw-data', help='Specific raw data file to process (default: latest)')
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

def main():
    args = parse_args()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    logger.info("Starting Lightning-Lens Data Processing Pipeline")
    
    # Step 1: Convert raw JSON data to CSV
    if not args.skip_convert:
        logger.info("Step 1: Converting raw JSON data to CSV")
        if not run_script("convert_raw_data.py"):
            logger.error("Failed to convert raw data. Exiting.")
            return False
    else:
        logger.info("Skipping Step 1: Converting raw JSON data to CSV")
    
    # Find the latest transaction CSV file
    if args.skip_convert or args.skip_transform:
        transactions_csv = get_latest_file(PROCESSED_DIR, "transactions_*.csv")
        if not transactions_csv:
            logger.error("No transaction CSV files found. Cannot proceed.")
            return False
    else:
        transactions_csv = os.path.join(PROCESSED_DIR, f"transactions_{timestamp}.csv")
    
    # Step 2: Transform transaction data
    if not args.skip_transform:
        logger.info("Step 2: Transforming transaction data")
        if not run_script("transform_transactions.py", ["--input", transactions_csv]):
            logger.error("Failed to transform transaction data. Exiting.")
            return False
    else:
        logger.info("Skipping Step 2: Transforming transaction data")
    
    # Find the latest transformed transaction CSV file
    if args.skip_transform or args.skip_features:
        transformed_csv = get_latest_file(PROCESSED_DIR, "transformed_transactions_*.csv")
        if not transformed_csv:
            logger.error("No transformed transaction CSV files found. Cannot proceed.")
            return False
    else:
        transformed_csv = os.path.join(PROCESSED_DIR, f"transformed_transactions_{timestamp}.csv")
    
    # Step 3: Generate features
    if not args.skip_features:
        logger.info("Step 3: Generating features")
        if not run_script("generate_features.py", ["--input", transformed_csv]):
            logger.error("Failed to generate features. Exiting.")
            return False
    else:
        logger.info("Skipping Step 3: Generating features")
    
    # Step 4: Train the initial model
    if not args.skip_training:
        logger.info("Step 4: Training the initial model")
        if not run_script("train_initial_model.py"):
            logger.error("Failed to train the model. Exiting.")
            return False
    else:
        logger.info("Skipping Step 4: Training the initial model")
    
    logger.info("Lightning-Lens Data Processing Pipeline completed successfully!")
    
    # Print model file path
    model_file = get_latest_file(MODELS_DIR, "model_initial_*.pkl")
    if model_file:
        logger.info(f"Latest model: {model_file}")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)