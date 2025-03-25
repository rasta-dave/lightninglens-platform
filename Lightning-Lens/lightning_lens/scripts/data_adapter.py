#!/usr/bin/env python3
"""
LightningLens Data Adapter

This script adapts data from your Lightning Network simulation to the format
expected by the LightningLens online learning module.
"""

import requests
import json
import time
import sys
import os
import pandas as pd
from datetime import datetime

# Configuration
HTTP_SERVER_URL = "http://localhost:5000/api/update"

def adapt_channel_state(channel_data):
    """
    Adapt channel state data to the format expected by the online learner
    
    Expected format:
    {
        "event_type": "channel_state",
        "channel_id": "lnd-alice_lnd-bob",
        "node": "lnd-alice",
        "remote_pubkey": "lnd-bob",
        "capacity": 1000000,
        "local_balance": 564329,
        "remote_balance": 435671,
        "balance_ratio": 0.564329  # This is what's missing
    }
    """
    # If balance_ratio is missing, calculate it
    if 'balance_ratio' not in channel_data and 'local_balance' in channel_data and 'capacity' in channel_data:
        channel_data['balance_ratio'] = channel_data['local_balance'] / channel_data['capacity']
    
    # If channel_id is missing, create it
    if 'channel_id' not in channel_data and 'node' in channel_data and 'remote_pubkey' in channel_data:
        channel_data['channel_id'] = f"{channel_data['node']}_{channel_data['remote_pubkey']}"
    
    return channel_data

def adapt_transaction(transaction_data):
    """
    Adapt transaction data from simulation CSV format to the expected format
    
    Expected output format:
    {
        "event_type": "transaction",
        "timestamp": "2025-03-20T16:11:13.890481",
        "transaction": {
            "sender": "lnd-bob",
            "receiver": "lnd-eve",
            "amount": 1049,
            "success": true,
            "fee": 0,
            "description": "Donation"
        },
        "channels": { ... }  # Channel state after transaction
    }
    """
    # Create adapted transaction structure
    adapted_data = {
        "event_type": "transaction",
        "timestamp": transaction_data.get("timestamp", datetime.now().isoformat()),
        "transaction": {
            "sender": transaction_data.get("sender", "unknown"),
            "receiver": transaction_data.get("receiver", "unknown"),
            "amount": int(transaction_data.get("amount", 0)),
            "success": True if transaction_data.get("success", "").lower() == "true" else False,
            "fee": int(transaction_data.get("fee", 0)),
            "description": transaction_data.get("description", "")
        }
    }
    
    # Extract channel data from the 'channel_after' field if it exists
    try:
        channel_after = transaction_data.get("channel_after", "{}")
        if isinstance(channel_after, str) and channel_after:
            channel_data = json.loads(channel_after.replace('\"', '"'))
            adapted_data["channels"] = channel_data
    except Exception as e:
        print(f"Error parsing channel data: {str(e)}")
    
    return adapted_data

def process_simulation_file(file_path):
    """Process a simulation CSV file and send data to the HTTP server"""
    try:
        print(f"Processing simulation file: {file_path}")
        df = pd.read_csv(file_path)
        
        if df.empty:
            print("Simulation file is empty")
            return False
            
        print(f"Found {len(df)} transactions in the simulation file")
        success_count = 0
        
        for _, row in df.iterrows():
            # Convert row to dict
            row_dict = row.to_dict()
            
            # Adapt data based on the type
            if row_dict.get("type") == "payment":
                adapted_data = adapt_transaction(row_dict)
                if send_to_server(adapted_data):
                    success_count += 1
                    
                # Also create and send channel state updates
                try:
                    if "channel_after" in row_dict and row_dict["channel_after"]:
                        channel_data = json.loads(row_dict["channel_after"].replace('\"', '"'))
                        if channel_data:
                            # Create channel state event
                            channel_state = {
                                "event_type": "channel_state",
                                "timestamp": row_dict.get("timestamp", datetime.now().isoformat()),
                                "channels": channel_data
                            }
                            if send_to_server(channel_state):
                                success_count += 1
                except Exception as e:
                    print(f"Error processing channel state: {str(e)}")
            
            # Sleep a bit to avoid overwhelming the server
            time.sleep(0.1)
            
        print(f"Successfully sent {success_count} updates to server")
        return True
    except Exception as e:
        print(f"Error processing simulation file: {str(e)}")
        return False

def send_to_server(data):
    """Send adapted data to the HTTP server"""
    try:
        # Adapt data based on event type
        if data.get('event_type') == 'channel_state':
            if 'node' in data: # Single channel update
                data = adapt_channel_state(data)
        
        # Send to server
        response = requests.post(HTTP_SERVER_URL, json=data)
        if response.status_code == 200:
            print(f"Successfully sent {data.get('event_type', 'unknown')} data to server")
            return True
        else:
            print(f"Error sending data: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"Error sending data: {str(e)}")
        return False

def scan_simulation_directory():
    """Scan the simulation directory for new files to process"""
    sim_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                           "data", "simulation")
    
    # Alternative path in case the above doesn't exist
    alt_sim_dir = "/media/shahazzad/new3/KOD/LIGHTNING-LENS/data/simulation"
    
    if not os.path.exists(sim_dir) and os.path.exists(alt_sim_dir):
        sim_dir = alt_sim_dir
    
    if not os.path.exists(sim_dir):
        print(f"Simulation directory not found: {sim_dir}")
        return False
    
    # Get list of CSV files
    files = sorted([os.path.join(sim_dir, f) for f in os.listdir(sim_dir) 
                   if f.startswith('lightning_simulation_') and f.endswith('.csv')],
                  key=os.path.getmtime, reverse=True)
    
    if not files:
        print("No simulation files found")
        return False
    
    # Process the most recent file
    most_recent = files[0]
    print(f"Processing most recent simulation file: {most_recent}")
    return process_simulation_file(most_recent)

def main():
    """Main function to process command line input"""
    if len(sys.argv) < 2:
        # No arguments, scan simulation directory
        print("No arguments provided, scanning simulation directory for data")
        scan_simulation_directory()
        return
    
    # Single JSON command
    if len(sys.argv) == 2 and not sys.argv[1].endswith('.csv'):
        try:
            # Parse JSON data from command line
            data = json.loads(sys.argv[1])
            send_to_server(data)
        except json.JSONDecodeError:
            print("Error: Invalid JSON data")
        except Exception as e:
            print(f"Error: {str(e)}")
        return
    
    # CSV file path provided
    if len(sys.argv) == 2 and sys.argv[1].endswith('.csv'):
        process_simulation_file(sys.argv[1])
        return
        
    print("Usage:")
    print("  python data_adapter.py                               # Process latest simulation file")
    print("  python data_adapter.py <json_data>                   # Process JSON string")
    print("  python data_adapter.py path/to/simulation_file.csv   # Process CSV file")

if __name__ == "__main__":
    main() 