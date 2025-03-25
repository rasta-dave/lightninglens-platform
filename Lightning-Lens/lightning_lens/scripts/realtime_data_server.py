#!/usr/bin/env python3
"""
Real-time Data Server for Lightning Lens

This script provides WebSocket endpoints for streaming real-time data from the
Lightning Network simulation and ML model to the frontend dashboard.
"""

import os
import sys
import json
import logging
import argparse
import asyncio
import websockets
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import threading
import time
import random

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/realtime_data_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("RealtimeDataServer")

# Store connected clients by type
connected_clients = {
    'network': set(),
    'transactions': set(),
    'channels': set(),
    'metrics': set(),
    'predictions': set(),
    'anomalies': set(),
    'learning': set(),
    'all': set()
}

# Data caches for new connections
data_cache = {
    'network_state': {},
    'transactions': [],
    'channel_balances': {},
    'metrics': {},
    'predictions': [],
    'anomalies': [],
    'learning_metrics': {}
}

# Last update timestamps
last_updates = {
    'network': datetime.now(),
    'transactions': datetime.now(),
    'channels': datetime.now(),
    'metrics': datetime.now(),
    'predictions': datetime.now(),
    'anomalies': datetime.now(),
    'learning': datetime.now()
}

# Lock for thread-safe data updates
data_lock = threading.Lock()

async def register(websocket, path):
    """Register a new client for a specific data stream"""
    # Extract the stream type from the path
    stream_type = path.strip('/').lower()
    
    if stream_type not in connected_clients:
        stream_type = 'all'
    
    # Add to the appropriate set
    connected_clients[stream_type].add(websocket)
    connected_clients['all'].add(websocket)
    
    logger.info(f"Client connected to {stream_type} stream. Total {stream_type} clients: {len(connected_clients[stream_type])}")
    
    # Send initial data based on stream type
    await send_initial_data(websocket, stream_type)

async def unregister(websocket):
    """Unregister a client"""
    # Remove from all sets
    for client_set in connected_clients.values():
        if websocket in client_set:
            client_set.remove(websocket)
    
    logger.info(f"Client disconnected. Remaining clients: {len(connected_clients['all'])}")

async def send_initial_data(websocket, stream_type):
    """Send initial data to a new client based on stream type"""
    try:
        if stream_type == 'network' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'network_state',
                    'data': data_cache['network_state'],
                    'timestamp': datetime.now().isoformat()
                }))
        
        if stream_type == 'transactions' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'transactions',
                    'data': data_cache['transactions'][-100:],  # Send last 100 transactions
                    'timestamp': datetime.now().isoformat()
                }))
        
        if stream_type == 'channels' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'channel_balances',
                    'data': data_cache['channel_balances'],
                    'timestamp': datetime.now().isoformat()
                }))
        
        if stream_type == 'metrics' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'metrics',
                    'data': data_cache['metrics'],
                    'timestamp': datetime.now().isoformat()
                }))
        
        if stream_type == 'predictions' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'predictions',
                    'data': data_cache['predictions'],
                    'timestamp': datetime.now().isoformat()
                }))
        
        if stream_type == 'anomalies' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'anomalies',
                    'data': data_cache['anomalies'],
                    'timestamp': datetime.now().isoformat()
                }))
        
        if stream_type == 'learning' or stream_type == 'all':
            with data_lock:
                await websocket.send(json.dumps({
                    'type': 'learning_metrics',
                    'data': data_cache['learning_metrics'],
                    'timestamp': datetime.now().isoformat()
                }))
    
    except Exception as e:
        logger.error(f"Error sending initial data: {str(e)}")

async def broadcast_update(update_type, data):
    """Broadcast an update to all clients subscribed to a specific type"""
    if not connected_clients[update_type] and not connected_clients['all']:
        return
    
    # Update the cache
    with data_lock:
        if update_type == 'network':
            data_cache['network_state'] = data
        elif update_type == 'transactions':
            # Append new transactions to the cache
            if isinstance(data, list):
                data_cache['transactions'].extend(data)
                # Keep only the last 1000 transactions
                data_cache['transactions'] = data_cache['transactions'][-1000:]
            else:
                data_cache['transactions'].append(data)
                data_cache['transactions'] = data_cache['transactions'][-1000:]
        elif update_type == 'channels':
            # Update channel balances
            data_cache['channel_balances'].update(data)
        elif update_type == 'metrics':
            data_cache['metrics'] = data
        elif update_type == 'predictions':
            data_cache['predictions'] = data
        elif update_type == 'anomalies':
            # Append new anomalies
            if isinstance(data, list):
                data_cache['anomalies'].extend(data)
                data_cache['anomalies'] = data_cache['anomalies'][-100:]
            else:
                data_cache['anomalies'].append(data)
                data_cache['anomalies'] = data_cache['anomalies'][-100:]
        elif update_type == 'learning':
            data_cache['learning_metrics'] = data
    
    # Update timestamp
    last_updates[update_type] = datetime.now()
    
    # Create the message
    message = json.dumps({
        'type': update_type,
        'data': data,
        'timestamp': datetime.now().isoformat()
    })
    
    # Send to all clients subscribed to this type
    websockets_to_remove = set()
    
    for websocket in connected_clients[update_type]:
        try:
            await websocket.send(message)
        except websockets.exceptions.ConnectionClosed:
            websockets_to_remove.add(websocket)
    
    # Also send to clients subscribed to 'all'
    for websocket in connected_clients['all']:
        if websocket not in connected_clients[update_type]:  # Avoid duplicates
            try:
                await websocket.send(message)
            except websockets.exceptions.ConnectionClosed:
                websockets_to_remove.add(websocket)
    
    # Clean up closed connections
    for websocket in websockets_to_remove:
        await unregister(websocket)
    
    logger.info(f"Broadcast {update_type} update to {len(connected_clients[update_type]) + len(connected_clients['all'])} clients")

