#!/bin/bash
# setup_base_path.sh - Creates a consistent path for the LIGHTNING-LENS project
# Run this script before starting any Lightning Lens services

# Define colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print step information
print_step() {
    echo -e "${BLUE}==== $1 ====${NC}"
}

# Function to print success message
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print warning message
print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

# Function to print error message
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_step "Lightning Lens Base Path Setup"
echo "This script will create a consistent path for the Lightning Lens project"

# Detect the current mount point by finding the LIGHTNING-LENS directory
CURRENT_PATH=$(pwd)

# Check if we're currently in the LIGHTNING-LENS directory
if [[ "$CURRENT_PATH" != *"/LIGHTNING-LENS"* ]]; then
    print_error "This script must be run from within the LIGHTNING-LENS directory"
    exit 1
fi

# Extract the base path (up to and including LIGHTNING-LENS)
BASE_PATH=$(echo "$CURRENT_PATH" | grep -o ".*LIGHTNING-LENS")
echo "Detected current path: $BASE_PATH"

# Create the config directory if it doesn't exist
mkdir -p "$BASE_PATH/configs"

# Create or update the environment config file
CONFIG_FILE="$BASE_PATH/configs/environment.env"
echo "# Lightning Lens Environment Configuration" > "$CONFIG_FILE"
echo "# Generated $(date)" >> "$CONFIG_FILE"
echo "" >> "$CONFIG_FILE"
echo "# Base path to the Lightning Lens project" >> "$CONFIG_FILE"
echo "LIGHTNING_LENS_PATH=\"$BASE_PATH\"" >> "$CONFIG_FILE"
echo "" >> "$CONFIG_FILE"
echo "# Data directory" >> "$CONFIG_FILE"
echo "LIGHTNING_LENS_DATA=\"$BASE_PATH/data\"" >> "$CONFIG_FILE"
echo "" >> "$CONFIG_FILE"
echo "# Configuration directory" >> "$CONFIG_FILE"
echo "LIGHTNING_LENS_CONFIG=\"$BASE_PATH/configs\"" >> "$CONFIG_FILE"

print_success "Created environment configuration at $CONFIG_FILE"

# Check if we have sudo access
if sudo -v 2>/dev/null; then
    # Create parent directory for symlink if it doesn't exist
    PARENT_DIR=$(dirname "$BASE_PATH")
    SYMLINK_PATH="/media/shahazzad/lightning-lens"
    
    echo "Creating symlink from $SYMLINK_PATH to $PARENT_DIR"
    
    # Remove existing symlink if it exists
    if [ -L "$SYMLINK_PATH" ]; then
        sudo rm "$SYMLINK_PATH"
    fi
    
    # Create the symlink
    sudo ln -sf "$PARENT_DIR" "$SYMLINK_PATH"
    
    if [ $? -eq 0 ]; then
        print_success "Created symlink at $SYMLINK_PATH"
        
        # Update the environment config file with the symlink path
        echo "" >> "$CONFIG_FILE"
        echo "# Symlink path (consistent across reboots)" >> "$CONFIG_FILE"
        echo "LIGHTNING_LENS_SYMLINK=\"$SYMLINK_PATH/$(basename "$BASE_PATH")\"" >> "$CONFIG_FILE"
        
        print_success "Updated environment configuration with symlink path"
    else
        print_error "Failed to create symlink. Check permissions."
    fi
else
    print_warning "No sudo access. Skipping symlink creation."
    print_warning "The path will still change on system reboots."
fi

# Create a helper script to load the environment
HELPER_SCRIPT="$BASE_PATH/load_environment.sh"
cat > "$HELPER_SCRIPT" << 'EOF'
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
EOF

chmod +x "$HELPER_SCRIPT"
print_success "Created environment loader script at $HELPER_SCRIPT"

print_step "Next Steps"
echo "1. To load the environment in your current shell:"
echo "   source ./load_environment.sh"
echo ""
echo "2. In your scripts, use the environment variables:"
echo "   LIGHTNING_LENS_PATH - Base path to the project"
echo "   LIGHTNING_LENS_DATA - Data directory"
echo "   LIGHTNING_LENS_CONFIG - Configuration directory"
echo ""
echo "3. For permanent setup, add symlink to /etc/fstab (requires sudo)"

print_success "Setup complete!" 