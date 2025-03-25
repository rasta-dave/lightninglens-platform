#!/usr/bin/env python3
"""
Suggestions WebSocket for LightningLens

This script provides a WebSocket endpoint that sends rebalancing suggestions
to the Lightning Network simulation in real-time.
"""

import os
import sys
import json
import logging
import argparse
import pandas as pd
import asyncio
import websockets
from datetime import datetime
import http

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SuggestionsWS")

# Store connected clients
connected = set()

def load_latest_predictions():
    """Load the latest prediction data"""
    try:
        predictions_file = "data/predictions/latest_predictions.csv"
        if not os.path.exists(predictions_file):
            logger.error(f"Predictions file not found: {predictions_file}")
            return None
        
        df = pd.read_csv(predictions_file)
        logger.info(f"Loaded {len(df)} predictions from {predictions_file}")
        return df
    except Exception as e:
        logger.error(f"Error loading predictions: {str(e)}")
        return None

async def register(websocket):
    """Register a new client"""
    connected.add(websocket)
    logger.info(f"Client connected. Total clients: {len(connected)}")
    
    # Send initial suggestions
    await send_suggestions_to_client(websocket)

async def unregister(websocket):
    """Unregister a client"""
    connected.remove(websocket)
    logger.info(f"Client disconnected. Remaining clients: {len(connected)}")

async def send_suggestions_to_client(websocket):
    """Send current suggestions to a client"""
    df = load_latest_predictions()
    if df is None:
        await websocket.send(json.dumps({"error": "Failed to load predictions"}))
        return
    
    # Convert to list of dictionaries for JSON response
    suggestions = []
    for _, row in df.iterrows():
        # Only include channels that need significant adjustment
        if abs(row['adjustment_needed']) > 0.05:  # 5% threshold
            suggestion = {
                "channel_id": row['channel_id'],
                "current_ratio": float(row['balance_ratio']),
                "optimal_ratio": float(row['optimal_ratio']),
                "adjustment_needed": float(row['adjustment_needed']),
                "significant": abs(row['adjustment_needed']) > 0.1  # Flag for UI highlighting
            }
            suggestions.append(suggestion)
    
    await websocket.send(json.dumps({
        "type": "suggestions",
        "suggestions": suggestions, 
        "count": len(suggestions),
        "timestamp": datetime.now().isoformat()
    }))

async def broadcast_suggestions():
    """Broadcast suggestions to all connected clients"""
    if not connected:
        return
    
    df = load_latest_predictions()
    if df is None:
        return
    
    # Convert to list of dictionaries for JSON response
    suggestions = []
    for _, row in df.iterrows():
        # Only include channels that need significant adjustment
        if abs(row['adjustment_needed']) > 0.05:  # 5% threshold
            suggestion = {
                "channel_id": row['channel_id'],
                "current_ratio": float(row['balance_ratio']),
                "optimal_ratio": float(row['optimal_ratio']),
                "adjustment_needed": float(row['adjustment_needed']),
                "significant": abs(row['adjustment_needed']) > 0.1  # Flag for UI highlighting
            }
            suggestions.append(suggestion)
    
    message = json.dumps({
        "type": "suggestions",
        "suggestions": suggestions, 
        "count": len(suggestions),
        "timestamp": datetime.now().isoformat()
    })
    
    await asyncio.gather(
        *[client.send(message) for client in connected]
    )
    logger.info(f"Broadcast {len(suggestions)} suggestions to {len(connected)} clients")

async def handle_message(websocket, message):
    """Handle incoming WebSocket messages"""
    try:
        data = json.loads(message)
        
        if data.get("type") == "get_suggestions":
            await send_suggestions_to_client(websocket)
        elif data.get("type") == "apply_suggestion":
            # Log the suggestion that the client wants to apply
            logger.info(f"Client requested to apply suggestion: {data.get('suggestion')}")
            # In a real implementation, this would send the suggestion to the simulation
            
            # Acknowledge receipt
            await websocket.send(json.dumps({
                "type": "suggestion_applied",
                "status": "success",
                "message": "Suggestion received and will be applied"
            }))
        elif data.get("type") == "heartbeat":
            # Respond to heartbeat messages to keep connection alive
            logger.debug(f"Received heartbeat, responding")
            await websocket.send(json.dumps({
                "type": "heartbeat_response",
                "timestamp": datetime.now().isoformat()
            }))
    
    except json.JSONDecodeError:
        logger.error(f"Received invalid JSON: {message[:100]}...")
    except Exception as e:
        logger.error(f"Error handling message: {str(e)}")

# CORS headers to be used in HTTP responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600',
}

async def http_handler(path, request_headers):
    """Handle HTTP requests (mainly for CORS)"""
    # Always return CORS headers for any request
    # This avoids the error with the request_headers.get() method
    
    if path == '/health':
        # Health check endpoint
        return http.HTTPStatus.OK, CORS_HEADERS, json.dumps({
            'status': 'healthy',
            'service': 'suggestions-ws',
            'connections': len(connected),
            'timestamp': datetime.now().isoformat()
        })
    
    # For all other requests, just return OK with CORS headers
    # This handles OPTIONS requests and other preflight checks
    return http.HTTPStatus.OK, CORS_HEADERS, ''

async def suggestions_server(websocket):
    """Handle WebSocket connections"""
    await register(websocket)
    try:
        async for message in websocket:
            await handle_message(websocket, message)
    except Exception as e:
        logger.error(f"Error in client connection: {str(e)}")
    finally:
        await unregister(websocket)

async def periodic_suggestions_broadcast():
    """Periodically broadcast suggestions to all clients"""
    while True:
        await broadcast_suggestions()
        await asyncio.sleep(30)  # Send updates every 30 seconds

async def start_server(port):
    """Start the WebSocket server"""
    # Start the server with the HTTP handler for CORS
    server = await websockets.serve(
        suggestions_server,
        "0.0.0.0",
        port,
        origins=None,  # Allow all origins
        ping_interval=30,  # Send ping every 30 seconds
        ping_timeout=10,   # Consider connection lost after 10 seconds with no pong
        process_request=http_handler  # HTTP handler for CORS and health checks
    )
    
    logger.info(f"Suggestions WebSocket server started on port {port}")
    
    # Start the periodic broadcast task
    asyncio.create_task(periodic_suggestions_broadcast())
    
    # Keep the server running
    await asyncio.Future()  # Run forever

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Suggestions WebSocket for LightningLens')
    parser.add_argument('--port', type=int, default=8767,
                       help='Port to run the WebSocket server on')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    port = args.port
    
    # Print startup message to stdout (for the script that calls this)
    print(f"Starting Suggestions WebSocket server on port {port}")
    
    # Start the async loop
    try:
        asyncio.run(start_server(port))
    except KeyboardInterrupt:
        logger.info("Server stopped by user") 