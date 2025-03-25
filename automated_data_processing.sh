#!/bin/bash
# automated_data_processing.sh - Automated data processing pipeline for Lightning Lens
# This script integrates with the existing workflow to automatically process data after simulation

# Define the base directory
BASE_DIR="/media/shahazzad/new3/KOD/LIGHTNING-LENS"
LOGS_DIR="$BASE_DIR/logs"
mkdir -p "$LOGS_DIR"

# Define log file
LOG_FILE="$LOGS_DIR/auto_processing_$(date +%Y%m%d_%H%M%S).log"

# Function to log messages
log() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") - $1" | tee -a "$LOG_FILE"
}

# Function to check if a process is running
is_running() {
    if pgrep -f "$1" > /dev/null; then
        return 0  # Process is running
    else
        return 1  # Process is not running
    fi
}

# Start the auto-learning system if not already running
if ! is_running "auto_learning.py"; then
    log "Starting the auto-learning system..."
    python3 "$BASE_DIR/Lightning-Lens/lightning_lens/scripts/auto_learning.py" --daemon >> "$LOGS_DIR/auto_learning.log" 2>&1 &
    AUTO_LEARNING_PID=$!
    log "Auto-learning system started with PID: $AUTO_LEARNING_PID"
else
    log "Auto-learning system is already running"
fi

# Function to run the data processing pipeline
run_data_processing() {
    log "Starting data processing pipeline..."
    
    # Run the process_data.sh script
    bash "$BASE_DIR/process_data.sh" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "Data processing completed successfully"
        return 0
    else
        log "Error: Data processing failed"
        return 1
    fi
}

# Function to update the model with new data
update_model() {
    log "Updating model with new data..."
    
    # Run the model update script
    python3 "$BASE_DIR/Lightning-Lens/lightning_lens/scripts/generate_predictions.py" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "Model updated successfully"
        return 0
    else
        log "Error: Model update failed"
        return 1
    fi
}

# Main execution
log "Automated data processing started"

# Run the data processing pipeline
run_data_processing

# Update the model if data processing was successful
if [ $? -eq 0 ]; then
    update_model
fi

log "Automated data processing completed"

# Exit with success
exit 0
