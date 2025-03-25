#!/bin/bash

# Define colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Store the original directory
ORIGINAL_DIR=$(pwd)

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}    Lightning Network Setup 🚀${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Script must be run with sudo. Elevating privileges..."
    exec sudo "$0" "$@"
    exit $?
fi

# Make sure expect is installed
if ! command -v expect &> /dev/null; then
    echo "Installing expect tool..."
    apt-get update
    apt-get install -y expect
fi

# Step 1: Cleanup - Stop existing containers and remove data directories
echo -e "${BLUE}Step 1: Cleaning up existing environment${NC}"

# Navigate to the Lightning-Simulation directory
if [ -d "Lightning-Simulation/lightning-simulation" ]; then
    cd Lightning-Simulation/lightning-simulation
    
    # Stop any running containers
    echo "Stopping any running containers..."
    docker-compose down -v
    
    # Remove LND data directories to start fresh
    echo "Removing existing LND data directories..."
    sudo rm -rf lnd-*-data
    
    # Recreate empty directories
    echo "Creating fresh data directories..."
    mkdir -p lnd-alice-data lnd-bob-data lnd-carol-data lnd-dave-data lnd-eve-data
    
    # Also clean up bitcoind data to start fresh
    echo "Removing Bitcoin data..."
    sudo rm -rf bitcoin-data
    mkdir -p bitcoin-data
    
    # Return to original directory
    cd "$ORIGINAL_DIR"
else
    echo -e "${RED}✗ Lightning-Simulation directory not found${NC}"
    echo "Make sure you're running this script from the project root directory."
    exit 1
fi

# Step 2: Start bitcoind only first
echo -e "${BLUE}Step 2: Starting Bitcoin node${NC}"
echo "⏱️  This may take a few minutes..."

cd Lightning-Simulation/lightning-simulation

echo "Starting bitcoind..."
docker-compose up -d bitcoind

# Wait for bitcoind to start
echo "Waiting for bitcoind to initialize..."
sleep 20

# Verify bitcoind is running
if docker ps | grep -q bitcoind; then
    echo -e "${GREEN}✓ Bitcoin node started successfully${NC}"
else
    echo -e "${RED}✗ Failed to start Bitcoin node${NC}"
    echo "Check docker logs for more information."
    docker-compose logs bitcoind
    cd "$ORIGINAL_DIR"
    exit 1
fi

# Create a wallet explicitly
echo "Creating Bitcoin wallet..."
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin createwallet default

# Get a Bitcoin address for generating blocks
echo "Getting Bitcoin address..."
ADDRESS=$(docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin getnewaddress)
echo "Using Bitcoin address: $ADDRESS"

# Generate some initial blocks (need at least 101 for funds to be spendable)
echo "Generating initial coins..."
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 101 "$ADDRESS"

# Step 3: Start LND nodes one by one and initialize them
echo -e "${BLUE}Step 3: Starting and initializing LND nodes${NC}"

# Function to initialize an LND node
initialize_lnd_node() {
    local node=$1
    echo "Initializing $node..."
    
    # Start only this node
    docker-compose up -d $node
    
    # Wait for the node to start
    echo "Waiting for $node to start..."
    sleep 15
    
    # Check if the node is running
    if ! docker ps | grep -q $node; then
        echo -e "${RED}✗ Failed to start $node${NC}"
        docker-compose logs $node
        return 1
    fi
    
    # Create a better expect script with longer timeouts and more specific error handling
    echo "Creating wallet for $node with password 'password'..."
    cat > /tmp/create_wallet.exp << EOF
#!/usr/bin/expect -f
set timeout 120
spawn docker exec -it $node lncli --network=regtest create
expect {
    "Input wallet password: " {
        send "password\r"
        exp_continue
    }
    "Confirm password: " {
        send "password\r"
        exp_continue
    }
    "Do you have an existing cipher seed mnemonic" {
        send "n\r"
        exp_continue
    }
    "Your cipher seed can be used to recover" {
        send "\r"
        exp_continue
    }
    "Input your passphrase" {
        send "\r"
        exp_continue
    }
    "lnd successfully initialized" {
        puts "Wallet created successfully!"
    }
    timeout {
        puts "Timeout occurred during wallet creation"
        exit 1
    }
    eof {
        puts "EOF received. Wallet may or may not be initialized."
    }
}
EOF
    
    chmod +x /tmp/create_wallet.exp
    
    # Run the expect script with a longer timeout
    timeout 120 /tmp/create_wallet.exp
    EXPECT_RESULT=$?
    rm /tmp/create_wallet.exp
    
    if [ $EXPECT_RESULT -ne 0 ]; then
        echo -e "${RED}✗ Error running wallet creation script${NC}"
        return 1
    fi
    
    # Wait for wallet initialization
    echo "Waiting for wallet to be fully initialized..."
    sleep 10
    
    # Verify the node is ready by trying multiple times
    echo "Verifying $node is operational..."
    local attempts=0
    local max_attempts=5
    
    while [ $attempts -lt $max_attempts ]; do
        if docker exec $node lncli --network=regtest getinfo > /dev/null 2>&1; then
            echo -e "${GREEN}✓ $node initialized successfully${NC}"
            return 0
        fi
        
        attempts=$((attempts + 1))
        echo "Attempt $attempts/$max_attempts - Waiting for $node to be ready..."
        sleep 5
    done
    
    echo -e "${RED}✗ Failed to initialize $node after multiple attempts${NC}"
    docker-compose logs $node
    return 1
}

# Initialize all LND nodes one by one
NODES=("lnd-alice" "lnd-bob" "lnd-carol" "lnd-dave" "lnd-eve")
for node in "${NODES[@]}"; do
    initialize_lnd_node $node
    NODE_RESULT=$?
    
    if [ $NODE_RESULT -ne 0 ]; then
        echo "There was an issue initializing $node. Check the logs above."
        
        # As a fallback, try unlocking if creation failed
        echo "Attempting to unlock the wallet as a fallback..."
        cat > /tmp/unlock_wallet.exp << EOF
#!/usr/bin/expect -f
set timeout 60
spawn docker exec -it $node lncli --network=regtest unlock
expect "Input wallet password: "
send "password\r"
expect eof
EOF
        chmod +x /tmp/unlock_wallet.exp
        timeout 30 /tmp/unlock_wallet.exp
        rm /tmp/unlock_wallet.exp
        
        if ! docker exec $node lncli --network=regtest getinfo > /dev/null 2>&1; then
            echo "Failed to initialize or unlock $node. Exiting."
            cd "$ORIGINAL_DIR"
            exit 1
        fi
    fi
    
    sleep 5
done

# Step 4: Fund the nodes
echo -e "${BLUE}Step 4: Funding the LND nodes${NC}"

# Generate more blocks to ensure wallet is fully synced
echo "Generating more blocks..."
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 10 "$ADDRESS"

# Fund each node
for node in "${NODES[@]}"; do
    echo "Creating new address for $node..."
    NODE_ADDRESS=$(docker exec $node lncli --network=regtest newaddress p2wkh | jq -r .address)
    
    echo "Sending 10 BTC to $node at $NODE_ADDRESS..."
    docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin sendtoaddress "$NODE_ADDRESS" 10
done

# Generate blocks to confirm transactions
echo "Confirming transactions..."
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 6 "$ADDRESS"

# Wait for funds to be recognized
echo "Waiting for funds to be processed..."
sleep 20

# Step 5: Create channels between nodes
echo -e "${BLUE}Step 5: Creating channels between nodes${NC}"

# Function to create a channel
create_channel() {
    local from=$1
    local to=$2
    local amount=$3
    echo "Creating channel from $from to $to with amount $amount..."
    
    # Get the public key of the destination node
    TO_PUBKEY=$(docker exec $to lncli --network=regtest getinfo | jq -r .identity_pubkey)
    
    # Get the address of the destination node
    echo "Connecting $from to $to..."
    docker exec $from lncli --network=regtest connect $TO_PUBKEY@$to:9735 || echo "Nodes already connected"
    
    # Open channel
    echo "Opening channel..."
    docker exec $from lncli --network=regtest openchannel --node_key=$TO_PUBKEY --local_amt=$amount --push_amt=0
    
    # Generate a block to start confirming the channel
    docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 3 "$ADDRESS"
    
    # Wait for channel to be recognized
    sleep 10
}

# Create a network of channels
create_channel "lnd-alice" "lnd-bob" 1000000
create_channel "lnd-bob" "lnd-carol" 1000000
create_channel "lnd-carol" "lnd-dave" 1000000
create_channel "lnd-dave" "lnd-eve" 1000000
create_channel "lnd-eve" "lnd-alice" 1000000
create_channel "lnd-alice" "lnd-carol" 1000000
create_channel "lnd-bob" "lnd-eve" 1000000

# Generate blocks to confirm channels
echo "Confirming channels..."
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 6 "$ADDRESS"

# Wait for channels to be fully established
echo "Waiting for channels to be established..."
sleep 30

# Step 6: Verify all nodes and channels
echo -e "${BLUE}Step 6: Verifying network status${NC}"

# Check each node
for node in "${NODES[@]}"; do
    echo "Status for $node:"
    docker exec $node lncli --network=regtest getinfo | jq '.alias, .num_active_channels, .num_peers'
    docker exec $node lncli --network=regtest listchannels | jq '.channels | length'
done

# Return to the original directory
cd "$ORIGINAL_DIR"

echo ""
echo -e "${GREEN}🎉 Lightning Network setup complete! 🎉${NC}"
echo "All wallets initialized and channels established!"
echo "Network is ready for testing and development."
echo "================================"
