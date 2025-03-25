#!/usr/bin/env python3
"""
Train initial model for LightningLens

This script trains an initial model using historical data.
"""

import os
import pandas as pd
import numpy as np
import pickle
from datetime import datetime
import glob
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler

def find_latest_file(pattern):
    """Find the latest file matching the pattern"""
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getctime)

def train_initial_model():
    """Train the initial model using the latest features file"""
    # Find the latest features file
    features_file = find_latest_file("data/processed/features_*.csv")
    if not features_file:
        print("No features files found. Please run data collection first.")
        return False
    
    print(f"Training initial model using: {features_file}")
    
    try:
        # Load features
        features_df = pd.read_csv(features_file)
        
        # Prepare data
        X = features_df[['capacity', 'local_balance', 'remote_balance', 
                         'balance_ratio', 'tx_count', 'success_rate', 'avg_amount']]
        y = features_df['optimal_ratio']
        
        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Train model
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X_scaled, y)
        
        # Save model and scaler
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Create models directory if it doesn't exist
        os.makedirs("data/models", exist_ok=True)
        
        # Save model
        model_path = f"data/models/model_initial_{timestamp}.pkl"
        with open(model_path, 'wb') as f:
            pickle.dump(model, f)
        
        # Save scaler
        scaler_path = f"data/models/scaler_initial_{timestamp}.pkl"
        with open(scaler_path, 'wb') as f:
            pickle.dump(scaler, f)
        
        print(f"Model saved to: {model_path}")
        print(f"Scaler saved to: {scaler_path}")
        
        return True
        
    except Exception as e:
        print(f"Error training initial model: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("LightningLens Initial Model Training")
    print("====================================")
    
    if train_initial_model():
        print("\nInitial model trained successfully.")
        print("You can now run the HTTP server to start online learning:")
        print("python -m src.scripts.http_server")
    else:
        print("\nFailed to train initial model.") 