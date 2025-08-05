"""
VPN-specific routes and helper functions.
"""
from flask import jsonify, request, current_app
from .. import bp
import subprocess
import time
from .utils import check_process_running, update_pia_credentials, update_transmission_credentials
from backend.auth.decorators import admin_required
from backend.utils.utils import execute_systemctl_command, decrypt_data, write_to_log
from backend.monitors.vpn import VPNMonitor
import json

# Create a single instance of VPNMonitor to use its caching capabilities
_vpn_monitor = VPNMonitor()

@bp.route('/api/status/vpn/pia', methods=['GET'])
def get_pia_status():
    """Get OpenVPN connection status."""
    try:
        is_running = check_process_running('openvpn')
        
        return jsonify({
            "status": "connected" if is_running else "disconnected",
            "timestamp": time.time()
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/transmission', methods=['GET'])
def get_transmission_status():
    """Get Transmission VPN status."""
    try:
        is_running = check_process_running('transmission')
        
        return jsonify({
            "status": "connected" if is_running else "disconnected",
            "timestamp": time.time()
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/updatekey/pia', methods=['POST'])
@admin_required
def update_pia():
    """Update PIA VPN credentials using encrypted payload."""
    try:
        data = request.get_json()
        encrypted_payload = data.get('encryptedPayload')

        if not encrypted_payload:
            return jsonify({
                "status": "error",
                "error": "Missing encryptedPayload",
                "timestamp": time.time()
            }), 400
        
        # Decrypt the payload
        decrypted_json = decrypt_data(encrypted_payload)
        if decrypted_json is None:
             current_app.logger.error(f"Failed to decrypt PIA payload from {request.remote_addr}")
             return jsonify({"status": "error", "error": "Decryption failed"}), 400
        
        try:
            credentials = json.loads(decrypted_json)
            username = credentials.get('username')
            password = credentials.get('password')
        except json.JSONDecodeError:
            current_app.logger.error(f"Failed to parse decrypted JSON for PIA update: {decrypted_json[:50]}...")
            return jsonify({"status": "error", "error": "Invalid decrypted payload format"}), 400

        if not username or not password:
            return jsonify({ 
                "status": "error", 
                "error": "Missing username or password in decrypted payload",
                "timestamp": time.time()
            }), 400
        
        # Validate and update credentials using the utility function
        success, message = update_pia_credentials(username, password)
        if not success:
            write_to_log('admin', f'Failed to update PIA credentials: {message}', 'error')
            return jsonify({
                "status": "error",
                "error": message,
                "timestamp": time.time()
            }), 400

        write_to_log('admin', 'PIA VPN credentials updated successfully', 'info')
        return jsonify({
            "status": "success",
            "message": "PIA credentials updated successfully",
            "timestamp": time.time()
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error in update_pia: {str(e)}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/updatekey/transmission', methods=['POST'])
@admin_required
def update_transmission():
    """Update Transmission credentials using encrypted payload."""
    try:
        current_app.logger.info('[PIAVPN] Received transmission credentials update request')
        data = request.get_json()
        
        if not data:
            current_app.logger.error('[PIAVPN] No JSON data received in request')
            return jsonify({
                "status": "error",
                "error": "No JSON data received",
                "timestamp": time.time()
            }), 400
            
        encrypted_payload = data.get('encryptedPayload')

        if not encrypted_payload:
            current_app.logger.error('[PIAVPN] Missing encryptedPayload in request data')
            return jsonify({
                "status": "error",
                "error": "Missing encryptedPayload",
                "timestamp": time.time()
            }), 400
        
        current_app.logger.debug('[PIAVPN] Attempting to decrypt payload')
        # Decrypt the payload
        decrypted_json = decrypt_data(encrypted_payload)
        if decrypted_json is None:
             current_app.logger.error(f"[PIAVPN] Failed to decrypt Transmission payload from {request.remote_addr}")
             return jsonify({"status": "error", "error": "Decryption failed"}), 400
        
        try:
            current_app.logger.debug('[PIAVPN] Parsing decrypted JSON data')
            credentials = json.loads(decrypted_json)
            username = credentials.get('username')
            password = credentials.get('password')
            
            # Add debug logging to see exactly what was received
            current_app.logger.debug(f'[PIAVPN] Extracted credentials - Username: "{username}", Password length: {len(password) if password else 0}')
            current_app.logger.debug(f'[PIAVPN] Raw decrypted JSON: {decrypted_json}')
            
        except json.JSONDecodeError as e:
            current_app.logger.error(f"[PIAVPN] Failed to parse decrypted JSON: {str(e)}")
            return jsonify({"status": "error", "error": "Invalid decrypted payload format"}), 400

        if not username or not password:
            current_app.logger.error('[PIAVPN] Missing username or password in decrypted payload')
            return jsonify({ 
                "status": "error", 
                "error": "Missing username or password in decrypted payload",
                "timestamp": time.time()
            }), 400
        
        current_app.logger.info('[PIAVPN] Attempting to update Transmission credentials')
        # Validate and update credentials using the utility function
        success, message = update_transmission_credentials(username, password)
        if not success:
            write_to_log('admin', f'Failed to update Transmission credentials: {message}', 'error')
            return jsonify({
                "status": "error",
                "error": message,
                "timestamp": time.time()
            }), 400

        write_to_log('admin', 'Transmission credentials updated successfully', 'info')
        return jsonify({
            "status": "success",
            "message": "Transmission credentials updated successfully",
            "timestamp": time.time()
        }), 200

    except Exception as e:
        current_app.logger.error(f"[PIAVPN] Unexpected error in update_transmission: {str(e)}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/pia/exists', methods=['GET'])
@admin_required
def check_pia_key_exists():
    """Check if PIA credentials exist in vault."""
    key_path = '/vault/.keys/pia.key'
    command = ['/usr/bin/sudo', '/usr/bin/test', '-f', key_path]
    current_app.logger.info(f'[PIAVPN] Checking existence of {key_path} using command: {" ".join(command)}')
    try:
        # Use sudo to check file existence
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False
        )
        exists = result.returncode == 0
        current_app.logger.info(f'[PIAVPN] Command finished. Return code: {result.returncode}, stdout: "{result.stdout.strip()}", stderr: "{result.stderr.strip()}". Exists: {exists}')
        
        return jsonify({
            "exists": exists,
            "timestamp": time.time()
        }), 200

    except Exception as e:
        current_app.logger.error(f'[PIAVPN] Exception during check: {str(e)}')
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/test-admin', methods=['GET'])
@admin_required
def test_admin_auth():
    """Test route for admin authentication."""
    try:
        # Return all request headers for debugging
        headers = {key: value for key, value in request.headers.items()}
        
        return jsonify({
            "status": "success",
            "message": "Admin authentication successful",
            "headers": headers,
            "timestamp": time.time()
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/transmission/exists', methods=['GET'])
@admin_required
def check_transmission_key_exists():
    """Check if Transmission credentials exist in vault."""
    key_path = '/vault/.keys/transmission.key'
    command = ['/usr/bin/sudo', '/usr/bin/test', '-f', key_path]
    current_app.logger.info(f'[PIAVPN] Checking existence of {key_path} using command: {" ".join(command)}')
    try:
        # Use sudo to check file existence
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False
        )
        exists = result.returncode == 0
        current_app.logger.info(f'[PIAVPN] Command finished. Return code: {result.returncode}, stdout: "{result.stdout.strip()}", stderr: "{result.stderr.strip()}". Exists: {exists}')

        return jsonify({
            "exists": exists,
            "timestamp": time.time()
        }), 200

    except Exception as e:
        current_app.logger.error(f'[PIAVPN] Exception during check: {str(e)}')
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/enable', methods=['POST'])
@admin_required
def enable_vpn():
    """Enable the VPN service."""
    current_app.logger.info(f"[PIAVPN] Received request to enable VPN service from {request.remote_addr}")
    try:
        # Use the utility function to start the systemd service
        success, message = execute_systemctl_command('enable', 'transmissionPIA.service')
        
        if success:
            write_to_log('admin', 'VPN service enabled successfully', 'info')
            current_app.logger.info(f"[PIAVPN] Successfully enabled VPN service. Invalidating cache.")
            # Force update the monitor's cache immediately after enabling
            _vpn_monitor.invalidate_enabled_cache()
            return jsonify({
                "status": "success",
                "message": "VPN service enabled successfully",
                "timestamp": time.time()
            }), 200
        else:
            write_to_log('admin', f'Failed to enable VPN service: {message}', 'error')
            return jsonify({
                "status": "error",
                "error": f"Failed to enable VPN service: {message}",
                "timestamp": time.time()
            }), 500
            
    except Exception as e:
        write_to_log('admin', f'Failed to enable VPN service: {str(e)}', 'error')
        current_app.logger.error(f"[PIAVPN] Exception in enable_vpn: {str(e)}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/disable', methods=['POST'])
@admin_required
def disable_vpn():
    """Disable the VPN service."""
    current_app.logger.info(f"[PIAVPN] Received request to disable VPN service from {request.remote_addr}")
    try:
        # Use the utility function to stop the systemd service
        success, message = execute_systemctl_command('disable', 'transmissionPIA.service')
        
        if success:
            write_to_log('admin', 'VPN service disabled successfully', 'info')
            current_app.logger.info(f"[PIAVPN] Successfully disabled VPN service. Invalidating cache.")
            # Force update the monitor's cache immediately after disabling
            _vpn_monitor.invalidate_enabled_cache()
            return jsonify({
                "status": "success",
                "message": "VPN service disabled successfully",
                "timestamp": time.time()
            }), 200
        else:
            write_to_log('admin', f'Failed to disable VPN service: {message}', 'error')
            return jsonify({
                "status": "error",
                "error": f"Failed to disable VPN service: {message}",
                "timestamp": time.time()
            }), 500
            
    except Exception as e:
        write_to_log('admin', f'Failed to disable VPN service: {str(e)}', 'error')
        current_app.logger.error(f"[PIAVPN] Exception in disable_vpn: {str(e)}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@bp.route('/api/status/vpn/check-enabled', methods=['GET'])
@admin_required
def check_vpn_enabled():
    """Check if the VPN service is enabled in systemd using the cached method."""
    try:
        # Use the cached method from the VPNMonitor instance
        is_enabled = _vpn_monitor.check_if_service_enabled()
        
        current_app.logger.info(f"[PIAVPN] Enabled status check (from cache): {is_enabled}")
        
        return jsonify({
            "is_enabled": is_enabled,
            "timestamp": time.time()
        }), 200

    except Exception as e:
        current_app.logger.error(f"[PIAVPN] Error checking VPN enabled status: {str(e)}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": time.time()
        }), 500