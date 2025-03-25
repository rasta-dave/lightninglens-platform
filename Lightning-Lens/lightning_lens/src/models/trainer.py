import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib
from datetime import datetime
import os
from typing import Tuple, Any, Dict, Optional
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

class ModelTrainer:
    """ Trains a model to predict optimal channel balances """

    def __init__(self,
                 test_size: float = 0.2,
                 random_state: int = 42):
        """ Initialize the model trainer
        
        Args:
            test_size (float): Proportion of data to reserve for testing
            random_state (int): Random seed for reproducibility
        """
        self.test_size = test_size
        self.random_state = random_state
        self.scaler = StandardScaler()

    def prepare_data(self,
                     data: pd.DataFrame,
                     target_column: str) -> Tuple[pd.DataFrame, pd.DataFrame, np.ndarray, np.ndarray]:
        """ prepare data for model training by splitting and scaling 
        
        Args:
            data (pd.DataFrame): Input data with features and target
            target_column (str): Name of the target column

        Returns:
            Tuple containing:
                x_train (pd.DataFrame): Training features
                x_test (pd.DataFrame): Testing features
                y_train (np.ndarray): Training targets
                y_test (np.ndarray): Testing targets
        """
        # Seperate features and target ...
        y = data[target_column].values

        # Remove non-feature columns ...
        x = data.drop([target_column, 'channel_id', 'timestamp'], axis=1, errors='ignore')

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            x, y, test_size=self.test_size, random_state=self.random_state
        )

        # Scale features ...
        X_train_scaled = pd.DataFrame(
            self.scaler.fit_transform(X_train),
            columns=X_train.columns
        )

        X_test_scaled = pd.DataFrame(
            self.scaler.transform(X_test),
            columns=X_test.columns
        )

        return X_train_scaled, X_test_scaled, y_train, y_test

    def train_model(self,
                    data: pd.DataFrame,
                    target_column: str,
                    model_params: Optional[Dict[str, Any]] = None) -> Tuple[Any, Dict[str, float]]:
        """ Train a model on the provided data 
        
        Args:
            data (pd.DataFrame): Data with features and target
            target_column (str): Name of the target column
            model_params (Dict[str, Any], optional): Parameters for the model

        Returns:
            Tuple containing:
                model: Trained model
                metrics (Dict[str, float]): Model performance metrics
        """
        # Set default model parameters if not provided ...
        if model_params is None:
            model_params = {
                'n_estimators': 100,
                'max_depth': 10,
                'min_samples_split': 2,
                'random_state': self.random_state
            }

        # Prepare data ...
        X_train, X_test, y_train, y_test = self.prepare_data(data, target_column)

        # Initialize and train model ...
        self.model = RandomForestRegressor(**model_params)
        self.model.fit(X_train, y_train)

        # Evalutae model ...
        y_pred = self.model.predict(X_test)
        metrics = self._calculate_metrics(y_test, y_pred)

        return self.model, metrics

    def _calculate_metrics(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        """ Calculate regression metrics

        Args:
            y_true (np.ndarray): True target values
            y_pred (np.ndarray): Predicted target values

        Returns:
            Dict[str, float]: Dictionary containing metrics
        """
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mean_squared_error(y_true, y_pred))
        r2 = r2_score(y_true, y_pred)

        return {
            'mae': mae,
            'rmse': rmse,
            'r2': r2
        }

    def save_model(self, model_path: str, scaler_path: str) -> None:
        """ Save model and scaler to disk 
        
        Args:
            model_path (str): Path to save the model
            scaler_path (str): Path to save the scaler
        """
        # Create directories if they do not exist ...
        os.makedirs(os.path.dirname(model_path), exist_ok=True)

        # save model and scaler ...
        joblib.dump(self.model, model_path)
        joblib.dump(self.scaler, scaler_path)

    def load_model(self, model_path: str, scaler_path: str) -> Tuple[Any, StandardScaler]:
        """ Load model and scaler from disk 
        
        Args:
            model_path (str): Path to the saved model
            scaler_path (str): Path to the saved scaler

        Returns:
            Tuple containing:
                model: Loaded model
                scaler (StandardScaler): Loaded scaler
        """
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)

        return model, scaler

    def predict(self, model: Any, data: pd.DataFrame) -> np.ndarray:
        """ Make predictions using the trained model """
        # Get feature names from scaler
        feature_names = self.scaler.feature_names_in_

        # Select only the features used in training
        X = data[feature_names]

        # Scale features using the loaded scaler
        X_scaled = pd.DataFrame(
            self.scaler.transform(X),
            columns=feature_names
        )

        # Make predictions
        predictions = model.predict(X_scaled)

        return predictions