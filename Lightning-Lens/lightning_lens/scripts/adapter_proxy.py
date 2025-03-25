#!/usr/bin/env python3
"""
Feature Adapter Proxy for LightningLens

This script acts as a proxy between the simulation and the HTTP server,
transforming the data to match the expected format.
"""

import os
import sys
import json
import requests
from flask import Flask, request, jsonify, Response
import logging
from datetime import datetime
from flask_cors import CORS  # Import CORS
import time

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("adapter_proxy.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AdapterProxy")

app = Flask(__name__)
# Enable CORS for all routes with more specific settings
CORS(app, resources={r"/api/*": {"origins": "*", "supports_credentials": True}})

# The real HTTP server
REAL_SERVER = "http://localhost:5001/api/update"

# Store latest data for dashboard
latest_data = {
    "nodes": [
        {
            "id": "lnd-alice",
            "alias": "Alice",
            "local_balance": 580000,
            "capacity": 1000000,
            "num_channels": 3,
            "is_online": True,
        },
        {
            "id": "lnd-bob",
            "alias": "Bob",
            "local_balance": 620000,
            "capacity": 1000000,
            "num_channels": 4,
            "is_online": True,
        },
        {
            "id": "lnd-carol",
            "alias": "Carol",
            "local_balance": 450000,
            "capacity": 800000,
            "num_channels": 3,
            "is_online": True,
        },
        {
            "id": "lnd-dave",
            "alias": "Dave",
            "local_balance": 390000,
            "capacity": 700000,
            "num_channels": 2,
            "is_online": True,
        },
        {
            "id": "lnd-eve",
            "alias": "Eve",
            "local_balance": 510000,
            "capacity": 900000,
            "num_channels": 3,
            "is_online": True,
        },
    ],
    "channels": [
        {
            "node1_pub": "lnd-alice",
            "node2_pub": "lnd-bob",
            "capacity": 300000,
            "local_balance": 150000,
            "remote_balance": 150000,
        },
        {
            "node1_pub": "lnd-alice",
            "node2_pub": "lnd-carol",
            "capacity": 200000,
            "local_balance": 80000,
            "remote_balance": 120000,
        },
        {
            "node1_pub": "lnd-bob",
            "node2_pub": "lnd-carol",
            "capacity": 250000,
            "local_balance": 140000,
            "remote_balance": 110000,
        },
        {
            "node1_pub": "lnd-bob",
            "node2_pub": "lnd-dave",
            "capacity": 150000,
            "local_balance": 90000,
            "remote_balance": 60000,
        },
        {
            "node1_pub": "lnd-carol",
            "node2_pub": "lnd-dave",
            "capacity": 200000,
            "local_balance": 100000,
            "remote_balance": 100000,
        },
        {
            "node1_pub": "lnd-alice",
            "node2_pub": "lnd-eve",
            "capacity": 220000,
            "local_balance": 120000,
            "remote_balance": 100000,
        },
        {
            "node1_pub": "lnd-bob",
            "node2_pub": "lnd-eve",
            "capacity": 180000,
            "local_balance": 80000,
            "remote_balance": 100000,
        },
    ],
    "transactions": [
        {
            "payment_hash": "tx1",
            "creation_date": int(datetime.now().timestamp()) - 300,
            "sender": "lnd-alice",
            "receiver": "lnd-bob",
            "value": 50000,
            "fee": 10,
            "status": "SUCCEEDED",
            "memo": "Payment for services",
        },
        {
            "payment_hash": "tx2",
            "creation_date": int(datetime.now().timestamp()) - 600,
            "sender": "lnd-carol",
            "receiver": "lnd-alice",
            "value": 25000,
            "fee": 5,
            "status": "SUCCEEDED",
            "memo": "Monthly subscription",
        },
        {
            "payment_hash": "tx3",
            "creation_date": int(datetime.now().timestamp()) - 900,
            "sender": "lnd-bob",
            "receiver": "lnd-dave",
            "value": 15000,
            "fee": 3,
            "status": "FAILED",
            "memo": "Failed payment",
        },
    ],
    "model_accuracy": 85.5,
    "rebalance_operations": [],
    "optimizations": []
}

