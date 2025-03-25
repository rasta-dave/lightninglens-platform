from src.utils.lnd_client import LndClient
from src.utils.config import load_config
from data.collector import DataCollector
import os
from datetime import datetime

def main():
    # Load configuration ...
    config = load_config()

    # Initialize client and collector
    client = LndClient('alice') # or whichever node you're monitoring
    collector = DataCollector(client)

    try:
        # Collect metrics
        raw_metrics = collector.collect_channel_metrics()

        # Process metrics
        metrics_df = collector.process_metrics(raw_metrics)

        # Save to file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filepath = f'data/raw/metrics_{timestamp}.csv'
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        collector.save_metrics(metrics_df, filepath)

        print(f'Successfully collected and saved metrics to {filepath}')

    except Exception as e:
        print(f'Error: {e}')

if __name__ == '__main__':
    main()