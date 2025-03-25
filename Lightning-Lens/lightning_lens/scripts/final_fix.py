#!/usr/bin/env python3
"""
Final fix for the generate_features.py script
"""

import os
import sys

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def final_fix():
    """Apply the final fix to the generate_features.py script"""
    script_path = "scripts/generate_features.py"
    
    if not os.path.exists(script_path):
        print(f"Error: {script_path} not found")
        return False
    
    # Create a backup if it doesn't exist
    backup_path = f"{script_path}.final_backup"
    if not os.path.exists(backup_path):
        with open(script_path, 'r') as src, open(backup_path, 'w') as dst:
            dst.write(src.read())
        print(f"Created backup: {backup_path}")
    
    # Read the script content
    with open(script_path, 'r') as f:
        content = f.read()
    
    # Check if argparse is already imported
    if "import argparse" not in content:
        # Add argparse import
        content = content.replace("import glob", "import glob\nimport argparse")
        print("Added argparse import")
    
    # Check if parse_args function exists
    if "def parse_args" not in content:
        # Add parse_args function before generate_features
        parse_args_func = """
def parse_args():
    parser = argparse.ArgumentParser(description='Generate features from transaction data')
    parser.add_argument('--input', type=str, required=True, help='Input transaction CSV file')
    parser.add_argument('--output', type=str, help='Output features CSV file')
    return parser.parse_args()
"""
        content = content.replace("def generate_features", parse_args_func + "\ndef generate_features")
        print("Added parse_args function")
    
    # Update the main part to parse args
    if "if __name__ == \"__main__\":" in content:
        # Replace the main part
        old_main = """if __name__ == "__main__":
    print("LightningLens Feature Generator")
    print("===============================")
    
    if generate_features(args, ):
        print("\\nFeatures generated successfully. You can now train the initial model:")
        print("python -m scripts.train_initial_model")
    else:
        print("\\nFailed to generate features. Please check your data files.")"""
        
        new_main = """if __name__ == "__main__":
    print("LightningLens Feature Generator")
    print("===============================")
    
    # Parse command line arguments
    args = parse_args()
    
    if generate_features(args):
        print("\\nFeatures generated successfully. You can now train the initial model:")
        print("python -m scripts.train_initial_model")
    else:
        print("\\nFailed to generate features. Please check your data files.")"""
        
        content = content.replace(old_main, new_main)
        print("Updated main part to parse args")
    
    # Fix the generate_features function signature
    if "def generate_features(args, ):" in content:
        content = content.replace("def generate_features(args, ):", "def generate_features(args):")
        print("Fixed generate_features function signature")
    
    # Write the fixed content back to the script
    with open(script_path, 'w') as f:
        f.write(content)
    
    print(f"Fixed {script_path}")
    return True

if __name__ == "__main__":
    final_fix() 