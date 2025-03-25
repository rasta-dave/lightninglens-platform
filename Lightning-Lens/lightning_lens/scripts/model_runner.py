"""
Model Runner - Train and utilize the LightningLens model
"""
import os
import argparse
import pandas as pd
from datetime import datetime
from src.models.trainer import ModelTrainer
from src.models.features import FeatureProcessor
from src.utils.config import load_config

def train_model(config_path, data_path, output_dir, target_column="balance_ratio"):
    """ Train a new model using processed feature data 
    
    Args:
        config_path (str): Path to configuration file
        data_path (str): Path to processed features CSV
        output_dir (str): Directory to save model artifacts

    """
    # Load configuration ...
    config = load_config(config_path)
    model_config = config.get("model", {})

    # Load data ...
    print(f"Loading data from {data_path}...")
    features_df = pd.read_csv(data_path)

    # Initialize the ModelTrainer ...
    trainer = ModelTrainer(
        test_size=config.get("training", {}).get("validation_split", 0.2),
        random_state=42
    )

    # Training the model ...
    print("Training model ...")
    model_params = {
        'n_estimators': model_config.get("n_estimators", 100),
        'max_depth': model_config.get("max_depth", 10),
        'min_samples_split': model_config.get("min_sampples_split", 2),
        'random_state': 42
    }

    model, metrics = trainer.train_model(
        features_df,
        target_column=target_column,
        model_params=model_params
    )

    # Printing metrics ...
    print("\nModel Performance:")
    print(f" MAE: {metrics['mae']:.4f}")
    print(f" RMSE: {metrics['rmse']:.4f}")
    print(f" R2: {metrics['r2']:.4f}")

    # Save model and scaler ...
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_path = os.path.join(output_dir, f"model_{timestamp}.pkl")
    scaler_path = os.path.join(output_dir, f"scaler_{timestamp}.pkl")
    os.makedirs(output_dir, exist_ok=True)
    trainer.save_model(model_path, scaler_path)



def predict_optimal_ratios(model_path: str, scaler_path: str, data_path: str, output_path: str):
    """Make predictions using a trained model
    
    Args:
        model_path (str): Path to saved model
        scaler_path (str): Path to saved scaler
        data_path (str): Path to input data
        output_path (str): Path to save predictions
    """
    # Load data
    print(f"Loading data from {data_path}...")
    df = pd.read_csv(data_path)
    
    # Load model and make predictions
    trainer = ModelTrainer()
    model, scaler = trainer.load_model(model_path, scaler_path)
    trainer.scaler = scaler  # Set the loaded scaler
    predictions = trainer.predict(model, df)
    
    # Save predictions
    result_df = df.copy()
    result_df['predicted_optimal_ratio'] = predictions
    result_df['adjustment_needed'] = predictions - result_df['balance_ratio']
    result_df.to_csv(output_path, index=False)
    
    print(f"\nPredictions saved to {output_path}")


#############################################

def main():
    parser = argparse.ArgumentParser(description='LightningLens Model Runner')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Train command
    train_parser = subparsers.add_parser('train', help='Train a new model')
    train_parser.add_argument('--config', default='configs/config.yaml', help='Path to config file')
    train_parser.add_argument('--data', required=True, help='Path to processed features CSV')
    train_parser.add_argument('--output', default='data/models', help='Output directory for model')

    # Predict command
    predict_parser = subparsers.add_parser('predict', help='Make predictions with trained model')
    predict_parser.add_argument('--model', required=True, help='Path to trained model file')
    predict_parser.add_argument('--scaler', required=True, help='Path to fitted scaler')
    predict_parser.add_argument('--data', required=True, help='Path to features CSV')
    predict_parser.add_argument('--output', required=True, help='Path for predictions output')

    args = parser.parse_args()

    if args.command == 'train':
        train_model(args.config, args.data, args.output)
    elif args.command == 'predict':
        predict_optimal_ratios(args.model, args.scaler, args.data, args.output)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

