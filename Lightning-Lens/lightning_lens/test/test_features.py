import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from src.models.features import FeatureProcessor

class TestFeatureProcessor:
    @pytest.fixture
    def sample_data(self):
        """ Create sample channel metrics data """
        dates = pd.date_range(start='2024-01-01', periods=24, freq='H')
        data = []

        for timestamp in dates:
            data.append({
                'timestamp': timestamp,
                'channel_id': '123456',
                'capacity': 1000000,
                'local_balance': 500000 + np.random.randint(-10000, 10000),
                'remote_balance': 500000 + np.random.randint(-10000, 10000),
                'remote_pubkey': 'abc123',
                'balance_ratio': 0.5
            })

        return pd.DataFrame(data)
    
    @pytest.fixture
    def feature_processor(self):
        return FeatureProcessor()
    
    def test_calculate_balance_velocity(self, feature_processor, sample_data):
        """ Test calculation of balance change velocity """
        features = feature_processor.calculate_balance_velocity(sample_data)

        assert 'balance_velocity' in features.columns
        assert len(features) == len(sample_data)
        assert not features['balance_velocity'].isnull().any()

    def test_calculate_liquidity_stress(self, feature_processor, sample_data):
        """ Test calculation of liquidity stress indicators """
        features = feature_processor.calculate_liquidity_stress(sample_data)

        assert 'liquidity_stress' in features.columns
        assert all(features['liquidity_stress'].between(0, 1))

    def test_generate_time_features(self, feature_processor, sample_data):
        """ Test generation of time-based features """
        features = feature_processor.generate_time_features(sample_data)

        assert 'hour_of_day' in features.columns
        assert 'day_of_week' in features.columns
        assert all(features['hour_of_day'].between(0, 23))
        assert all(features['day_of_week'].between(0, 6))

    def test_process_features(self, feature_processor, sample_data):
        """ Test complete feature processing pipeline """
        features = feature_processor.process_features(sample_data)

        # Check all expected features are present ...
        expected_features = [
            'balance_velocity',
            'liquidity_stress',
            'hour_of_day',
            'day_of_week',
            'balance_ratio'
        ]

        for feature in expected_features:
            assert feature in features.columns

        # Check no Nan values in features ...
        assert not features.isnull().any().any()

        # Check feature ranges ...
        assert all(features['balance_ratio'].between(0, 1))
        assert all(features['liquidity_stress'].between(0, 1))
        assert all(features['day_of_week'].between(0, 6))

    def test_invalid_data_handling(self, feature_processor):
        """ Test handling of invalid input data """
        # Test empty dataframe
        empty_df = pd.DataFrame()
        with pytest.raises(ValueError):
            feature_processor.validate_input(empty_df)

        # Test missing required columns
        invalid_df = pd.DataFrame({
            'timestamp': ['2024-02-16'],
            'channel_id': ['123'],
            'local_balance': [100],
            'capacity': [200]

        })
        with pytest.raises(ValueError):
            feature_processor.validate_input(invalid_df)



