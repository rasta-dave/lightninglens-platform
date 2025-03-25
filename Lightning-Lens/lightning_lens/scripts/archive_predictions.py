#!/usr/bin/env python3
"""
Prediction File Archiver for LightningLens

This script archives old prediction files to prevent accumulation
while preserving the most recent ones for visualization.
"""

import os
import sys
import glob
import shutil
import logging
import argparse
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("PredictionArchiver")

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Prediction File Archiver')
    parser.add_argument('--keep', type=int, default=24,
                        help='Number of most recent prediction files to keep (default: 24)')
    parser.add_argument('--archive', action='store_true',
                        help='Archive files instead of deleting them')
    return parser.parse_args()

def archive_predictions():
    """Archive old prediction files"""
    args = parse_args()
    
    # Create archive directory if needed
    if args.archive:
        archive_dir = "data/predictions/archive"
        os.makedirs(archive_dir, exist_ok=True)
    
    # Get all prediction files
    files = glob.glob("data/predictions/predictions_*.csv")
    
    # Skip if we don't have enough files
    if len(files) <= args.keep:
        logger.info(f"Only {len(files)} prediction files found, which is less than or equal to the {args.keep} to keep. No action needed.")
        return
    
    # Sort files by creation time (newest first)
    files.sort(key=os.path.getctime, reverse=True)
    
    # Keep the most recent files
    files_to_keep = files[:args.keep]
    files_to_process = files[args.keep:]
    
    logger.info(f"Found {len(files)} prediction files")
    logger.info(f"Keeping {len(files_to_keep)} most recent files")
    logger.info(f"Processing {len(files_to_process)} older files")
    
    # Process older files
    for file in files_to_process:
        if args.archive:
            # Move to archive
            dest = os.path.join(archive_dir, os.path.basename(file))
            shutil.move(file, dest)
            logger.info(f"Archived: {file} -> {dest}")
        else:
            # Delete
            os.remove(file)
            logger.info(f"Deleted: {file}")
    
    logger.info(f"Finished processing prediction files")
    logger.info(f"Remaining files: {len(files_to_keep)}")

if __name__ == "__main__":
    archive_predictions() 