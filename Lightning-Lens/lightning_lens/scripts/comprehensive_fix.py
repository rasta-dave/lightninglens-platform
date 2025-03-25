#!/usr/bin/env python3
"""
Comprehensive fix for the generate_features.py script
"""

import os
import sys
import re

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def comprehensive_fix():
    """Apply a comprehensive fix to the generate_features.py script"""
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
        content = f.read()
    
    # Find all occurrences of hardcoded file paths
    hardcoded_paths = re.findall(r'["\']data/processed/transactions_[^"\']+["\']', content)
    
    if hardcoded_paths:
        print(f"Found {len(hardcoded_paths)} hardcoded file paths:")
        for path in hardcoded_paths:
            print(f"  - {path}")
        
        # Replace all hardcoded paths with args.input
        fixed_content = content
        for path in hardcoded_paths:
            fixed_content = fixed_content.replace(path, 'args.input')
        
        # Write the fixed content back to the script
        with open(script_path, 'w') as f:
            f.write(fixed_content)
        
        print(f"Fixed all hardcoded paths in {script_path}")
    else:
        print("No hardcoded file paths found.")
        
        # Check if there's a print statement that shows the wrong file
        print_statements = re.findall(r'print\([^)]*transactions[^)]*\)', content)
        
        if print_statements:
            print(f"Found {len(print_statements)} print statements about transactions:")
            for stmt in print_statements:
                print(f"  - {stmt}")
            
            # Replace the print statement to show the correct file
            fixed_content = re.sub(
                r'print\([^"\']*["\']Using transaction data from: [^"\']+["\']\)',
                'print(f"Using transaction data from: {args.input}")',
                content
            )
            
            # Write the fixed content back to the script
            with open(script_path, 'w') as f:
                f.write(fixed_content)
            
            print(f"Fixed print statements in {script_path}")
        else:
            print("No print statements about transactions found.")
    
    return True

if __name__ == "__main__":
    comprehensive_fix() 