#!/bin/bash
# Source this file to load the Lightning Lens environment variables
# Usage: source ./load_environment.sh

# Detect the current path
CURRENT_DIR=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")

# Load the environment variables
if [ -f "$CURRENT_DIR/configs/environment.env" ]; then
    source "$CURRENT_DIR/configs/environment.env"
    echo "Lightning Lens environment loaded from $CURRENT_DIR/configs/environment.env"
    echo "Base path: $LIGHTNING_LENS_PATH"
else
    echo "Error: Environment configuration not found"
    return 1
fi

# Export the variables
export LIGHTNING_LENS_PATH
export LIGHTNING_LENS_DATA
export LIGHTNING_LENS_CONFIG
if [ -n "$LIGHTNING_LENS_SYMLINK" ]; then
    export LIGHTNING_LENS_SYMLINK
fi

# Add a helper function to get paths
lightning_lens_path() {
    local rel_path="$1"
    echo "$LIGHTNING_LENS_PATH/$rel_path"
}
