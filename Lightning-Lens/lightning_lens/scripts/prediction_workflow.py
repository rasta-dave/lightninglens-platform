#!/usr/bin/env python3
"""
LightningLens Prediction Workflow

This script provides a complete workflow for generating predictions,
creating visualizations, and managing prediction files.
"""

import os
import sys
import argparse
import logging
import requests
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("PredictionWorkflow")

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='LightningLens Prediction Workflow')
    parser.add_argument('--count', type=int, default=1,
                        help='Number of predictions to generate (default: 1)')
    parser.add_argument('--interval', type=int, default=5,
                        help='Interval between predictions in minutes (default: 5)')
    parser.add_argument('--keep', type=int, default=20,
                        help='Number of prediction files to keep (default: 20)')
    parser.add_argument('--archive', action='store_true',
                        help='Archive old files instead of deleting them')
    parser.add_argument('--detailed', action='store_true',
                        help='Generate detailed visualizations')
    parser.add_argument('--skip-generate', action='store_true',
                        help='Skip prediction generation (only visualize and archive)')
    parser.add_argument('--skip-visualize', action='store_true',
                        help='Skip visualization (only generate and archive)')
    parser.add_argument('--skip-archive', action='store_true',
                        help='Skip archiving (only generate and visualize)')
    parser.add_argument('--send-suggestions', action='store_true',
                        help='Send rebalancing suggestions to the simulation')
    parser.add_argument('--suggestion-threshold', type=float, default=0.1,
                        help='Threshold for sending rebalancing suggestions (default: 0.1)')
    parser.add_argument('--suggestion-api', type=str, default='http://localhost:5002/api/send-suggestions',
                        help='URL of the suggestion API endpoint')
    parser.add_argument('--skip-cleanup', action='store_true',
                        help='Skip cleanup of old raw data files')
    parser.add_argument('--keep-days', type=int, default=7,
                        help='Number of days of raw data to keep (default: 7)')
    parser.add_argument('--enable-learning', action='store_true',
                        help='Enable automated learning from simulation results')
    parser.add_argument('--learning-threshold', type=int, default=50,
                        help='Minimum number of transactions to trigger learning (default: 50)')
    return parser.parse_args()

