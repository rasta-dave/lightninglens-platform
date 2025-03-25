#!/bin/bash
# start-simple-dashboard.sh - Start the simplified Lightning Lens Dashboard

# Define colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get current directory
CURRENT_DIR=$(pwd)

# Define directories
SCRIPTS_DIR="$CURRENT_DIR/Lightning-Lens/lightning_lens/scripts"
FRONTEND_DIR="$CURRENT_DIR/Lightning-Lens/lightning_lens/frontend"

# Define ports (non-conflicting with existing system)
DATA_SERVER_PORT=3005  # Doesn't conflict with existing services
FRONTEND_PORT=3035     # Changed from default 3000 to avoid conflict with main frontend

# Create logs directory if it doesn't exist
LOGS_DIR="$CURRENT_DIR/logs"
mkdir -p "$LOGS_DIR"

# Make sure the script is executable
chmod +x "$0"

echo -e "${BLUE}=== Lightning Lens Simple Dashboard Startup ===${NC}"

# Function to check if a port is in use
is_port_in_use() {
  lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null
  return $?
}

# Function to kill a process on a specific port
kill_port() {
  local port=$1
  local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}Port $port is in use (PID: $pid). Stopping process...${NC}"
    kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev/null
    sleep 1
  fi
}

# Check if ports are in use and kill processes if needed
if is_port_in_use $DATA_SERVER_PORT; then
  echo -e "${YELLOW}Warning: Port $DATA_SERVER_PORT (data server) is already in use.${NC}"
  read -p "Attempt to free the port? (y/n): " -n 1 -r REPLY
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kill_port $DATA_SERVER_PORT
  else
    echo -e "${RED}Cannot start data server on port $DATA_SERVER_PORT. Please free the port manually.${NC}"
    exit 1
  fi
fi

if is_port_in_use $FRONTEND_PORT; then
  echo -e "${YELLOW}Warning: Port $FRONTEND_PORT (frontend) is already in use.${NC}"
  read -p "Attempt to free the port? (y/n): " -n 1 -r REPLY
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kill_port $FRONTEND_PORT
  else
    echo -e "${RED}Cannot start frontend on port $FRONTEND_PORT. Please free the port manually.${NC}"
    exit 1
  fi
fi

# Install backend dependencies if needed
if [ ! -d "$SCRIPTS_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing backend server dependencies...${NC}"
  cd "$SCRIPTS_DIR" || exit
  npm install chokidar cors csv-parser express ws
  cd "$CURRENT_DIR" || exit
  echo -e "${GREEN}Backend dependencies installed.${NC}"
fi

# Install frontend dependencies if needed
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing frontend dependencies...${NC}"
  cd "$FRONTEND_DIR" || exit
  npm install
  cd "$CURRENT_DIR" || exit
  echo -e "${GREEN}Frontend dependencies installed.${NC}"
fi

# Initialize log files
echo "$(date): Starting simple data server" > "$LOGS_DIR/simple_data_server.log"
echo "$(date): Starting simple frontend" > "$LOGS_DIR/simple_frontend.log"

# Start backend data server
echo -e "${YELLOW}Starting data server on port ${DATA_SERVER_PORT}...${NC}"
cd "$SCRIPTS_DIR" || exit
NODE_PID=""
NODE_ENV=development PORT=$DATA_SERVER_PORT node simple_data_server.js > "$LOGS_DIR/simple_data_server.log" 2>&1 &
NODE_PID=$!
cd "$CURRENT_DIR" || exit

if [ -n "$NODE_PID" ]; then
  echo -e "${GREEN}Data server started with PID: $NODE_PID${NC}"
  
  # Verify data server started
  sleep 3
  if is_port_in_use $DATA_SERVER_PORT; then
    echo -e "${GREEN}✓ Data server is running on port $DATA_SERVER_PORT${NC}"
    # Verify WebSocket server
    echo -e "${YELLOW}Checking WebSocket server...${NC}"
    if nc -z localhost $DATA_SERVER_PORT 2>/dev/null; then
      echo -e "${GREEN}✓ WebSocket server is accessible${NC}"
    else
      echo -e "${YELLOW}⚠️ WebSocket server may not be fully initialized yet${NC}"
    fi
  else
    echo -e "${RED}✗ Data server failed to start on port $DATA_SERVER_PORT${NC}"
    echo "Check logs with: cat $LOGS_DIR/simple_data_server.log"
    exit 1
  fi
else
  echo -e "${RED}Failed to start data server${NC}"
  exit 1
fi

# Start frontend
echo -e "${YELLOW}Starting frontend on port ${FRONTEND_PORT}...${NC}"
cd "$FRONTEND_DIR" || exit
REACT_PID=""
PORT=$FRONTEND_PORT npm start > "$LOGS_DIR/simple_frontend.log" 2>&1 &
REACT_PID=$!
cd "$CURRENT_DIR" || exit

if [ -n "$REACT_PID" ]; then
  echo -e "${GREEN}Frontend started with PID: $REACT_PID${NC}"
  
  # Verify frontend started (this may take some time)
  echo -n "Waiting for frontend to start"
  for i in {1..15}; do
    if is_port_in_use $FRONTEND_PORT; then
      echo -e "\n${GREEN}✓ Frontend is running on port $FRONTEND_PORT${NC}"
      break
    else
      echo -n "."
      sleep 2
      if [ $i -eq 15 ]; then
        echo -e "\n${YELLOW}⚠️ Frontend may still be starting...${NC}"
        echo "Check logs with: cat $LOGS_DIR/simple_frontend.log"
      fi
    fi
  done
else
  echo -e "${RED}Failed to start frontend${NC}"
  kill $NODE_PID
  exit 1
fi

echo -e "\n${GREEN}=== Lightning Lens Dashboard is now running ===${NC}"
echo -e "Data Server: ${BLUE}http://localhost:${DATA_SERVER_PORT}${NC}"
echo -e "Frontend: ${BLUE}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "\nPress Ctrl+C to stop both servers.\n"

# Wait for user to press Ctrl+C
trap "echo -e '\n${YELLOW}Shutting down servers...${NC}'; kill $NODE_PID $REACT_PID; echo -e '${GREEN}Servers stopped.${NC}'; exit 0" INT
wait 