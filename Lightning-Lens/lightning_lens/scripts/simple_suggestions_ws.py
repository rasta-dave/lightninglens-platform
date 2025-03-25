#!/usr/bin/env python3
"""
Simple Suggestions WebSocket for LightningLens

This script provides a minimal WebSocket endpoint that sends rebalancing suggestions.
"""

import asyncio
import json
import logging
import argparse
import signal
import sys
import os
from datetime import datetime
import websockets
import traceback
import uuid

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Set to DEBUG for more detailed logs
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SimpleSuggestionsWS")
logger.setLevel(logging.DEBUG)  # Ensure our logger is at DEBUG level

# Also log websockets library messages
logging.getLogger("websockets").setLevel(logging.DEBUG)
logging.getLogger("websockets.protocol").setLevel(logging.DEBUG)  # Log protocol details

# Store connected clients
connected = set()
statistics = {
    "connections_total": 0,
    "messages_received": 0,
    "messages_sent": 0,
    "errors": 0,
    "start_time": datetime.now().isoformat()
}

async def register(websocket):
    """Register a new client"""
    try:
        remote = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        logger.info(f"New client connecting from {remote}")
        
        connected.add(websocket)
        statistics["connections_total"] += 1
        logger.info(f"Client connected. Total clients: {len(connected)}")
        
        # Send an extremely basic welcome message
        # Further simplified to avoid client validation issues
        welcome_message = {
            "type": "connected",
            "success": True
        }
        logger.debug(f"Sending welcome message: {welcome_message}")
        await websocket.send(json.dumps(welcome_message))
        statistics["messages_sent"] += 1
    except Exception as e:
        logger.error(f"Error in register: {str(e)}")
        logger.debug(traceback.format_exc())
        statistics["errors"] += 1

async def unregister(websocket):
    """Unregister a client"""
    try:
        connected.remove(websocket)
    except KeyError:
        pass
    except Exception as e:
        logger.error(f"Error in unregister: {str(e)}")
    logger.info(f"Client disconnected. Remaining clients: {len(connected)}")

async def send_mock_suggestions(websocket):
    """Send mock suggestions to a client"""
    suggestions = [
        {
            "channel_id": "channel1",
            "current_ratio": 0.3,
            "optimal_ratio": 0.5,
            "adjustment_needed": 0.2,
            "significant": True
        },
        {
            "channel_id": "channel2",
            "current_ratio": 0.7,
            "optimal_ratio": 0.6,
            "adjustment_needed": -0.1,
            "significant": True
        },
        {
            "channel_id": "channel3",
            "current_ratio": 0.4,
            "optimal_ratio": 0.5,
            "adjustment_needed": 0.1,
            "significant": False
        }
    ]
    
    try:
        message = {
            "type": "suggestions",
            "suggestions": suggestions,
            "count": len(suggestions),
            "timestamp": datetime.now().isoformat()
        }
        logger.debug(f"Sending suggestions: {message}")
        await websocket.send(json.dumps(message))
        statistics["messages_sent"] += 1
        logger.info(f"Sent mock suggestions to client")
    except Exception as e:
        logger.error(f"Error sending suggestions: {str(e)}")
        logger.debug(traceback.format_exc())
        statistics["errors"] += 1

async def handle_message(websocket, message):
    """Handle incoming WebSocket messages"""
    try:
        statistics["messages_received"] += 1
        logger.debug(f"Received raw message: {message}")
        logger.debug(f"WebSocket state at message receipt: {websocket.state if hasattr(websocket, 'state') else 'N/A'}")
        
        # Try to parse the message
        try:
            data = json.loads(message)
            message_type = data.get("type", "unknown")
            logger.info(f"Received message: {message_type}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse message as JSON: {str(e)}")
            logger.debug(f"Raw message content: {message[:200]}..." if len(message) > 200 else message)
            # Continue with raw message handling
            return
        
        if message_type == "get_suggestions":
            await send_mock_suggestions(websocket)
        elif message_type == "heartbeat":
            # Respond to heartbeat messages
            response = {
                "type": "heartbeat_response",
                "timestamp": datetime.now().isoformat()
            }
            logger.debug(f"Sending heartbeat response: {response}")
            await websocket.send(json.dumps(response))
            statistics["messages_sent"] += 1
            logger.info("Received heartbeat, sent response")
        else:
            logger.warning(f"Received unknown message type: {message_type}")
            await websocket.send(json.dumps({
                "type": "error",
                "error": f"Unknown message type: {message_type}",
                "timestamp": datetime.now().isoformat()
            }))
            statistics["messages_sent"] += 1
            
    except json.JSONDecodeError:
        logger.error(f"Received invalid JSON: {message[:100]}...")
        statistics["errors"] += 1
        try:
            await websocket.send(json.dumps({
                "type": "error",
                "error": "Invalid JSON",
                "timestamp": datetime.now().isoformat()
            }))
            statistics["messages_sent"] += 1
        except Exception:
            pass
    except Exception as e:
        logger.error(f"Error handling message: {str(e)}")
        logger.debug(traceback.format_exc())
        statistics["errors"] += 1