async def handle_client_message(websocket, message):
    """Handle incoming messages from clients"""
    try:
        data = json.loads(message)
        message_type = data.get('type', '')
        
        if message_type == 'ping':
            # Respond to ping with pong
            await websocket.send(json.dumps({
                'type': 'pong',
                'timestamp': datetime.now().isoformat()
            }))
        
        elif message_type == 'subscribe':
            # Subscribe to a specific data stream
            stream_type = data.get('stream', 'all')
            if stream_type in connected_clients:
                connected_clients[stream_type].add(websocket)
                logger.info(f"Client subscribed to {stream_type} stream")
                # Send initial data for the new subscription
                await send_initial_data(websocket, stream_type)
        
        elif message_type == 'unsubscribe':
            # Unsubscribe from a specific data stream
            stream_type = data.get('stream', 'all')
            if stream_type in connected_clients and websocket in connected_clients[stream_type]:
                connected_clients[stream_type].remove(websocket)
                logger.info(f"Client unsubscribed from {stream_type} stream")
        
        elif message_type == 'get_history':
            # Request historical data
            stream_type = data.get('stream', 'all')
            limit = data.get('limit', 100)
            
            if stream_type == 'transactions':
                with data_lock:
                    await websocket.send(json.dumps({
                        'type': 'transaction_history',
                        'data': data_cache['transactions'][-limit:],
                        'timestamp': datetime.now().isoformat()
                    }))
            
            elif stream_type == 'anomalies':
                with data_lock:
                    await websocket.send(json.dumps({
                        'type': 'anomaly_history',
                        'data': data_cache['anomalies'][-limit:],
                        'timestamp': datetime.now().isoformat()
                    }))
    
    except json.JSONDecodeError:
        logger.error(f"Received invalid JSON: {message[:100]}...")
    except Exception as e:
        logger.error(f"Error handling client message: {str(e)}")

async def websocket_handler(websocket, path):
    """Handle WebSocket connections"""
    await register(websocket, path)
    try:
        async for message in websocket:
            await handle_client_message(websocket, message)
    except Exception as e:
        logger.error(f"Error in client connection: {str(e)}")
    finally:
        await unregister(websocket)

async def start_server(host, port):
    """Start the WebSocket server"""
    server = await websockets.serve(
        websocket_handler,
        host,
        port,
        ping_interval=30,
        ping_timeout=10
    )
    
    logger.info(f"Real-time data server started on {host}:{port}")
    
    # Start the heartbeat task
    asyncio.create_task(send_heartbeats())
    
    # Keep the server running
    await asyncio.Future()

async def send_heartbeats():
    """Send periodic heartbeats to all clients"""
    while True:
        if connected_clients['all']:
            heartbeat = json.dumps({
                'type': 'heartbeat',
                'timestamp': datetime.now().isoformat(),
                'server_time': datetime.now().isoformat()
            })
            
            websockets_to_remove = set()
            
            for websocket in connected_clients['all']:
                try:
                    await websocket.send(heartbeat)
                except websockets.exceptions.ConnectionClosed:
                    websockets_to_remove.add(websocket)
            
            # Clean up closed connections
            for websocket in websockets_to_remove:
                await unregister(websocket)
        
        await asyncio.sleep(15)  # Send heartbeat every 15 seconds

# HTTP API integration functions
def update_network_state(network_state):
    """Update the network state data and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('network', network_state),
        asyncio.get_event_loop()
    )

def update_transaction(transaction):
    """Update with a new transaction and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('transactions', transaction),
        asyncio.get_event_loop()
    )

def update_channel_balances(channel_data):
    """Update channel balances and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('channels', channel_data),
        asyncio.get_event_loop()
    )

def update_metrics(metrics_data):
    """Update performance metrics and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('metrics', metrics_data),
        asyncio.get_event_loop()
    )

def update_predictions(predictions_data):
    """Update model predictions and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('predictions', predictions_data),
        asyncio.get_event_loop()
    )

def update_anomalies(anomaly_data):
    """Update anomaly detections and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('anomalies', anomaly_data),
        asyncio.get_event_loop()
    )

def update_learning_metrics(learning_data):
    """Update learning metrics and broadcast to clients"""
    asyncio.run_coroutine_threadsafe(
        broadcast_update('learning', learning_data),
        asyncio.get_event_loop()
    )

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Real-time Data Server for Lightning Lens')
    parser.add_argument('--host', type=str, default='0.0.0.0',
                        help='Host to bind the WebSocket server to')
    parser.add_argument('--port', type=int, default=8769,
                        help='Port to run the WebSocket server on')
    return parser.parse_args()

def main():
    """Main function"""
    args = parse_args()
    
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    # Print startup message
    print(f"Starting Real-time Data Server on {args.host}:{args.port}")
    
    # Start the async event loop
    try:
        asyncio.run(start_server(args.host, args.port))
    except KeyboardInterrupt:
        logger.info("Server stopped by user")

if __name__ == "__main__":
    main()
