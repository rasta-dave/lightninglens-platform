FROM python:3.9-slim

WORKDIR /app

# Copy only the necessary files
COPY requirements.txt /app/
COPY *.py /app/
COPY src/ /app/src/
COPY frontend/ /app/frontend/
COPY configs/ /app/configs/
COPY scripts/ /app/scripts/
COPY visualizations/ /app/visualizations/
COPY setup.py /app/
COPY README.md /app/

# Install dependencies and the package in development mode
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install -e .

# Create data directory
RUN mkdir -p /app/data

# Create a symbolic link for the lightning_lens package
RUN mkdir -p /app/lightning_lens
RUN ln -s /app/src /app/lightning_lens/src
RUN touch /app/lightning_lens/__init__.py

# Set the Python path to include the app directory
ENV PYTHONPATH=/app

# Expose the Flask port
EXPOSE 5001

# Run the HTTP server
CMD ["python", "scripts/http_server.py"] 