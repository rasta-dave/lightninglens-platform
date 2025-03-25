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

# Step 1: Start bitcoind and LND nodes
echo -e "${BLUE}Step 1: Starting Bitcoin node and LND nodes${NC}"
echo "⏱️  This may take a few minutes..."

# Navigate to the Lightning-Simulation directory
echo "Navigating to Lightning-Simulation directory..."
if [ -d "Lightning-Simulation/lightning-simulation" ]; then
    cd Lightning-Simulation/lightning-simulation

    # Clean up any existing containers first
    echo "Stopping and removing existing containers..."
    docker-compose down -v

    # Start the bitcoind and LND nodes
    echo "Starting bitcoind and LND nodes with docker-compose..."
    docker-compose up -d

    # Check if containers are running
    echo "Checking if containers started successfully..."
    CONTAINERS=$(docker ps | grep -E 'bitcoind|lnd' | wc -l)
    
    if [ $CONTAINERS -gt 0 ]; then
        echo -e "${GREEN}✓ Bitcoin and LND nodes started successfully${NC}"
        echo "Waiting 30 seconds for nodes to initialize..."
        sleep 30  # Give them time to initialize
    else
        echo -e "${RED}✗ Failed to start Bitcoin and LND nodes${NC}"
        echo "Check docker logs for more information."
        echo "Returning to the original directory..."
        cd "$ORIGINAL_DIR"
        exit 1
    fi

    # Return to the original directory
    echo "Returning to the original directory..."
    cd "$ORIGINAL_DIR"
else
    echo -e "${RED}✗ Lightning-Simulation directory not found${NC}"
    echo "Make sure you're running this script from the project root directory."
    exit 1
fi

# Clean up any stale containers
docker-compose down -v

# Remove potentially corrupted container configuration
docker system prune -f

# Restart from scratch
docker-compose up -d

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Script must be run with sudo. Elevating privileges..."
    exec sudo "$0" "$@"
    exit $?
fi

set -e

# Print welcome message with time estimate
echo "================================"
echo "    Lightning Network Setup 🚀"
echo "================================"
echo ""
echo "Default wallet password for all nodes: 'password'"
echo ""
echo "⏱️  Estimated setup time: 3-5 minutes"
echo "This process will:"
echo " • Continue from previous setup"
echo " • Unlock LND wallets"
echo " • Establish payment channels"
echo ""
echo "Please be patient as the setup progresses..."
echo ""

# Initialize total progress variables
TOTAL_STEPS=10
CURRENT_STEP=2  # Start from step 2 since we already have Bitcoin initialized

# Function to update total progress
update_total_progress() {
    local message=$1
    CURRENT_STEP=$((CURRENT_STEP + 1))
    local progress=$((CURRENT_STEP * 100 / TOTAL_STEPS))
    local filled_size=$((progress * 40 / 100))
    local empty_size=$((40 - filled_size))
    
    # Create the progress bar
    bar="["
    for ((i=0; i<filled_size; i++)); do
        bar+="="
    done
    
    if [ $filled_size -lt 40 ]; then
        bar+=">"
        for ((i=0; i<empty_size-1; i++)); do
            bar+=" "
        done
    fi
    
    bar+="] $progress%"
    
    echo -e "\n📊 Overall Progress: $message $bar\n"
}

# Install expect if not already installed
if ! command -v expect &> /dev/null; then
    echo "Installing expect..."
    DEBIAN_FRONTEND=noninteractive apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y expect
fi

# Function to show progress bar
show_progress() {
    local duration=$1
    local message=$2
    local elapsed=0
    local progress=0
    local bar_size=40
    
    while [ $elapsed -lt $duration ]; do
        # Calculate progress percentage
        progress=$((elapsed * 100 / duration))
        filled_size=$((progress * bar_size / 100))
        empty_size=$((bar_size - filled_size))
        
        # Create the progress bar
        bar="["
        for ((i=0; i<filled_size; i++)); do
            bar+="="
        done
        
        if [ $filled_size -lt $bar_size ]; then
            bar+=">"
            for ((i=0; i<empty_size-1; i++)); do
                bar+=" "
            done
        fi
        
        bar+="] $progress%"
        
        # Print the progress bar
        echo -ne "\r$message $bar"
        
        sleep 1
        elapsed=$((elapsed + 1))
    done
    
    # Complete the progress bar
    echo -ne "\r$message [========================================] 100%\n"
}

# Function to restart a node
restart_node() {
    local node=$1
    echo "Restarting $node..."
    docker restart $node
    sleep 10
}

# Function to unlock wallet
unlock_wallet() {
    local node=$1
    echo "Unlocking wallet for $node 🔓"
    
    # Check if node is running
    if ! docker ps | grep -q $node; then
        echo "$node is not running! Attempting to start..."
        docker start $node
        sleep 10
    fi
    
    # Check if we can connect to the node
    if ! docker exec $node lncli --network=regtest getinfo &>/dev/null; then
        echo "Unlocking wallet..."
        
        # Create an expect script to handle the unlock
        cat > /tmp/unlock_wallet.exp << EOF
#!/usr/bin/expect -f
set timeout 60
spawn docker exec -it $node lncli --network=regtest unlock
expect "Input wallet password: "
send "password\r"
expect eof
EOF
        
        # Make the script executable
        chmod +x /tmp/unlock_wallet.exp
        
        # Run the expect script
        /tmp/unlock_wallet.exp
        
        # Clean up
        rm /tmp/unlock_wallet.exp
        
        echo "[========================================] 100%"
        echo "Wallet unlocked for $node ✅"
        echo "--------------------------------"
        
        # Wait for wallet to fully initialize
        show_progress 5 "Initializing wallet..."
    else
        echo "Wallet already unlocked for $node ✅"
    fi
}

