#!/bin/bash

echo "Setting up CORS Proxy Server for Lightning-Lens..."

# Navigate to the scripts directory
cd ./Lightning-Lens/lightning_lens/scripts

# Install dependencies if necessary (first run only)
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies for CORS proxy..."
    npm install --prefix . -g express cors http-proxy-middleware ws
fi

# Start the proxy server
echo "Starting CORS proxy server on port 3001..."
node cors_proxy.js 