# Add path handling for data and config files
import os

# First try the absolute path to the root data directory
ROOT_DATA_DIR = '/media/shahazzad/new1/KOD/LIGHTNING-LENS/data'
ROOT_CONFIG_DIR = '/media/shahazzad/new1/KOD/LIGHTNING-LENS/configs'

# Function to find a file or directory in data locations
def get_data_path(relative_path):
    # Try root location first
    root_path = os.path.join(ROOT_DATA_DIR, relative_path)
    if os.path.exists(root_path):
        return root_path
        
    # Fall back to package path if it exists
    package_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'data', relative_path
    )
    if os.path.exists(package_path):
        return package_path
        
    # Default to root path even if it doesn't exist yet
    return root_path

# Function to find config files
def get_config_path(config_file):
    # Try root location first
    root_config = os.path.join(ROOT_CONFIG_DIR, config_file)
    if os.path.exists(root_config):
        return root_config
        
    # Fall back to package path
    package_config = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'configs', config_file
    )
    if os.path.exists(package_config):
        return package_config
        
    return root_config

def adapt_channel_state(channel_data):
    """
    Adapt channel state data to match the format expected by the model
    
    Args:
        channel_data: Dictionary containing channel state information
        
    Returns:
        Dictionary with adapted features
    """
    # Create a new dictionary with the required format
    adapted_data = {
        "event_type": channel_data.get("event_type", "channel_state"),
        "channel_id": channel_data.get("channel_id", None),
        "capacity": channel_data.get("capacity", 0),
        "local_balance": channel_data.get("local_balance", 0),
        "remote_balance": channel_data.get("remote_balance", 0),
        "balance_ratio": channel_data.get("balance_ratio", 0.0),
        "tx_count": channel_data.get("tx_count", 0),
        "success_rate": channel_data.get("success_rate", 1.0),
        "avg_amount": channel_data.get("avg_amount", 0)
    }
    
    # Generate channel_id if missing
    if not adapted_data["channel_id"] and "node" in channel_data and "remote_pubkey" in channel_data:
        adapted_data["channel_id"] = f"{channel_data['node']}_{channel_data['remote_pubkey'][:8]}"
    
    # Calculate balance_ratio if missing
    if adapted_data["balance_ratio"] == 0.0 and adapted_data["capacity"] > 0 and adapted_data["local_balance"] > 0:
        adapted_data["balance_ratio"] = float(adapted_data["local_balance"]) / float(adapted_data["capacity"])
    
    # Remove any fields that aren't in our expected format
    for key in list(adapted_data.keys()):
        if key not in ["event_type", "channel_id", "capacity", "local_balance", "remote_balance", 
                      "balance_ratio", "tx_count", "success_rate", "avg_amount"]:
            del adapted_data[key]
    
    # Log the transformation
    logger.info(f"Transformed data: {json.dumps(adapted_data)}")
    
    return adapted_data

