#!/usr/bin/env python3
"""
Generate features from transaction data for the LightningLens model
"""

import os
import sys
import pandas as pd
import numpy as np
import argparse
from datetime import datetime

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def parse_args():
    parser = argparse.ArgumentParser(description='Generate features from transaction data')
    parser.add_argument('--input', type=str, required=True, help='Input transaction CSV file')
    parser.add_argument('--output', type=str, help='Output features CSV file')
    return parser.parse_args()

def generate_features(input_file, output_file=None):
    """Generate features from transaction data"""
    print("LightningLens Feature Generator")
    print("===============================")
    print(f"Using transaction data from: {input_file}")
    
    # Read the transaction data
    try:
        transactions_df = pd.read_csv(input_file)
    except Exception as e:
        print(f"Error reading input file: {str(e)}")
        return False
    
    # Extract all unique nodes
    all_nodes = set()
    for col in ['sender', 'receiver']:
        all_nodes.update(transactions_df[col].unique())
    
    print(f"Found {len(all_nodes)} unique nodes")
    
    # Initialize feature dictionaries
    node_features = {}
    for node in all_nodes:
        node_features[node] = {
            'sent_count': 0,
            'received_count': 0,
            'sent_amount': 0,
            'received_amount': 0,
            'success_rate': 0,
            'avg_fee': 0,
            'avg_sent_amount': 0,
            'avg_received_amount': 0,
            'balance_ratio': 0.5,  # Default balance ratio
        }
    
    # Process transactions to calculate features
    for _, tx in transactions_df.iterrows():
        sender = tx['sender']
        receiver = tx['receiver']
        amount = tx['amount']
        success = tx['success']
        
        # Update sender features
        node_features[sender]['sent_count'] += 1
        node_features[sender]['sent_amount'] += amount
        
        # Update receiver features
        node_features[receiver]['received_count'] += 1
        node_features[receiver]['received_amount'] += amount
        
        # Update success rate
        if success:
            node_features[sender]['success_rate'] += 1
        
        # Update fee
        if 'fee' in tx:
            node_features[sender]['avg_fee'] += tx['fee']
        
        # Update balance ratio if available
        if 'balance_ratio' in tx and not pd.isna(tx['balance_ratio']):
            # Use the most recent balance ratio
            node_features[sender]['balance_ratio'] = tx['balance_ratio']
    
    # Calculate averages and normalize features
    for node, features in node_features.items():
        # Calculate success rate
        if features['sent_count'] > 0:
            features['success_rate'] /= features['sent_count']
        
        # Calculate average fee
        if features['sent_count'] > 0:
            features['avg_fee'] /= features['sent_count']
        
        # Calculate average sent amount
        if features['sent_count'] > 0:
            features['avg_sent_amount'] = features['sent_amount'] / features['sent_count']
        
        # Calculate average received amount
        if features['received_count'] > 0:
            features['avg_received_amount'] = features['received_amount'] / features['received_count']
    
    # Create a DataFrame from the features
    features_data = []
    for node, features in node_features.items():
        features_data.append({
            'node': node,
            'sent_count': features['sent_count'],
            'received_count': features['received_count'],
            'sent_amount': features['sent_amount'],
            'received_amount': features['received_amount'],
            'success_rate': features['success_rate'],
            'avg_fee': features['avg_fee'],
            'avg_sent_amount': features['avg_sent_amount'],
            'avg_received_amount': features['avg_received_amount'],
            'balance_ratio': features['balance_ratio'],
        })
    
    features_df = pd.DataFrame(features_data)
    
    # Determine output file name if not provided
    if not output_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"data/processed/features_{timestamp}.csv"
    
    # Save to CSV
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    features_df.to_csv(output_file, index=False)
    
    print(f"Generated features for {len(features_data)} nodes")
    print(f"Saved to: {output_file}")
    
    return True

def main():
    args = parse_args()
    generate_features(args.input, args.output)

if __name__ == "__main__":
    main() 