import os
from flask import request, jsonify, current_app
from backend.auth.decorators import admin_required
from backend.utils.utils import get_service_status, execute_systemctl_command, execute_systemctl_system_command, write_to_log, resolve_device_identifier
from backend.monitors.harddrivetest import HardDriveTestMonitor
from .. import bp
from . import utils
import time
import subprocess
import re
import json
from pathlib import Path
import logging
logger = logging.getLogger('homeserver')

@bp.route('/api/admin/ssh/status', methods=['GET'])
@admin_required
def get_ssh_status():
    """Get SSH password authentication status."""
    try:
        logger.info("[CTLMAN] Checking SSH password authentication status")
        status = utils.get_ssh_password_status()
        
        if "error" in status:
            logger.error(f"[CTLMAN] Error retrieving SSH status: {status['error']}")
            return jsonify(status), 500
            
        logger.info(f"[CTLMAN] SSH password authentication status: {'enabled' if status['password_auth_enabled'] else 'disabled'}")
        return jsonify(status), 200
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error getting SSH status: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/api/admin/ssh/toggle', methods=['POST'])
@admin_required
def toggle_ssh_auth():
    """Toggle SSH password authentication."""
    try:
        data = request.get_json()
        if data is None:
            logger.error("[CTLMAN] No JSON data received in SSH toggle request")
            return jsonify({"error": "No JSON data received"}), 400
            
        enable = data.get('enable')
        if enable is None:
            logger.error("[CTLMAN] Missing 'enable' parameter in SSH toggle request")
            return jsonify({"error": "Missing 'enable' parameter"}), 400
            
        logger.info(f"[CTLMAN] Attempting to {'enable' if enable else 'disable'} SSH password authentication")
        success, message = utils.toggle_ssh_password_auth(enable)
        
        if success:
            logger.info(f"[CTLMAN] Successfully {'enabled' if enable else 'disabled'} SSH password authentication")
            write_to_log('admin', f'SSH password authentication {"enabled" if enable else "disabled"}', 'info')
            return jsonify({
                "success": True, 
                "message": message,
                "password_auth_enabled": enable
            }), 200
        else:
            logger.error(f"[CTLMAN] Failed to {'enable' if enable else 'disable'} SSH password authentication: {message}")
            return jsonify({
                "success": False, 
                "error": message
            }), 500
            
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error toggling SSH authentication: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/api/admin/services/hard-reset', methods=['POST'])
@admin_required
def hard_reset_services():
    """Restart gunicorn and nginx services for hard reset of the web interface."""
    try:
        logger.info("[CTLMAN] Initiating hard reset of web services (gunicorn + nginx)")
        
        # Immediately prepare success response
        response = jsonify({
            "success": True,
            "message": "Hard reset initiated. Please wait for the interface to reload."
        })
        
        # Use a background thread to restart services after a delay to allow response to be sent
        import threading
        def restart_services():
            import time
            time.sleep(1)  # Short delay to allow response to be sent
            
            logger.info("[CTLMAN] Executing hard reset - restarting services")
            
            # First try restarting gunicorn
            success_gunicorn, gunicorn_output = execute_systemctl_command('restart', 'gunicorn.service')
            if not success_gunicorn:
                logger.error(f"[CTLMAN] Failed to restart gunicorn: {gunicorn_output}")
            else:
                logger.info("[CTLMAN] Successfully restarted gunicorn service")
                
            # Then restart nginx which will apply to the newly started gunicorn
            time.sleep(1)  # Give gunicorn a moment to start
            success_nginx, nginx_output = execute_systemctl_command('restart', 'nginx.service')
            if not success_nginx:
                logger.error(f"[CTLMAN] Failed to restart nginx: {nginx_output}")
            else:
                logger.info("[CTLMAN] Successfully restarted nginx service")
            
        # Start the background restart thread
        threading.Thread(target=restart_services).start()
        
        logger.info("[CTLMAN] Hard reset response sent, service restarts scheduled")
        return response
        
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error during hard reset: {str(e)}")
        return jsonify({
            "success": False, 
            "message": "Failed to perform hard reset",
            "error": str(e)
        }), 500

