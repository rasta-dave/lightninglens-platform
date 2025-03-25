import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def generate_test_data(n_samples=100):
    """Generate realistic sample data for model testing"""
    
    # Create timestamps over 24 hours
    base_time = datetime.now()
    timestamps = [base_time + timedelta(hours=i) for i in range(24)]
    timestamps = timestamps * (n_samples // 24 + 1)
    timestamps = sorted(timestamps[:n_samples])
    
    # Generate channel IDs
    channel_ids = [f"ch_{i:03d}" for i in range(5)]
    channel_ids = channel_ids * (n_samples // 5 + 1)
    channel_ids = channel_ids[:n_samples]
    
    # Create DataFrame
    df = pd.DataFrame({
        'channel_id': channel_ids,
        'timestamp': timestamps,
        'balance_velocity': np.random.normal(0.5, 0.2, n_samples),  # Normal distribution
        'liquidity_stress': np.random.uniform(0.2, 0.8, n_samples), # Uniform distribution
        'hour_of_day': [t.hour for t in timestamps],
        'day_of_week': [t.weekday() for t in timestamps],
        'balance_ratio': np.random.beta(2, 2, n_samples)  # Beta distribution for realistic ratios
    })
    
    # Save to CSV
    output_path = 'data/processed/sample_training_data.csv'
    df.to_csv(output_path, index=False)
    print(f"Generated sample data saved to: {output_path}")
    return output_path

if __name__ == "__main__":
    path = generate_test_data(100)
    print("\nSample data statistics:")
    df = pd.read_csv(path)
    print(df.describe()) 