import pandas as pd
import numpy as np
from typing import List
from datetime import datetime

class FeatureProcessor:
    """ Process raw channel metrics into features for ML model """

    REQUIRED_COLUMNS = [
        'timestamp', 'channel_id', 'capacity',
        'local_balance', 'remote_balance', 'balance_ratio'
    ]

    def __init__(self):
        """ Initialize feature processor """
        pass

    def validate_input(self, data: pd.DataFrame):
        """ Validate input data has required columns and format """
        if data.empty:
            raise ValueError('Input DataFrame is empty')
        
        missing_cols = [col for col in self.REQUIRED_COLUMNS if col not in data.columns]
        if missing_cols:
            raise ValueError(f'Missing required columns: {missing_cols}')
        
    def calculate_balance_velocity(self, data: pd.DataFrame) -> pd.DataFrame:
        """ Calculate rate of change in local balance 
        
        Args:
            data (pd.DataFrame): Channel metrics data
            
        Returns:
            pd.DataFrame: Data with balance_velocity column added
        """
        df = data.copy()
        df = df.sort_values('timestamp')

        # Calculate balance changes
        df['balance_change'] = df.groupby('channel_id')['local_balance'].diff()

        # Calculate time differences in hours
        df['time_diff'] = df.groupby('channel_id')['timestamp'].diff().dt.total_seconds() / 3600

        # Calculate velocity (balance change per hour)
        df['balance_velocity'] = df['balance_change'] / df['time_diff']

        # Fill first entry (which will be NaN) with 0
        df['balance_velocity'] = df['balance_velocity'].fillna(0)

        # Drop temporary columns
        df = df.drop(['balance_change', 'time_diff'], axis=1)

        return df
    
    def calculate_liquidity_stress(self, data: pd.DataFrame) -> pd.DataFrame:
        """ Calculate liquidity stress indicators """
        df = data.copy()

        # Calculate how close the balance is to either extreme
        df['liquidity_stress'] = df.apply(
            lambda row: max(
                1 - (row['local_balance'] / row['capacity']),
                row['local_balance'] / row['capacity']
            ), axis=1
        )

        return df
    
    def generate_time_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """ Generate time-based features from timestamp """
        df = data.copy()

        df['hour_of_day'] = df['timestamp'].dt.hour
        df['day_of_week'] = df['timestamp'].dt.dayofweek

        return df
    
    def process_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """ Process all features for the model """
        # Validate input data ...
        self.validate_input(data)

        # Create a copy to avoid modifying input ..
        df = data.copy()

        # Calculate all features ...
        df = self.calculate_balance_velocity(df)
        df = self.calculate_liquidity_stress(df)
        df = self.generate_time_features(df)

        # Select and order final features ... 🚀
        features = [
            'channel_id',
            'timestamp',
            'balance_velocity',
            'liquidity_stress',
            'hour_of_day',
            'day_of_week',
            'balance_ratio'
        ]

        return df[features].copy()

