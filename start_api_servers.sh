#!/bin/bash

# Unified Script to Start Lightning Lens API Servers
# This script ensures we use the original servers and avoid duplicates

# Set the base directory
BASE_DIR="/media/shahazzad/new3/KOD/LIGHTNING-LENS"
SCRIPTS_DIR="$BASE_DIR/Lightning-Lens/lightning_lens/scripts"
SIMULATION_SCRIPTS_DIR="$BASE_DIR/Lightning-Simulation/lightning-simulation/scripts"
LOGS_DIR="$BASE_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

# Function to check if a port is in use
is_port_in_use() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Check if the original ports are already in use
if is_port_in_use 8000; then
    echo "Port 8000 (HTTP Server) is already in use. Please close the application using this port."
    exit 1
fi

if is_port_in_use 8768; then
    echo "Port 8768 (WebSocket Server) is already in use. Please close the application using this port."
    exit 1
fi

if is_port_in_use 8001; then
    echo "Port 8001 (Adapter Proxy) is already in use. Please close the application using this port."
    exit 1
fi

if is_port_in_use 8767; then
    echo "Port 8767 (Suggestions Service) is already in use. Please close the application using this port."
    exit 1
fi

# Start HTTP server (original)
echo "Starting HTTP Server on port 8000..."
python3 "$SCRIPTS_DIR/http_server.py" --port 8000 > "$LOGS_DIR/http_server.log" 2>&1 &
HTTP_PID=$!

# Verify HTTP server is running
sleep 2
if ! is_port_in_use 8000; then
    echo "WARNING: HTTP Server failed to start on port 8000"
else
    echo "HTTP Server started successfully on port 8000 with PID: $HTTP_PID"
fi

# Start WebSocket server
echo "Starting WebSocket Server on port 8768..."
python3 "$SIMULATION_SCRIPTS_DIR/websocket_server.py" > "$LOGS_DIR/websocket_server.log" 2>&1 &
WS_PID=$!

# Verify WebSocket server is running
sleep 2
if ! is_port_in_use 8768; then
    echo "WARNING: WebSocket Server failed to start on port 8768"
else
    echo "WebSocket Server started successfully on port 8768 with PID: $WS_PID"
fi

# Start Adapter Proxy
echo "Starting Adapter Proxy on port 8001..."
python3 "$SCRIPTS_DIR/adapter_proxy.py" > "$LOGS_DIR/adapter_proxy.log" 2>&1 &
PROXY_PID=$!

# Verify Adapter Proxy is running
sleep 2
if ! is_port_in_use 8001; then
    echo "WARNING: Adapter Proxy failed to start on port 8001"
else
    echo "Adapter Proxy started successfully on port 8001 with PID: $PROXY_PID"
fi

# Start Suggestions Service
echo "Starting Suggestions Service on port 8767..."
python3 "$SCRIPTS_DIR/suggestions_service.py" > "$LOGS_DIR/suggestions_service.log" 2>&1 &
SUGGESTIONS_PID=$!

# Verify Suggestions Service is running
sleep 2
if ! is_port_in_use 8767; then
    echo "WARNING: Suggestions Service failed to start on port 8767"
else
    echo "Suggestions Service started successfully on port 8767 with PID: $SUGGESTIONS_PID"
fi

# Function to handle script termination
cleanup() {
    echo "Stopping servers..."
    kill $HTTP_PID $WS_PID $PROXY_PID $SUGGESTIONS_PID 2>/dev/null
    exit 0
}

# Register the cleanup function for when the script is terminated
trap cleanup SIGINT SIGTERM

echo "==============================================="
echo "All servers are running. Press Ctrl+C to stop."
echo "HTTP Server PID: $HTTP_PID"
echo "WebSocket Server PID: $WS_PID"
echo "Adapter Proxy PID: $PROXY_PID"
echo "Suggestions Service PID: $SUGGESTIONS_PID"
echo "==============================================="

# Wait for all processes to finish
wait $HTTP_PID $WS_PID $PROXY_PID $SUGGESTIONS_PID
