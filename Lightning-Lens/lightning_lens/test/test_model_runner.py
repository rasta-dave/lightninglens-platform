import pytest
import os
import pandas as pd
import numpy as np
import tempfile
from unittest.mock import patch, MagicMock
from src.scripts.model_runner import train_model, predict_optimal_ratios

class TestModelRunner:
    @pytest.fixture
    def sample_data(self):
        """ Create a small sample dataframe for testing """
        return pd.DataFrame({
            'channel_id': ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'],
            'timestamp': pd.date_range(start='2024-01-01', periods=5),
            'balance_velocity': np.random.rand(5),
            'liquidity_stress': np.random.uniform(0, 1, 5),
            'hour_of_day': np.random.randint(0, 24, 5),
            'day_of_week': np.random.randint(0, 7, 5),
            'balance_ratio': np.random.uniform(0, 1, 5)
        })
    
    @pytest.fixture
    def mock_config(self):
        """ Mock configuration dictionary """
        return {
            'model': {
                'n_estimators': 10,
                'max_depth': 3,
                'min_samples_split': 2
            },
            'training': {
                'validation_split': 0.25
            }
        }
    
    @pytest.fixture
    def temp_csv(self, sample_data):
        """ Create a temporary CSV file with sample data """
        with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as tmp:
            sample_data.to_csv(tmp.name, index=False)
            return tmp.name
        
    @pytest.fixture
    def cleanup_files(self):
        """ Fixture to clean up any files created during the test"""
        files_to_remove = []
        yield files_to_remove
        for file_path in files_to_remove:
            if os.path.exists(file_path):
                os.remove(file_path)

    @patch('src.scripts.model_runner.load_config')
    @patch('src.scripts.model_runner.ModelTrainer')
    def test_train_model(self, mock_trainer_class, mock_load_config, mock_config, temp_csv, cleanup_files):
        """ Test the train_model function """
        # Setup mocks ...
        mock_load_config.return_value = mock_config

        mock_trainer = MagicMock()
        mock_trainer_class.return_value = mock_trainer

        # Mock return values ...
        mock_model = MagicMock()
        mock_metrics = {'mae': 0.1, 'rmse': 0.2, 'r2': 0.8}
        mock_trainer.train_model.return_value = (mock_model, mock_metrics)

        # Creating a temporary output directory ...
        with tempfile.TemporaryDirectory() as temp_dir:
            # Call the function ...
            train_model('dummy_config_path', temp_csv, temp_dir, 'balance_ratio')

            # Verify the function called the right methods with right parameters ...
            mock_load_config.assert_called_once_with('dummy_config_path')

            mock_trainer_class.assert_called_once_with(
                test_size=0.25,
                random_state=42
            )

            # Check if model was trained with correct params ...
            mock_trainer.train_model.assert_called_once()
            call_args = mock_trainer.train_model.call_args[1]
            assert call_args['target_column'] == 'balance_ratio'
            assert call_args['model_params']['n_estimators'] == 10
            assert call_args['model_params']['max_depth'] == 3

            # Check if model was saved ...
            assert mock_trainer.save_model.called

            # Add model and scaler paths to cleanup list if they exist ...
            model_path = mock_trainer.save_model.call_args[0][0]
            scaler_path = mock_trainer.save_model.call_args[0][1]
            if os.path.exists(model_path):
                cleanup_files.append(model_path)
            if os.path.exists(scaler_path):
                cleanup_files.append(scaler_path)
            
            

    @patch('src.scripts.model_runner.load_config')
    @patch('src.scripts.model_runner.ModelTrainer')
    def test_predict_optimal_ratios(self, mock_trainer_class, mock_load_config,
                                    mock_config, sample_data, temp_csv, cleanup_files):
        """ Test the predict_optimal_ratios function """
        # Setup mocks ...
        mock_trainer = MagicMock()
        mock_trainer_class.return_value = mock_trainer

        # Mock model and scaler ...
        mock_model = MagicMock()
        mock_scaler = MagicMock()
        mock_trainer.load_model.return_value = (mock_model, mock_scaler)

        # Mock predictions ...
        mock_predictions = np.array([0.3, 0.5, 0.7, 0.4, 0.6])
        mock_trainer.predict.return_value = mock_predictions
        
        with tempfile.NamedTemporaryFile(suffix='.pkl') as model_file:
            # Call the function ...
            predict_optimal_ratios(
                model_file.name,
                temp_csv,
                output_dir="data/predictions"
            )

            # Check if model was loaded correctly ...
            mock_trainer.load_model.assert_called_once_with(model_file.name)

            # Check if predict was called
            mock_trainer.predict.assert_called_once()

            # Verify predictions directory exists
            assert os.path.exists("data/predictions")