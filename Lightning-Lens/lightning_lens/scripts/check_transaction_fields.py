#!/usr/bin/env python3
"""
Check if a transaction CSV file has the required fields for feature generation
"""

import os
import sys
import pandas as pd
import argparse

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def parse_args():
    parser = argparse.ArgumentParser(description='Check transaction CSV fields')
    parser.add_argument('--input', type=str, required=True, help='Input transaction CSV file')
    return parser.parse_args()

def check_transaction_fields(input_file):
    """Check if a transaction CSV file has the required fields"""
    print(f"Checking transaction data from: {input_file}")
    
    # Read the input file
    try:
        df = pd.read_csv(input_file)
    except Exception as e:
        print(f"Error reading input file: {str(e)}")
        return False
    
    # Print the column names
    print("\nColumn names in the file:")
    for col in df.columns:
        print(f"  - {col}")
    
    # Check for required fields
    required_fields = ['sender', 'receiver', 'amount', 'success']
    missing_fields = [field for field in required_fields if field not in df.columns]
    
    if missing_fields:
        print("\nMissing required fields:")
        for field in missing_fields:
            print(f"  - {field}")
        return False
    else:
        print("\nAll required fields are present!")
        
        # Print a sample row
        print("\nSample row:")
        sample_row = df.iloc[0]
        for col in df.columns:
            print(f"  {col}: {sample_row[col]}")
        
        return True

def main():
    args = parse_args()
    check_transaction_fields(args.input)

if __name__ == "__main__":
    main() 