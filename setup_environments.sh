#!/bin/bash
# Setup script for Lightning Lens Platform
# This script sets up virtual environments for both components and fixes import issues

# Don't exit on error, we want to handle errors gracefully
set +e

echo "Setting up Lightning Lens Platform environments..."

# Create and set up Lightning-Lens environment
echo "Setting up Lightning-Lens environment..."
cd Lightning-Lens/lightning_lens

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment for Lightning-Lens..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Lightning-Lens dependencies..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "Warning: Some dependencies could not be installed. Continuing anyway..."
fi

# Create a .pth file to add the project root to Python's path
echo "Setting up Python path for imports..."
SITE_PACKAGES_DIR=$(python -c "import site; print(site.getsitepackages()[0])")
PROJECT_ROOT=$(cd ../.. && pwd)
LIGHTNING_LENS_ROOT=$(pwd)

echo "Creating .pth file in $SITE_PACKAGES_DIR"
echo "$PROJECT_ROOT" > "$SITE_PACKAGES_DIR/lightning_lens_project.pth"
echo "$LIGHTNING_LENS_ROOT" >> "$SITE_PACKAGES_DIR/lightning_lens_project.pth"

# Create a simple script to set PYTHONPATH when activating the environment
echo "Creating script to set PYTHONPATH on activation..."
ACTIVATE_SCRIPT="venv/bin/activate"
if grep -q "PYTHONPATH" "$ACTIVATE_SCRIPT"; then
    echo "PYTHONPATH already set in activation script"
else
    echo "Adding PYTHONPATH to activation script"
    cat >> "$ACTIVATE_SCRIPT" << EOF

# Set PYTHONPATH for Lightning Lens
export PYTHONPATH="\$PYTHONPATH:$PROJECT_ROOT:$LIGHTNING_LENS_ROOT"
EOF
fi

echo "Lightning-Lens environment setup complete with PYTHONPATH configuration."

# Deactivate the virtual environment
deactivate

# Return to the root directory
cd ../..

# Create and set up Lightning-Simulation environment
echo "Setting up Lightning-Simulation environment..."
cd Lightning-Simulation/lightning-simulation

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment for Lightning-Simulation..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Lightning-Simulation dependencies..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "Warning: Some dependencies could not be installed. Continuing anyway..."
fi

# Deactivate the virtual environment
deactivate

# Return to the root directory
cd ../..

echo "Environment setup complete!"
echo ""
echo "To activate the Lightning-Lens environment:"
echo "  cd Lightning-Lens/lightning_lens"
echo "  source venv/bin/activate"
echo "  # PYTHONPATH will be automatically set when you activate the environment"
echo ""
echo "To activate the Lightning-Simulation environment:"
echo "  cd Lightning-Simulation/lightning-simulation"
echo "  source venv/bin/activate"
echo ""
echo "For more information, see the README.md file." 