#!/usr/bin/env python3
"""
Feature Adapter for LightningLens

This script adapts channel state data from the simulation to match
the feature format expected by the trained model.
"""

import os
import sys
import json
import pandas as pd
import numpy as np
from datetime import datetime
import requests

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def adapt_channel_state(channel_data):
    """
    Adapt channel state data to match the format expected by the model
    
    Args:
        channel_data: Dictionary containing channel state information
        
    Returns:
        Dictionary with adapted features
    """
    # Create a new dictionary with the required format
    adapted_data = {
        "event_type": "channel_state",
        "channel_id": None,
        "capacity": 0,
        "local_balance": 0,
        "remote_balance": 0,
        "balance_ratio": 0.0,
        "tx_count": 0,
        "success_rate": 1.0,
        "avg_amount": 0
    }
    
    # Copy existing fields
    if isinstance(channel_data, dict):
        for key in channel_data:
            if key in adapted_data:
                adapted_data[key] = channel_data[key]
    
    # Generate channel_id if missing
    if not adapted_data["channel_id"] and "node" in channel_data and "remote_pubkey" in channel_data:
        adapted_data["channel_id"] = f"{channel_data['node']}_{channel_data['remote_pubkey'][:8]}"
    
    # Calculate balance_ratio if missing
    if adapted_data["balance_ratio"] == 0.0 and "capacity" in channel_data and "local_balance" in channel_data:
        capacity = float(channel_data["capacity"])
        if capacity > 0:
            adapted_data["balance_ratio"] = float(channel_data["local_balance"]) / capacity
    
    # Set capacity, local_balance, remote_balance if they exist in the input
    if "capacity" in channel_data:
        adapted_data["capacity"] = int(channel_data["capacity"])
    
    if "local_balance" in channel_data:
        adapted_data["local_balance"] = int(channel_data["local_balance"])
    
    if "remote_balance" in channel_data:
        adapted_data["remote_balance"] = int(channel_data["remote_balance"])
    elif "capacity" in channel_data and "local_balance" in channel_data:
        adapted_data["remote_balance"] = int(channel_data["capacity"]) - int(channel_data["local_balance"])
    
    return adapted_data

def send_to_http_api(data):
    """Send adapted data to the HTTP API"""
    try:
        response = requests.post("http://localhost:5000/api/update", json=data, timeout=2)
        if response.status_code == 200:
            print(f"✅ Adapted data sent to HTTP API")
            return True
        else:
            print(f"⚠️ HTTP API returned status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"⚠️ Error sending data to HTTP API: {str(e)}")
        return False

def process_file(filepath):
    """Process a JSON or CSV file containing channel data"""
    if not os.path.exists(filepath):
        print(f"Error: File {filepath} not found")
        return False
    
    try:
        # Determine file type
        if filepath.endswith('.json'):
            with open(filepath, 'r') as f:
                data = json.load(f)
                
            if isinstance(data, list):
                for item in data:
                    adapted = adapt_channel_state(item)
                    send_to_http_api(adapted)
            elif isinstance(data, dict):
                adapted = adapt_channel_state(data)
                send_to_http_api(adapted)
            
        elif filepath.endswith('.csv'):
            df = pd.read_csv(filepath)
            for _, row in df.iterrows():
                adapted = adapt_channel_state(row.to_dict())
                send_to_http_api(adapted)
        
        return True
    except Exception as e:
        print(f"Error processing file: {str(e)}")
        return False

def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: python feature_adapter.py <json_data_or_filepath>")
        return
    
    input_data = sys.argv[1]
    
    # Check if input is a file path
    if os.path.exists(input_data):
        process_file(input_data)
    else:
        # Try to parse as JSON
        try:
            data = json.loads(input_data)
            adapted = adapt_channel_state(data)
            send_to_http_api(adapted)
        except json.JSONDecodeError:
            print("Error: Input is neither a valid file path nor valid JSON")

if __name__ == "__main__":
    main() 