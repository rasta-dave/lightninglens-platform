#!/usr/bin/env python3
"""
Fix the input parameter handling in generate_features.py
"""

import os
import sys
import fileinput
import re

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def fix_generate_features():
    """Fix the input parameter handling in generate_features.py"""
    script_path = "scripts/generate_features.py"
    
    if not os.path.exists(script_path):
        print(f"Error: {script_path} not found")
        return False
    
    # Create a backup
    backup_path = f"{script_path}.bak"
    if not os.path.exists(backup_path):
        with open(script_path, 'r') as src, open(backup_path, 'w') as dst:
            dst.write(src.read())
        print(f"Created backup: {backup_path}")
    
    # Read the script content
    with open(script_path, 'r') as f:
        content = f.read()
    
    # Check if there's a hardcoded input file path
    if "data/processed/transactions_" in content:
        print("Found hardcoded input file path. Fixing...")
        
        # Replace hardcoded path with args.input
        fixed_content = re.sub(
            r'(transactions_df = pd\.read_csv\()["\']data/processed/transactions_[^"\']+["\'](\))',
            r'\1args.input\2',
            content
        )
        
        # Write the fixed content back to the script
        with open(script_path, 'w') as f:
            f.write(fixed_content)
        
        print(f"Fixed {script_path}")
        return True
    else:
        print("No hardcoded input file path found. Checking input parameter handling...")
        
        # Check if args.input is used correctly
        if "args.input" in content:
            print("Input parameter seems to be handled correctly in the code.")
            print("The issue might be elsewhere. Let's print the input parameter value for debugging.")
            
            # Add debug print
            debug_line = '\n    print(f"Debug: Input parameter value is {args.input}")\n'
            fixed_content = re.sub(
                r'(def generate_features\(\):\s+"""[^"]*"""\s+)(\w)',
                r'\1    print(f"Debug: Input parameter value is {args.input}")\n    \2',
                content
            )
            
            # Write the fixed content back to the script
            with open(script_path, 'w') as f:
                f.write(fixed_content)
            
            print(f"Added debug print to {script_path}")
            return True
        else:
            print("Input parameter handling issue detected. Adding proper input parameter handling...")
            
            # Add proper input parameter handling
            fixed_content = re.sub(
                r'(def generate_features\(\):\s+"""[^"]*"""\s+)(transactions_df = pd\.read_csv\([^)]+\))',
                r'\1    # Use the input file specified in the command line arguments\n    transactions_df = pd.read_csv(args.input)',
                content
            )
            
            # Write the fixed content back to the script
            with open(script_path, 'w') as f:
                f.write(fixed_content)
            
            print(f"Fixed input parameter handling in {script_path}")
            return True

if __name__ == "__main__":
    fix_generate_features() 