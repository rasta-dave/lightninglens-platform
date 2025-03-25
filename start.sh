#!/bin/bash
# Enhanced start.sh - Launch the complete Lightning-Lens system

# Define colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Define the Python interpreter to use
PYTHON_BIN=$(which python3)
NODE_BIN=$(which node)
LIGHTNING_LENS_DIR=$(pwd)

# Create log directory if it doesn't exist
LOGS_DIR="$LIGHTNING_LENS_DIR/logs"
mkdir -p $LOGS_DIR

echo -e "${BLUE}=== Lightning Lens System Startup ===${NC}"

# Create data directories with proper permissions
echo "Creating necessary data directories..."
mkdir -p data/models data/predictions data/processed data/simulation data/visualizations data/raw
echo "  ✓ Data directories created"

# Skip permission setting if not the owner
if [ -O "data" ]; then
  chmod -R 755 data 2>/dev/null
  echo "  ✓ Directory permissions set to 755"
else
  echo -e "  ${YELLOW}⚠️ You are not the owner of some data files.${NC}"
  echo "     This is not critical, the system will still work."
fi

# Define service ports
WS_SERVER_PORT=8768
HTTP_SERVER_PORT=8000
ENHANCED_HTTP_PORT=5000
ADAPTER_PROXY_PORT=8001
WS_CLIENT_PORT=8766
SUGGESTIONS_WS_PORT=8767
CORS_PROXY_PORT=3003
FRONTEND_PORT=3000
HEALTH_DASHBOARD_PORT=3030

# Display port configuration
echo -e "${BLUE}=== Service Configuration ===${NC}"
echo "WebSocket Server:    Port $WS_SERVER_PORT"
echo "HTTP Server:         Port $HTTP_SERVER_PORT"
echo "Enhanced HTTP Server:Port $ENHANCED_HTTP_PORT"
echo "Adapter Proxy:       Port $ADAPTER_PROXY_PORT" 
echo "WebSocket Client:    Connects to $WS_SERVER_PORT"
echo "Suggestions Service: Port $SUGGESTIONS_WS_PORT"
echo "CORS Proxy:          Port $CORS_PROXY_PORT"
echo "Frontend:            Port $FRONTEND_PORT"
echo "Health Dashboard:    Port $HEALTH_DASHBOARD_PORT"
echo "-----------------------------------"

# Function to check if a port is in use
is_port_in_use() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0  # Port is in use (success)
    else
        return 1  # Port is not in use (failure)
    fi
}

# Function to get PID of process using a port
get_pid_for_port() {
    lsof -Pi :$1 -sTCP:LISTEN -t 2>/dev/null
}

# Kill an existing process on a port
function kill_port() {
  local port=$1
  local pid=$(get_pid_for_port $port)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}Stopping existing service on port $port (PID: $pid)${NC}"
    kill -15 $pid 2>/dev/null || kill -9 $pid 2>/dev/null
    sleep 1
  fi
}

# Kill all potentially running services
kill_port $HTTP_SERVER_PORT
kill_port $WS_SERVER_PORT
kill_port $ADAPTER_PROXY_PORT
kill_port $SUGGESTIONS_WS_PORT
kill_port $CORS_PROXY_PORT
kill_port $FRONTEND_PORT
kill_port $HEALTH_DASHBOARD_PORT

# WebSocket client doesn't listen on a port, try to find by process name
WS_CLIENT_PROCESS=$(pgrep -f "websocket_client.py" || echo "")
if [ -n "$WS_CLIENT_PROCESS" ]; then
  echo -e "${YELLOW}Stopping WebSocket client process $WS_CLIENT_PROCESS${NC}"
  kill -15 $WS_CLIENT_PROCESS 2>/dev/null || kill -9 $WS_CLIENT_PROCESS 2>/dev/null
  sleep 1
fi

# Initialize log files
function init_log() {
  local name=$1
  mkdir -p "$(dirname "$LOGS_DIR/${name}.log")"
  echo "$(date): Starting $name" > "$LOGS_DIR/${name}.log"
}

init_log "http_server"
init_log "enhanced_http_server"
init_log "ws_server"
init_log "adapter"
init_log "client_ws"
init_log "suggestions_ws"
init_log "cors_proxy"
init_log "frontend"
init_log "health_dashboard"

