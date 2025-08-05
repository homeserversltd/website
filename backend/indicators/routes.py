"""
Service status indicator routes and functions.
"""
import json
from typing import List, Dict
from flask import current_app, jsonify
from . import bp
from backend.indicators.utils import collect_services_status

@bp.route('/api/status/services', methods=['GET'])
def get_service_status():
    """
    Retrieve the status of backend services.
    Uses unified configuration (from tabs.portals.data.portals) to show each service
    indicator with its name, description, and status.
    """
    try:
        indicators = collect_services_status()
        return jsonify(indicators), 200
        
    except Exception as e:
        current_app.logger.error(f'Error getting services status: {str(e)}')
        return jsonify({'error': str(e)}), 500

@bp.route('/api/status', methods=['GET'])
def get_status():
    """Get overall system status."""
    return jsonify({
        "services": {
            "websocket": "running",
            "database": "connected",
            "auth": "ok"
        }
    }), 200

@bp.route('/api/uptime', methods=['GET'])
def get_uptime():
    """Get system uptime."""
    try:
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.readline().split()[0])
            return jsonify({'uptime': uptime_seconds}), 200
    except Exception as e:
        current_app.logger.error(f'Error getting uptime: {str(e)}')
        return jsonify({'error': 'Failed to get uptime'}), 500
