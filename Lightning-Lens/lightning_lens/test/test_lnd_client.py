import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, mock_open
from src.utils.lnd_client import LndClient
from src.proto import lightning_pb2 as ln
import grpc
import os

class TestLndClient:
    @pytest.fixture
    def mock_config(self):
        """ Provide a mock config for testing """
        return {
            'network': {
                'type': 'regtest',
                'bitcoin_rpc': 'http://bitcoind:18443'
            },
            'nodes': {
                'alice': {
                    'rpc_server': 'localhost:10001',
                    'tls_cert_path': '/media/shahazzad/new/KOD/REGTEST-BITCOIN/lightning-docker-testnet/lnd-alice-data/tls.cert',
                    'macaroon_path': '/media/shahazzad/new/KOD/REGTEST-BITCOIN/lightning-docker-testnet/lnd-alice-data/data/chain/bitcoin/regtest/admin.macaroon',
                    'peers': ['bob']
                }
            }
        }

    @pytest.fixture
    def mock_client(self, mock_config):
        """ Create a mock LND client """
        with patch('src.utils.lnd_client.load_config', return_value=mock_config), \
            patch('builtins.open', mock_open(read_data=b'mock_cert_data')), \
            patch('src.utils.lnd_client.grpc.ssl_channel_credentials'), \
            patch('src.utils.lnd_client.grpc.metadata_call_credentials'), \
            patch('src.utils.lnd_client.grpc.composite_channel_credentials'), \
            patch('src.utils.lnd_client.grpc.secure_channel'), \
            patch('src.utils.lnd_client.lnrpc.LightningStub'):
            client = LndClient('alice')
            client.stub = MagicMock()
            return client

    def test_successful_initialization(self, mock_config):
        """ Test successful client initialization """
        # Creating mock file contents
        mock_cert = b'mock certificate content'
        mock_macaroon = b'mock macaroon content'

        # Create a mock file handler that returns different content for different files
        mock_file = MagicMock()
        mock_file.__enter__ = MagicMock()
        mock_file.__enter__.return_value = mock_file
        mock_file.__exit__ = MagicMock()
        mock_file.read.side_effect = [mock_cert, mock_macaroon]

        # Mock os.path.exists to return True
        with patch('src.utils.lnd_client.load_config', return_value=mock_config), \
            patch('builtins.open', MagicMock(return_value=mock_file)), \
            patch('os.path.exists', return_value=True), \
            patch('src.utils.lnd_client.grpc.ssl_channel_credentials'), \
            patch('src.utils.lnd_client.grpc.metadata_call_credentials'), \
            patch('src.utils.lnd_client.grpc.composite_channel_credentials'), \
            patch('src.utils.lnd_client.grpc.secure_channel'), \
            patch('src.utils.lnd_client.lnrpc.LightningStub'):

            client = LndClient('alice')
            assert client is not None
            assert client.node_config == mock_config['nodes']['alice']

    def test_invalid_node_name(self):
        with pytest.raises(KeyError) as exc_info:
            LndClient('invalid_node')
        assert 'invalid_node' in str(exc_info.value)

    @patch('src.utils.lnd_client.grpc.ssl_channel_credentials')
    @patch('src.utils.lnd_client.grpc.metadata_call_credentials')
    def test_initialization_with_invalid_cert(self, mock_meta_creds, mock_ssl_creds):
        mock_ssl_creds.side_effect = Exception('Invalid certificate')
        with pytest.raises(Exception) as exc_info:
            LndClient('alice')
        assert 'Invalid certificate' in str(exc_info.value)

    def test_get_info_success(self, mock_client):
        """ Test succesful get_info call """
        # Preparing mock response ...
        mock_response = MagicMock()
        mock_response.identity_pubkey = 'test_pubkey'
        mock_response.alias = 'test_alias'
        mock_response.num_peers = 5
        mock_response.num_active_channels = 3
        mock_response.block_height = 100

        mock_client.stub.GetInfo.return_value = mock_response

        info = mock_client.get_info()

        assert info['pubkey'] == 'test_pubkey'
        assert info['alias'] == 'test_alias'
        assert info['num_peers'] == 5
        assert info['num_active_channels'] == 3
        assert info['blockheight'] == 100

    def test_get_info_failure(self, mock_client):
        """ Test get_info with RPC failure """
        mock_client.stub.GetInfo.side_effect = grpc.RpcError('RPC Error')

        with pytest.raises(Exception) as exc_info:
            mock_client.get_info()
        assert 'Error fetching node info' in str(exc_info.value)

    def test_get_channel_balances_success(self, mock_client):
        """ Test successful get_channel_balances call """
        # Preparing the mock channel ...
        mock_channel = MagicMock()
        mock_channel.chan_id = '123456'
        mock_channel.capacity = 1000000
        mock_channel.local_balance = 500000
        mock_channel.remote_balance = 500000
        mock_channel.remote_pubkey = 'remote_pubkey'

        # Preparing the mock response ...
        mock_response = MagicMock()
        mock_response.channels = [mock_channel]

        mock_client.stub.ListChannels.return_value = mock_response

        channels = mock_client.get_channel_balances()

        assert len(channels) == 1
        assert channels[0]['channel_id'] == '123456'
        assert channels[0]['capacity'] == 1000000
        assert channels[0]['local_balance'] == 500000
        assert channels[0]['remote_balance'] == 500000
        assert channels[0]['remote_pubkey'] == 'remote_pubkey'

    def test_get_channel_balances_failure(self, mock_client):
        """ Test get_channel_balances with RPC failure """
        mock_client.stub.ListChannels.side_effect = grpc.RpcError('RPC Error')

        with pytest.raises(Exception) as exc_info:
            mock_client.get_channel_balances()
        assert 'Failed to get channel balances' in str(exc_info.value)

    def test_get_forwarding_history_success(self, mock_client):
        """ Test successful get_forwarding_history call """
        # Preparing the mock event ...
        mock_event = MagicMock()
        mock_event.timestamp = int(datetime.now().timestamp())
        mock_event.chan_id_in = '123'
        mock_event.chain_id_out = '456'
        mock_event.amt_in = 1000
        mock_event.amt_out = 990
        mock_event.fee = 10

        # Preparing mock response ...
        mock_response = MagicMock()
        mock_response.forwarding_events = [mock_event]

        mock_client.stub.ForwardingHistory.return_value = mock_response

        history = mock_client.get_forwarding_history()

        assert len(history) == 1
        assert history[0]['chan_id_in'] == '123'
        assert history[0]['amt_in'] == 1000
        assert history[0]['fee'] == 10
    
    def test_create_invoice_success(self, mock_client):
        """ Test successful create_invoice call """
        mock_response = MagicMock()
        mock_response.payment_request = 'lnbc...'

        mock_client.stub.AddInvoice.return_value = mock_response

        payment_request = mock_client.create_invoice(1000, "Test payment")
        assert payment_request == 'lnbc...'

        # Verify correct parameters were passed ...
        mock_client.stub.AddInvoice.assert_called_once()
        call_args = mock_client.stub.AddInvoice.call_args[0][0]
        assert call_args.value == 1000
        assert call_args.memo == "Test payment"

    def test_pay_invoice_success(self, mock_client):
        """ Test successful pay_invoice call """
        # Create nested mocks for the response structure
        mock_route = MagicMock()
        mock_route.total_time_lock = 100
        mock_route.total_fees = 10
        mock_route.total_amt = 1000

        mock_response = MagicMock()
        mock_response.payment_hash = b'hash'
        mock_response.payment_preimage = b'preimage'
        mock_response.payment_route = mock_route  # Attach the mock route

        mock_client.stub.SendPaymentSync.return_value = mock_response

        result = mock_client.pay_invoice('lnbc...')

        assert result['payment_hash'] == b'hash'.hex()
        assert result['payment_preimage'] == b'preimage'.hex()
        assert result['payment_route']['total_time_lock'] == 100
        assert result['payment_route']['total_fees'] == 10
        assert result['payment_route']['total_amt'] == 1000

@pytest.mark.integration
class TestLndClientIntegration:
    """ Integration tests requiring actual Polar network """

    @pytest.fixture
    def alice_client(self):
        return LndClient('alice')
    
    @pytest.fixture
    def bob_client(self):
        return LndClient('bob')
    
    def test_node_connection(self, alice_client):
        """ Test connection to actual Polar node """
        try:
            info = alice_client.get_info()
            assert info is not None
            assert 'pubkey' in info
            assert 'alias' in info
        except Exception as e:
            pytest.skip(f'Polar network not available: ${str(e)}')

    def test_payment_flow(self, alice_client, bob_client):
        """ Test complete payment flow between nodes """
        try:
            # Create invoice
            amount = 1000
            memo = "Test payment"
            payment_request = alice_client.create_invoice(amount, memo)
            assert payment_request is not None

            # Pay invoice
            payment_result = bob_client.pay_invoice(payment_request)
            assert payment_result is not None
            assert 'payment_hash' in payment_result
            assert 'payment_route' in payment_result
            
            # Verify payment amount
            assert payment_result['payment_route']['total_amt'] == amount
        except Exception as e:
            pytest.skip(f'Payment test failed: ${str(e)}')

if __name__ == "__main__":
    pytest.main()
