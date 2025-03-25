"""
LightningLens - Easy-to-use wrapper for channel balance analysis
"""
import argparse
import os
from datetime import datetime

def main():
    parser = argparse.ArgumentParser(description="LightningLens - Lightning Network Channel Balance Analysis")
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Train command
    train_parser = subparsers.add_parser('train', help='Train a new model')
    train_parser.add_argument('--data', required=True, help='Path to training data CSV')

    # Analyze command (combines predict & visualize)
    analyze_parser = subparsers.add_parser('analyze', help='Analyze channel balances')
    analyze_parser.add_argument('--data', required=True, help='Path to channel data CSV')
    analyze_parser.add_argument('--model', help='Path to custom model (optional)')

    args = parser.parse_args()

    if args.command == 'train':
        from src.scripts.model_runner import train_model # type: ignore
        output_dir = 'data/models'
        train_model('configs/config.yaml', args.data, output_dir)

    elif args.command == 'analyze':
        from src.scripts.model_runner import predict_optimal_ratios # type: ignore
        from src.scripts.visualizer import create_visualizations # type: ignore
        
        # Use latest model if not specified
        if not args.model:
            model_dir = 'data/models'
            models = [f for f in os.listdir(model_dir) if f.startswith('model_')]
            latest_model = sorted(models)[-1]
            model_path = os.path.join(model_dir, latest_model)
            scaler_path = os.path.join(model_dir, latest_model.replace('model_', 'scaler_'))
        else:
            model_path = args.model
            scaler_path = args.model.replace('model_', 'scaler_')

        # Make predictions
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        predictions_path = f'data/predictions/predictions_{timestamp}.csv'
        os.makedirs('data/predictions', exist_ok=True)
        
        predict_optimal_ratios(model_path, scaler_path, args.data, predictions_path)
        
        # Create visualizations
        create_visualizations(predictions_path, 'visualizations')

    else:
        parser.print_help()

if __name__ == "__main__":
    main() 