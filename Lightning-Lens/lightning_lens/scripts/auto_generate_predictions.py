#!/usr/bin/env python3
"""
Automatic Prediction Generator for LightningLens

This script automatically generates predictions at regular intervals
to create a time series for better visualization of model evolution.
"""

import os
import sys
import time
import argparse
import logging
from datetime import datetime
import importlib.util
import json

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import the prediction generator
from scripts.generate_predictions import generate_predictions

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("AutoPredictionGenerator")

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Automatic Prediction Generator')
    parser.add_argument('--interval', type=int, default=5,
                        help='Interval between predictions in minutes (default: 5)')
    parser.add_argument('--count', type=int, default=12,
                        help='Number of predictions to generate (default: 12)')
    parser.add_argument('--visualize', action='store_true',
                        help='Generate visualizations after each prediction')
    return parser.parse_args()

def import_archive_module():
    """Dynamically import the archive_predictions module"""
    try:
        # Try to import the module
        from scripts.archive_predictions import archive_predictions
        return archive_predictions
    except ImportError:
        # If that fails, try to load it dynamically
        try:
            spec = importlib.util.spec_from_file_location(
                "archive_predictions", 
                os.path.join(os.path.dirname(__file__), "archive_predictions.py")
            )
            archive_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(archive_module)
            return archive_module.archive_predictions
        except Exception as e:
            logger.error(f"Failed to import archive_predictions module: {str(e)}")
            return None

def auto_generate_predictions():
    """Automatically generate predictions at regular intervals"""
    args = parse_args()
    
    logger.info(f"Starting automatic prediction generation")
    logger.info(f"Interval: {args.interval} minutes")
    logger.info(f"Count: {args.count} predictions")
    
    # Create directories if they don't exist
    os.makedirs("data/predictions", exist_ok=True)
    os.makedirs("data/visualizations", exist_ok=True)
    
    # Generate predictions at regular intervals
    for i in range(args.count):
        logger.info(f"Generating prediction {i+1}/{args.count}")
        
        # Generate predictions
        success = generate_predictions()
        
        if success:
            logger.info(f"Successfully generated prediction {i+1}/{args.count}")
            
            # Generate visualizations if requested
            if args.visualize and i > 0:  # Need at least 2 predictions for visualization
                try:
                    logger.info("Generating visualizations")
                    from scripts.visualize_model_evolution import visualize_model_evolution
                    visualize_model_evolution()
                except Exception as e:
                    logger.error(f"Error generating visualizations: {str(e)}")
        else:
            logger.error(f"Failed to generate prediction {i+1}/{args.count}")
        
        # Wait for the next interval if not the last iteration
        if i < args.count - 1:
            next_time = datetime.now().timestamp() + (args.interval * 60)
            next_time_str = datetime.fromtimestamp(next_time).strftime("%H:%M:%S")
            logger.info(f"Waiting {args.interval} minutes until {next_time_str} for next prediction")
            time.sleep(args.interval * 60)
    
    # Generate final visualizations
    try:
        logger.info("Generating final visualizations")
        from scripts.visualize_model_evolution import visualize_model_evolution
        visualize_model_evolution()
        
        # Generate predictions using the learning dashboard module
        logger.info("Generating predictions using learning dashboard module")
        try:
            from scripts.learning_dashboard.predictions import get_predictions, get_metrics
            
            # Get the predictions
            predictions = get_predictions()
            logger.info(f"Generated {len(predictions)} predictions")
            
            # Get the metrics
            metrics = get_metrics()
            metric_keys = list(metrics.keys()) if metrics else "none available"
            logger.info(f"Generated metrics: {metric_keys}")
            
            # Save predictions to a file
            predictions_file = "data/predictions/latest_dashboard_predictions.json"
            with open(predictions_file, 'w') as f:
                json.dump(predictions, f, indent=2)
            logger.info(f"Saved predictions to {predictions_file}")
            
            # Save metrics to a file
            metrics_file = "data/predictions/latest_dashboard_metrics.json"
            with open(metrics_file, 'w') as f:
                json.dump(metrics, f, indent=2)
            logger.info(f"Saved metrics to {metrics_file}")
            
        except ImportError as e:
            logger.warning(f"Learning dashboard predictions module not available: {e}")
            # Try to fall back to the old dashboard generation
            try:
                logger.info("Falling back to legacy dashboard generation")
                from scripts.learning_dashboard import generate_dashboard
                generate_dashboard()
                logger.info("Generated dashboard using legacy method")
            except ImportError:
                logger.error("Both new and legacy learning dashboard modules are unavailable")
            except Exception as e:
                logger.error(f"Error generating legacy dashboard: {str(e)}")
        except Exception as e:
            logger.error(f"Error generating predictions with learning dashboard module: {str(e)}")
    except Exception as e:
        logger.error(f"Error generating final visualizations: {str(e)}")
    
    # Clean up old prediction files
    try:
        logger.info("Cleaning up old prediction files")
        archive_func = import_archive_module()
        if archive_func:
            # Save original sys.argv
            original_argv = sys.argv.copy()
            
            # Set up arguments for archive_predictions
            sys.argv = ['archive_predictions.py', '--keep', '20']
            
            # Run the archive function
            archive_func()
            
            # Restore original sys.argv
            sys.argv = original_argv
            
            logger.info("Successfully cleaned up old prediction files")
        else:
            logger.warning("Could not import archive_predictions module, skipping cleanup")
    except Exception as e:
        logger.error(f"Error cleaning up prediction files: {str(e)}")
    
    logger.info("Automatic prediction generation complete")
    logger.info(f"Generated {args.count} predictions")
    logger.info("You can now view the visualizations in data/visualizations/")
    logger.info("And the dashboard at data/dashboard/index.html")

if __name__ == "__main__":
    auto_generate_predictions() 