@bp.route('/api/admin/system/restart', methods=['POST'])
@admin_required
def restart_system():
    """Restart the entire system securely after validating admin status."""
    try:
        logger.info("[CTLMAN] Initiating full system restart")
        
        # Execute system reboot command using systemctl
        success, output = execute_systemctl_system_command('reboot')
        
        if success:
            logger.info("[CTLMAN] Full system restart initiated successfully")
            return jsonify({
                'success': True,
                'message': 'Full system restart initiated successfully'
            }), 200
        else:
            logger.error(f"[CTLMAN] Failed to restart system: {output}")
            return jsonify({
                'success': False,
                'error': f'Failed to restart system: {output}'
            }), 500
            
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error during system restart: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to restart system: {str(e)}'
        }), 500

@bp.route('/api/admin/system/shutdown', methods=['POST'])
@admin_required
def shutdown_system():
    """Shutdown the entire system securely after validating admin status."""
    try:
        logger.info("[CTLMAN] Initiating full system shutdown")
        
        # Execute system shutdown command using systemctl
        success, output = execute_systemctl_system_command('poweroff')
        
        if success:
            logger.info("[CTLMAN] Full system shutdown initiated successfully")
            return jsonify({
                'success': True,
                'message': 'Full system shutdown initiated successfully'
            }), 200
        else:
            logger.error(f"[CTLMAN] Failed to shutdown system: {output}")
            return jsonify({
                'success': False,
                'error': f'Failed to shutdown system: {output}'
            }), 500
            
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error during system shutdown: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to shutdown system: {str(e)}'
        }), 500

@bp.route('/api/admin/ssh/service', methods=['POST'])
@admin_required
def control_ssh_service():
    """Enable/disable and start/stop the SSH service."""
    try:
        data = request.get_json()
        if data is None:
            logger.error("[CTLMAN] No JSON data received in SSH service control request")
            return jsonify({"error": "No JSON data received"}), 400
            
        enable = data.get('enable')
        if enable is None:
            logger.error("[CTLMAN] Missing 'enable' parameter in SSH service control request")
            return jsonify({"error": "Missing 'enable' parameter"}), 400
            
        logger.info(f"[CTLMAN] Attempting to {'enable and start' if enable else 'disable and stop'} SSH service")
        success, message = utils.control_ssh_service(enable)
        
        if success:
            logger.info(f"[CTLMAN] Successfully {'enabled and started' if enable else 'disabled and stopped'} SSH service")
            write_to_log('admin', f'SSH service {"enabled" if enable else "disabled"}', 'info')
            return jsonify({
                "success": True, 
                "message": message,
                "ssh_service_enabled": enable
            }), 200
        else:
            logger.error(f"[CTLMAN] Failed to {'enable and start' if enable else 'disable and stop'} SSH service: {message}")
            return jsonify({
                "success": False, 
                "error": message
            }), 500
            
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error controlling SSH service: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/api/admin/ssh/service/status', methods=['GET'])
@admin_required
def get_ssh_service_status():
    """Get SSH service status (enabled/disabled, running/stopped)."""
    try:
        logger.info("[CTLMAN] Checking SSH service status")
        status = utils.get_ssh_service_status()
        
        if "error" in status:
            logger.error(f"[CTLMAN] Error retrieving SSH service status: {status['error']}")
            return jsonify(status), 500
            
        logger.info(f"[CTLMAN] SSH service status: service {'enabled' if status['is_enabled'] else 'disabled'}, {'running' if status['is_running'] else 'stopped'}")
        return jsonify(status), 200
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error getting SSH service status: {str(e)}")
        return jsonify({"error": str(e)}), 500

# New routes for Samba service control

