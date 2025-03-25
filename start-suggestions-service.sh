#!/bin/bash

# start-suggestions-service.sh - Script to start and monitor the Lightning Lens suggestions WebSocket service

# Terminal colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Define paths
PROJECT_ROOT="/media/shahazzad/new3/KOD/LIGHTNING-LENS"
LIGHTNING_LENS_DIR="${PROJECT_ROOT}/Lightning-Lens"
LOGS_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOGS_DIR}/suggestions_ws.log"

# Ensure log directory exists
mkdir -p "${LOGS_DIR}"

echo -e "${YELLOW}Starting Lightning Lens Suggestions WebSocket Service...${NC}"

# Function to check if the port is already in use
check_port() {
  nc -z localhost 8767 > /dev/null 2>&1
  return $?
}

# Function to check if the service is already running
check_running() {
  pgrep -f "python.*simple_suggestions_ws.py" > /dev/null
  return $?
}

# Stop any existing service
stop_existing() {
  echo -e "${YELLOW}Stopping any existing suggestions WebSocket services...${NC}"
  pkill -f "python.*suggestions_service.py" || true
  pkill -f "python.*suggestions_ws.py" || true
  pkill -f "python.*simple_suggestions_ws.py" || true
  
  # Wait for processes to terminate
  sleep 2
  
  # Force kill if still running
  if check_running; then
    echo -e "${YELLOW}Forcefully terminating stubborn processes...${NC}"
    pkill -9 -f "python.*suggestions" || true
    sleep 1
  fi
  
  # Check if port is still in use
  if check_port; then
    echo -e "${RED}Port 8767 is still in use. Cannot start service.${NC}"
    echo -e "${YELLOW}Try manually killing the process using the port:${NC}"
    echo -e "  sudo lsof -i :8767"
    echo -e "  sudo kill <PID>"
    exit 1
  fi
}

# Start the service
start_service() {
  echo -e "${YELLOW}Starting suggestions WebSocket service on port 8767...${NC}"
  cd "${LIGHTNING_LENS_DIR}/lightning_lens/scripts" && \
  python simple_suggestions_ws.py --port 8767 --log-level DEBUG > "${LOG_FILE}" 2>&1 &
  
  # Get the PID of the service
  SERVICE_PID=$!
  echo -e "${GREEN}Service started with PID: ${SERVICE_PID}${NC}"
  
  # Wait for service to initialize
  sleep 2
  
  # Check if service is still running
  if ps -p ${SERVICE_PID} > /dev/null; then
    echo -e "${GREEN}Suggestions WebSocket service started successfully!${NC}"
    echo -e "Logs are being written to: ${LOG_FILE}"
    return 0
  else
    echo -e "${RED}Failed to start suggestions WebSocket service!${NC}"
    echo -e "Check the log file for errors: ${LOG_FILE}"
    return 1
  fi
}

# Test the service with a WebSocket client
test_service() {
  echo -e "${YELLOW}Testing WebSocket connection...${NC}"
  
  # Use Python to test the WebSocket connection
  python3 -c "
import asyncio
import websockets
import json
import sys

async def test():
    try:
        uri = 'ws://localhost:8767'
        print(f'Connecting to {uri}...')
        async with websockets.connect(uri, timeout=5) as websocket:
            print('Connected successfully!')
            
            # Send a heartbeat message
            await websocket.send(json.dumps({
                'type': 'heartbeat',
                'timestamp': '$(date -Iseconds)'
            }))
            
            # Receive the response
            response = await asyncio.wait_for(websocket.recv(), timeout=5)
            data = json.loads(response)
            print(f'Received response: {data.get(\"type\")}')
            
            # Success
            print('WebSocket connection test successful!')
            return True
    except Exception as e:
        print(f'Error testing WebSocket connection: {str(e)}')
        return False

if asyncio.run(test()):
    sys.exit(0)
else:
    sys.exit(1)
" > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}WebSocket connection test successful!${NC}"
    return 0
  else
    echo -e "${RED}WebSocket connection test failed!${NC}"
    return 1
  fi
}

# Main execution
stop_existing

if start_service; then
  echo -e "${GREEN}Service is ready to accept connections on ws://localhost:8767${NC}"
  
  # Test the connection
  if test_service; then
    echo -e "${GREEN}Service is working correctly and accepting connections.${NC}"
  else
    echo -e "${YELLOW}Service is running but WebSocket connection test failed.${NC}"
    echo -e "${YELLOW}Check the logs for more details:${NC} tail -f ${LOG_FILE}"
  fi
  
  # Print last few log lines
  echo -e "\n${YELLOW}Recent log entries:${NC}"
  tail -n 10 "${LOG_FILE}" || echo "No log entries yet"
  
  echo -e "\n${GREEN}To monitor logs in real-time, use: tail -f ${LOG_FILE}${NC}"
else
  echo -e "${RED}Failed to start service${NC}"
  exit 1
fi

exit 0 