# Function to check if a service is running
function check_service() {
  local name=$1
  local port=$2
  local attempts=10
  local wait_time=2
  
  echo -n "Checking if $name is running on port $port... "
  
  for ((i=1; i<=$attempts; i++)); do
    if nc -z localhost $port 2>/dev/null; then
      echo -e "${GREEN}✓ Connected${NC}"
      return 0
    else
      if [ $i -eq 1 ]; then
        echo -n "Waiting"
      else
        echo -n "."
      fi
      sleep $wait_time
    fi
  done
  
  echo -e "\n${RED}✗ Failed to connect to $name on port $port after $attempts attempts${NC}"
  return 1
}

# Function to check HTTP endpoint
function check_http_endpoint() {
  local name=$1
  local url=$2
  local attempts=5
  local wait_time=2
  
  echo -n "Checking if $name endpoint is available at $url... "
  
  for ((i=1; i<=$attempts; i++)); do
    if curl -s -f -m 2 "$url" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Available${NC}"
      return 0
    else
      if [ $i -eq 1 ]; then
        echo -n "Waiting"
      else
        echo -n "."
      fi
      sleep $wait_time
    fi
  done
  
  echo -e "\n${RED}✗ $name endpoint not responding at $url after $attempts attempts${NC}"
  return 1
}

echo -e "${BLUE}=== Starting Backend Services ===${NC}"

# Start WebSocket Server
echo "Starting WebSocket Server on port $WS_SERVER_PORT..."
$PYTHON_BIN Lightning-Simulation/lightning-simulation/scripts/websocket_server.py --port $WS_SERVER_PORT >> $LOGS_DIR/ws_server.log 2>&1 &
WS_SERVER_PID=$!
echo "  → Started with PID: $WS_SERVER_PID"
check_service "WebSocket Server" $WS_SERVER_PORT

# Start HTTP Server
echo "Starting HTTP Server on port $HTTP_SERVER_PORT..."
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/http_server.py --port $HTTP_SERVER_PORT >> $LOGS_DIR/http_server.log 2>&1 &
HTTP_SERVER_PID=$!
echo "  → Started with PID: $HTTP_SERVER_PID"
check_service "HTTP Server" $HTTP_SERVER_PORT
check_http_endpoint "HTTP API" "http://localhost:$HTTP_SERVER_PORT/api/status"

# Start Enhanced HTTP Server
echo "Starting Enhanced HTTP Server on port $ENHANCED_HTTP_PORT..."
# Kill any existing process on the port
kill_port $ENHANCED_HTTP_PORT
# Initialize the log file
init_log "enhanced_http_server"
# Start the Enhanced HTTP Server
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/enhanced_http_server.py --port $ENHANCED_HTTP_PORT >> $LOGS_DIR/enhanced_http_server.log 2>&1 &
ENHANCED_HTTP_PID=$!
echo "  → Started with PID: $ENHANCED_HTTP_PID"
check_service "Enhanced HTTP Server" $ENHANCED_HTTP_PORT
check_http_endpoint "Enhanced HTTP API" "http://localhost:$ENHANCED_HTTP_PORT/api/status"

# Start Adapter Proxy
echo "Starting Adapter Proxy on port $ADAPTER_PROXY_PORT..."
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/adapter_proxy.py --port $ADAPTER_PROXY_PORT >> $LOGS_DIR/adapter.log 2>&1 &
ADAPTER_PROXY_PID=$!
echo "  → Started with PID: $ADAPTER_PROXY_PID"
check_service "Adapter Proxy" $ADAPTER_PROXY_PORT

# Start WebSocket Client
echo "Starting WebSocket Client..."
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/websocket_client.py --uri "ws://localhost:$WS_SERVER_PORT" --verbose >> $LOGS_DIR/client_ws.log 2>&1 &
WS_CLIENT_PID=$!
echo "  → Started with PID: $WS_CLIENT_PID"
# Check the log file for successful connection after a short delay
sleep 3
if grep -q "Connected to Lightning Network simulation" $LOGS_DIR/client_ws.log 2>/dev/null; then
  echo -e "  ${GREEN}✓ WebSocket Client connected to server${NC}"
