#!/usr/bin/env python3
"""
Directly fix the generate_features.py script to use the transformed transactions file
"""

import os
import sys

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def direct_fix():
    """Directly fix the generate_features.py script"""
    script_path = "scripts/generate_features.py"
    
    if not os.path.exists(script_path):
        print(f"Error: {script_path} not found")
        return False
    
    # Create a backup if it doesn't exist
    backup_path = f"{script_path}.original"
    if not os.path.exists(backup_path):
        with open(script_path, 'r') as src, open(backup_path, 'w') as dst:
            dst.write(src.read())
        print(f"Created backup: {backup_path}")
    
    # Read the script content
    with open(script_path, 'r') as f:
        lines = f.readlines()
    
    # Find the line that reads the transactions file
    for i, line in enumerate(lines):
        if "transactions_df = pd.read_csv" in line:
            # Replace with the correct file path
            lines[i] = "    transactions_df = pd.read_csv(args.input)\n"
            print(f"Fixed line {i+1}: {lines[i].strip()}")
            break
    
    # Write the fixed content back to the script
    with open(script_path, 'w') as f:
        f.writelines(lines)
    
    print(f"Fixed {script_path}")
    return True

if __name__ == "__main__":
    direct_fix() 