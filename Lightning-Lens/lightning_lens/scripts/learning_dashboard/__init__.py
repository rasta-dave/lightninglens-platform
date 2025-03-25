"""
Learning Dashboard Package - Provides ML-driven insights for Lightning Network
"""

# Version information
__version__ = "0.1.0" 

# Import functions from predictions module for easier access
from .predictions import get_predictions, get_metrics, predict_optimal_balance

# Backward compatibility function for existing code
def generate_dashboard():
    """
    Generate a dashboard with predictions and metrics.
    This is a backward compatibility function.
    
    Returns:
        dict: A dictionary containing predictions and metrics
    """
    from .predictions import get_predictions, get_metrics
    
    return {
        "predictions": get_predictions(),
        "metrics": get_metrics()
    } 