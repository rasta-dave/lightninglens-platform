#!/bin/bash
# stop.sh - Stop all Lightning-Lens services

# Define colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Stopping Lightning Lens System ===${NC}"

# Function to stop a service running on a specific port
stop_service() {
    local name=$1
    local port=$2
    
    echo -n "Stopping $name on port $port... "
    local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
    
    if [ -n "$pid" ]; then
        kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev/null
        echo -e "${GREEN}Stopped (PID: $pid)${NC}"
    else
        echo -e "${YELLOW}Not running${NC}"
    fi
}

# Stop services by port
stop_service "HTTP Server" 8000
stop_service "WebSocket Server" 8768
stop_service "Adapter Proxy" 8001
stop_service "Suggestions Service" 8767
stop_service "CORS Proxy" 3003
stop_service "Frontend" 3000
stop_service "Health Dashboard" 3030
stop_service "Simple Data Server" 3005
stop_service "Simple Dashboard Frontend" 3035

# Stop services by name pattern (for those that don't have a dedicated port)
echo -n "Stopping WebSocket Client... "
WS_CLIENT_PIDS=$(pgrep -f "websocket_client.py" || echo "")
if [ -n "$WS_CLIENT_PIDS" ]; then
    kill -15 $WS_CLIENT_PIDS 2>/dev/null || kill -9 $WS_CLIENT_PIDS 2>/dev/null
    echo -e "${GREEN}Stopped (PIDs: $WS_CLIENT_PIDS)${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

echo -n "Stopping Auto Learning... "
AUTO_LEARNING_PIDS=$(pgrep -f "auto_learning.py" || echo "")
if [ -n "$AUTO_LEARNING_PIDS" ]; then
    kill -15 $AUTO_LEARNING_PIDS 2>/dev/null || kill -9 $AUTO_LEARNING_PIDS 2>/dev/null
    echo -e "${GREEN}Stopped (PIDs: $AUTO_LEARNING_PIDS)${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

echo -n "Stopping Simulation Monitor... "
SIM_MONITOR_PIDS=$(pgrep -f "simulation_monitor.py" || echo "")
if [ -n "$SIM_MONITOR_PIDS" ]; then
    kill -15 $SIM_MONITOR_PIDS 2>/dev/null || kill -9 $SIM_MONITOR_PIDS 2>/dev/null
    echo -e "${GREEN}Stopped (PIDs: $SIM_MONITOR_PIDS)${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

echo -e "${GREEN}All Lightning Lens services have been stopped.${NC}"
