#!/bin/bash

# Start suggestions WebSocket service script
# This is a simpler script focused only on the suggestions WebSocket

echo "Starting Suggestions WebSocket service..."

# Find the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
cd "$PROJECT_ROOT" || exit 1

echo "Project root: $PROJECT_ROOT"

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing process on port 8767
echo "Checking for existing processes on port 8767..."
lsof -i:8767 | grep LISTEN | awk '{print $2}' | xargs -r kill -9
sleep 1

# Start the service
echo "Starting suggestions WebSocket service on port 8767..."
cd "$PROJECT_ROOT" && python -m lightning_lens.scripts.suggestions_ws --port 8767 > logs/suggestions_ws.log 2>&1 &

PID=$!
echo "Started with PID: $PID"

# Verify it's running
sleep 2
if ps -p $PID > /dev/null; then
    echo "✓ Service started successfully"
else
    echo "✗ Service failed to start"
    echo "Check logs/suggestions_ws.log for errors"
    cat logs/suggestions_ws.log
    exit 1
fi

echo "Service is now running. Check logs/suggestions_ws.log for details." 