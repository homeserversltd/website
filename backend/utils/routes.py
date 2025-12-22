from flask import jsonify, current_app
from . import bp
from .utils import get_config

@bp.route('/api/version', methods=['GET'])
def get_version():
    """
    Get version information from the homeserver.json config file.
    
    Returns:
        JSON response with version information from global.version or a default value
    """
    try:
        config = get_config()
        version_info = config.get('global', {}).get('version', {
            'generation': 0,
            'buildId': 'unknown',
            'lastUpdated': 'unknown'
        })
        
        return jsonify({
            'status': 'success',
            'version': version_info
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching version info: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to retrieve version information: {str(e)}",
            'version': {
                'generation': 0,
                'buildId': 'unknown',
                'lastUpdated': 'unknown'
            }
        }), 500