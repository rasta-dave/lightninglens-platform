import pytest
from datetime import datetime
from unittest.mock import MagicMock
from data.collector import DataCollector
from src.utils.lnd_client import LndClient

class TestDataCollector:
    @pytest.fixture
    def mock_client(self):
        client = MagicMock(spec=LndClient)
        client.get_channel_balances.return_value = [
            {
                'channel_id': '123',
                'capacity': 1000000,
                'local_balance': 500000,
                'remote_balance': 500000,
                'remote_pubkey': 'abc123'
            }
        ]
        client.get_forwarding_history.return_value = []
        return client

    @pytest.fixture
    def collector(self, mock_client):
        return DataCollector(mock_client)

    def test_collect_channel_metrics(self, collector):
        """ Test collecting channel metrics """
        metrics = collector.collect_channel_metrics()
        
        assert metrics is not None
        assert 'timestamp' in metrics
        assert 'channels' in metrics
        assert 'forwarding' in metrics

    def test_process_metrics(self, collector):
        """ Test processing metrics """
        # Setup test data
        raw_metrics = {
            'timestamp': datetime.now(),
            'channels': [
                {
                    'channel_id': '123',
                    'capacity': 1000000,
                    'local_balance': 500000,
                    'remote_balance': 500000,
                    'remote_pubkey': 'abc123'
                }
            ],
            'forwarding': []
        }

        # Process metrics
        df = collector.process_metrics(raw_metrics)
        
        # Verify the results
        assert not df.empty
        assert 'channel_id' in df.columns
        assert 'balance_ratio' in df.columns
        assert len(df) == 1

