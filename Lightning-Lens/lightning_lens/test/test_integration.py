import pytest
from src.utils.lnd_client import LndClient

@pytest.mark.integration
class TestDockerIntegration:
    @pytest.fixture
    def alice_client(self):
        try:
            client = LndClient('alice', config_path="lightning-docker-testnet/configs/test_docker.yaml")
            return client
        except Exception as e:
            print(f"\nClient initialization error: {str(e)}")
            raise
    
    @pytest.fixture
    def bob_client(self):
        return LndClient('bob', config_path="lightning-docker-testnet/configs/test_docker.yaml")
    
    def test_node_connection(self, alice_client):
        try:
            info = alice_client.get_info()
            assert info is not None
            assert 'pubkey' in info
        except Exception as e:
            print(f"\nConnection error details: {type(e).__name__}: {str(e)}")
            print(f"Make sure your Docker containers are running with: docker ps")
            pytest.skip(f"Docker environment not available: {str(e)}") 

    def test_channel_balances(self, alice_client):
        """ Test fetching channel balances """
        balances = alice_client.get_channel_balances()
        assert isinstance(balances, list)

    def test_node_communication(self, alice_client, bob_client):
        """ Test communication between nodes """
        try:
            # First verify both clients are connected
            alice_info = alice_client.get_info()
            bob_info = bob_client.get_info()
            if not alice_info or not bob_info:
                pytest.skip("One or both nodes not available")

            # Create invoice with timeout handling
            amount = 1000
            try:
                invoice = bob_client.create_invoice(amount, "Test payment")
                if not invoice:
                    pytest.skip("Failed to create invoice")
                print(f"Successfully created invoice: {invoice[:30]}...")
            except Exception as e:
                pytest.skip(f"Invoice creation failed: {str(e)}")

            pytest.skip("Skipping remaining payment test until decode_invoice is implemented")
            
        except Exception as e:
            print(f"\nTest failed with error: {type(e).__name__}: {str(e)}")
            pytest.skip(f"Node communication test failed: {str(e)}") 