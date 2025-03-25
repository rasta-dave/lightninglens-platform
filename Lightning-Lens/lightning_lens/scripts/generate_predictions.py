#!/usr/bin/env python3
"""
Generate predictions from the trained model

This script loads the latest trained model and generates predictions
for the current channel states, saving them to the predictions folder.
"""

import os
import sys
import glob
import pandas as pd
import numpy as np
from datetime import datetime
import joblib

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def find_latest_file(pattern):
    """Find the latest file matching the pattern"""
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getctime)

def generate_predictions():
    """Generate predictions from the trained model"""
    print("LightningLens Prediction Generator")
    print("==================================")
    
    # Find the latest model and scaler
    model_file = find_latest_file("data/models/model_*.pkl")
    scaler_file = find_latest_file("data/models/scaler_*.pkl")
    
    if not model_file or not scaler_file:
        print("No model or scaler found. Please train a model first.")
        return False
    
    print(f"Using model: {model_file}")
    print(f"Using scaler: {scaler_file}")
    
    # Find the latest channel states
    channel_file = find_latest_file("data/processed/channel_states_*.csv")
    
    if not channel_file:
        print("No channel state data found. Please collect data first.")
        return False
    
    print(f"Using channel data: {channel_file}")
    
    try:
        # Load model and scaler
        model = joblib.load(model_file)
        scaler = joblib.load(scaler_file)
        
        # Load channel data
        channel_df = pd.read_csv(channel_file)
        
        # Prepare features for prediction
        # Get the feature names from the scaler
        feature_names = scaler.feature_names_in_
        
        # Check which features are available in our data
        available_features = [f for f in feature_names if f in channel_df.columns]
        missing_features = [f for f in feature_names if f not in channel_df.columns]
        
        if missing_features:
            print(f"Warning: Missing features: {missing_features}")
            print("Adding default values for missing features")
            
            # Add default values for missing features
            for feature in missing_features:
                if feature == 'hour_of_day':
                    channel_df[feature] = datetime.now().hour
                elif feature == 'day_of_week':
                    channel_df[feature] = datetime.now().weekday()
                elif feature == 'balance_velocity':
                    channel_df[feature] = 0.0
                elif feature == 'liquidity_stress':
                    channel_df[feature] = 0.5
                else:
                    channel_df[feature] = 0.0
        
        # Select features for prediction
        X = channel_df[feature_names]
        
        # Scale features
        X_scaled = scaler.transform(X)
        
        # Make predictions
        predictions = model.predict(X_scaled)
        
        # Add predictions to the dataframe
        result_df = channel_df.copy()
        result_df['optimal_ratio'] = predictions
        result_df['adjustment_needed'] = predictions - result_df['balance_ratio']
        
        # Save predictions
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        try:
            # Create directories with proper permissions
            os.makedirs("data/predictions", exist_ok=True)
            
            # Try to make the directory writable
            try:
                os.chmod("data/predictions", 0o777)  # Full permissions
            except Exception as e:
                print(f"Warning: Could not set permissions on data/predictions: {str(e)}")
            
            output_file = f"data/predictions/predictions_{timestamp}.csv"
            latest_file = "data/predictions/latest_predictions.csv"
            
            # Try to save the files
            try:
                result_df.to_csv(output_file, index=False)
                print(f"Generated predictions for {len(result_df)} channels")
                print(f"Saved to: {output_file}")
            except Exception as e:
                print(f"Warning: Could not save to {output_file}: {str(e)}")
                # Try saving to a temp location
                temp_dir = os.path.expanduser("~/temp")
                os.makedirs(temp_dir, exist_ok=True)
                temp_file = f"{temp_dir}/predictions_{timestamp}.csv"
                result_df.to_csv(temp_file, index=False)
                print(f"Saved to alternative location: {temp_file}")
                output_file = temp_file
            
            # Try to save latest predictions
            try:
                result_df.to_csv(latest_file, index=False)
                print(f"Also saved to: {latest_file}")
            except Exception as e:
                print(f"Warning: Could not save to {latest_file}: {str(e)}")
                
            # Print some statistics
            print("\nPrediction Statistics:")
            print(f"Average current balance ratio: {result_df['balance_ratio'].mean():.4f}")
            print(f"Average optimal balance ratio: {result_df['optimal_ratio'].mean():.4f}")
            print(f"Average adjustment needed: {result_df['adjustment_needed'].mean():.4f}")
            
            # Count channels needing significant adjustment
            significant = result_df[abs(result_df['adjustment_needed']) > 0.1]
            print(f"Channels needing significant adjustment: {len(significant)} ({len(significant)/len(result_df)*100:.1f}%)")
            
            # Return success
            return True
            
        except Exception as e:
            print(f"Error generating predictions: {str(e)}")
            return False
        
    except Exception as e:
        print(f"Error generating predictions: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    generate_predictions() 