#!/bin/bash
# start_simulation.sh - Start the Lightning Network simulation

# Define colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check and run setup_base_path.sh if needed
if [ ! -f "./load_environment.sh" ]; then
    echo -e "${YELLOW}Environment configuration not found. Running setup_base_path.sh...${NC}"
    if [ -f "./setup_base_path.sh" ]; then
        ./setup_base_path.sh
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to set up base path. Please run setup_base_path.sh manually.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}setup_base_path.sh not found. Please ensure you're in the correct directory.${NC}"
        exit 1
    fi
fi

# Load environment variables
echo -e "${BLUE}Loading environment variables...${NC}"
source ./load_environment.sh

# Define the Python interpreter to use
PYTHON_BIN=$(which python3)
BASE_DIR=${LIGHTNING_LENS_PATH:-$(pwd)}
SIMULATION_SCRIPT="$BASE_DIR/Lightning-Simulation/lightning-simulation/scripts/simulate_network.py"
LOGS_DIR="$BASE_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

echo -e "${BLUE}=== Lightning Network Simulation Startup ===${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

# Function to check if a Docker container is running
container_is_running() {
    if docker ps | grep -q "$1"; then
        return 0  # Container is running
    else
        return 1  # Container is not running
    fi
}

# Check for Bitcoin and LND node containers
echo "Checking if Bitcoin and LND nodes are running..."
NODES_RUNNING=true

if ! container_is_running "bitcoind"; then
    echo -e "${RED}✗ Bitcoin node (bitcoind) is not running${NC}"
    NODES_RUNNING=false
fi

# Check for LND nodes
for node in "lnd-alice" "lnd-bob" "lnd-carol" "lnd-dave" "lnd-eve"; do
    if ! container_is_running "$node"; then
        echo -e "${RED}✗ Lightning node $node is not running${NC}"
        NODES_RUNNING=false
    fi
done

if [ "$NODES_RUNNING" = false ]; then
    echo -e "${YELLOW}⚠️ Some required nodes are not running.${NC}"
    echo -e "Would you like to start the nodes with ${GREEN}setup-nodes-continue.sh${NC}? (y/n)"
    
    read -p "Start nodes now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Starting nodes with setup-nodes-continue.sh...${NC}"
        ./setup-nodes-continue.sh
        
        # Check if setup was successful
        if ! container_is_running "bitcoind"; then
            echo -e "${RED}✗ Failed to start Bitcoin node. Exiting.${NC}"
            exit 1
        fi
    else
        echo "Exiting. Please start the nodes manually with:"
        echo "./setup-nodes-continue.sh"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Bitcoin and LND nodes are running${NC}"
fi

# Check if the simulation script exists
if [ ! -f "$SIMULATION_SCRIPT" ]; then
    echo -e "${RED}✗ Simulation script not found:${NC} $SIMULATION_SCRIPT"
    echo "Make sure you are running this script from the project root directory."
    echo "Current directory: $(pwd)"
    exit 1
fi

# Initialize log file
LOGFILE="$LOGS_DIR/simulation.log"
echo "$(date): Starting Lightning Network simulation" > "$LOGFILE"

# Check if services are running
echo "Checking if required services are running..."

# Function to check if a port is in use
is_port_in_use() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0  # Port is in use (success)
    else
        return 1  # Port is not in use (failure)
    fi
}

# Check essential services
SERVICES_READY=true

if ! is_port_in_use 8000; then
    echo -e "${YELLOW}⚠️ HTTP Server (port 8000) is not running.${NC}"
    SERVICES_READY=false
fi

if ! is_port_in_use 8768; then
    echo -e "${YELLOW}⚠️ WebSocket Server (port 8768) is not running.${NC}"
    SERVICES_READY=false
fi

if ! is_port_in_use 8767; then
    echo -e "${YELLOW}⚠️ Suggestions Service (port 8767) is not running.${NC}"
    SERVICES_READY=false
fi

if [ "$SERVICES_READY" = false ]; then
    echo -e "${YELLOW}⚠️ Some Lightning Lens services are not running.${NC}"
    echo -e "To ensure full functionality, run ${GREEN}./start.sh${NC} first in another terminal."
    
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting."
        exit 1
    fi
    echo -e "${YELLOW}Continuing with simulation despite missing services...${NC}"
else
    echo -e "${GREEN}✓ All required services are running${NC}"
fi

# Start the simulation
echo -e "${BLUE}=== Starting Lightning Network Simulation ===${NC}"
echo "The simulation will run in this terminal window."
echo "Press Ctrl+C to stop the simulation."
echo -e "Log file: ${GREEN}$LOGFILE${NC}"
echo

# Run the simulation with output to both terminal and log file
echo -e "${GREEN}Simulation starting...${NC}"
echo "----------------------------------------"
$PYTHON_BIN "$SIMULATION_SCRIPT" 2>&1 | tee -a "$LOGFILE"

# This part will execute when the simulation is stopped
echo -e "${BLUE}=== Simulation Stopped ===${NC}"
echo "The simulation has been stopped."
echo -e "You can view the full log at: ${GREEN}$LOGFILE${NC}"
echo -e "To restart, run ${GREEN}./start_simulation.sh${NC} again."
echo -e "Lightning Lens services will continue running and collecting data." 