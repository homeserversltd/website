"""
DHCP Premium Tab Flask Blueprint

This blueprint provides API endpoints for DHCP management functionality.
Includes DHCP lease viewing, static IP reservations, and configuration management.
"""

from flask import Blueprint, request, jsonify, current_app
import subprocess
import json
from .dhcp_manager import DhcpManager

# Create blueprint
bp = Blueprint('dhcp', __name__, url_prefix='/api/dhcp')

# Initialize DHCP manager
dhcp_manager = DhcpManager()

@bp.route('/status', methods=['GET'])
def get_status():
    """Get the status of the DHCP service."""
    try:
        status = dhcp_manager.get_service_status()
        return jsonify({
            'success': True,
            'status': status
        })
    except Exception as e:
        current_app.logger.error(f"Error getting DHCP status: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/leases', methods=['GET'])
def get_leases():
    """Get active DHCP leases."""
    try:
        leases = dhcp_manager.get_leases()
        return jsonify({
            'success': True,
            'leases': leases
        })
    except Exception as e:
        current_app.logger.error(f"Error getting DHCP leases: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/reservations', methods=['GET'])
def get_reservations():
    """Get static IP reservations."""
    try:
        reservations = dhcp_manager.get_reservations()
        return jsonify({
            'success': True,
            'reservations': reservations
        })
    except Exception as e:
        current_app.logger.error(f"Error getting DHCP reservations: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/reservations', methods=['POST'])
def add_reservation():
    """Add a new static IP reservation.
    
    ip-address is optional. If not provided or if provided IP is in pool range,
    the backend will auto-assign from reserved range (192.168.123.2-49).
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        if 'hw-address' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: hw-address'
            }), 400
        
        result = dhcp_manager.add_reservation(
            hw_address=data['hw-address'],
            ip_address=data.get('ip-address'),  # Optional - will auto-assign if not provided
            hostname=data.get('hostname')
        )
        
        return jsonify({
            'success': True,
            'message': 'Reservation added successfully',
            'reservation': result
        })
    except Exception as e:
        current_app.logger.error(f"Error adding DHCP reservation: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/reservations/<reservation_id>', methods=['PUT'])
def update_reservation(reservation_id):
    """Update a reservation's IP address."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        if 'ip-address' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: ip-address'
            }), 400
        
        result = dhcp_manager.update_reservation_ip(
            identifier=reservation_id,
            new_ip=data['ip-address']
        )
        
        return jsonify({
            'success': True,
            'message': 'Reservation updated successfully',
            'reservation': result
        })
    except Exception as e:
        current_app.logger.error(f"Error updating DHCP reservation: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/reservations/<reservation_id>', methods=['DELETE'])
def remove_reservation(reservation_id):
    """Remove a static IP reservation."""
    try:
        result = dhcp_manager.remove_reservation(reservation_id)
        
        if result:
            return jsonify({
                'success': True,
                'message': 'Reservation removed successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Reservation not found'
            }), 404
    except Exception as e:
        current_app.logger.error(f"Error removing DHCP reservation: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/config', methods=['GET'])
def get_config():
    """Get current DHCP configuration."""
    try:
        config = dhcp_manager.get_config()
        return jsonify({
            'success': True,
            'config': config
        })
    except Exception as e:
        current_app.logger.error(f"Error getting DHCP config: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/config', methods=['POST'])
def update_config():
    """Update DHCP configuration."""
    try:
        data = request.get_json()
        
        if not data or 'config' not in data:
            return jsonify({
                'success': False,
                'error': 'No configuration provided'
            }), 400
        
        result = dhcp_manager.update_config(data['config'])
        
        return jsonify({
            'success': True,
            'message': 'Configuration updated successfully',
            'config': result
        })
    except Exception as e:
        current_app.logger.error(f"Error updating DHCP config: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    try:
        status = dhcp_manager.get_service_status()
        config_valid = dhcp_manager.validate_config()
        
        return jsonify({
            'status': 'healthy' if status['active'] and config_valid else 'unhealthy',
            'service': status,
            'config_valid': config_valid
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500

@bp.route('/statistics', methods=['GET'])
def get_statistics():
    """Get DHCP statistics including homeserver IP, reservation count, and lease count."""
    try:
        statistics = dhcp_manager.get_statistics()
        return jsonify({
            'success': True,
            'statistics': statistics
        })
    except Exception as e:
        current_app.logger.error(f"Error getting DHCP statistics: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/pool-boundary', methods=['GET'])
def get_pool_boundary():
    """Get the current pool boundary (max reservations setting)."""
    try:
        max_reservations = dhcp_manager.get_current_boundary()
        return jsonify({
            'success': True,
            'max_reservations': max_reservations
        })
    except Exception as e:
        current_app.logger.error(f"Error getting pool boundary: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/pool-boundary', methods=['POST'])
def update_pool_boundary():
    """Update the pool boundary to adjust reservations-to-hosts ratio.
    
    Accepts max_reservations count and updates the Kea config to set
    the boundary between reserved range and pool range.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        if 'max_reservations' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: max_reservations'
            }), 400
        
        max_reservations = data['max_reservations']
        
        if not isinstance(max_reservations, int) or max_reservations < 0:
            return jsonify({
                'success': False,
                'error': 'max_reservations must be a non-negative integer'
            }), 400
        
        result = dhcp_manager.update_pool_boundary(max_reservations)
        
        return jsonify({
            'success': True,
            'message': 'Pool boundary updated successfully'
        })
    except Exception as e:
        current_app.logger.error(f"Error updating pool boundary: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
