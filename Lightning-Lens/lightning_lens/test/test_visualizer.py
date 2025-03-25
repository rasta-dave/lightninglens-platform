import os
import pytest
import pandas as pd
import numpy as np
import tempfile
from unittest.mock import patch, MagicMock

# Importing the functions from the visualizer script
from src.scripts.visualizer import (
    create_output_directory,
    load_data,
    plot_balance_distribution,
    plot_optimal_vs_current,
    plot_rebalance_recommendations,
    plot_feature_importance,
    create_summary_report,
    create_visualizations
)

class TestVisualizer:

    @pytest.fixture
    def sample_predictions(self):
        """ Create a sample predictions Dataframe """
        return pd.DataFrame({
            'channel_id': ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'],
            'timestamp': pd.date_range(start='2024-01-01', periods=5),
            'balance_velocity': np.random.rand(5),
            'liquidity_stress': np.random.uniform(0, 1, 5),
            'hour_of_day': np.random.randint(0, 24, 5),
            'day_of_week': np.random.randint(0, 7, 5),
            'balance_ratio': np.random.uniform(0, 1, 5),
            'predicted_optimal_ratio': np.random.uniform(0, 1, 5),
            'current_ratio': np.random.uniform(0, 1, 5),
            'adjustment_needed': np.random.uniform(-0.5, 0.5, 5)
        })
    
    @pytest.fixture
    def temp_csv(self, sample_predictions):
        """ Create a temporary CSV file with sample predictions """
        with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as tmp:
            sample_predictions.to_csv(tmp.name, index=False)
            return tmp.name
        
    @pytest.fixture
    def cleanup_files(self):
        """ Fixture to clean up any files created during testing """
        files_to_remove = []
        yield files_to_remove
        for file_path in files_to_remove:
            if os.path.exists(file_path):
                os.remove(file_path)

    def test_create_output_directory(self):
        """ Test creating output directory """
        with tempfile.TemporaryDirectory() as temp_dir:
            test_dir = os.path.join(temp_dir, "visualization")
            result = create_output_directory(test_dir)

            assert os.path.exists(test_dir)
            assert result == test_dir

    def test_load_data(self, temp_csv):
        """ Test loading data from CSV """
        df = load_data(temp_csv)

        assert df is not None
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 5

    @patch('matplotlib.pyplot.savefig')
    def test_plot_balance_distribution(self, mock_savefig, sample_predictions):
        """ Test balance distribution plot creation """
        with tempfile.TemporaryDirectory() as temp_dir:
            result = plot_balance_distribution(sample_predictions, temp_dir)

            # Check that savefig was called ...
            assert mock_savefig.called

            # Check that the function returns a path
            assert result is not None
            assert isinstance(result, str)
            assert result.endswith('.png')

    @patch('matplotlib.pyplot.savefig')
    def test_plot_optimal_vs_current(self, mock_savefig, sample_predictions):
        """ Test optimal vs current plot creation """
        with tempfile.TemporaryDirectory() as temp_dir:
            result = plot_optimal_vs_current(sample_predictions, temp_dir)

            # Check that savefig was called ...
            assert mock_savefig.called

            # Check that the function returns a path
            assert result is not None
            assert isinstance(result, str)
            assert result.endswith('.png')
    
    @patch('matplotlib.pyplot.savefig')
    def test_plot_rebalance_recommendations(self, mock_savefig, sample_predictions):
        """ Test rebalance recommendations plot creation """
        with tempfile.TemporaryDirectory() as temp_dir:
            result = plot_rebalance_recommendations(sample_predictions, temp_dir)

            # Check that savefig was called ...
            assert mock_savefig.called

            # Check that the function returns a path ...
            assert result is not None
            assert isinstance(result, str)
            assert result.endswith('.png')

    @patch('matplotlib.pyplot.savefig')
    def test_plot_feature_importance(self, mock_savefig, sample_predictions):
        """ Test feature importance plot creation """
        with tempfile.TemporaryDirectory() as temp_dir:
            result = plot_feature_importance(sample_predictions, temp_dir)

            # Check that savefig was called ...
            assert mock_savefig.called

            # Check that the function returns a path
            assert result is not None
            assert isinstance(result, str)
            assert result.endswith('.png')
    
    def test_create_summary_report(self, sample_predictions):
        """ Test summary report creation """
        with tempfile.TemporaryDirectory() as temp_dir:
            visualizations = {
                'Balance Distribution': 'path/to/balance_distribution.png',
                'Optimal vs Current Balance': 'path/to/optimal_vs_current.png',
                'Rebalance Recoomendations': 'path/to/rebalance_recommendations.png',
                'Feature Importance': 'path/to/frature_importance.png'
            }

            result = create_summary_report(sample_predictions, temp_dir, visualizations)

            # Check that report was created ...
            assert os.path.exists(result)

            # Check content
            with open(result, 'r') as f:
                content = f.read()
                assert "Lightning Lens Rebalancing Report" in content
                assert "Total Channels Analyzed: 5" in content

    @patch('src.scripts.visualizer.plot_balance_distribution')
    @patch('src.scripts.visualizer.plot_optimal_vs_current')
    @patch('src.scripts.visualizer.plot_rebalance_recommendations')
    @patch('src.scripts.visualizer.plot_feature_importance')
    @patch('src.scripts.visualizer.create_summary_report')
    def test_create_visualizations(self, mock_report, mock_feature, mock_rebalance,
                                   mock_optimal, mock_balance, temp_csv):
        """ Test the main visualization function """
        # Set return values for mocks
        mock_balance.return_value = "path/to/balance.png"
        mock_optimal.return_value = "path/to/optimal.png"
        mock_rebalance.return_value = "path/to/rebalance.png"
        mock_feature.return_value = "path/to/feature.png"
        mock_report.return_value = "path/to/report.md"

        with tempfile.TemporaryDirectory() as temp_dir:
            create_visualizations(temp_csv, temp_dir)

            # Verify all plotting functions were called ...
            assert mock_balance.called
            assert mock_optimal.called
            assert mock_rebalance.called
            assert mock_feature.called
            assert mock_report.called
            
        





