#!/usr/bin/env python3
"""
Patch the generate_features.py script to work with the current transaction data format
"""

import os
import sys
import fileinput
import re

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def patch_generate_features():
    """Patch the generate_features.py script"""
    script_path = "scripts/generate_features.py"
    
    if not os.path.exists(script_path):
        print(f"Error: {script_path} not found")
        return False
    
    # Create a backup
    backup_path = f"{script_path}.bak"
    with open(script_path, 'r') as src, open(backup_path, 'w') as dst:
        dst.write(src.read())
    
    print(f"Created backup: {backup_path}")
    
    # Patterns to find and replace
    patterns = [
        # Replace node extraction
        (r"all_nodes = set\(\)\s+for col in \['sender', 'receiver'\]:\s+all_nodes\.update\(transactions_df\[col\]\.unique\(\)\)", 
         "all_nodes = set()\n    # Extract node names from channel_id\n    for channel_id in transactions_df['channel_id'].unique():\n        if channel_id and isinstance(channel_id, str):\n            parts = channel_id.split('_')\n            if len(parts) > 0:\n                all_nodes.add(parts[0])"),
        
        # Replace transaction processing
        (r"for _, tx in transactions_df\.iterrows\(\):\s+sender = tx\['sender'\]\s+receiver = tx\['receiver'\]\s+amount = tx\['amount'\]\s+success = tx\['success'\]", 
         "for _, tx in transactions_df.iterrows():\n        # Skip rows without channel_id\n        if not tx.get('channel_id') or not isinstance(tx.get('channel_id'), str):\n            continue\n            \n        # Extract sender and receiver from channel_id\n        channel_parts = tx.get('channel_id', '').split('_')\n        if len(channel_parts) < 2:\n            continue\n            \n        sender = channel_parts[0]\n        receiver = 'unknown'\n        if len(channel_parts) > 1:\n            receiver = channel_parts[1]\n            \n        amount = tx.get('avg_amount', 1000)\n        success = 1 if tx.get('success_rate', 0.9) > 0.5 else 0")
    ]
    
    # Apply patches
    for pattern, replacement in patterns:
        with fileinput.input(files=(script_path,), inplace=True) as f:
            for line in f:
                patched_content = re.sub(pattern, replacement, line, flags=re.DOTALL)
                print(patched_content, end='')
    
    print(f"Patched {script_path}")
    return True

if __name__ == "__main__":
    patch_generate_features() 