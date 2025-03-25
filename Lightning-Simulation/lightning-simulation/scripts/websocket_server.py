#!/usr/bin/env python3
"""
WebSocket Server for Lightning Network Simulation

This script creates a WebSocket server that allows real-time
communication between the simulation and ML model.
"""

import asyncio
import websockets # type: ignore
import json
import time
import logging
from datetime import datetime
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('websocket_server.log')
    ]
)
logger = logging.getLogger('websocket_server')

# Store connected clients with their connection time
connected = {}
# Store network state
network_state = {
    "channels": {},
    "transactions": [],
    "last_update": None
}

# Define origins allowed to connect (for CORS)
def origin_allowed(origin):
    # Allow any origin - this is OK for development
    # For production, you might want to restrict this
    logger.info(f"Connection attempt from origin: {origin}")
    return True

async def register(websocket):
    """Register a new client"""
    client_id = id(websocket)
    connected[websocket] = {
        "connected_at": datetime.now().isoformat(),
        "client_id": client_id,
        "last_ping": datetime.now().timestamp(),
        "last_pong": datetime.now().timestamp(),
        "messages_received": 0,
        "messages_sent": 0
    }
    
    logger.info(f"Client {client_id} connected. Total clients: {len(connected)}")
    
    # Send current state to new client
    await websocket.send(json.dumps({
        "type": "state_update",
        "data": network_state
    }))
    
    # Send connection acknowledgment
    await websocket.send(json.dumps({
        "type": "connection_status",
        "data": {
            "status": "connected",
            "client_id": client_id,
            "server_time": datetime.now().isoformat(),
            "message": "Connection established successfully"
        }
    }))

async def unregister(websocket):
    """Unregister a client"""
    if websocket in connected:
        client_info = connected[websocket]
        client_id = client_info["client_id"]
        logger.info(f"Client {client_id} disconnected. Connection duration: {datetime.now().timestamp() - client_info['last_ping']} seconds")
        del connected[websocket]
        logger.info(f"Remaining clients: {len(connected)}")
    else:
        logger.warning(f"Attempted to unregister unknown client: {id(websocket)}")

async def broadcast_update(update):
    """Broadcast an update to all connected clients"""
    if not connected:
        return
        
    # Convert to JSON once to avoid repeated serialization
    json_message = json.dumps(update)
    
    # Create a list to track failed clients for removal
    failed_clients = []
    
    # Send to each client with individual error handling
    for client in connected:
        try:
            await client.send(json_message)
            connected[client]["messages_sent"] += 1
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {connected[client]['client_id']} connection closed during broadcast")
            failed_clients.append(client)
        except Exception as e:
            logger.error(f"Error broadcasting to client {connected[client]['client_id']}: {str(e)}")
            failed_clients.append(client)
    
    # Remove failed clients
    for client in failed_clients:
        if client in connected:
            await unregister(client)

async def handle_message(websocket, message):
    """Handle incoming messages"""
    if websocket not in connected:
        logger.warning(f"Received message from unregistered client: {id(websocket)}")
        return
        
    # Update client activity tracking
    client_info = connected[websocket]
    client_info["messages_received"] += 1
    client_id = client_info["client_id"]
    
    try:
        data = json.loads(message)
        
        # Check if we have a valid type
        if "type" not in data:
            logger.warning(f"Client {client_id}: Received message without type: {message[:100]}...")
            return
        
        # Handle heartbeat messages
        if data["type"] == "heartbeat":
            # Update last activity time
            client_info["last_pong"] = datetime.now().timestamp()
            # Send heartbeat response
            await websocket.send(json.dumps({
                "type": "heartbeat_response",
                "timestamp": datetime.now().isoformat()
            }))
            return
            
        # Handle regular messages
        logger.info(f"Client {client_id}: Received message type: {data['type']}")
            
        if data["type"] == "channel_update":
            # Update to handle the new data format
            if "channels" in data:
                network_state["channels"] = data["channels"]
            elif "data" in data:
                network_state["channels"] = data["data"]
            network_state["last_update"] = datetime.now().isoformat()
            # Broadcast to all clients
            await broadcast_update({
                "type": "channel_update",
                "data": network_state["channels"]
            })
        
        elif data["type"] == "transaction":
            # Update to handle the new data format
            transaction_data = data.get("transaction", data.get("data", {}))
            network_state["transactions"].append(transaction_data)
            # Keep only the last 100 transactions
            if len(network_state["transactions"]) > 100:
                network_state["transactions"] = network_state["transactions"][-100:]
            # Broadcast to all clients
            await broadcast_update({
                "type": "transaction",
                "data": transaction_data
            })
        
        elif data["type"] == "request_suggestions":
            # Handle requests for rebalancing suggestions
            # This is where your ML model would generate suggestions
            await websocket.send(json.dumps({
                "type": "rebalance_suggestions",
                "suggestions": []  # Empty list for now, would be filled by ML model
            }))
        
        elif data["type"] == "rebalance_suggestion":
            # Broadcast suggestion to all clients
            suggestion_data = data.get("suggestion", data.get("data", {}))
            await broadcast_update({
                "type": "rebalance_suggestion",
                "data": suggestion_data
            })
        
        elif data["type"] == "connection_test":
            # Respond to connection test requests
            await websocket.send(json.dumps({
                "type": "connection_test_response",
                "data": {
                    "received_at": datetime.now().isoformat(),
                    "echo_data": data.get("data", {})
                }
            }))

    except json.JSONDecodeError:
        logger.warning(f"Client {client_id}: Received invalid JSON: {message[:100]}...")
    except Exception as e:
        logger.error(f"Client {client_id}: Error handling message: {str(e)}")
        logger.error(f"Message was: {message[:100]}...")

