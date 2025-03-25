FROM python:3.9-slim

WORKDIR /app

# Copy only the necessary files
COPY requirements.txt /app/
COPY scripts/ /app/scripts/

RUN pip install --no-cache-dir -r requirements.txt

# Create data directory
RUN mkdir -p /app/data

# Expose the WebSocket port
EXPOSE 8765

# Run the WebSocket server
CMD ["python", "scripts/websocket_server.py"] 