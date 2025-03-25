#!/usr/bin/env python3
"""
Simple WebSocket Client to test our WebSocket server

This script connects to the WebSocket server and sends a heartbeat message.
"""

import asyncio
import websockets
import json
import sys
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SimpleWSClient")

async def test_ws_connection(uri):
    """Test WebSocket connection to the given URI"""
    logger.info(f"Connecting to WebSocket server at {uri}")
    try:
        async with websockets.connect(uri) as websocket:
            logger.info("Connection established")
            
            # Wait for welcome message
            welcome = await websocket.recv()
            logger.info(f"Received welcome message: {welcome}")
            
            # Send heartbeat message
            heartbeat = {
                "type": "heartbeat",
                "timestamp": datetime.now().isoformat()
            }
            logger.info(f"Sending heartbeat: {heartbeat}")
            await websocket.send(json.dumps(heartbeat))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            logger.info(f"Received response: {response}")
            
            # Request suggestions
            get_suggestions = {
                "type": "get_suggestions",
                "timestamp": datetime.now().isoformat()
            }
            logger.info(f"Sending get_suggestions: {get_suggestions}")
            await websocket.send(json.dumps(get_suggestions))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            logger.info(f"Received suggestions: {response}")
            
            logger.info("Test completed successfully")
            
    except Exception as e:
        logger.error(f"Error in WebSocket connection: {str(e)}")
        return False
    
    return True

async def main():
    """Main function to run the WebSocket client test"""
    if len(sys.argv) > 1:
        uri = sys.argv[1]
    else:
        uri = "ws://localhost:8767"
    
    logger.info(f"Starting WebSocket client test to {uri}")
    
    success = await test_ws_connection(uri)
    if success:
        logger.info("WebSocket connection test passed")
        sys.exit(0)
    else:
        logger.error("WebSocket connection test failed")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Client stopped by keyboard interrupt") 