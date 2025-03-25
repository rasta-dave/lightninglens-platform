#!/usr/bin/env python3
"""
Simulation Monitor for Lightning Lens

This script monitors the Lightning Network simulation and triggers the data processing
pipeline when the simulation completes or reaches a significant milestone.
"""

import os
import sys
import time
import json
import logging
import argparse
import subprocess
import signal
import threading
import requests
from datetime import datetime, timedelta
import glob

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SimulationMonitor")

# Define paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
SCRIPTS_DIR = os.path.join(BASE_DIR, "Lightning-Lens/lightning_lens/scripts")
DATA_DIR = os.path.join(BASE_DIR, "data")
SIMULATION_DIR = os.path.join(DATA_DIR, "simulation")

# Global variables
running = True
last_check_time = datetime.now()
check_interval = 60  # Check every minute
simulation_api_url = "http://localhost:8000/api"
auto_processing_script = os.path.join(BASE_DIR, "automated_data_processing.sh")

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Lightning Lens Simulation Monitor')
    parser.add_argument('--interval', type=int, default=60,
                        help='Check interval in seconds (default: 60)')
    parser.add_argument('--api-url', type=str, default="http://localhost:8000/api",
                        help='URL of the HTTP API (default: http://localhost:8000/api)')
    parser.add_argument('--daemon', action='store_true',
                        help='Run as a daemon process')
    return parser.parse_args()

def get_latest_simulation_file():
    """Get the latest simulation data file"""
    files = glob.glob(os.path.join(SIMULATION_DIR, "lightning_simulation_*.csv"))
    if not files:
        return None
    return max(files, key=os.path.getmtime)

def check_simulation_status():
    """Check if the simulation is running or has completed"""
    try:
        # Try to get status via API
        response = requests.get(f"{simulation_api_url}/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return data.get("status", "unknown")
    except Exception as e:
        logger.warning(f"Error checking simulation status via API: {e}")
    
    # Fallback: Check if simulation files have been updated recently
    latest_file = get_latest_simulation_file()
    if not latest_file:
        return "unknown"
    
    # Check if file was modified in the last 5 minutes
    file_mtime = datetime.fromtimestamp(os.path.getmtime(latest_file))
    if (datetime.now() - file_mtime) < timedelta(minutes=5):
        return "running"
    
    return "completed"

def trigger_data_processing():
    """Trigger the automated data processing pipeline"""
    logger.info("Triggering automated data processing...")
    
    try:
        # Run the automated data processing script
        result = subprocess.run(
            ["bash", auto_processing_script],
            check=True,
            capture_output=True,
            text=True
        )
        logger.info(f"Data processing triggered successfully: {result.stdout.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Error triggering data processing: {e}")
        logger.error(f"Error output: {e.stderr}")
        return False

def monitor_loop():
    """Main monitoring loop"""
    global running, last_check_time
    
    while running:
        try:
            logger.info(f"Checking simulation status (interval: {check_interval}s)")
            
            # Check simulation status
            status = check_simulation_status()
            logger.info(f"Simulation status: {status}")
            
            # If simulation has completed or reached a milestone, trigger data processing
            if status == "completed":
                # Check if we've already processed this completion
                if (datetime.now() - last_check_time) > timedelta(minutes=5):
                    logger.info("Simulation has completed. Triggering data processing...")
                    trigger_data_processing()
                    last_check_time = datetime.now()
            
            # Sleep until next check
            for _ in range(check_interval):
                if not running:
                    break
                time.sleep(1)
        except Exception as e:
            logger.error(f"Error in monitoring loop: {e}")
            time.sleep(60)  # Wait a minute before retrying after an error

def signal_handler(sig, frame):
    """Handle Ctrl+C to gracefully exit"""
    global running
    logger.info("Shutting down...")
    running = False

def main():
    """Main function"""
    global check_interval, simulation_api_url, running
    
    # Parse arguments
    args = parse_args()
    check_interval = args.interval
    simulation_api_url = args.api_url
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("Starting Lightning Lens Simulation Monitor")
    logger.info(f"Check interval: {check_interval} seconds")
    logger.info(f"API URL: {simulation_api_url}")
    
    # Ensure the automated data processing script is executable
    if not os.path.isfile(auto_processing_script):
        logger.error(f"Automated data processing script not found: {auto_processing_script}")
        return 1
    
    os.chmod(auto_processing_script, 0o755)
    logger.info(f"Automated data processing script is ready: {auto_processing_script}")
    
    if args.daemon:
        logger.info("Running as daemon process")
        
        # Create a daemon thread
        thread = threading.Thread(target=monitor_loop)
        thread.daemon = True
        thread.start()
        
        # Keep the main thread alive
        while running:
            time.sleep(1)
    else:
        # Run in the main thread
        monitor_loop()
    
    logger.info("Lightning Lens Simulation Monitor stopped")
    return 0

if __name__ == "__main__":
    sys.exit(main())
