#!/bin/bash
# fix_permissions.sh - Fix permissions for Lightning-Lens data directories

echo "Fixing permissions for Lightning-Lens data directories..."

# Create data directories if they don't exist
mkdir -p data/models data/predictions data/processed data/simulation data/visualizations data/raw

# Take ownership of the directories (assuming your username is shahazzad)
sudo chown -R $USER:$USER data/

# Set proper permissions
chmod -R 755 data/

echo "Permissions fixed for all data directories."
echo "You can now run ./start.sh to start the services." 