async def suggestions_handler(websocket, path):
    """Handle WebSocket connections for suggestions."""
    try:
        # Get client info
        remote = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        logger.info(f"Client connected from {remote}")
        
        # Log connection details
        logger.debug(f"WebSocket connection details - Path: {path}, Headers: {websocket.request_headers if hasattr(websocket, 'request_headers') else 'N/A'}")
        logger.debug(f"WebSocket state: {websocket.state if hasattr(websocket, 'state') else 'N/A'}")
        
        # Register client
        connected.add(websocket)
        statistics["connections_total"] += 1
        logger.info(f"Client connected. Total clients: {len(connected)}")
        
        # Send ultra-minimal welcome message to ensure client acceptance
        # Use the absolute minimum format to avoid client validation issues
        welcome = {
            "type": "connected",
            "success": True
        }
        
        logger.debug(f"Sending welcome message: {welcome}")
        try:
            await websocket.send(json.dumps(welcome))
            logger.debug("Welcome message sent successfully")
            statistics["messages_sent"] += 1
        except Exception as e:
            logger.error(f"Error sending welcome message: {str(e)}")
            logger.debug(traceback.format_exc())
        
        # Main message loop
        async for message in websocket:
            try:
                await handle_message(websocket, message)
            except websockets.exceptions.ConnectionClosed as e:
                logger.info(f"Connection closed: code={e.code}, reason={e.reason}")
                break
    except Exception as e:
        logger.error(f"Fatal error in suggestions_handler: {str(e)}")
        logger.debug(traceback.format_exc())
        statistics["errors"] += 1
    finally:
        # Make sure to remove client on disconnect
        try:
            connected.remove(websocket)
        except KeyError:
            logger.debug("Client not found in connected set during disconnect")
            pass
        except Exception as e:
            logger.error(f"Error removing client from connected set: {str(e)}")
            logger.debug(traceback.format_exc())
        
        # Log disconnect details
        logger.info(f"Client disconnected. Remaining clients: {len(connected)}")
        logger.debug(f"WebSocket state at disconnect: {websocket.state if hasattr(websocket, 'state') else 'N/A'}")
        logger.debug(f"WebSocket close code: {websocket.close_code if hasattr(websocket, 'close_code') else 'N/A'}")
        logger.debug(f"WebSocket close reason: {websocket.close_reason if hasattr(websocket, 'close_reason') else 'N/A'}")

async def periodic_suggestions_broadcast():
    """Periodically broadcast suggestions to all clients"""
    while True:
        try:
            if connected:
                suggestions = [
                    {
                        "channel_id": "channel1",
                        "current_ratio": 0.3,
                        "optimal_ratio": 0.5,
                        "adjustment_needed": 0.2,
                        "significant": True
                    },
                    {
                        "channel_id": "channel2",
                        "current_ratio": 0.7,
                        "optimal_ratio": 0.6,
                        "adjustment_needed": -0.1,
                        "significant": True
                    },
                    {
                        "channel_id": "channel3",
                        "current_ratio": 0.4,
                        "optimal_ratio": 0.5,
                        "adjustment_needed": 0.1,
                        "significant": False
                    }
                ]
                
                message = json.dumps({
                    "type": "suggestions",
                    "suggestions": suggestions,
                    "count": len(suggestions),
                    "timestamp": datetime.now().isoformat()
                })
                
                disconnected = set()
                for client in connected:
                    try:
                        await client.send(message)
                        statistics["messages_sent"] += 1
                    except websockets.exceptions.ConnectionClosed:
                        # Mark client for removal
                        disconnected.add(client)
                    except Exception as e:
                        logger.error(f"Error sending to client: {str(e)}")
                        statistics["errors"] += 1
                        disconnected.add(client)
                
                # Remove disconnected clients
                for client in disconnected:
                    try:
                        connected.remove(client)
                    except KeyError:
                        pass
                
                if disconnected:
                    logger.info(f"Removed {len(disconnected)} disconnected clients. Remaining: {len(connected)}")
                else:
                    logger.info(f"Broadcast suggestions to {len(connected)} clients")
        except Exception as e:
            logger.error(f"Error in periodic_suggestions_broadcast: {str(e)}")
            logger.debug(traceback.format_exc())
        
        await asyncio.sleep(30)  # Send updates every 30 seconds

