#!/usr/bin/env python3
"""
Simple WebSocket test client for Lightning Lens
"""

import asyncio
import websockets
import json
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("WSTestClient")

async def test_connection():
    """Connect to the WebSocket server and log messages"""
    uri = "ws://localhost:8767"
    logger.info(f"Connecting to {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            logger.info("Connection established")
            
            # Expect a welcome message
            welcome = await websocket.recv()
            logger.info(f"Welcome message: {welcome}")
            welcome_data = json.loads(welcome)
            logger.info(f"Message type: {welcome_data.get('type')}")
            logger.info(f"Success flag: {welcome_data.get('success')}")
            
            # Send a heartbeat
            heartbeat = {
                "type": "heartbeat",
                "timestamp": "2025-03-20T20:30:00.000Z"
            }
            logger.info(f"Sending heartbeat: {json.dumps(heartbeat)}")
            await websocket.send(json.dumps(heartbeat))
            
            # Get heartbeat response
            response = await websocket.recv()
            logger.info(f"Heartbeat response: {response}")
            
            # Request suggestions
            request = {
                "type": "get_suggestions",
                "timestamp": "2025-03-20T20:30:01.000Z"
            }
            logger.info(f"Requesting suggestions: {json.dumps(request)}")
            await websocket.send(json.dumps(request))
            
            # Get suggestions response
            suggestions = await websocket.recv()
            logger.info(f"Suggestions response: {suggestions}")
            
            # Log success and close connection
            logger.info("Test completed successfully")
    except Exception as e:
        logger.error(f"Error in test connection: {str(e)}")
        return False
    
    return True

if __name__ == "__main__":
    success = asyncio.run(test_connection())
    sys.exit(0 if success else 1) 