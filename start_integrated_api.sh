#!/bin/bash

# Terminal colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BLUE='\033[0;34m'
CYAN='\033[0;36m'

echo -e "${BLUE}=== Lightning Lens Integrated API Startup ===${NC}"

# Define key paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="${PROJECT_ROOT}/Lightning-Lens/lightning_lens/scripts"
LOGS_DIR="${PROJECT_ROOT}/logs"
INTEGRATED_API_DIR="${SCRIPTS_DIR}/integrated-api"

# Check if logs directory exists
if [ ! -d "$LOGS_DIR" ]; then
  echo -e "${YELLOW}Creating logs directory...${NC}"
  mkdir -p "$LOGS_DIR"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is required but not installed. Please install Node.js and try again.${NC}"
  exit 1
fi

# Kill any existing process on the ports
kill_process_on_port() {
  local port="$1"
  local pid=$(lsof -t -i:$port)
  if [ ! -z "$pid" ]; then
    echo -e "Stopping existing service on port $port (PID: $pid)"
    kill -9 $pid 2>/dev/null
  fi
}

# Kill existing processes
kill_process_on_port 3003 # CORS Proxy / API Gateway
kill_process_on_port 8767 # Suggestions Service

# Function to start a service
start_service() {
  local name="$1"
  local script="$2"
  local port="$3"
  local log_file="$4"
  
  echo -e "${YELLOW}Starting $name on port $port...${NC}"
  node "$script" > "$log_file" 2>&1 &
  local pid=$!
  echo -e "  → Started with PID: $pid"
  
  # Check if service is running
  echo -ne "Checking if $name is running on port $port... "
  for i in {1..10}; do
    if lsof -i:$port -sTCP:LISTEN -t &>/dev/null; then
      echo -e "${GREEN}✓ Running${NC}"
      return 0
    fi
    echo -n "."
    sleep 1
  done
  
  echo -e "${RED}✗ Failed to start${NC}"
  echo -e "  ${RED}✗ Check the log file for details: $log_file${NC}"
  return 1
}

# Start the API Gateway
start_service "API Gateway" "${INTEGRATED_API_DIR}/api-gateway.js" "3003" "${LOGS_DIR}/api_gateway.log"
api_gateway_status=$?

# Start the Suggestions Service
start_service "Suggestions Service" "${INTEGRATED_API_DIR}/suggestions-service.js" "8767" "${LOGS_DIR}/suggestions_service.log"
suggestions_service_status=$?

echo -e "${BLUE}=== Integrated API Services Status ===${NC}"
if [ $api_gateway_status -eq 0 ]; then
  echo -e "API Gateway:        ${GREEN}Running${NC} (Port: 3003)"
else
  echo -e "API Gateway:        ${RED}Failed to start${NC}"
fi

if [ $suggestions_service_status -eq 0 ]; then
  echo -e "Suggestions Service: ${GREEN}Running${NC} (Port: 8767)"
else
  echo -e "Suggestions Service: ${RED}Failed to start${NC}"
fi

echo -e "${BLUE}=== Useful Commands ===${NC}"
echo -e "View API Gateway logs:        ${CYAN}tail -f ${LOGS_DIR}/api_gateway.log${NC}"
echo -e "View Suggestions Service logs: ${CYAN}tail -f ${LOGS_DIR}/suggestions_service.log${NC}"
echo -e "Check services status:         ${CYAN}curl http://localhost:3003/api/status${NC}"

# Make script exit with error if any service failed to start
if [ $api_gateway_status -ne 0 ] || [ $suggestions_service_status -ne 0 ]; then
  echo -e "${RED}One or more services failed to start. Check the logs for details.${NC}"
  exit 1
fi

echo -e "${GREEN}Integrated API services are now running!${NC}" 