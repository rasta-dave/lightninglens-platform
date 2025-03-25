#!/usr/bin/env python3
"""
Fix the 'args' not defined error in generate_features.py
"""

import os
import sys
import re

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def fix_args_error():
    """Fix the 'args' not defined error in generate_features.py"""
    script_path = "scripts/generate_features.py"
    
    if not os.path.exists(script_path):
        print(f"Error: {script_path} not found")
        return False
    
    # Create a backup if it doesn't exist
    backup_path = f"{script_path}.args_backup"
    if not os.path.exists(backup_path):
        with open(script_path, 'r') as src, open(backup_path, 'w') as dst:
            dst.write(src.read())
        print(f"Created backup: {backup_path}")
    
    # Read the script content
    with open(script_path, 'r') as f:
        lines = f.readlines()
    
    # Find the generate_features function definition
    for i, line in enumerate(lines):
        if "def generate_features(" in line:
            # Check if it already has args parameter
            if "args" in line:
                print("Function already has args parameter")
                break
                
            # Add args parameter to the function
            lines[i] = line.replace("def generate_features(", "def generate_features(args, ")
            print(f"Added args parameter to function definition: {lines[i].strip()}")
            
            # Now find where the function is called
            for j, call_line in enumerate(lines):
                if "if generate_features(" in call_line:
                    # Add args to the function call
                    lines[j] = call_line.replace("if generate_features(", "if generate_features(args, ")
                    print(f"Updated function call: {lines[j].strip()}")
                    break
            break
    
    # Write the fixed content back to the script
    with open(script_path, 'w') as f:
        f.writelines(lines)
    
    print(f"Fixed {script_path}")
    return True

if __name__ == "__main__":
    fix_args_error() 