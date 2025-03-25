#!/usr/bin/env python3
"""
Enhanced WebSocket Test Client for Lightning Lens

This script provides a more detailed test client for debugging WebSocket connections,
with enhanced logging and connection diagnostics.
"""

import asyncio
import websockets
import json
import logging
import argparse
import time
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("EnhancedWSTest")

# Statistics
stats = {
    "connection_attempts": 0,
    "successful_connections": 0,
    "messages_sent": 0,
    "messages_received": 0,
    "errors": 0,
    "avg_connection_time_ms": 0,
    "last_close_code": None,
    "last_close_reason": None
}

async def test_connection(host, port, timeout=10, keep_alive=False, num_messages=3, delay_between_msgs=1):
    """Test WebSocket connection with detailed diagnostics"""
    url = f"ws://{host}:{port}"
    logger.info(f"Testing WebSocket connection to {url}")
    stats["connection_attempts"] += 1
    
    connection_start = time.time()
    connection_time_ms = 0
    
    try:
        # Connect with timeout
        logger.info(f"Connecting to {url}...")
        try:
            websocket = await asyncio.wait_for(
                websockets.connect(url), 
                timeout=timeout
            )
            connection_time_ms = int((time.time() - connection_start) * 1000)
            logger.info(f"Connected successfully in {connection_time_ms}ms!")
            stats["successful_connections"] += 1
            stats["avg_connection_time_ms"] = (
                (stats["avg_connection_time_ms"] * (stats["successful_connections"] - 1) + connection_time_ms) / 
                stats["successful_connections"]
            )
        except asyncio.TimeoutError:
            logger.error(f"Connection timeout after {timeout} seconds")
            stats["errors"] += 1
            return False
        
        # Log WebSocket details
        logger.debug(f"WebSocket details - State: {websocket.state if hasattr(websocket, 'state') else 'N/A'}")
        logger.debug(f"WebSocket protocol: {websocket.protocol if hasattr(websocket, 'protocol') else 'None'}")
        logger.debug(f"WebSocket subprotocols: {websocket.subprotocols if hasattr(websocket, 'subprotocols') else 'N/A'}")
        # Extensions might not be available in all websockets versions
        extensions = getattr(websocket, 'extensions', None)
        logger.debug(f"WebSocket extensions: {extensions if extensions else 'None'}")
        
        # Send heartbeat message
        heartbeat_msg = {
            "type": "heartbeat",
            "timestamp": datetime.now().isoformat(),
            "client_id": "enhanced-test-client"
        }
        logger.debug(f"Sending heartbeat message: {heartbeat_msg}")
        await websocket.send(json.dumps(heartbeat_msg))
        stats["messages_sent"] += 1
        logger.info("Sent heartbeat message")
        
        # Wait for response with timeout
        try:
            response = await asyncio.wait_for(websocket.recv(), timeout=timeout)
            stats["messages_received"] += 1
            
            try:
                response_data = json.loads(response)
                logger.info(f"Received response: {response_data.get('type', 'unknown')}")
                logger.debug(f"Full response: {response_data}")
            except json.JSONDecodeError:
                logger.warning(f"Received non-JSON response: {response[:100]}...")
        except asyncio.TimeoutError:
            logger.error(f"No response received within {timeout} seconds")
            stats["errors"] += 1
        
        # Send additional messages if requested
        if num_messages > 1:
            for i in range(1, num_messages):
                # Wait between messages
                await asyncio.sleep(delay_between_msgs)
                
                # Send get_suggestions message
                suggestions_msg = {
                    "type": "get_suggestions",
                    "timestamp": datetime.now().isoformat(),
                    "client_info": {
                        "client_id": "enhanced-test-client",
                        "test_sequence": i
                    }
                }
                logger.debug(f"Sending message {i}: {suggestions_msg}")
                await websocket.send(json.dumps(suggestions_msg))
                stats["messages_sent"] += 1
                logger.info(f"Sent message {i}")
                
                # Wait for response with timeout
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=timeout)
                    stats["messages_received"] += 1
                    
                    try:
                        response_data = json.loads(response)
                        logger.info(f"Received response to message {i}: {response_data.get('type', 'unknown')}")
                        
                        if response_data.get("type") == "suggestions":
                            num_suggestions = len(response_data.get("suggestions", []))
                            logger.info(f"Received {num_suggestions} suggestions")
                    except json.JSONDecodeError:
                        logger.warning(f"Received non-JSON response to message {i}: {response[:100]}...")
                except asyncio.TimeoutError:
                    logger.error(f"No response received for message {i} within {timeout} seconds")
                    stats["errors"] += 1
        
        # Keep connection alive if requested
        if keep_alive:
            logger.info("Keeping connection alive. Press Ctrl+C to exit.")
            try:
                while True:
                    await asyncio.sleep(5)
                    heartbeat_msg = {
                        "type": "heartbeat",
                        "timestamp": datetime.now().isoformat(),
                        "client_id": "enhanced-test-client-keepalive"
                    }
                    await websocket.send(json.dumps(heartbeat_msg))
                    stats["messages_sent"] += 1
                    logger.debug("Sent keepalive heartbeat")
                    
                    response = await asyncio.wait_for(websocket.recv(), timeout=timeout)
                    stats["messages_received"] += 1
                    logger.debug(f"Received keepalive response: {response[:100]}...")
            except KeyboardInterrupt:
                logger.info("Keyboard interrupt received, closing connection")
            except Exception as e:
                logger.error(f"Error during keepalive: {str(e)}")
                stats["errors"] += 1
        
        # Close connection gracefully
        logger.info("Closing connection gracefully...")
        await websocket.close()
        logger.info("Connection closed gracefully")
        return True
        
    except websockets.exceptions.ConnectionClosed as e:
        connection_time_ms = int((time.time() - connection_start) * 1000)
        stats["last_close_code"] = e.code
        stats["last_close_reason"] = e.reason
        logger.error(f"Connection closed unexpectedly after {connection_time_ms}ms. Code: {e.code}, Reason: {e.reason}")
        stats["errors"] += 1
        return False
    except Exception as e:
        connection_time_ms = int((time.time() - connection_start) * 1000)
        logger.error(f"Connection error after {connection_time_ms}ms: {str(e)}")
        stats["errors"] += 1
        return False

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="Enhanced WebSocket Test Client for Lightning Lens")
    parser.add_argument("--host", default="localhost", help="WebSocket server host")
    parser.add_argument("--port", type=int, default=8767, help="WebSocket server port")
    parser.add_argument("--timeout", type=int, default=10, help="Connection and response timeout in seconds")
    parser.add_argument("--keep-alive", action="store_true", help="Keep connection alive after test")
    parser.add_argument("--num-messages", type=int, default=3, help="Number of messages to send")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between messages in seconds")
    parser.add_argument("--repeat", type=int, default=1, help="Number of times to repeat the test")
    parser.add_argument("--interval", type=float, default=2.0, help="Interval between test repetitions in seconds")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    return parser.parse_args()

