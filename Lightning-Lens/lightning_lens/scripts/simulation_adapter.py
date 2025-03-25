#!/usr/bin/env python3
"""
Simulation Adapter for LightningLens

This script provides an adapter that the Lightning Network simulation
can use to receive and apply rebalancing suggestions.
"""

import os
import sys
import json
import logging
import argparse
import requests
from flask import Flask, jsonify, request

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SimulationAdapter")

app = Flask(__name__)

# Configuration
SIMULATION_COMMAND_URL = "http://localhost:8080/api/command"  # Update with your simulation command endpoint

def apply_rebalance(suggestion):
    """Apply a rebalancing suggestion to the simulation"""
    try:
        channel_id = suggestion.get('channel_id')
        source_node = suggestion.get('source_node')
        target_node = suggestion.get('target_node')
        amount = suggestion.get('amount')
        direction = suggestion.get('direction')
        
        if not all([channel_id, source_node, target_node, amount, direction]):
            logger.warning(f"Missing required fields in suggestion: {suggestion}")
            return False
        
        # Construct the command for the simulation
        command = {
            "command": "rebalance",
            "params": {
                "channel_id": channel_id,
                "source": source_node,
                "target": target_node,
                "amount": amount,
                "direction": direction
            }
        }
        
        # Send command to simulation
        response = requests.post(SIMULATION_COMMAND_URL, json=command, timeout=5)
        
        if response.status_code == 200:
            logger.info(f"Successfully applied rebalance for {channel_id}: {direction} {amount} sats")
            return True
        else:
            logger.warning(f"Failed to apply rebalance: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"Error applying rebalance: {str(e)}")
        return False

@app.route('/api/rebalance', methods=['POST'])
def receive_rebalance():
    """API endpoint to receive rebalancing suggestions"""
    try:
        suggestion = request.json
        logger.info(f"Received rebalance suggestion for {suggestion.get('channel_id')}")
        
        # Apply the rebalance to the simulation
        success = apply_rebalance(suggestion)
        
        if success:
            return jsonify({"status": "success", "message": "Rebalance applied successfully"})
        else:
            return jsonify({"status": "error", "message": "Failed to apply rebalance"}), 500
            
    except Exception as e:
        logger.error(f"Error processing rebalance suggestion: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Simulation Adapter for LightningLens')
    parser.add_argument('--port', type=int, default=8081,
                        help='Port to run the adapter on (default: 8081)')
    parser.add_argument('--simulation-url', type=str,
                        help='URL of the simulation command endpoint')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    
    # Update simulation URL if provided
    if args.simulation_url:
        SIMULATION_COMMAND_URL = args.simulation_url
        logger.info(f"Using simulation command URL: {SIMULATION_COMMAND_URL}")
    
    logger.info(f"Starting Simulation Adapter on port {args.port}")
    app.run(host='0.0.0.0', port=args.port) 