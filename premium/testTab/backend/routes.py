"""
Test Premium Tab Flask Blueprint

This blueprint provides API endpoints for the test premium tab functionality.
Includes data processing, analytics, and custom utilities.
"""

from flask import Blueprint, request, jsonify, current_app
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import httpx
import json
from .utils import TestDataProcessor, generate_sample_data

# Create blueprint
bp = Blueprint('test', __name__, url_prefix='/api/test')

@bp.route('/status', methods=['GET'])
def get_status():
    """Get the status of the test premium tab."""
    return jsonify({
        'status': 'active',
        'tab_name': 'test',
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat(),
        'features': [
            'data_processing',
            'analytics',
            'sample_generation',
            'external_api_integration'
        ]
    })

@bp.route('/data/sample', methods=['GET'])
def get_sample_data():
    """Generate and return sample data for testing."""
    try:
        count = request.args.get('count', 10, type=int)
        data_type = request.args.get('type', 'random')
        
        # Limit count for safety
        count = min(count, 1000)
        
        sample_data = generate_sample_data(count, data_type)
        
        return jsonify({
            'success': True,
            'data': sample_data,
            'count': len(sample_data),
            'generated_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        current_app.logger.error(f"Error generating sample data: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/analytics/process', methods=['POST'])
def process_analytics():
    """Process analytics data using pandas and numpy."""
    try:
        data = request.get_json()
        
        if not data or 'dataset' not in data:
            return jsonify({
                'success': False,
                'error': 'No dataset provided'
            }), 400
        
        processor = TestDataProcessor()
        results = processor.analyze_dataset(data['dataset'])
        
        return jsonify({
            'success': True,
            'results': results,
            'processed_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        current_app.logger.error(f"Error processing analytics: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/external/fetch', methods=['GET'])
def fetch_external_data():
    """Fetch data from an external API using httpx."""
    try:
        url = request.args.get('url')
        
        if not url:
            return jsonify({
                'success': False,
                'error': 'No URL provided'
            }), 400
        
        # Basic URL validation
        if not url.startswith(('http://', 'https://')):
            return jsonify({
                'success': False,
                'error': 'Invalid URL format'
            }), 400
        
        # Make request with timeout
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)
            response.raise_for_status()
            
            # Try to parse as JSON, fallback to text
            try:
                data = response.json()
            except:
                data = response.text
        
        return jsonify({
            'success': True,
            'data': data,
            'status_code': response.status_code,
            'fetched_at': datetime.now().isoformat()
        })
        
    except httpx.TimeoutException:
        return jsonify({
            'success': False,
            'error': 'Request timeout'
        }), 408
    except httpx.HTTPStatusError as e:
        return jsonify({
            'success': False,
            'error': f'HTTP error: {e.response.status_code}'
        }), e.response.status_code
    except Exception as e:
        current_app.logger.error(f"Error fetching external data: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/config', methods=['GET'])
def get_config():
    """Get test tab configuration."""
    return jsonify({
        'tab_name': 'test',
        'display_name': 'Test Premium Tab',
        'description': 'A test premium tab for demonstrating functionality',
        'version': '1.0.0',
        'capabilities': {
            'data_processing': True,
            'analytics': True,
            'external_api': True,
            'real_time_updates': False
        },
        'settings': {
            'max_data_points': 1000,
            'cache_duration': 300,
            'enable_logging': True
        }
    })

@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    try:
        # Test pandas/numpy functionality
        test_array = np.array([1, 2, 3, 4, 5])
        test_df = pd.DataFrame({'test': test_array})
        
        # Test httpx availability
        httpx_available = True
        try:
            httpx.Client()
        except:
            httpx_available = False
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'dependencies': {
                'pandas': True,
                'numpy': True,
                'httpx': httpx_available
            },
            'test_results': {
                'numpy_array_length': len(test_array),
                'pandas_dataframe_shape': test_df.shape
            }
        })
        
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500