async def health_check():
    """Periodically log health information"""
    while True:
        try:
            logger.info(f"Health: {len(connected)} clients connected, " +
                       f"total: {statistics['connections_total']}, " +
                       f"msgs received: {statistics['messages_received']}, " +
                       f"msgs sent: {statistics['messages_sent']}, " +
                       f"errors: {statistics['errors']}")
        except Exception as e:
            logger.error(f"Error in health_check: {str(e)}")
        
        await asyncio.sleep(60)  # Log health info every minute

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Simple Suggestions WebSocket Server')
    parser.add_argument('--port', type=int, default=8767, help='Port to listen on')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--debug', action='store_true', 
                        help='Enable debug logging (shorthand for --log-level DEBUG)')
    parser.add_argument('--broadcast-interval', type=int, default=60,
                        help='Interval for broadcasting suggestions in seconds (0 to disable)')
    parser.add_argument('--log-level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
                        default='INFO', help='Set the logging level')
    return parser.parse_args()

async def main():
    """Main entry point for the WebSocket server."""
    
    # Parse command-line arguments
    args = parse_args()
    
    # Set log level
    logging.getLogger('SimpleSuggestionsWS').setLevel(
        getattr(logging, args.log_level)
    )
    logging.getLogger('websockets').setLevel(
        getattr(logging, args.log_level)
    )
    
    # Get base directory for static files
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Get host and port
    host = args.host
    port = args.port
    
    # Log startup info
    print(f"Starting Simple Suggestions WebSocket server on {host}:{port}")
    logger.info(f"Starting WebSocket server on {host}:{port} with websockets {websockets.__version__}")
    
    # Initialize statistics
    statistics["start_time"] = datetime.now()
    statistics["version"] = "2.0.0"  # TODO: use version from package
    
    # Create stop condition
    stop = asyncio.Future()
    
    # Setup signal handlers for clean shutdown
    loop = asyncio.get_running_loop()
    for signal_name in ['SIGINT', 'SIGTERM']:
        if hasattr(signal, signal_name):
            loop.add_signal_handler(
                getattr(signal, signal_name),
                lambda: stop.set_result(None)
            )
    
    # Log allowed origins if in debug mode
    if args.log_level == 'DEBUG':
        origins = [
            'http://localhost:8000',
            'http://localhost:3000',
            'http://127.0.0.1:8000',
            'http://127.0.0.1:3000',
            'http://localhost:8001',
            'http://127.0.0.1:8001',
            'http://localhost:8889',  # Added for our test client
            'http://127.0.0.1:8889',  # Added for our test client
            'file://',
            None
        ]
        logger.info(f"Configured allowed origins: {origins}")
    
    # Start the server with proper settings for websockets 15.0.1
    try:
        # Create a wrapper handler that ensures path parameter is properly handled
        async def handler_with_path(websocket):
            """Wrapper to ensure path parameter is properly passed"""
            path = websocket.path if hasattr(websocket, 'path') else '/'
            await suggestions_handler(websocket, path)
        
        # Create the server with only supported parameters for 15.0.1
        server = await websockets.serve(
            handler_with_path,  # Use our wrapper function that handles path properly
            host,
            port,
            ping_interval=30,      # Send ping every 30 seconds
            ping_timeout=10,       # Consider connection lost after 10 seconds with no pong
            max_size=None,         # No message size limit
            max_queue=32,          # Limit message queue
            close_timeout=5        # Shorter close timeout for faster debugging
        )
        
        # Log server configuration
        logger.debug(f"WebSocket server configuration: ping_interval={30}s, ping_timeout={10}s, close_timeout={5}s")
        
        logger.info(f"WebSocket server started successfully on {host}:{port}")
        logger.info("Ready to accept connections")
        
        # Start the periodic tasks
        broadcast_task = None
        health_task = None
        
        if args.broadcast_interval > 0:
            broadcast_task = asyncio.create_task(
                periodic_suggestions_broadcast()
            )
            logger.info(f"Starting periodic broadcast every {args.broadcast_interval} seconds")
        
        # Always start health monitoring
        health_task = asyncio.create_task(health_check())
        logger.info("Starting health monitoring")
        
        # Wait until stopped
        await stop
        logger.info("Stop signal received, shutting down...")
        
        # Cancel periodic tasks
        for task in [t for t in [broadcast_task, health_task] if t]:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        # Close server
        server.close()
        await server.wait_closed()
        
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        logger.debug(traceback.format_exc())
    
    logger.info("Server stopped gracefully")

if __name__ == "__main__":
    # Start the async loop
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Server stopped by keyboard interrupt")
    except Exception as e:
        logger.error(f"Error starting server: {str(e)}")
        logger.debug(traceback.format_exc())
        sys.exit(1) 