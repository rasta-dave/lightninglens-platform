#!/usr/bin/env python3
"""
Transform transaction data to match the expected format for feature generation

This script adds missing fields to transaction data that are required by the feature generator.
"""

import os
import sys
import pandas as pd
import argparse
import random
from datetime import datetime

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def parse_args():
    parser = argparse.ArgumentParser(description='Transform transaction data for feature generation')
    parser.add_argument('--input', type=str, required=True, help='Input transaction CSV file')
    parser.add_argument('--output', type=str, help='Output transformed CSV file')
    return parser.parse_args()

def transform_transactions(input_file, output_file=None):
    """Transform transaction data to match the expected format"""
    print(f"Transforming transaction data from: {input_file}")
    
    # Read the input file
    try:
        df = pd.read_csv(input_file)
    except Exception as e:
        print(f"Error reading input file: {str(e)}")
        return False
    
    # Get unique channel IDs to use as node identifiers
    channel_ids = []
    for channel_id in df['channel_id'].unique():
        if channel_id and isinstance(channel_id, str):
            channel_ids.append(channel_id)
    
    # If no valid channel IDs, create some dummy node names
    if not channel_ids:
        node_names = ['node_a', 'node_b', 'node_c', 'node_d', 'node_e']
    else:
        # Extract node names from channel IDs
        node_names = []
        for channel_id in channel_ids:
            parts = channel_id.split('_')
            if len(parts) > 0:
                node_name = parts[0]
                if node_name not in node_names:
                    node_names.append(node_name)
    
    # If still no node names, create dummy ones
    if not node_names:
        node_names = ['node_a', 'node_b', 'node_c', 'node_d', 'node_e']
    
    # Add required fields
    transformed_data = []
    
    for _, row in df.iterrows():
        # Generate random sender and receiver
        sender = random.choice(node_names)
        receiver = random.choice([n for n in node_names if n != sender])
        
        # Create transformed row
        transformed_row = {
            'timestamp': row.get('timestamp', datetime.now().isoformat()),
            'sender': sender,
            'receiver': receiver,
            'amount': row.get('avg_amount', 1000),
            'fee': random.randint(1, 10),
            'success': 1 if random.random() < row.get('success_rate', 0.9) else 0,
            'channel_id': row.get('channel_id', ''),
            'capacity': row.get('capacity', 1000000),
            'local_balance': row.get('local_balance', 500000),
            'remote_balance': row.get('remote_balance', 500000),
            'balance_ratio': row.get('balance_ratio', 0.5),
            'tx_count': row.get('tx_count', 0)
        }
        
        transformed_data.append(transformed_row)
    
    # Create DataFrame from transformed data
    transformed_df = pd.DataFrame(transformed_data)
    
    # Determine output file name if not provided
    if not output_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"data/processed/transformed_transactions_{timestamp}.csv"
    
    # Save to CSV
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    transformed_df.to_csv(output_file, index=False)
    
    print(f"Transformed {len(transformed_data)} transactions")
    print(f"Saved to: {output_file}")
    
    return True

def main():
    args = parse_args()
    transform_transactions(args.input, args.output)

if __name__ == "__main__":
    main() 