import os
import pandas as pd
from datetime import datetime
from data.collector import DataCollector
from src.models.features import FeatureProcessor
from src.utils.config import load_config
from src.utils.lnd_client import LndClient

def main():
    """ Main function to collect data and process features """

    # Load Docker configuration
    config_path = "lightning-docker-testnet/configs/test_docker.yaml"
    client = LndClient('alice', config_path=config_path)
    collector = DataCollector(client)
    processor = FeatureProcessor()

    try:
        # 1. Collect raw metrics
        print("Collecting channel metrics ... ")
        raw_metrics = collector.collect_channel_metrics()
        metrics_df = collector.process_metrics(raw_metrics)

        # 2. Process features
        print("Processing features ...")
        features_df = processor.process_features(metrics_df)

        # 3. Save results ...
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Save raw metrics
        raw_path = f'data/raw/metrics_{timestamp}.csv'
        features_path = f'data/processed/features_{timestamp}.csv'
        
        os.makedirs(os.path.dirname(raw_path), exist_ok=True)
        os.makedirs(os.path.dirname(features_path), exist_ok=True)
        
        metrics_df.to_csv(raw_path, index=False)
        features_df.to_csv(features_path, index=False)

        print(f"Succesfully saved:")
        print(f"- Raw metrics: {raw_path}")
        print(f"- Processed features: {features_path}")

        # Print some basic statistics
        print("\nBasic statistics:")
        print(f"Total channels: {len(metrics_df)}")
        print(f"Features shape: {features_df.shape}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()

