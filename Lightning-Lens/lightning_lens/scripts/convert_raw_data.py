#!/usr/bin/env python3
"""
Convert raw HTTP data to both transaction and channel state CSV files

This script reads the raw JSON data saved by the HTTP server and converts it
to both transaction and channel state CSV files that can be used for feature generation.
"""

import os
import sys
import json
import glob
import pandas as pd
from datetime import datetime

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def convert_raw_data():
    """Convert raw JSON data to both transaction and channel state CSV files"""
    # Find all raw JSON files
    raw_files = glob.glob("data/raw/http_data_*.json")
    
    if not raw_files:
        print("No raw data files found in data/raw/")
        return
    
    # Create lists to store all transactions and channel states
    all_transactions = []
    all_channel_states = []
    
    # Process each raw file
    for raw_file in raw_files:
        print(f"Processing {raw_file}...")
        
        # Load the raw data
        with open(raw_file, 'r') as f:
            raw_data = json.load(f)
        
        # Process each item in the raw data
        for item in raw_data:
            event_type = item.get('event_type', '')
            
            # Common fields for both types
            common_fields = {
                'timestamp': item.get('timestamp', datetime.now().isoformat()),
                'channel_id': item.get('channel_id', ''),
                'capacity': item.get('capacity', 0),
                'local_balance': item.get('local_balance', 0),
                'remote_balance': item.get('remote_balance', 0),
                'balance_ratio': item.get('balance_ratio', 0.0),
                'tx_count': item.get('tx_count', 0),
                'success_rate': item.get('success_rate', 1.0),
                'avg_amount': item.get('avg_amount', 0)
            }
            
            # Add to the appropriate list based on event type
            if event_type == 'transaction':
                all_transactions.append(common_fields)
            elif event_type == 'channel_state':
                all_channel_states.append(common_fields)
    
    # Generate timestamp for filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create directory if it doesn't exist
    os.makedirs("data/processed", exist_ok=True)
    
    # Save transactions to CSV
    if all_transactions:
        df_transactions = pd.DataFrame(all_transactions)
        output_file = f"data/processed/transactions_{timestamp}.csv"
        df_transactions.to_csv(output_file, index=False)
        print(f"Saved {len(all_transactions)} transactions to {output_file}")
    else:
        print("No transactions found in raw data files")
    
    # Save channel states to CSV
    if all_channel_states:
        df_channel_states = pd.DataFrame(all_channel_states)
        output_file = f"data/processed/channel_states_{timestamp}.csv"
        df_channel_states.to_csv(output_file, index=False)
        print(f"Saved {len(all_channel_states)} channel states to {output_file}")
    else:
        print("No channel states found in raw data files")

if __name__ == "__main__":
    convert_raw_data() 