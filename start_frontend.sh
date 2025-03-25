#!/bin/bash

# Color definitions for output formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner function
print_banner() {
  echo -e "${BLUE}=====================================================${NC}"
  echo -e "${BLUE}          Lightning Lens Frontend Starter           ${NC}"
  echo -e "${BLUE}=====================================================${NC}"
  echo -e "${BLUE}This script starts the React frontend for the Lightning Lens platform${NC}"
  echo ""
}

# Check if already running
check_if_running() {
  if lsof -i :3000 &>/dev/null; then
    echo -e "${YELLOW}⚠️  React frontend is already running on port 3000${NC}"
    echo -e "${YELLOW}If you want to restart it, please stop it first${NC}"
    echo -e "${YELLOW}You can use: ${NC}lsof -i :3000 | grep LISTEN | awk '{print \$2}' | xargs kill -9"
    echo ""
    echo -e "${GREEN}✓ You can access the dashboard at: ${NC}http://localhost:3000"
    return 0
  fi
  return 1
}

# Set up the log directory
setup_logs() {
  LOG_DIR="$(pwd)/logs"
  FRONTEND_LOG="${LOG_DIR}/react_frontend.log"
  
  # Create logs directory if it doesn't exist
  if [ ! -d "$LOG_DIR" ]; then
    echo -e "${YELLOW}Creating logs directory...${NC}"
    mkdir -p "$LOG_DIR"
  fi
  
  # Clear previous log
  echo "" > "$FRONTEND_LOG"
  echo -e "${GREEN}✓ Log file will be written to: ${NC}$FRONTEND_LOG"
}

# Function to start the frontend
start_frontend() {
  FRONTEND_DIR="$(pwd)/Lightning-Lens/lightning_lens/frontend"
  
  # Check if frontend directory exists
  if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Error: Frontend directory not found at: ${NC}$FRONTEND_DIR"
    echo -e "${YELLOW}Make sure you're running this script from the project root directory${NC}"
    exit 1
  fi
  
  echo -e "${BLUE}Starting React frontend from: ${NC}$FRONTEND_DIR"
  echo -e "${BLUE}This may take a few seconds...${NC}"
  
  # Change to frontend directory and start the application
  cd "$FRONTEND_DIR"
  
  # Check if node_modules exists, if not suggest running npm install
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Node modules not found. Installing dependencies...${NC}"
    npm install
    
    if [ $? -ne 0 ]; then
      echo -e "${RED}❌ Failed to install dependencies. Please run 'npm install' manually in $FRONTEND_DIR${NC}"
      exit 1
    fi
  fi
  
  # Start the frontend and redirect output to log file
  echo -e "${BLUE}Starting application...${NC}"
  nohup npm start > "$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!
  
  # Wait for the app to start
  echo -ne "${BLUE}Waiting for frontend to start..."
  
  # Count attempts
  ATTEMPTS=0
  MAX_ATTEMPTS=30
  
  while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if grep -q "Compiled successfully" "$FRONTEND_LOG"; then
      echo -e "\r${GREEN}✓ Frontend started successfully!                     ${NC}"
      break
    fi
    
    # Check if there's an error
    if grep -q "error" "$FRONTEND_LOG"; then
      echo -e "\r${RED}❌ Error starting frontend:${NC}"
      tail -n 10 "$FRONTEND_LOG"
      echo -e "${YELLOW}For more details, check the log: ${NC}$FRONTEND_LOG"
      exit 1
    fi
    
    # Check if process is still running
    if ! ps -p $FRONTEND_PID > /dev/null; then
      echo -e "\r${RED}❌ Frontend process stopped unexpectedly${NC}"
      tail -n 20 "$FRONTEND_LOG"
      exit 1
    fi
    
    echo -ne "."
    sleep 1
    ATTEMPTS=$((ATTEMPTS+1))
  done
  
  if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
    echo -e "\r${YELLOW}⚠️  Timeout waiting for frontend to start properly${NC}"
    echo -e "${YELLOW}The process is still running (PID: $FRONTEND_PID) but may have issues${NC}"
    echo -e "${YELLOW}Check the log for details: ${NC}$FRONTEND_LOG"
  else
    # Extract local URL from log
    LOCAL_URL=$(grep -o "Local:.*http://localhost:[0-9]*" "$FRONTEND_LOG" | sed 's/Local: *//')
    NETWORK_URL=$(grep -o "On Your Network:.*http://[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*:[0-9]*" "$FRONTEND_LOG" | sed 's/On Your Network: *//')
    
    echo -e "${GREEN}✓ React frontend is running with PID: ${NC}$FRONTEND_PID"
    echo -e "${GREEN}✓ You can access the dashboard at: ${NC}$LOCAL_URL"
    if [ ! -z "$NETWORK_URL" ]; then
      echo -e "${GREEN}✓ Network access available at: ${NC}$NETWORK_URL"
    fi
  fi
}

# Function to display helpful information
show_info() {
  echo ""
  echo -e "${BLUE}=====================================================${NC}"
  echo -e "${BLUE}                  Helpful Commands                   ${NC}"
  echo -e "${BLUE}=====================================================${NC}"
  echo -e "${YELLOW}View logs:${NC} tail -f logs/react_frontend.log"
  echo -e "${YELLOW}Check status:${NC} lsof -i :3000"
  echo -e "${YELLOW}Stop frontend:${NC} lsof -i :3000 | grep LISTEN | awk '{print \$2}' | xargs kill -9"
  echo ""
}

# Main script execution
print_banner

# Check if frontend is already running
if check_if_running; then
  show_info
  exit 0
fi

setup_logs
start_frontend
show_info

exit 0 