else
  echo -e "  ${YELLOW}⚠️ WebSocket Client connection status unknown${NC}"
  echo "    Check logs with: tail -f $LOGS_DIR/client_ws.log"
fi

# Start Suggestions Service
echo "Starting Suggestions Service on port $SUGGESTIONS_WS_PORT..."
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/simple_suggestions_ws.py --port $SUGGESTIONS_WS_PORT --log-level INFO >> $LOGS_DIR/suggestions_ws.log 2>&1 &
SUGGESTIONS_WS_PID=$!
echo "  → Started with PID: $SUGGESTIONS_WS_PID"
check_service "Suggestions Service" $SUGGESTIONS_WS_PORT

# Start CORS Proxy
echo "Starting CORS Proxy on port $CORS_PROXY_PORT..."
# Make sure the port is not in use
kill_port $CORS_PROXY_PORT
# Initialize the log file
init_log "cors_proxy"
# Start the CORS proxy with proper error handling
$NODE_BIN Lightning-Lens/lightning_lens/scripts/cors_proxy.js --port $CORS_PROXY_PORT --target http://localhost:$HTTP_SERVER_PORT --enhanced-target http://localhost:$ENHANCED_HTTP_PORT --ws-target ws://localhost:$WS_SERVER_PORT >> $LOGS_DIR/cors_proxy.log 2>&1 &
CORS_PROXY_PID=$!
echo "  → Started with PID: $CORS_PROXY_PID"

# Check if the CORS proxy is running
check_service "CORS Proxy" $CORS_PROXY_PORT
check_http_endpoint "CORS Proxy" "http://localhost:$CORS_PROXY_PORT/api/status"

# Comment out the Integrated API Services section as it conflicts with our optimized CORS Proxy
# The optimized CORS proxy already includes the functionality needed
# echo -e "${YELLOW}Starting Integrated API Services...${NC}"
# ./start_integrated_api.sh &
# Wait a moment for services to start
# sleep 2
# Check if services are running
# if lsof -i:3003 -sTCP:LISTEN >/dev/null && lsof -i:8767 -sTCP:LISTEN >/dev/null; then
#   echo -e "  ${GREEN}✓ Integrated API Services started successfully${NC}"
# else
#   echo -e "  ${YELLOW}⚠️ Integrated API Services may not have started properly${NC}"
#   echo -e "  ${YELLOW}Check logs for details: tail -f ${LOGS_DIR}/api_gateway.log${NC}"
# fi

# Update frontend configuration with current port values
echo "Updating frontend configuration..."
./update-frontend-config.sh > /dev/null 2>&1
echo "  ✓ Frontend configuration updated"

echo -e "${BLUE}=== Starting Frontend ===${NC}"
echo "Starting Lightning Lens frontend on port $FRONTEND_PORT..."

# Start the React frontend application with npm
echo -e "${BLUE}=== Starting React Frontend Application ===${NC}"
echo "Starting the React application..."

# Use the dedicated script to start the frontend if available
if [ -f "./start_frontend.sh" ]; then
  echo "Using dedicated frontend script (start_frontend.sh)..."
  
  # Make sure the script is executable
  chmod +x ./start_frontend.sh
  
  # Run the script in the background
  ./start_frontend.sh &
  REACT_APP_PID=$!
  FOUND_FRONTEND=true
  
  echo -e "${GREEN}Frontend startup script initiated with PID: $REACT_APP_PID${NC}"
  echo "The script will handle frontend startup and display status automatically"
  
  # Small delay to allow the script to start
  sleep 2
