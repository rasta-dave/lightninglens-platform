#!/bin/bash
# Test script for real data integration with Lightning Lens platform

set -e  # Exit on error

echo "Starting real data integration test"
echo "===================================="

# Create log directory if it doesn't exist
mkdir -p logs

# Define colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if the simulation data exists
echo -e "${YELLOW}Checking for simulation data...${NC}"
SIMULATION_DIR="./data/simulation"
if [ ! -d "$SIMULATION_DIR" ]; then
    echo -e "${RED}Error: Simulation directory not found at $SIMULATION_DIR${NC}"
    exit 1
fi

# Find the most recent simulation file
SIMULATION_FILE=$(find $SIMULATION_DIR -name "lightning_simulation_*.csv" -type f -printf "%T@ %p\n" | sort -nr | head -1 | cut -d' ' -f2-)

if [ -z "$SIMULATION_FILE" ]; then
    echo -e "${RED}Error: No simulation data files found in $SIMULATION_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}Found simulation data: $SIMULATION_FILE${NC}"
echo "File size: $(du -h "$SIMULATION_FILE" | cut -f1)"
echo "Transaction count: $(wc -l "$SIMULATION_FILE" | cut -d' ' -f1) lines"

# Process the simulation data through the data adapter
echo -e "\n${YELLOW}Processing simulation data with data adapter...${NC}"
cd Lightning-Lens
python lightning_lens/scripts/data_adapter.py "$SIMULATION_FILE" | tee ../logs/data_adapter_test.log

# Test WebSocket client connectivity
echo -e "\n${YELLOW}Testing WebSocket client connection...${NC}"
python lightning_lens/scripts/websocket_client.py --uri "ws://localhost:8768" --verbose > ../logs/websocket_client_test.log 2>&1 &
WEBSOCKET_PID=$!

# Let it run for a few seconds to see if it connects
sleep 5

# Check if the WebSocket client is still running
if ps -p $WEBSOCKET_PID > /dev/null; then
    echo -e "${GREEN}WebSocket client is running successfully${NC}"
    # Kill the process after testing
    kill $WEBSOCKET_PID
else
    echo -e "${RED}WebSocket client failed to run${NC}"
    echo "Check logs in logs/websocket_client_test.log for details"
fi

# Test suggestions service
echo -e "\n${YELLOW}Testing suggestions service...${NC}"
python lightning_lens/scripts/suggestions_service.py > ../logs/suggestions_service_test.log 2>&1 &
SUGGESTIONS_PID=$!

# Let it run for a few seconds to see if it starts properly
sleep 5

# Check if the suggestions service is still running
if ps -p $SUGGESTIONS_PID > /dev/null; then
    echo -e "${GREEN}Suggestions service is running successfully${NC}"
    # Kill the process after testing
    kill $SUGGESTIONS_PID
else
    echo -e "${RED}Suggestions service failed to run${NC}"
    echo "Check logs in logs/suggestions_service_test.log for details"
fi

cd ..

# Verify that the data is accessible via HTTP API
echo -e "\n${YELLOW}Verifying data via HTTP API...${NC}"
curl -s "http://localhost:5000/api/dashboard" | tee logs/api_dashboard.json | grep -q "transactions" && 
    echo -e "${GREEN}API is providing transaction data${NC}" || 
    echo -e "${RED}API is not providing transaction data${NC}"

# Check the frontend connection
echo -e "\n${YELLOW}Checking frontend connection...${NC}"
echo "Accessing frontend at http://localhost:3000"
curl -I "http://localhost:3000" > logs/frontend_connection.log 2>&1

if grep -q "200 OK" logs/frontend_connection.log; then
    echo -e "${GREEN}Frontend is accessible${NC}"
else
    echo -e "${RED}Frontend is not accessible${NC}"
    echo "Check logs in logs/frontend_connection.log for details"
fi

echo -e "\n${GREEN}Integration test completed${NC}"
echo "Check the log files in the logs directory for more details"
echo "To view real data in the frontend, ensure all services are running with ./start.sh" 