@app.route('/api/update', methods=['POST'])
def proxy_update():
    """Proxy update endpoint for simulation data"""
    try:
        data = request.json
        logger.info(f"Received {data.get('event_type')} update: {json.dumps(data)}")
        
        # Transform the data
        transformed_data = adapt_channel_state(data)
        logger.info(f"Transformed data: {json.dumps(transformed_data)}")
        
        # Forward to HTTP server with retry logic
        max_retries = 3
        retry_delay = 1  # seconds
        
        for attempt in range(max_retries):
            try:
                # Use requests.post with timeout
                response = requests.post(
                    "http://localhost:5002/api/update",
                    json=transformed_data,
                    timeout=5
                )
                
                if response.status_code == 200:
                    logger.info("Successfully forwarded update to HTTP server")
                    return jsonify({"status": "success", "message": "Update processed"})
                else:
                    logger.warning(f"HTTP server returned status {response.status_code}: {response.text}")
                    
            except requests.exceptions.ConnectionError as e:
                logger.warning(f"Connection error on attempt {attempt+1}/{max_retries}: {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
            except Exception as e:
                logger.error(f"Error processing request: {str(e)}")
                break
                
        # If we get here, all retries failed
        return jsonify({"status": "error", "message": "Failed to forward update after retries"}), 500
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/dashboard', methods=['GET', 'OPTIONS'])
def get_dashboard_data():
    """Return dashboard data for the frontend"""
    try:
        logger.info("Dashboard data requested")
        
        # Transform the data to match exactly what the frontend expects
        transformed_nodes = []
        for node in latest_data["nodes"]:
            transformed_nodes.append({
                "id": node["id"],
                "alias": node["alias"],
                "balance": node["local_balance"],  # Frontend expects 'balance', not 'local_balance'
                "capacity": node["capacity"],
                "connections": node["num_channels"],  # Frontend expects 'connections', not 'num_channels'
                "online": node["is_online"]  # Frontend expects 'online', not 'is_online'
            })
        
        transformed_channels = []
        for channel in latest_data["channels"]:
            # Find source and target nodes
            source_node = next((n for n in transformed_nodes if n["id"] == channel["node1_pub"]), None)
            target_node = next((n for n in transformed_nodes if n["id"] == channel["node2_pub"]), None)
            
            if not source_node:
                source_node = {"id": channel["node1_pub"], "alias": channel["node1_pub"].replace("lnd-", "")}
            
            if not target_node:
                target_node = {"id": channel["node2_pub"], "alias": channel["node2_pub"].replace("lnd-", "")}
            
            transformed_channels.append({
                "source": source_node,
                "target": target_node,
                "capacity": channel["capacity"],
                "localBalance": channel["local_balance"],  # Frontend expects camelCase
                "remoteBalance": channel["remote_balance"]  # Frontend expects camelCase
            })
        
        transformed_transactions = []
        for tx in latest_data["transactions"]:
            transformed_transactions.append({
                "id": tx["payment_hash"],
                "timestamp": datetime.fromtimestamp(tx["creation_date"]).strftime("%H:%M:%S"),
                "sender": tx["sender"],
                "receiver": tx["receiver"],
                "amount": tx["value"],
                "fee": tx["fee"],
                "success": tx["status"] == "SUCCEEDED",  # Frontend expects boolean
                "description": tx["memo"]
            })
        
        # Calculate stats
        total_transactions = len(transformed_transactions)
        successful_transactions = sum(1 for tx in transformed_transactions if tx["success"])
        success_rate = (successful_transactions / total_transactions * 100) if total_transactions > 0 else 0
        
        avg_channel_capacity = sum(ch["capacity"] for ch in transformed_channels) / len(transformed_channels) if transformed_channels else 0
        avg_channel_balance = sum(ch["localBalance"] for ch in transformed_channels) / len(transformed_channels) if transformed_channels else 0
        
        # Create the dashboard data in the exact format expected by the frontend
        dashboard_data = {
            "nodes": transformed_nodes,
            "channels": transformed_channels,
            "transactions": transformed_transactions,
            "stats": {
                "totalTransactions": total_transactions,
                "successRate": success_rate,
                "totalRebalanceOperations": len(latest_data.get("rebalance_operations", [])),
                "averageChannelCapacity": avg_channel_capacity,
                "averageChannelBalance": avg_channel_balance,
                "totalNodes": len(transformed_nodes),
                "totalChannels": len(transformed_channels),
                "modelAccuracy": latest_data.get("model_accuracy", 85),
                "totalOptimizations": len(latest_data.get("optimizations", []))
            }
        }
        
        # Generate additional data expected by the frontend
        times = ["12:00", "12:05", "12:10", "12:15", "12:20", "12:25", "12:30", "12:35", "12:40", "12:45", "12:50", "12:55", "13:00"]
        time_series_data = []
        
        for time in times:
            time_series_data.append({
                "time": time,
                "transactions": 5 + (hash(time) % 15),
                "successRate": 85 + (hash(time) % 15),
                "avgAmount": 2000 + (hash(time) % 3000),
                "modelAccuracy": 75 + (hash(time) % 20)
            })
        
        dashboard_data["timeSeriesData"] = time_series_data
        
        # Generate channel balance data
        channel_balance_data = []
        for channel in transformed_channels:
            total_capacity = channel["capacity"]
            local_balance_percent = (channel["localBalance"] / total_capacity) * 100 if total_capacity > 0 else 0
            remote_balance_percent = (channel["remoteBalance"] / total_capacity) * 100 if total_capacity > 0 else 0
            
            channel_balance_data.append({
                "name": f"{channel['source']['id']} - {channel['target']['id']}",
                "capacity": channel["capacity"],
                "localBalance": channel["localBalance"],
                "remoteBalance": channel["remoteBalance"],
                "localPercent": local_balance_percent,
                "remotePercent": remote_balance_percent
            })
        
        dashboard_data["channelBalanceData"] = channel_balance_data
        
        # Generate AI prediction data
        ai_prediction_data = [
            {
                "channel": "lnd-alice - lnd-bob",
                "currentBalance": 150000,
                "recommendedBalance": 180000,
                "confidence": 0.85
            },
            {
                "channel": "lnd-bob - lnd-carol",
                "currentBalance": 140000,
                "recommendedBalance": 125000,
                "confidence": 0.78
            },
            {
                "channel": "lnd-carol - lnd-dave",
                "currentBalance": 100000,
                "recommendedBalance": 120000,
                "confidence": 0.92
            },
            {
                "channel": "lnd-alice - lnd-eve",
                "currentBalance": 120000,
                "recommendedBalance": 110000,
                "confidence": 0.65
            }
        ]
        
        dashboard_data["aiPredictionData"] = ai_prediction_data
        
        # Calculate network health
        success_rate_score = (dashboard_data["stats"]["successRate"] / 100) * 40
        channel_balance_score = (dashboard_data["stats"]["averageChannelBalance"] / dashboard_data["stats"]["averageChannelCapacity"]) * 30 if dashboard_data["stats"]["averageChannelCapacity"] > 0 else 0
        model_accuracy_score = (dashboard_data["stats"]["modelAccuracy"] / 100) * 30
        
        total_score = success_rate_score + channel_balance_score + model_accuracy_score
        
        category = "critical"
        if total_score >= 80:
            category = "excellent"
        elif total_score >= 60:
            category = "good"
        elif total_score >= 40:
            category = "fair"
        elif total_score >= 20:
            category = "poor"
        
        dashboard_data["networkHealth"] = {
            "score": total_score,
            "category": category
        }
        
        # Log the data structure being returned
        logger.info(f"Dashboard data structure: {json.dumps({k: type(v).__name__ for k, v in dashboard_data.items()})}")
        logger.info(f"Returning dashboard data with {len(dashboard_data['nodes'])} nodes, {len(dashboard_data['channels'])} channels, and {len(dashboard_data['transactions'])} transactions")
        
        # Add explicit CORS headers
        response = jsonify(dashboard_data)
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        
        return response
    except Exception as e:
        logger.error(f"Error getting dashboard data: {str(e)}")
        logger.exception("Detailed error:")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/suggestions', methods=['GET'])
def get_suggestions():
    """Return rebalancing suggestions for the frontend"""
    try:
        logger.info("Suggestions requested")
        # Return empty suggestions for now
        return jsonify({
            "status": "success",
            "suggestions": []
        })
    except Exception as e:
        logger.error(f"Error getting suggestions: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({"status": "ok", "message": "Adapter proxy is running"})

def save_transformed_data(data, dataset_type="raw"):
    """Save transformed data to disk"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = get_data_path(f'{dataset_type}/transformed_data_{timestamp}.json')
    
    # Make sure the directory exists
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    with open(filename, 'w') as f:
        json.dump(data, f)
    logger.info(f"Saved transformed data to {filename}")
    
    return filename

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Lightning Lens Feature Adapter Proxy")
    parser.add_argument("--port", type=int, default=5050, help="Port to run the server on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to run the server on")
    
    args = parser.parse_args()
    
    logger.info(f"Starting adapter proxy on {args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=True) 