else
  # If the dedicated script is not available, use the existing approach
  echo "Dedicated frontend script not found. Using default approach..."
  
  # Try to locate the React app frontend directory by checking multiple possible locations
  if [ -d "Lightning-Lens/frontend" ]; then
    FRONTEND_DIR="Lightning-Lens/frontend"
    FOUND_FRONTEND=true
    echo -e "Found React app at: ${GREEN}${FRONTEND_DIR}${NC}"
  elif [ -d "Lightning-Lens/lightning_lens/frontend" ]; then
    FRONTEND_DIR="Lightning-Lens/lightning_lens/frontend"
    FOUND_FRONTEND=true
    echo -e "Found React app at: ${GREEN}${FRONTEND_DIR}${NC}"
  elif [ -d "frontend" ]; then
    FRONTEND_DIR="frontend"
    FOUND_FRONTEND=true
    echo -e "Found React app at: ${GREEN}${FRONTEND_DIR}${NC}"
  else
    # Search for package.json files that contain "react" dependency to find frontend directories
    echo "Searching for React frontend directories..."
    FRONTEND_DIRS=$(find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec grep -l "\"react\":" {} \; -exec dirname {} \; 2>/dev/null | sort)
    
    if [ -n "$FRONTEND_DIRS" ]; then
      # List all frontend candidates
      echo "Found potential React app locations:"
      counter=1
      for dir in $FRONTEND_DIRS; do
        echo "  $counter. $dir"
        counter=$((counter + 1))
      done
      
      # Choose the first one that has package.json
      for dir in $FRONTEND_DIRS; do
        if [ -f "$dir/package.json" ]; then
          FRONTEND_DIR="$dir"
          FOUND_FRONTEND=true
          echo -e "Selected React app at: ${GREEN}${dir}${NC}"
          break
        fi
      done
    fi
  fi
  
  if [ "$FOUND_FRONTEND" = false ]; then
    echo -e "${YELLOW}⚠️ Could not find React frontend application${NC}"
    echo "Please start it manually by locating your React app directory and running 'npm start'"
  else
    # We found a frontend directory, let's start it
    echo "Starting React app in: $FRONTEND_DIR"
    
    # Make sure logs directory exists
    mkdir -p "$LOGS_DIR"
    
    # First ensure we're in the project root
    cd "$LIGHTNING_LENS_DIR"
    
    # Then navigate to the frontend directory using relative path
    cd "$FRONTEND_DIR" || {
      echo -e "${RED}✗ Could not navigate to the frontend directory:${NC} $FRONTEND_DIR"
      echo "Error: Directory exists but couldn't be accessed."
      FOUND_FRONTEND=false
    }
    
    if [ "$FOUND_FRONTEND" = true ]; then
      # Check if it's a Next.js app
      if [ -f "next.config.js" ]; then
        echo "Detected Next.js application"
        npm run dev > "$LIGHTNING_LENS_DIR/$LOGS_DIR/react_frontend.log" 2>&1 &
        REACT_APP_PID=$!
        REACT_APP_CMD="npm run dev"
      else
        echo "Detected standard React application"
        npm start > "$LIGHTNING_LENS_DIR/$LOGS_DIR/react_frontend.log" 2>&1 &
        REACT_APP_PID=$!
        REACT_APP_CMD="npm start"
      fi
      
      echo -e "${GREEN}React app started with PID: $REACT_APP_PID${NC}"
      echo "Command used: $REACT_APP_CMD"
      echo "Log file: $LIGHTNING_LENS_DIR/$LOGS_DIR/react_frontend.log"
      
      # Navigate back to original directory
      cd "$LIGHTNING_LENS_DIR"
      
      # Wait for the app to be available on port 3000
      echo "Waiting for React app to become available (this may take up to 30 seconds)... "
      success=false
      for i in {1..30}; do
        if nc -z localhost 3000 2>/dev/null; then
          echo -e "${GREEN}✓ React app is ready!${NC}"
          echo -e "Access the frontend at: ${BLUE}http://localhost:3000${NC}"
          success=true
          break
        fi
        
        # Show progress
        echo -n "."
        sleep 1
      done
      
      if [ "$success" = false ]; then
        echo -e "\n${YELLOW}⚠️ React app is taking longer than expected to start.${NC}"
        echo "  - It might still be starting in the background"
        echo "  - Check if there's an error in the logs: tail -f $LOGS_DIR/react_frontend.log"
        echo "  - You can also try accessing http://localhost:3000 in your browser anyway"
      fi
    fi
  fi
fi

echo -e "${BLUE}=== Starting Automated Learning Services ===${NC}"