async def main():
    """Main entry point"""
    args = parse_args()
    
    # Set log level
    if args.debug:
        logger.setLevel(logging.DEBUG)
        logging.getLogger("websockets").setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.INFO)
        logging.getLogger("websockets").setLevel(logging.WARNING)
    
    # Print test configuration
    logger.info("Enhanced WebSocket Test Client")
    logger.info(f"Target: ws://{args.host}:{args.port}")
    logger.info(f"Configuration: timeout={args.timeout}s, messages={args.num_messages}, repeat={args.repeat}")
    
    # Run tests
    success_count = 0
    for i in range(args.repeat):
        if i > 0:
            logger.info(f"Waiting {args.interval} seconds before next test...")
            await asyncio.sleep(args.interval)
        
        logger.info(f"Starting test {i+1}/{args.repeat}")
        if await test_connection(
            args.host, 
            args.port, 
            args.timeout, 
            args.keep_alive,
            args.num_messages,
            args.delay
        ):
            success_count += 1
    
    # Print summary
    success_rate = (success_count / args.repeat) * 100 if args.repeat > 0 else 0
    logger.info("\n=== Test Summary ===")
    logger.info(f"Tests completed: {args.repeat}")
    logger.info(f"Successful connections: {success_count} ({success_rate:.1f}%)")
    logger.info(f"Connection attempts: {stats['connection_attempts']}")
    logger.info(f"Messages sent: {stats['messages_sent']}")
    logger.info(f"Messages received: {stats['messages_received']}")
    logger.info(f"Errors: {stats['errors']}")
    
    if stats["successful_connections"] > 0:
        logger.info(f"Average connection time: {stats['avg_connection_time_ms']:.1f}ms")
    
    if stats["last_close_code"]:
        logger.info(f"Last close code: {stats['last_close_code']}")
        logger.info(f"Last close reason: {stats['last_close_reason'] or 'None'}")
    
    return success_count == args.repeat

if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Unhandled error: {str(e)}")
        sys.exit(1)