async def heartbeat_monitor():
    """Monitor client connections and send periodic pings"""
    while True:
        current_time = datetime.now().timestamp()
        clients_to_remove = []
        
        for client, info in connected.items():
            try:
                # Check if client has been inactive for too long (30 seconds)
                if current_time - info["last_pong"] > 30:
                    logger.warning(f"Client {info['client_id']} inactive for too long, marking for removal")
                    clients_to_remove.append(client)
                    continue
                    
                # Send ping every 15 seconds if we haven't received a pong recently
                if current_time - info["last_ping"] > 15:
                    info["last_ping"] = current_time
                    # Send application-level ping
                    await client.send(json.dumps({
                        "type": "ping",
                        "timestamp": datetime.now().isoformat()
                    }))
                    logger.debug(f"Sent ping to client {info['client_id']}")
            except websockets.exceptions.ConnectionClosed:
                logger.info(f"Connection closed for client {info['client_id']} during heartbeat")
                clients_to_remove.append(client)
            except Exception as e:
                logger.error(f"Error in heartbeat for client {info['client_id']}: {str(e)}")
                clients_to_remove.append(client)
        
        # Remove disconnected clients
        for client in clients_to_remove:
            if client in connected:
                await unregister(client)
        
        # Wait before next heartbeat cycle
        await asyncio.sleep(5)

async def server(websocket, path=None):
    """Handle WebSocket connections
    
    The path parameter is optional to support different websockets library versions
    """
    client_ip = websocket.remote_address[0] if hasattr(websocket, 'remote_address') else 'unknown'
    logger.info(f"New connection from {client_ip}")
    
    await register(websocket)
    try:
        async for message in websocket:
            await handle_message(websocket, message)
    except websockets.exceptions.ConnectionClosedOK:
        logger.info(f"Client {connected.get(websocket, {}).get('client_id', 'unknown')} closed connection normally")
    except websockets.exceptions.ConnectionClosedError as e:
        logger.warning(f"Client {connected.get(websocket, {}).get('client_id', 'unknown')} connection closed with error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error with client {connected.get(websocket, {}).get('client_id', 'unknown')}: {str(e)}")
    finally:
        await unregister(websocket)

async def start_websocket_server():
    # Use port from command line argument or default to 8768
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8768, help='Port to run the WebSocket server on')
    args = parser.parse_args()
    port = args.port
    
    # Start the heartbeat monitor task
    asyncio.create_task(heartbeat_monitor())
    
    # Configure the WebSocket server with proper ping/pong settings
    return await websockets.serve(
        server, 
        "0.0.0.0", 
        port,
        ping_interval=20,  # Send WebSocket ping every 20 seconds
        ping_timeout=10,   # Wait 10 seconds for pong response
        max_size=10_485_760,  # 10MB max message size
        max_queue=32,      # Allow up to 32 messages to be queued
        origins=None,      # Allow all origins by passing None
        close_timeout=10   # Wait 10 seconds for graceful close
    )

if __name__ == "__main__":
    # Modern way to handle asyncio event loops
    async def main():
        # Parse command line arguments
        parser = argparse.ArgumentParser()
        parser.add_argument('--port', type=int, default=8768, help='Port to run the WebSocket server on')
        args = parser.parse_args()
        port = args.port
        
        # Set up signal handlers for graceful shutdown
        loop = asyncio.get_running_loop()
        for signal_name in ('SIGINT', 'SIGTERM'):
            try:
                loop.add_signal_handler(
                    getattr(signal, signal_name),
                    lambda: asyncio.create_task(shutdown(loop))
                )
            except (NotImplementedError, AttributeError):
                # Some systems may not support this
                pass
        
        server = await start_websocket_server()
        logger.info(f"WebSocket server started at ws://0.0.0.0:{port}")
        logger.info("Allowing connections from all origins (CORS enabled)")
        logger.info(f"Ping interval: 20s, Ping timeout: 10s")
        
        # Keep the server running
        await asyncio.Future()  # Run forever
    
    # Graceful shutdown function
    async def shutdown(loop):
        logger.info("Shutting down WebSocket server...")
        
        # Close all client connections
        close_tasks = []
        for client in list(connected.keys()):
            try:
                close_tasks.append(client.close(1001, "Server shutting down"))
            except:
                pass
        
        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)
            logger.info(f"Closed {len(close_tasks)} client connections")
        
        # Stop the event loop
        loop.stop()
    
    # Import signal module here to avoid issues if it's not available
    try:
        import signal
    except ImportError:
        logger.warning("Signal module not available, graceful shutdown may not work properly")
    
    # Run the async main function with cleaner exit
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("WebSocket server stopped by keyboard interrupt")
    except Exception as e:
        logger.error(f"WebSocket server crashed: {str(e)}")
    finally:
        logger.info("WebSocket server shutdown complete")