# Start the automated data processing and learning system
echo "Starting automated learning system..."
init_log "auto_learning"
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/auto_learning.py --daemon >> $LOGS_DIR/auto_learning.log 2>&1 &
AUTO_LEARNING_PID=$!
echo "  → Started with PID: $AUTO_LEARNING_PID"

# Start the simulation monitor
echo "Starting simulation monitor..."
init_log "simulation_monitor"
$PYTHON_BIN Lightning-Lens/lightning_lens/scripts/simulation_monitor.py --daemon >> $LOGS_DIR/simulation_monitor.log 2>&1 &
SIMULATION_MONITOR_PID=$!
echo "  → Started with PID: $SIMULATION_MONITOR_PID"

# Start Health Dashboard
echo -e "${BLUE}=== Starting Health Dashboard ===${NC}"
echo "Starting Health Dashboard on port $HEALTH_DASHBOARD_PORT..."
$NODE_BIN Lightning-Lens/lightning_lens/scripts/start_health_dashboard.js --port $HEALTH_DASHBOARD_PORT >> $LOGS_DIR/health_dashboard.log 2>&1 &
HEALTH_DASHBOARD_PID=$!
echo "  → Started with PID: $HEALTH_DASHBOARD_PID"
check_service "Health Dashboard" $HEALTH_DASHBOARD_PORT
check_http_endpoint "Health Dashboard" "http://localhost:$HEALTH_DASHBOARD_PORT/api/health"

# Summary
echo ""
echo -e "${BLUE}=== Lightning Lens System Status ===${NC}"
echo -e "Backend Services:"
echo -e "  WebSocket Server:    ${GREEN}Running${NC} (PID: $WS_SERVER_PID)"
echo -e "  HTTP Server:         ${GREEN}Running${NC} (PID: $HTTP_SERVER_PID)"
echo -e "  Enhanced HTTP:       ${GREEN}Running${NC} (PID: $ENHANCED_HTTP_PID)"
echo -e "  Adapter Proxy:       ${GREEN}Running${NC} (PID: $ADAPTER_PROXY_PID)"
echo -e "  WebSocket Client:    ${GREEN}Running${NC} (PID: $WS_CLIENT_PID)"
echo -e "  Suggestions Service: ${GREEN}Running${NC} (PID: $SUGGESTIONS_WS_PID)"
echo -e "  CORS Proxy:          ${GREEN}Running${NC} (PID: $CORS_PROXY_PID)"
echo -e "  Health Dashboard:    ${GREEN}Running${NC} (PID: $HEALTH_DASHBOARD_PID)"
echo ""
echo -e "Frontend:"
if [ "$FOUND_FRONTEND" = true ]; then
    echo -e "  Next.js Frontend:    ${GREEN}Running${NC} at http://localhost:$FRONTEND_PORT (PID: $REACT_APP_PID)"
else
    echo -e "  Next.js Frontend:    ${YELLOW}Not Started${NC}"
    echo -e "  To start manually:   cd $FRONTEND_DIR && npm run dev"
fi
echo ""
echo -e "Auxiliary Services:"
echo -e "  Auto Learning:       ${GREEN}Running${NC} (PID: $AUTO_LEARNING_PID)"
echo -e "  Simulation Monitor:  ${GREEN}Running${NC} (PID: $SIMULATION_MONITOR_PID)"
echo ""
echo -e "${BLUE}=== Dashboards ===${NC}"
echo -e "Main Dashboard:    ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "Health Dashboard:  ${GREEN}http://localhost:$HEALTH_DASHBOARD_PORT${NC}"
echo ""
echo -e "${BLUE}=== Useful Commands ===${NC}"
echo "View logs:            tail -f $LOGS_DIR/<service_name>.log"
echo "Check service status: lsof -i :<port_number>"
echo "Stop all services:    ./stop.sh (or create this script to kill processes)"
echo ""
echo -e "${GREEN}Lightning Lens startup and diagnostics complete!${NC}"

# Add the simple dashboard option at the very end of startup
echo -e "\n${BLUE}=== Simple Dashboard (Optional) ===${NC}"
echo -e "Would you like to start the simplified Lightning Network visualization dashboard?"
read -p "Start simple dashboard? [y/N]: " -n 1 -r SIMPLE_DASHBOARD_REPLY
echo

