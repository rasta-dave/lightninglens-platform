#!/usr/bin/env python3
"""
Cleanup Script for LightningLens

This script removes data files from the following directories:
- data/processed (transactions, features, channels CSV files)
- data/raw (metrics CSV files)
- data/predictions (predictions CSV files)
- data/models (model and scaler PKL files)

The script preserves directory structures while dddcleaning up old data files.
"""

import os
import argparse
import glob
from datetime import datetime, timedelta

def cleanup_data_directory(directory, pattern, dry_run=False, keep_days=0):
    """
    Remove files from a specific directory.
    
    Args:
        directory (str): Directory path to clean
        pattern (str): File pattern to match
        dry_run (bool): If True, only print what would be deleted without actually deleting
        keep_days (int): Number of days worth of files to keep (0 means delete all)
    
    Returns:
        int: Number of files deleted
    """
    if not os.path.exists(directory):
        print(f"Directory not found: {directory}")
        return 0
    
    # Calculate cutoff date if keep_days is specified
    cutoff_date = None
    if keep_days > 0:
        cutoff_date = datetime.now() - timedelta(days=keep_days)
    
    # Find all matching files
    file_paths = glob.glob(os.path.join(directory, pattern))
    
    if not file_paths:
        print(f"No matching files found in {directory}")
        return 0
    
    # Count files to be deleted
    delete_count = 0
    
    for file_path in file_paths:
        file_name = os.path.basename(file_path)
        
        # Check file date if cutoff_date is specified
        should_delete = True
        if cutoff_date:
            file_stat = os.stat(file_path)
            file_date = datetime.fromtimestamp(file_stat.st_mtime)
            if file_date > cutoff_date:
                should_delete = False
        
        if should_delete:
            delete_count += 1
            if dry_run:
                print(f"Would delete: {os.path.join(os.path.basename(directory), file_name)}")
            else:
                try:
                    os.remove(file_path)
                    print(f"Deleted: {os.path.join(os.path.basename(directory), file_name)}")
                except Exception as e:
                    print(f"Error deleting {file_name}: {e}")
    
    return delete_count

def cleanup_all_data(dry_run=False, keep_days=0, data_type=None):
    """
    Clean up data files across all data directories.
    
    Args:
        dry_run (bool): If True, only print what would be deleted without actually deleting
        keep_days (int): Number of days worth of files to keep (0 means delete all)
        data_type (str): Specific file type to delete or None for all
    """
    # Get the base directory
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Define directories and patterns
    directories = {
        'processed': os.path.join(base_dir, 'data', 'processed'),
        'raw': os.path.join(base_dir, 'data', 'raw'),
        'predictions': os.path.join(base_dir, 'data', 'predictions'),
        'models': os.path.join(base_dir, 'data', 'models')
    }
    
    # Define patterns based on data_type
    patterns = {
        'transactions': 'transactions_*.csv',
        'features': 'features_*.csv',
        'channels': 'channels_*.csv',
        'metrics': 'metrics_*.csv',
        'predictions': 'predictions_*.csv',
        'model': 'model_*.pkl',
        'scaler': 'scaler_*.pkl'
    }
    
    # Calculate cutoff date if keep_days is specified
    if keep_days > 0:
        cutoff_date = datetime.now() - timedelta(days=keep_days)
        print(f"Keeping files newer than {cutoff_date.strftime('%Y-%m-%d')}")
    
    # Track total files deleted
    total_deleted = 0
    
    # Process each directory with appropriate patterns
    if data_type is None or data_type in ['transactions', 'features', 'channels']:
        # For processed directory
        if data_type is None:
            # Delete all CSV files in processed
            total_deleted += cleanup_data_directory(
                directories['processed'], '*.csv', dry_run, keep_days
            )
        else:
            # Delete specific file type in processed
            total_deleted += cleanup_data_directory(
                directories['processed'], patterns[data_type], dry_run, keep_days
            )
    
    if data_type is None or data_type == 'metrics':
        # For raw directory (metrics files)
        total_deleted += cleanup_data_directory(
            directories['raw'], patterns['metrics'], dry_run, keep_days
        )
    
    if data_type is None or data_type == 'predictions':
        # For predictions directory
        total_deleted += cleanup_data_directory(
            directories['predictions'], patterns['predictions'], dry_run, keep_days
        )
        
    if data_type is None or data_type in ['model', 'scaler']:
        # For models directory
        if data_type is None:
            # Delete all PKL files in models
            total_deleted += cleanup_data_directory(
                directories['models'], '*.pkl', dry_run, keep_days
            )
        else:
            # Delete specific model file type
            total_deleted += cleanup_data_directory(
                directories['models'], patterns[data_type], dry_run, keep_days
            )
    
    # Print summary
    if dry_run:
        print(f"\nDRY RUN: Would have deleted {total_deleted} files total")
    else:
        print(f"\nSuccessfully deleted {total_deleted} files total")

def main():
    parser = argparse.ArgumentParser(description="Clean up data files in LightningLens data directories")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without actually deleting")
    parser.add_argument("--keep-days", type=int, default=0, help="Keep files newer than specified days (default: delete all)")
    parser.add_argument("--type", choices=["transactions", "features", "channels", "metrics", "predictions", "model", "scaler"], 
                        help="Specific file type to delete (default: all data files)")
    
    args = parser.parse_args()
    
    print("LightningLens Data Cleanup")
    print("==========================")
    
    if args.dry_run:
        print("Running in DRY RUN mode - no files will be deleted")
    
    cleanup_all_data(args.dry_run, args.keep_days, args.type)

if __name__ == "__main__":
    main() 