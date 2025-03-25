#!/bin/bash

# Restart WebSocket Services Script for Lightning Lens
# This script will restart all WebSocket services used by Lightning Lens

echo "Lightning Lens WebSocket Services Restart Script"
echo "==============================================="

# Find the project root directory
PROJECT_ROOT=$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")
cd "$PROJECT_ROOT" || exit 1

echo "Project root: $PROJECT_ROOT"
echo

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to restart a specific service
restart_service() {
  local service_name=$1
  local script_path=$2
  local port=$3
  local log_file=$4

  echo "Restarting $service_name service..."
  
  # Kill existing process
  pids=$(ps aux | grep "$script_path" | grep -v grep | awk '{print $2}')
  if [ -n "$pids" ]; then
    echo "  Stopping existing $service_name process (PID: $pids)"
    kill -9 $pids 2>/dev/null
    sleep 1
  else
    echo "  No existing $service_name process found"
  fi
  
  # Start new process
  echo "  Starting new $service_name process on port $port"
  echo "  Logs will be written to $log_file"
  python -m $script_path --port $port > "$log_file" 2>&1 &
  
  # Check if started successfully
  sleep 2
  if ps aux | grep -q "$script_path" | grep -v grep; then
    echo "  ✓ $service_name service started successfully"
  else
    echo "  ✗ Failed to start $service_name service"
  fi
  echo
}

# Restart suggestions WebSocket
restart_service "Suggestions WebSocket" "lightning_lens.scripts.suggestions_ws" 8767 "logs/suggestions_ws.log"

# Restart WebSocket server (if it exists)
restart_service "WebSocket Server" "lightning_lens.server.ws_server" 8768 "logs/ws_server.log" 

echo "All WebSocket services have been restarted."
echo "To check status of the services, run: ps aux | grep -E 'suggestions_ws|ws_server' | grep -v grep"
echo 