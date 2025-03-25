import pytest
import pandas as pd
import numpy as np
import os
import tempfile
from src.models.trainer import ModelTrainer

class TestModelTrainer:
    @pytest.fixture
    def sample_features(self):
        """ Create sample feature data """
        n_samples = 100
        # Create repeating channel IDs of exact length
        channel_ids = ['1', '2', '3'] * (n_samples // 3) + ['1', '2', '3'][:n_samples % 3]
        
        return pd.DataFrame({
            'channel_id': channel_ids[:n_samples],  # Ensure exact length
            'timestamp': pd.date_range(start='2024-01-01', periods=n_samples, freq='H'),
            'balance_velocity': np.random.rand(n_samples),
            'liquidity_stress': np.random.uniform(0, 1, n_samples),
            'hour_of_day': np.random.randint(0, 24, n_samples),
            'day_of_week': np.random.randint(0, 7, n_samples),
            'balance_ratio': np.random.uniform(0, 1, n_samples)
        })
    
    @pytest.fixture
    def sample_target(self):
        """ Create sample target data """
        n_samples = 100  # Match sample_features size
        return np.random.uniform(0.3, 0.8, n_samples)
    
    def test_model_initialization(self):
        """ Test model trainer initialization """
        trainer = ModelTrainer()
        assert trainer is not None
        assert trainer.test_size == 0.2
        assert trainer.random_state == 42

    def test_data_preparation(self, sample_features, sample_target):
        """ Test data preparation functionality """
        trainer = ModelTrainer()

        # Add target to features
        features_df = sample_features.copy()
        features_df['optimal_ratio'] = sample_target

        X_train, X_test, y_train, y_test = trainer.prepare_data(
            features_df, target_column='optimal_ratio'
        )

        # Check shapes with correct expected sizes
        n_samples = len(sample_features)
        expected_train_size = int(n_samples * 0.8)
        assert len(X_train) == expected_train_size
        assert len(y_train) == expected_train_size
        assert len(X_test) == n_samples - expected_train_size
        assert len(y_test) == n_samples - expected_train_size

        # Check column removal ...
        assert 'channel_id' not in X_train.columns
        assert 'timestamp' not in X_train.columns
        assert 'optimal_ratio' not in X_train.columns

    def test_model_training(self, sample_features, sample_target):
        """ Test model training functionality """
        trainer = ModelTrainer()

        # Add target to features ...
        features_df = sample_features.copy()
        features_df['optimal_ratio'] = sample_target

        # Train model ...
        model, metrics = trainer.train_model(
            features_df, target_column='optimal_ratio'
        )

        # Check if model was created ...
        assert model is not None

        # Check if metrics were calculated ...
        assert 'mae' in metrics
        assert 'rmse' in metrics
        assert 'r2' in metrics

    def test_model_saving_loading(self, sample_features, sample_target):
        """ Test model saving and loading functionality """
        trainer = ModelTrainer()

        # Add target to features ...
        features_df = sample_features.copy()
        features_df['optimal_ratio'] = sample_target

        # Create temp directory for model saving ...
        with tempfile.TemporaryDirectory() as tmpdirname:
            model_path = os.path.join(tmpdirname, 'test_model.pkl')
            scaler_path = os.path.join(tmpdirname, 'test_scaler.pkl')

        # Train and save model ...
        model, _ = trainer.train_model(
            features_df,
            target_column='optimal_ratio'
        )

        trainer.save_model(model_path, scaler_path)

        # Check if files were created ...
        assert os.path.exists(model_path)
        assert os.path.exists(scaler_path)

        # Load model ...
        loaded_model, loaded_scaler = trainer.load_model(model_path, scaler_path)

        # Check if model was loaded correctly ...
        assert loaded_model is not None
        assert loaded_scaler is not None


    def test_model_prediction(self, sample_features, sample_target):
        """ Test model prediction functionality """
        trainer = ModelTrainer()

        # Add target to features ...
        features_df = sample_features.copy()
        features_df['optimal_ratio'] = sample_target

        # Train model ...
        model, _ = trainer.train_model(
            features_df, target_column='optimal_ratio'
        )

        # Create test data for prediction ...
        test_data = sample_features.iloc[:5].copy()

        # Make predictions
        predictions = trainer.predict(model, test_data)

        # Check predictions shape and values ...
        assert len(predictions) == 5
        assert all(0.0 <= pred <= 1.0 for pred in predictions)