# Function to verify a node is ready
verify_node_ready() {
    local node=$1
    echo "Verifying $node is ready..."
    
    local attempt=1
    local max_attempts=30
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec $node lncli --network=regtest getinfo &>/dev/null; then
            echo "$node is ready! ✅"
            return 0
        fi
        
        echo -ne "\rWaiting for $node to be ready... (Attempt $attempt/$max_attempts) "
        sleep 5
        attempt=$((attempt + 1))
    done
    
    echo "$node failed to initialize properly ❌"
    echo "Checking logs for $node:"
    docker logs $node | tail -n 30
    return 1
}

# Create a channel between two nodes
create_channel() {
    local from=$1
    local to=$2
    local amount=$3
    echo "Opening channel from $from to $to with amount $amount 🔗"
    
    # Get pubkeys
    local to_pubkey=$(docker exec $to lncli --network=regtest getinfo | jq -r .identity_pubkey)
    
    echo "Connecting $from to $to..."
    # Connect nodes
    docker exec $from lncli --network=regtest connect $to_pubkey@$to:9735 || echo "Nodes may already be connected"
    
    echo "Opening channel..."
    # Open channel
    docker exec $from lncli --network=regtest openchannel $to_pubkey $amount || echo "Channel may already exist"
    
    # Generate a block to start confirming
    docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 1 "$ADDRESS"
    
    echo "Channel opening initiated! ✅"
}

echo "Checking if bitcoind is running... 🔍"
docker logs bitcoind | tail -n 20

update_total_progress "Continuing setup"

# Verify bitcoind is running
echo "Verifying bitcoind is running... ⏳"
if docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin getblockchaininfo > /dev/null 2>&1; then
    echo "Successfully connected to bitcoind! ✅"
else
    echo "Error: bitcoind is not running or not responding ❌"
    exit 1
fi

# Check if wallet is already loaded
echo "Checking Bitcoin wallet status... 💰"
if ! docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin getwalletinfo > /dev/null 2>&1; then
    echo "Wallet not loaded. Attempting to load 'regtest_wallet'..."
    docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin loadwallet "regtest_wallet" || docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin createwallet "regtest_wallet"
else
    echo "Wallet is already loaded and ready ✅"
fi

# Get a Bitcoin address for generating blocks
ADDRESS=$(docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin getnewaddress)
echo "Using Bitcoin address: $ADDRESS"

# Generate more coins to ensure we have enough funds
echo "Generating additional coins for funding..."
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 100 $ADDRESS

update_total_progress "Setting up LND nodes"

# Setup all nodes
NODES=("lnd-alice" "lnd-bob" "lnd-carol" "lnd-dave" "lnd-eve")
echo "Setting up LND nodes... ⚡"
for node in "${NODES[@]}"; do
    unlock_wallet "$node"
    verify_node_ready "$node"
    update_total_progress "Setting up $node"
done

# Fund nodes
echo "Funding nodes... 💸"
for node in "${NODES[@]}"; do
    echo "Funding $node..."
    ADDRESS=$(docker exec $node lncli --network=regtest newaddress p2wkh | jq -r .address)
    docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin sendtoaddress "$ADDRESS" 5
done

update_total_progress "Funding nodes"

# Generate blocks to confirm funding
echo "Confirming funding transactions... 🔄"
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 6 "$ADDRESS"

# Wait for nodes to process blocks
echo "Waiting for nodes to process blocks..."
show_progress 10 "Processing blocks"

update_total_progress "Creating channels"

# Create channels
echo "Creating channels... 🌉"
create_channel "lnd-alice" "lnd-bob" 1000000
create_channel "lnd-bob" "lnd-carol" 1000000
create_channel "lnd-carol" "lnd-dave" 1000000
create_channel "lnd-dave" "lnd-eve" 1000000
create_channel "lnd-eve" "lnd-alice" 1000000
create_channel "lnd-alice" "lnd-carol" 1000000
create_channel "lnd-bob" "lnd-eve" 1000000

update_total_progress "Confirming channels"

# Generate blocks to confirm channels
echo "Confirming channel transactions... 🔄"
docker exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoin -rpcpassword=bitcoin generatetoaddress 6 "$ADDRESS"

# Wait for nodes to process blocks
echo "Waiting for nodes to process blocks..."
show_progress 10 "Finalizing setup"

update_total_progress "Verifying network"

# Verify final status
echo "Verifying final status... 🔍"
for node in "${NODES[@]}"; do
    echo "Status for $node:"
    docker exec $node lncli --network=regtest getinfo | jq '.num_active_channels, .num_peers'
    docker exec $node lncli --network=regtest listchannels | jq '.channels | length'
done

update_total_progress "Setup complete!"

echo ""
echo "🎉 Lightning Network setup complete! 🎉"
echo "All wallets initialized and channels established!"
echo "Network is ready for testing and development."
echo "================================"
