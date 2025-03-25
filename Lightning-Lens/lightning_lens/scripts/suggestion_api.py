#!/usr/bin/env python3
"""
Suggestion API for LightningLens

This script provides an API endpoint that sends rebalancing suggestions
to the Lightning Network simulation in real-time.
"""

import os
import sys
import json
import requests
import logging
import argparse
import pandas as pd
from flask import Flask, jsonify, request
from datetime import datetime

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SuggestionAPI")

app = Flask(__name__)

# Configuration
SIMULATION_API_URL = "http://localhost:8080/api/rebalance"  # Update with your simulation API endpoint

def load_latest_predictions():
    """Load the latest prediction data"""
    try:
        predictions_file = "data/predictions/latest_predictions.csv"
        if not os.path.exists(predictions_file):
            logger.error(f"Predictions file not found: {predictions_file}")
            return None
        
        df = pd.read_csv(predictions_file)
        logger.info(f"Loaded {len(df)} predictions from {predictions_file}")
        return df
    except Exception as e:
        logger.error(f"Error loading predictions: {str(e)}")
        return None

def send_suggestion_to_simulation(channel_id, current_ratio, optimal_ratio, adjustment_needed):
    """Send a rebalancing suggestion to the simulation"""
    try:
        # Parse channel_id to extract node information
        parts = channel_id.split('_')
        if len(parts) < 2:
            logger.warning(f"Invalid channel_id format: {channel_id}")
            return False
        
        source_node = parts[0]
        target_node = parts[1]
        
        # Calculate amount to rebalance (as a percentage of capacity)
        # Assuming capacity is 1,000,000 sats (adjust as needed)
        capacity = 1000000
        amount_to_rebalance = int(abs(adjustment_needed) * capacity)
        
        # Determine direction (positive adjustment means add funds to local balance)
        direction = "in" if adjustment_needed > 0 else "out"
        
        # Prepare the suggestion payload
        suggestion = {
            "channel_id": channel_id,
            "source_node": source_node,
            "target_node": target_node,
            "current_ratio": current_ratio,
            "optimal_ratio": optimal_ratio,
            "adjustment_needed": adjustment_needed,
            "amount": amount_to_rebalance,
            "direction": direction,
            "timestamp": datetime.now().isoformat()
        }
        
        # Send to simulation
        response = requests.post(SIMULATION_API_URL, json=suggestion, timeout=5)
        
        if response.status_code == 200:
            logger.info(f"Successfully sent suggestion for {channel_id}: {direction} {amount_to_rebalance} sats")
            return True
        else:
            logger.warning(f"Failed to send suggestion: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        logger.error(f"Error sending suggestion: {str(e)}")
        return False

@app.route('/api/suggestions', methods=['GET'])
def get_suggestions():
    """API endpoint to get all current suggestions"""
    df = load_latest_predictions()
    if df is None:
        return jsonify({"error": "Failed to load predictions"}), 500
    
    # Convert to list of dictionaries for JSON response
    suggestions = []
    for _, row in df.iterrows():
        # Only include channels that need significant adjustment
        if abs(row['adjustment_needed']) > 0.05:  # 5% threshold
            suggestion = {
                "channel_id": row['channel_id'],
                "current_ratio": float(row['balance_ratio']),
                "optimal_ratio": float(row['optimal_ratio']),
                "adjustment_needed": float(row['adjustment_needed']),
                "significant": abs(row['adjustment_needed']) > 0.1  # Flag for UI highlighting
            }
            suggestions.append(suggestion)
    
    return jsonify({"suggestions": suggestions, "count": len(suggestions)})

@app.route('/api/send-suggestions', methods=['POST'])
def send_suggestions():
    """API endpoint to send suggestions to the simulation"""
    df = load_latest_predictions()
    if df is None:
        return jsonify({"error": "Failed to load predictions"}), 500
    
    # Get threshold from request or use default
    threshold = request.json.get('threshold', 0.1) if request.is_json else 0.1
    
    # Filter channels that need significant adjustment
    significant_df = df[abs(df['adjustment_needed']) > threshold]
    
    # Send suggestions to simulation
    success_count = 0
    for _, row in significant_df.iterrows():
        if send_suggestion_to_simulation(
            row['channel_id'],
            row['balance_ratio'],
            row['optimal_ratio'],
            row['adjustment_needed']
        ):
            success_count += 1
    
    return jsonify({
        "total": len(significant_df),
        "sent": success_count,
        "threshold": threshold
    })

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Suggestion API for LightningLens')
    parser.add_argument('--port', type=int, default=5002,
                        help='Port to run the API server on (default: 5002)')
    parser.add_argument('--simulation-url', type=str,
                        help='URL of the simulation API endpoint')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    
    # Update simulation URL if provided
    if args.simulation_url:
        SIMULATION_API_URL = args.simulation_url
        logger.info(f"Using simulation API URL: {SIMULATION_API_URL}")
    
    logger.info(f"Starting Suggestion API on port {args.port}")
    app.run(host='0.0.0.0', port=args.port) 