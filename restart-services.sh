#!/bin/bash

# restart-services.sh - Fixes WebSocket connection issues in Lightning Lens
#
# This script:
# 1. Kills any existing WebSocket services
# 2. Restarts the suggestions service using correct arguments
# 3. Starts the HTTP server to serve the test client
# 4. Provides diagnostic information

# Terminal colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="/media/shahazzad/new3/KOD/LIGHTNING-LENS"
LOGS_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOGS_DIR}/suggestions_ws.log"

# Create logs directory if it doesn't exist
mkdir -p "${LOGS_DIR}"

echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Lightning Lens WebSocket Connection Fixer${NC}"
echo -e "${BLUE}========================================${NC}"

# Function to check if port is in use
check_port() {
  nc -z localhost $1 > /dev/null 2>&1
  return $?
}

# Stop existing services
echo -e "\n${YELLOW}[1/4] Stopping existing services...${NC}"
pkill -f "python.*suggestions" || true
pkill -f "python.*http.server" || true
sleep 2

# Force kill if still running
for port in 8767 8001; do
  if check_port $port; then
    echo -e "${YELLOW}Force killing processes on port $port...${NC}"
    fuser -k ${port}/tcp || true
  fi
done
sleep 1

# Verify ports are free
for port in 8767 8001; do
  if check_port $port; then
    echo -e "${RED}Cannot free port $port! Manual intervention required.${NC}"
    echo -e "Run: sudo lsof -i :$port"
    echo -e "Then: sudo kill -9 <PID>"
    exit 1
  else
    echo -e "${GREEN}Port $port is available.${NC}"
  fi
done

# Start suggestions service
echo -e "\n${YELLOW}[2/4] Starting suggestions WebSocket service...${NC}"
cd "${PROJECT_ROOT}/Lightning-Lens/lightning_lens/scripts" && \
python simple_suggestions_ws.py --port 8767 --log-level DEBUG > "${LOG_FILE}" 2>&1 &

SUGGESTIONS_PID=$!
sleep 2

if ps -p ${SUGGESTIONS_PID} > /dev/null; then
  echo -e "${GREEN}Suggestions service started with PID: ${SUGGESTIONS_PID}${NC}"
else
  echo -e "${RED}Failed to start suggestions service! Check logs: ${LOG_FILE}${NC}"
  exit 1
fi

# Start HTTP server for test client
echo -e "\n${YELLOW}[3/4] Starting HTTP server for test client...${NC}"
cd "${PROJECT_ROOT}" && \
python -m http.server 8001 --bind 127.0.0.1 > /dev/null 2>&1 &

HTTP_PID=$!
sleep 1

if ps -p ${HTTP_PID} > /dev/null; then
  echo -e "${GREEN}HTTP server started with PID: ${HTTP_PID}${NC}"
else
  echo -e "${RED}Failed to start HTTP server!${NC}"
  exit 1
fi

# Display diagnostic information
echo -e "\n${YELLOW}[4/4] Diagnostic Information:${NC}"
echo -e "${GREEN}Services started successfully:${NC}"
echo -e "  • WebSocket service: ws://localhost:8767"
echo -e "  • HTTP server: http://localhost:8001"
echo -e "\n${GREEN}Test WebSocket connection:${NC}"
echo -e "  • Open test client: http://localhost:8001/simple_ws_test.html"
echo -e "  • Make sure 'Prevent auto-disconnection' is checked"
echo -e "  • Click Connect and observe the logs"
echo -e "\n${GREEN}Monitor WebSocket logs:${NC}"
echo -e "  • tail -f ${LOG_FILE}"

# Show recent log entries
echo -e "\n${YELLOW}Recent log entries:${NC}"
tail -n 10 "${LOG_FILE}" || echo "No log entries yet"

echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}WebSocket connection issues should now be fixed!${NC}"
echo -e "${YELLOW}If problems persist, check WORKLOG_4.md for detailed debugging instructions.${NC}"
echo -e "${BLUE}========================================${NC}"

exit 0 