def run_workflow():
    """Run the complete prediction workflow"""
    args = parse_args()
    
    logger.info("Starting LightningLens Prediction Workflow")
    
    # Step 1: Generate predictions (if not skipped)
    if not args.skip_generate:
        logger.info("Generating predictions")
        try:
            from scripts.auto_generate_predictions import auto_generate_predictions
            
            # Save original sys.argv
            original_argv = sys.argv.copy()
            
            # Set up arguments for auto_generate_predictions
            generate_args = ['auto_generate_predictions.py']
            generate_args.extend(['--count', str(args.count)])
            generate_args.extend(['--interval', str(args.interval)])
            sys.argv = generate_args
            
            # Run the auto-generate function
            auto_generate_predictions()
            
            # Restore original sys.argv
            sys.argv = original_argv
            
            logger.info("Successfully generated predictions")
        except Exception as e:
            logger.error(f"Error generating predictions: {str(e)}")
            return False
            
    # Step 1.5: Run automated learning if enabled
    if args.enable_learning:
        logger.info("Running automated learning from simulation results")
        try:
            # Import the auto_learning module
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from auto_learning import check_and_process
            
            # Run the learning process
            logger.info(f"Processing data with learning threshold: {args.learning_threshold}")
            check_and_process(min_transactions=args.learning_threshold)
            
            logger.info("Automated learning completed successfully")
        except Exception as e:
            logger.error(f"Error in automated learning: {str(e)}")
            # Continue with the workflow even if learning fails
    
    # Step 2: Create visualizations (if not skipped)
    if not args.skip_visualize:
        logger.info("Creating visualizations")
        try:
            # First, run the model evolution visualizer
            from scripts.visualize_model_evolution import visualize_model_evolution
            visualize_model_evolution()
            logger.info("Generated model evolution visualizations")
            
            # Then, run the detailed visualizer
            from src.scripts.visualizer import create_visualizations
            create_visualizations(
                "data/predictions/latest_predictions.csv",
                "data/visualizations",
                detailed=args.detailed
            )
            logger.info("Generated detailed visualizations")
            
            # Finally, generate predictions using the new learning_dashboard module
            try:
                from scripts.learning_dashboard.predictions import get_predictions, get_metrics
                
                # Get and log the predictions
                predictions = get_predictions()
                logger.info(f"Generated {len(predictions)} predictions using learning dashboard module")
                
                # Get and log the metrics
                metrics = get_metrics()
                logger.info(f"Generated learning metrics: {list(metrics.keys()) if metrics else 'none available'}")
                
                # Save predictions to a file for persistence
                predictions_dir = "data/predictions"
                os.makedirs(predictions_dir, exist_ok=True)
                
                # Save as JSON file with timestamp
                import json
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                predictions_file = os.path.join(predictions_dir, f"dashboard_predictions_{timestamp}.json")
                
                with open(predictions_file, 'w') as f:
                    json.dump(predictions, f, indent=2)
                    
                logger.info(f"Saved predictions to {predictions_file}")
                
            except ImportError as e:
                logger.warning(f"Learning dashboard module not available: {e}")
                # Try to fall back to the old dashboard generation
                try:
                    from scripts.learning_dashboard import generate_dashboard
                    generate_dashboard()
                    logger.info("Generated learning dashboard using legacy method")
                except ImportError:
                    logger.error("Both new and legacy learning dashboard modules are unavailable")
                except Exception as e:
                    logger.error(f"Error generating legacy dashboard: {str(e)}")
            except Exception as e:
                logger.error(f"Error generating predictions with learning dashboard module: {str(e)}")
                
        except Exception as e:
            logger.error(f"Error creating visualizations: {str(e)}")
    
    # Step 3: Archive old prediction files (if not skipped)
    if not args.skip_archive:
        logger.info("Archiving old prediction files")
        try:
            from scripts.archive_predictions import archive_predictions
            
            # Save original sys.argv
            original_argv = sys.argv.copy()
            
            # Set up arguments for archive_predictions
            archive_args = ['archive_predictions.py', '--keep', str(args.keep)]
            if args.archive:
                archive_args.append('--archive')
            sys.argv = archive_args
            
            # Run the archive function
            archive_predictions()
            
            # Restore original sys.argv
            sys.argv = original_argv
            
            logger.info("Successfully archived old prediction files")
        except Exception as e:
            logger.error(f"Error archiving prediction files: {str(e)}")
    
    # Step 4: Send suggestions to simulation (if enabled)
    if args.send_suggestions:
        logger.info("Sending rebalancing suggestions to simulation")
        try:
            # Send suggestions via the API
            response = requests.post(
                args.suggestion_api,
                json={"threshold": args.suggestion_threshold},
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Sent {result['sent']} of {result['total']} suggestions to simulation")
            else:
                logger.warning(f"Failed to send suggestions: HTTP {response.status_code}")
        except Exception as e:
            logger.error(f"Error sending suggestions: {str(e)}")
    
    # Step 5: Clean up old raw data files (if not skipped)
    if not args.skip_cleanup:
        logger.info(f"Cleaning up raw data files older than {args.keep_days} days")
        try:
            from scripts.cleanup_data import cleanup_all_data
            
            # Clean up only metrics files
            cleanup_all_data(False, args.keep_days, 'metrics')
            logger.info("Successfully cleaned up old raw data files")
        except Exception as e:
            logger.error(f"Error cleaning up raw data files: {str(e)}")
    
    # Step 6: Trigger automated data processing if not already done
    if args.enable_learning and not args.skip_generate:
        logger.info("Triggering automated data processing pipeline")
        try:
            # Check if the automated_data_processing.sh script exists
            script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                                      "automated_data_processing.sh")
            
            if os.path.exists(script_path):
                import subprocess
                result = subprocess.run(["bash", script_path], capture_output=True, text=True)
                if result.returncode == 0:
                    logger.info("Automated data processing completed successfully")
                else:
                    logger.warning(f"Automated data processing returned non-zero exit code: {result.returncode}")
                    logger.warning(f"Error output: {result.stderr}")
            else:
                logger.warning(f"Automated data processing script not found: {script_path}")
        except Exception as e:
            logger.error(f"Error triggering automated data processing: {str(e)}")
    
    logger.info("Prediction workflow complete")
    return True

if __name__ == "__main__":
    run_workflow() 