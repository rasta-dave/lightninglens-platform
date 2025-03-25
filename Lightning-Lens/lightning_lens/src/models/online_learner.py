"""
Online Learning Module for LightningLens

This module provides incremental learning capabilities to adapt the model
in real-time as new transaction data arrives from the Lightning Network.
"""

import os
import logging
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import joblib
from typing import List, Dict, Tuple, Optional, Any
import time
import sys

# Try different import patterns to make it work in various contexts
try:
    from src.models.features import FeatureProcessor
except ModuleNotFoundError:
    try:
        # Try with relative import
        from .features import FeatureProcessor
    except ImportError:
        try:
            # Try with absolute import
            current_dir = os.path.dirname(os.path.abspath(__file__))
            parent_dir = os.path.dirname(os.path.dirname(current_dir))
            if parent_dir not in sys.path:
                sys.path.append(parent_dir)
            from lightning_lens.src.models.features import FeatureProcessor
        except ModuleNotFoundError:
            # Create a minimal implementation if all else fails
            class FeatureProcessor:
                def process_features(self, data):
                    return pd.DataFrame(data)

# Configure logging
logger = logging.getLogger("OnlineLearner")
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)

class OnlineLearner:
    """
    Provides real-time learning capabilities for LightningLens models.
    
    This class maintains a transaction buffer and performs incremental
    model updates as new data arrives from the Lightning Network.
    """
    
    def __init__(self, 
                 model_path: Optional[str] = None,
                 buffer_size: int = 1000,
                 min_samples_for_update: int = 20,
                 update_interval: int = 10):
        """
        Initialize the online learner.
        
        Args:
            model_path: Path to initial model (if None, will create a new model)
            buffer_size: Maximum number of transactions to keep in buffer
            min_samples_for_update: Minimum samples needed before updating model
            update_interval: Update model every N transactions
        """
        self.buffer = []
        self.buffer_size = buffer_size
        self.min_samples_for_update = min_samples_for_update
        self.update_interval = update_interval
        self.transaction_count = 0
        self.feature_processor = FeatureProcessor()
        self.last_update_time = datetime.now()
        self.learning_rate = 0.1  # Initial learning rate
        self.performance_history = []
        
        # Load or create model and scaler
        if model_path and os.path.exists(model_path):
            logger.info(f"Loading initial model from {model_path}")
            self.model, self.scaler = self._load_model(model_path)
        else:
            logger.info("Creating new model for online learning")
            self.model = RandomForestRegressor(n_estimators=50, random_state=42)
            self.scaler = StandardScaler()
            self.is_fitted = False
        
    def _load_model(self, model_path: str) -> Tuple[Any, Any]:
        """Load model and scaler from disk"""
        model = joblib.load(model_path)
        
        # Try to load corresponding scaler
        scaler_path = model_path.replace('model_', 'scaler_')
        if os.path.exists(scaler_path):
            scaler = joblib.load(scaler_path)
        else:
            scaler = StandardScaler()
            
        self.is_fitted = True
        return model, scaler
    
    def add_transaction(self, transaction_data: Dict) -> bool:
        """
        Add new transaction to buffer and trigger learning if needed.
        
        Args:
            transaction_data: Transaction data from Lightning Network
            
        Returns:
            bool: True if model was updated, False otherwise
        """
        # Add to buffer
        self.buffer.append(transaction_data)
        self.transaction_count += 1
        
        # Trim buffer if it exceeds max size
        if len(self.buffer) > self.buffer_size:
            self.buffer = self.buffer[-self.buffer_size:]
        
        # Check if we should update the model
        should_update = (
            len(self.buffer) >= self.min_samples_for_update and
            self.transaction_count % self.update_interval == 0
        )
        
        if should_update:
            return self._update_model()
        return False
    
    def add_channel_state(self, channel_data: Dict) -> bool:
        """
        Add channel state data to the buffer.
        
        Args:
            channel_data: Channel state data from Lightning Network
            
        Returns:
            bool: True if model was updated, False otherwise
        """
        # Add to buffer with type marker
        channel_data['_data_type'] = 'channel_state'
        return self.add_transaction(channel_data)
    
    def _update_model(self) -> bool:
        """
        Perform incremental model update using buffered data.
        
        Returns:
            bool: True if model was updated successfully
        """
        if not self.buffer:
            return False
            
        try:
            # Convert buffer to DataFrame
            buffer_df = pd.DataFrame(self.buffer)
            
            # Process features
            features_df = self.feature_processor.process_features(buffer_df)
            
            if features_df.empty:
                logger.warning("No valid features extracted from buffer")
                return False
            
            # Prepare data for model update
            X = features_df.drop(['channel_id', 'timestamp'], axis=1, errors='ignore')
            y = features_df['balance_ratio']  # Target is current balance ratio
            
            if len(X) < self.min_samples_for_update:
                return False
                
            # Handle first-time fit vs. incremental update
            if not self.is_fitted:
                # First-time fit
                self.scaler.fit(X)
                X_scaled = self.scaler.transform(X)
                self.model.fit(X_scaled, y)
                self.is_fitted = True
                logger.info(f"Initial model fit with {len(X)} samples")
            else:
                # Incremental update (partial_fit for scaler)
                X_scaled = self.scaler.transform(X)
                
                # For RandomForest, we need to retrain on combined data
                # In a production system, you might use a true online learning algorithm
                self.model.fit(X_scaled, y)
                logger.info(f"Model updated with {len(X)} new samples")
            
            # Save snapshot periodically
            current_time = datetime.now()
            time_diff = (current_time - self.last_update_time).total_seconds()
            if time_diff > 300:  # Save every 5 minutes
                self._save_model_snapshot()
                self.last_update_time = current_time
                
            return True
            
        except Exception as e:
            logger.error(f"Error updating model: {str(e)}")
            return False
    
    def _save_model_snapshot(self):
        """Save current model and scaler to disk"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs("data/models", exist_ok=True)
            
            model_path = f"data/models/model_online_{timestamp}.pkl"
            scaler_path = f"data/models/scaler_online_{timestamp}.pkl"
            
            joblib.dump(self.model, model_path)
            joblib.dump(self.scaler, scaler_path)
            
            logger.info(f"Saved model snapshot to {model_path}")
        except Exception as e:
            logger.error(f"Error saving model snapshot: {str(e)}")
    
    def predict(self, features_df: pd.DataFrame) -> np.ndarray:
        """
        Make predictions using the current model.
        
        Args:
            features_df: DataFrame with processed features
            
        Returns:
            np.ndarray: Predicted optimal balance ratios
        """
        if not self.is_fitted:
            # Return default predictions if model isn't trained yet
            return np.full(len(features_df), 0.5)
            
        try:
            # Prepare features
            X = features_df.drop(['channel_id', 'timestamp'], axis=1, errors='ignore')
            
            # Scale features
            X_scaled = self.scaler.transform(X)
            
            # Make predictions
            predictions = self.model.predict(X_scaled)
            
            return predictions
            
        except Exception as e:
            logger.error(f"Error making predictions: {str(e)}")
            return np.full(len(features_df), 0.5)

    def prepare_features(self, data):
        """
        Prepare features from raw data for model prediction
        
        Args:
            data: Dictionary containing channel state or transaction data
            
        Returns:
            List of feature values in the correct order for the model
        """
        try:
            # Extract relevant features
            features = {
                'capacity': data.get('capacity', 0),
                'local_balance': data.get('local_balance', 0),
                'remote_balance': data.get('remote_balance', 0),
                'balance_ratio': data.get('balance_ratio', 0.0),
                'tx_count': data.get('tx_count', 0),
                'success_rate': data.get('success_rate', 1.0),
                'avg_amount': data.get('avg_amount', 0)
            }
            
            # Convert to the format expected by the model
            # This depends on how your model was trained
            # You might need to adjust this based on your model's expected input
            feature_list = [
                features['capacity'],
                features['local_balance'],
                features['remote_balance'],
                features['balance_ratio'],
                features['tx_count'],
                features['success_rate'],
                features['avg_amount']
            ]
            
            return feature_list
            
        except Exception as e:
            raise ValueError(f"Error preparing features: {str(e)}")

    def retrain(self):
        """Retrain the model with new data"""
        if len(self.buffer) < self.min_samples_for_update:
            logger.info(f"Not enough samples for retraining. Have {len(self.buffer)}, need {self.min_samples_for_update}")
            return False
        
        try:
            # Convert buffer to DataFrame
            buffer_df = pd.DataFrame(self.buffer)
            
            # Prepare features and target
            X = buffer_df.drop(['optimal_balance'], axis=1)
            y = buffer_df['optimal_balance']
            
            # Scale features
            X_scaled = self.scaler.transform(X)
            
            # Get current performance
            current_performance = self._evaluate_performance()
            
            # Adjust learning rate based on performance trend
            if len(self.performance_history) > 1:
                last_performance = self.performance_history[-1]
                if current_performance > last_performance:
                    # Performance improving, increase learning rate
                    self.learning_rate = min(0.5, self.learning_rate * 1.1)
                    logger.info(f"Performance improving, increased learning rate to {self.learning_rate:.4f}")
                else:
                    # Performance declining, decrease learning rate
                    self.learning_rate = max(0.01, self.learning_rate * 0.9)
                    logger.info(f"Performance declining, decreased learning rate to {self.learning_rate:.4f}")
            
            # Store current performance
            self.performance_history.append(current_performance)
            
            # Partial fit with adjusted learning rate
            if hasattr(self.model, 'partial_fit'):
                self.model.partial_fit(X_scaled, y)
                logger.info(f"Model partially fitted with {len(X)} samples")
            else:
                # For models that don't support partial_fit, retrain completely
                self.model.fit(X_scaled, y)
                logger.info(f"Model completely retrained with {len(X)} samples")
            
            # Feature importance analysis (if available)
            if hasattr(self.model, 'feature_importances_'):
                feature_names = X.columns
                importances = self.model.feature_importances_
                feature_importance = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)
                logger.info(f"Top features: {feature_importance[:3]}")
            
            # Clear buffer after successful retraining
            self.buffer = []
            
            return True
            
        except Exception as e:
            logger.error(f"Error retraining model: {str(e)}")
            return False
    
    def _evaluate_performance(self):
        """Evaluate current model performance"""
        try:
            # Use a simple metric: average prediction error on buffer data
            buffer_df = pd.DataFrame(self.buffer)
            X = buffer_df.drop(['optimal_balance'], axis=1)
            y_true = buffer_df['optimal_balance']
            
            # Scale features
            X_scaled = self.scaler.transform(X)
            
            # Make predictions
            y_pred = self.model.predict(X_scaled)
            
            # Calculate mean absolute error
            mae = np.mean(np.abs(y_pred - y_true))
            
            return 1.0 / (1.0 + mae)  # Higher is better
            
        except Exception as e:
            logger.error(f"Error evaluating performance: {str(e)}")
            return 0.0 