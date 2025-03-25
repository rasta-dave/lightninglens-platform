#!/usr/bin/env python3
"""
Test WebSocket Client for Lightning Lens

This script connects to the simple suggestions WebSocket service
and verifies the connection works correctly.
"""

import asyncio
import websockets
import json
import sys
import logging
import argparse
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("WSClient")

# Connection settings
DEFAULT_PORT = 8767
DEFAULT_HOSTNAME = "localhost"

async def test_websocket(hostname, port, timeout=5, keep_alive=False):
    """Test the WebSocket connection"""
    url = f"ws://{hostname}:{port}"
    logger.info(f"Connecting to {url}...")
    
    try:
        # Connect with timeout
        async with websockets.connect(url, open_timeout=timeout) as websocket:
            logger.info("Connected successfully!")
            
            # Send heartbeat
            await websocket.send(json.dumps({
                "type": "heartbeat",
                "timestamp": datetime.now().isoformat(),
                "client_id": "test-client"
            }))
            logger.info("Sent heartbeat message")
            
            # Receive response
            response = await asyncio.wait_for(websocket.recv(), timeout=timeout)
            data = json.loads(response)
            logger.info(f"Received response: {data.get('type')}")
            
            # Request suggestions
            await websocket.send(json.dumps({
                "type": "get_suggestions",
                "timestamp": datetime.now().isoformat()
            }))
            logger.info("Requested suggestions")
            
            # Receive suggestions
            response = await asyncio.wait_for(websocket.recv(), timeout=timeout)
            data = json.loads(response)
            logger.info(f"Received {len(data.get('suggestions', []))} suggestions")
            
            # If keep_alive, maintain connection and print messages
            if keep_alive:
                logger.info("Keeping connection alive. Press Ctrl+C to exit.")
                while True:
                    response = await websocket.recv()
                    data = json.loads(response)
                    logger.info(f"Received message of type: {data.get('type')}")
                    
                    # Send heartbeat every 10 seconds to keep connection alive
                    await asyncio.sleep(10)
                    await websocket.send(json.dumps({
                        "type": "heartbeat",
                        "timestamp": datetime.now().isoformat(),
                        "client_id": "test-client"
                    }))
                    
        logger.info("Connection closed gracefully")
        return True
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return False

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Test WebSocket Client for Lightning Lens')
    parser.add_argument('--host', type=str, default=DEFAULT_HOSTNAME,
                       help=f'Hostname to connect to (default: {DEFAULT_HOSTNAME})')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT,
                       help=f'Port to connect to (default: {DEFAULT_PORT})')
    parser.add_argument('--timeout', type=int, default=5,
                       help='Connection timeout in seconds (default: 5)')
    parser.add_argument('--keep-alive', action='store_true',
                       help='Keep the connection alive and print received messages')
    parser.add_argument('--debug', action='store_true',
                       help='Enable debug logging')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    
    # Set log level
    logging.getLogger("WSClient").setLevel(logging.DEBUG if args.debug else logging.INFO)
    
    # Run the test
    logger.info(f"Testing WebSocket connection to {args.host}:{args.port}")
    
    try:
        success = asyncio.run(test_websocket(
            hostname=args.host, 
            port=args.port, 
            timeout=args.timeout,
            keep_alive=args.keep_alive
        ))
        
        if success:
            logger.info("WebSocket connection test successful!")
            sys.exit(0)
        else:
            logger.error("WebSocket connection test failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
        sys.exit(0) 