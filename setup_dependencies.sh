#!/bin/bash

echo "Setting up dependencies for Lightning-Lens..."

# Flask CORS dependency for HTTP server
echo "Installing Flask-CORS..."
pip install flask-cors

# Node.js dependencies for CORS proxy
echo "Installing Node.js dependencies for CORS proxy..."
cd ./Lightning-Lens/lightning_lens/scripts
npm install express cors http-proxy-middleware ws

echo "Dependencies installed successfully!"
echo "Now you can run the following scripts:"
echo "1. ./start_proxy.sh - To start the CORS proxy server"
echo "2. Your regular start script for the backend servers"
echo ""
echo "IMPORTANT: Make sure your frontend connects to the proxy at:"
echo "- HTTP API: http://localhost:3001/api"
echo "- WebSocket: ws://localhost:3001/ws" 