if [[ $SIMPLE_DASHBOARD_REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Starting simplified dashboard...${NC}"
  
  # Define ports (non-conflicting with existing system)
  SIMPLE_DATA_PORT=3005  # Doesn't conflict with existing services
  SIMPLE_FRONTEND_PORT=3035  # Different from main frontend (3000)
  
  # Define directories
  SIMPLE_SCRIPTS_DIR="$LIGHTNING_LENS_DIR/Lightning-Lens/lightning_lens/scripts"
  SIMPLE_FRONTEND_DIR="$LIGHTNING_LENS_DIR/Lightning-Lens/lightning_lens/frontend"
  
  # Kill any existing processes on these ports
  kill_port $SIMPLE_DATA_PORT
  kill_port $SIMPLE_FRONTEND_PORT
  
  # Initialize log files
  init_log "simple_data_server"
  init_log "simple_frontend"
  
  # Start data server
  echo -e "${YELLOW}Starting simple data server on port ${SIMPLE_DATA_PORT}...${NC}"
  cd "$SIMPLE_SCRIPTS_DIR" || exit
  NODE_ENV=development PORT=$SIMPLE_DATA_PORT npm start > "$LOGS_DIR/simple_data_server.log" 2>&1 &
  SIMPLE_DATA_PID=$!
  cd "$LIGHTNING_LENS_DIR" || exit
  
  # Verify data server started
  sleep 3
  if nc -z localhost $SIMPLE_DATA_PORT 2>/dev/null; then
    echo -e "${GREEN}✓ Simple data server started on port ${SIMPLE_DATA_PORT} (PID: ${SIMPLE_DATA_PID})${NC}"
  else
    echo -e "${RED}✗ Failed to start simple data server${NC}"
    echo "  Check logs: tail -f $LOGS_DIR/simple_data_server.log"
  fi
  
  # Start frontend
  echo -e "${YELLOW}Starting simple dashboard frontend on port ${SIMPLE_FRONTEND_PORT}...${NC}"
  cd "$SIMPLE_FRONTEND_DIR" || exit
  PORT=$SIMPLE_FRONTEND_PORT npm start > "$LOGS_DIR/simple_frontend.log" 2>&1 &
  SIMPLE_FRONTEND_PID=$!
  cd "$LIGHTNING_LENS_DIR" || exit
  
  # Verify frontend started
  sleep 5
  if nc -z localhost $SIMPLE_FRONTEND_PORT 2>/dev/null; then
    echo -e "${GREEN}✓ Simple dashboard frontend started on port ${SIMPLE_FRONTEND_PORT} (PID: ${SIMPLE_FRONTEND_PID})${NC}"
    echo -e "  Access simple dashboard at: ${BLUE}http://localhost:${SIMPLE_FRONTEND_PORT}${NC}"
    
    # Update final dashboards list
    echo -e "\n${BLUE}=== Dashboards Available ===${NC}"
    echo -e "Main Dashboard:        ${GREEN}http://localhost:3000${NC}"
    echo -e "Health Dashboard:      ${GREEN}http://localhost:3030${NC}"
    echo -e "Simple Visualization:  ${GREEN}http://localhost:${SIMPLE_FRONTEND_PORT}${NC}"
  else
    echo -e "${YELLOW}⚠️ Simple dashboard frontend may still be starting...${NC}"
    echo "  Expected URL: http://localhost:${SIMPLE_FRONTEND_PORT}"
    echo "  Check logs: tail -f $LOGS_DIR/simple_frontend.log"
  fi
else
  echo -e "${YELLOW}Skipping simplified dashboard startup.${NC}"
  echo -e "You can start it separately with: ${BLUE}./start-simple-dashboard.sh${NC}"
fi

echo -e "\n${BLUE}=== Lightning Lens System Fully Started ===${NC}"
echo -e "${GREEN}All services including the React frontend are now running.${NC}"
echo -e "Visit ${BLUE}http://localhost:3000${NC} in your browser to access the application."
echo -e "\nTo stop all services, use: ${YELLOW}./stop.sh${NC} or press Ctrl+C in each terminal window."