@bp.route('/api/admin/samba/service/status', methods=['GET'])
@admin_required
def get_samba_service_status():
    """Get Samba services status (enabled/disabled, running/stopped)."""
    try:
        logger.info("[CTLMAN] Checking Samba services status")
        status = utils.get_samba_services_status()
        
        if "error" in status:
            logger.error(f"[CTLMAN] Error retrieving Samba services status: {status['error']}")
            return jsonify(status), 500
            
        logger.info(f"[CTLMAN] Samba services status: all services {'enabled' if status['all_enabled'] else 'not all enabled'}, {'running' if status['all_running'] else 'not all running'}")
        return jsonify(status), 200
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error getting Samba services status: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/api/admin/samba/service', methods=['POST'])
@admin_required
def control_samba_service():
    """Enable/disable and start/stop Samba services."""
    try:
        data = request.get_json()
        if data is None:
            logger.error("[CTLMAN] No JSON data received in Samba service control request")
            return jsonify({"error": "No JSON data received"}), 400
            
        enable = data.get('enable')
        if enable is None:
            logger.error("[CTLMAN] Missing 'enable' parameter in Samba service control request")
            return jsonify({"error": "Missing 'enable' parameter"}), 400
            
        logger.info(f"[CTLMAN] Attempting to {'enable and start' if enable else 'disable and stop'} Samba services")
        success, message = utils.control_samba_services(enable)
        
        if success:
            logger.info(f"[CTLMAN] Successfully {'enabled and started' if enable else 'disabled and stopped'} Samba services")
            write_to_log('admin', f'Samba services {"enabled" if enable else "disabled"}', 'info')
            return jsonify({
                "success": True, 
                "message": message,
                "samba_services_enabled": enable
            }), 200
        else:
            logger.error(f"[CTLMAN] Failed to {'enable and start' if enable else 'disable and stop'} Samba services: {message}")
            return jsonify({
                "success": False, 
                "error": message
            }), 500
            
    except Exception as e:
        logger.exception(f"[CTLMAN] Unexpected error controlling Samba services: {str(e)}")
        return jsonify({"error": str(e)}), 500

# New route for cryptography testing
@bp.route('/api/admin/crypto/test', methods=['POST'])
@admin_required
def test_crypto_methods():
    """Receive variously encoded secrets and attempt to decode them."""
    try:
        data = request.get_json()
        if data is None:
            logger.error("[CTLMAN][CRYPTO] No JSON data received in crypto test request")
            return jsonify({"error": "No JSON data received"}), 400
            
        logger.info(f"[CTLMAN][CRYPTO] Received crypto test request with data: {data}")
        
        decoded_results = utils.decode_crypto_payload(data)
        
        logger.info(f"[CTLMAN][CRYPTO] Decoded results: {decoded_results}")
        return jsonify({"results": decoded_results}), 200
        
    except Exception as e:
        logger.exception(f"[CTLMAN][CRYPTO] Unexpected error during crypto test: {str(e)}")
        return jsonify({"error": str(e)}), 500
    

# Hard Drive Test routes
@bp.route('/api/admin/hard-drive-test/results', methods=['GET'])
@admin_required
def get_test_results():
    """Get hard drive test results."""
    try:
        monitor = HardDriveTestMonitor()
        results = monitor.get_test_results()
        return jsonify(results), 200
    except Exception as e:
        current_app.logger.error(f"Error getting test results: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500

@bp.route('/api/admin/hard-drive-test/progress', methods=['GET'])
@admin_required
def get_test_progress():
    """Get current hard drive test progress."""
    try:
        monitor = HardDriveTestMonitor()
        progress = monitor.get_test_progress()
        return jsonify(progress), 200
    except Exception as e:
        current_app.logger.error(f"Error getting test progress: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500

@bp.route('/api/admin/hard-drive-test/start', methods=['POST'])
@admin_required
def start_hard_drive_test():
    """Start a hard drive test."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "message": "No JSON data received"}), 400
            
        device = data.get('device')
        test_type = data.get('test_type')
        
        if not device or not test_type:
            return jsonify({
                "success": False, 
                "message": "Missing required parameters: device and test_type"
            }), 400
            
        # Validate test type
        valid_test_types = ['quick', 'full', 'ultimate']
        if test_type not in valid_test_types:
            return jsonify({
                "success": False, 
                "message": f"Invalid test_type. Must be one of: {', '.join(valid_test_types)}"
            }), 400
            
        # Resolve device identifier
        resolved_device = resolve_device_identifier(device)

        # Start the test
        monitor = HardDriveTestMonitor()
        result = monitor.start_test(resolved_device, test_type)
        
        # Return the result
        return jsonify(result), 200 if result.get('success') else 500
        
    except Exception as e:
        current_app.logger.error(f"Error starting hard drive test: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500
