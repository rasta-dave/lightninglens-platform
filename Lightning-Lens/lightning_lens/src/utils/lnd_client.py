import os
import codecs
import grpc
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime

from ..proto import lightning_pb2 as ln
from ..proto import lightning_pb2_grpc as lnrpc

from .config import load_config


class LndClient:
    """ ☋ Client for interacting with LND nodes """

    def __init__(self, node_name: str, config_path: str = "lightning-docker-testnet/configs/test_docker.yaml"):
        """ Initialize LND client for a specific node

        Args:
            node_name (str): Name of the node (e.g., 'alice', 'bob')
            config_path (str): Path to docker config file
        """
        self.config = load_config(config_path)
        if node_name not in self.config['nodes']:
            raise KeyError(f'Node {node_name} not found in config')
        self.node_config = self.config['nodes'][node_name]
        self.stub = self._create_stub()

    def _create_stub(self) -> lnrpc.LightningStub:
        """ Create a gRPC stub for LND communication ⛵ """
        cert_path = os.path.expanduser(self.node_config['tls_cert_path'])
        macaroon_path = os.path.expanduser(self.node_config['macaroon_path'])
        
        # Check if files exist
        if not os.path.exists(cert_path):
            raise FileNotFoundError(f"TLS cert not found at: {cert_path}")
        if not os.path.exists(macaroon_path):
            raise FileNotFoundError(f"Macaroon not found at: {macaroon_path}")
        
        cert = open(cert_path, 'rb').read()
        with open(macaroon_path, 'rb') as f:
            macaroon_bytes = f.read()
        macaroon = codecs.encode(macaroon_bytes, 'hex')

        cert_creds = grpc.ssl_channel_credentials(cert)
        auth_creds = grpc.metadata_call_credentials(
            lambda _, cb: cb([('macaroon', macaroon)], None)
        )
        combined_creds = grpc.composite_channel_credentials(cert_creds, auth_creds)

        channel = grpc.secure_channel(
            self.node_config['rpc_server'],
            combined_creds
        )
        return lnrpc.LightningStub(channel)
    
    def get_info(self) -> Dict:
        """ Get basic info about the node """
        try:
            response = self.stub.GetInfo(ln.GetInfoRequest())
            return {
                'pubkey': response.identity_pubkey,
                'alias': response.alias,
                'num_peers': response.num_peers,
                'num_active_channels': response.num_active_channels,
                'blockheight': response.block_height
            }
        except Exception as e:
            raise Exception(f'Error fetching node info: {e}')
    
    def get_channel_balances(self) -> List[Dict]:
        """ Get balance information for all channels """
        try:
            response = self.stub.ListChannels(ln.ListChannelsRequest())
            channels = []
            for channel in response.channels:
                channels.append({
                    'channel_id': channel.chan_id,
                    'capacity': channel.capacity,
                    'local_balance': channel.local_balance,
                    'remote_balance': channel.remote_balance,
                    'remote_pubkey': channel.remote_pubkey
                })
            return channels
        except Exception as e:
            raise Exception(f'Failed to get channel balances: {e}')
    
    def get_forwarding_history(self, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None) -> List[Dict]:
        """ Get forwarding history for the node """

        # Fetches payments that were routed through this node ... 🔅
        try:
            request = ln.ForwardingHistoryRequest(
                start_time=int(start_time.timestamp()) if start_time else 0,
                end_time=int(end_time.timestamp()) if end_time else 0,
                num_max_events=1000
            )
            response = self.stub.ForwardingHistory(request)

            # Requesting a list of forwarding events between the given timestamps ...
            forwarding_events = []
            for event in response.forwarding_events:
                forwarding_events.append({
                    'timestamp': datetime.fromtimestamp(event.timestamp),
                    'chan_id_in': event.chan_id_in,
                    'chain_id_out': event.chain_id_out,
                    'amt_in': event.amt_in,
                    'amt_out': event.amt_out,
                    'fee': event.fee
                })
                return forwarding_events
        except Exception as e:
                raise Exception(f'Error fetching forwarding history: {e}')
    
    def create_invoice(self, amount: int, memo: str = "") -> str:
        """ Create a payment invoice """
        try:
            response = self.stub.AddInvoice(
                ln.Invoice(
                    value=amount,
                    memo=memo
                ),
                timeout=10  # Add 10 second timeout
            )
            return response.payment_request
        except Exception as e:
            raise Exception(f'Failed to create invoice: {e}')
    
    def pay_invoice(self, payment_request: str) -> Dict:
        """ Pay a Lightning invoice """
        try:
            response = self.stub.SendPaymentSync(ln.SendRequest(
                payment_request=payment_request
            ))
            return {
                'payment_hash': response.payment_hash.hex(),
                'payment_preimage': response.payment_preimage.hex(),
                'payment_route': {
                    'total_time_lock': response.payment_route.total_time_lock,
                    'total_fees': response.payment_route.total_fees,
                    'total_amt': response.payment_route.total_amt
                }
            }
        except Exception as e:
            raise Exception(f'Failed to pay invoice: {e}')

# Example usage
if __name__ == "__main__":
    # Connect to Alice's node
    alice = LndClient('alice')

    try:
        # Get node info
        info = alice.get_info()
        print("Node Info:", info)

        # Get channel balances
        channels = alice.get_channel_balances()
        print("Channel Balances:", channels)

        # Get recent forwarding history
        history = alice.get_forwarding_history()
        print("Forwarding History:", history)

    except Exception as e:
        print(f"Error: {e}")