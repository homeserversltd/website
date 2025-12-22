"""
Tailscale-specific routes and helper functions.
"""
from flask import jsonify, request, current_app
from .. import bp
import subprocess
import re
from backend.utils.utils import execute_systemctl_command, write_to_log
from .utils import (
    get_tailscale_status,
    get_tailnet_name,
    update_tailnet_name_v2 as update_tailnet_name,
    generate_login_url,
    cache_login_url,
    clear_login_url_cache
)
from backend.auth.decorators import admin_required

@bp.route('/api/status/tailscale', methods=['GET'])
def get_tailscale_status_endpoint():
    """Get Tailscale connection status."""
    status = get_tailscale_status()
    status['tailnet'] = get_tailnet_name()
    return jsonify(status), 200

@bp.route('/api/status/tailscale/connect', methods=['POST'])
@admin_required
def connect_tailscale():
    """Connect to Tailscale network or return a cached login URL without spamming."""
    try:
        # If already connected, report success and clear any stale cached link
        status = get_tailscale_status()
        if status.get('status') == 'connected':
            clear_login_url_cache()
            write_to_log('admin', '[TAIL] Tailscale already connected', 'info')
            return jsonify({"success": True, "isFirstRun": False}), 200

        # Not connected → try to get (or reuse) a login URL without spamming
        login_url = generate_login_url()
        if login_url:
            cache_login_url(login_url)
            write_to_log('admin', '[TAIL] Tailscale login URL ready', 'info')
            return jsonify({
                "success": True,
                "isFirstRun": True,
                "authUrl": login_url
            }), 200

        # Passive fallback: attempt to scrape systemctl output without invoking another up
        service_status_result = subprocess.run(
            ['/usr/bin/sudo', '/usr/bin/systemctl', 'status', 'tailscaled.service'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if service_status_result.returncode == 0:
            login_match = re.search(r'https://login\.tailscale\.com/a/[a-zA-Z0-9]+', service_status_result.stdout)
            if login_match:
                login_url = login_match.group(0)
                cache_login_url(login_url)
                write_to_log('admin', '[TAIL] Tailscale login URL found from service status', 'info')
                return jsonify({
                    "success": True,
                    "isFirstRun": True,
                    "authUrl": login_url
                }), 200

        current_app.logger.error("[TAIL] Unable to obtain Tailscale login URL")
        return jsonify({
            "success": False,
            "error": "Unable to obtain Tailscale login URL. Please retry.",
            "isFirstRun": True
        }), 500
        
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error connecting Tailscale: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/api/status/tailscale/authkey', methods=['POST'])
@admin_required
def authenticate_with_authkey():
    """Authenticate Tailscale using an auth key."""
    try:
        data = request.get_json()
        if not data:
            current_app.logger.error("[TAIL] No JSON data received in authkey request")
            return jsonify({"success": False, "error": "No JSON data received"}), 400
            
        auth_key = data.get('authKey', '').strip()
        if not auth_key:
            current_app.logger.error("[TAIL] Missing authKey parameter")
            return jsonify({"success": False, "error": "Missing authKey parameter"}), 400
            
        # Validate auth key format (tskey-auth-* or tskey-client-*)
        if not re.match(r'^tskey-(auth|client)-[a-zA-Z0-9]+$', auth_key):
            current_app.logger.error(f"[TAIL] Invalid auth key format: {auth_key[:20]}...")
            return jsonify({"success": False, "error": "Invalid auth key format"}), 400
            
        current_app.logger.info(f"[TAIL] Attempting authentication with auth key: {auth_key[:20]}...")
        
        # Run tailscale up with auth key
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/bin/tailscale', 'up', '--authkey', auth_key],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        current_app.logger.info(f"[TAIL] Auth key command return code: {result.returncode}")
        current_app.logger.info(f"[TAIL] Auth key command stdout: {result.stdout}")
        
        if result.returncode != 0:
            error_msg = result.stderr.strip() or result.stdout.strip() or "Authentication failed"
            current_app.logger.error(f"[TAIL] Auth key authentication failed: {error_msg}")
            return jsonify({
                "success": False,
                "error": f"Authentication failed: {error_msg}"
            }), 400
            
        # Check if authentication was successful
        if "Success." in result.stdout or "Machine authorized" in result.stdout:
            write_to_log('admin', f'[TAIL] Tailscale authenticated successfully with auth key', 'info')
            clear_login_url_cache()
            return jsonify({
                "success": True,
                "message": "Successfully authenticated with auth key"
            }), 200
        else:
            # Even if no explicit success message, check if no errors occurred
            write_to_log('admin', f'[TAIL] Tailscale auth key command completed', 'info')
            clear_login_url_cache()
            return jsonify({
                "success": True,
                "message": "Auth key authentication completed"
            }), 200
            
    except subprocess.TimeoutExpired:
        current_app.logger.error("[TAIL] Timeout during auth key authentication")
        return jsonify({"success": False, "error": "Authentication timed out"}), 500
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error in auth key authentication: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/api/status/tailscale/disconnect', methods=['POST'])
@admin_required
def disconnect_tailscale():
    """Disconnect from Tailscale network."""
    try:
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/bin/tailscale', 'down'],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            current_app.logger.error(f"[TAIL] Failed to disconnect: {result.stderr}")
            return jsonify({
                "success": False,
                "error": result.stderr
            }), 400
            
        write_to_log('admin', '[TAIL] Tailscale disconnected successfully', 'info')
        return jsonify({"success": True}), 200
        
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error disconnecting Tailscale: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/api/status/tailscale/enable', methods=['POST'])
@admin_required
def enable_tailscale():
    """Enable Tailscale service."""
    try:
        enable_success, enable_output = execute_systemctl_command('enable', 'tailscaled.service')
        if not enable_success:
            current_app.logger.error(f"[TAIL] Failed to enable service: {enable_output}")
            return jsonify({
                "success": False, 
                "error": f"Failed to enable service: {enable_output}"
            }), 500

        write_to_log('admin', '[TAIL] Tailscale service enabled', 'info')
        return jsonify({"success": True, "message": enable_output}), 200
        
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error enabling Tailscale: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/api/status/tailscale/disable', methods=['POST'])
@admin_required
def disable_tailscale():
    """Disable Tailscale service."""
    try:
        disable_success, disable_output = execute_systemctl_command('disable', 'tailscaled.service')
        if not disable_success:
            current_app.logger.error(f"[TAIL] Failed to disable service: {disable_output}")
            return jsonify({
                "success": False, 
                "error": f"Failed to disable service: {disable_output}"
            }), 500
        
        write_to_log('admin', '[TAIL] Tailscale service disabled', 'info')
        return jsonify({"success": True, "message": disable_output}), 200
        
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error disabling Tailscale: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route('/api/status/tailscale/config', methods=['GET', 'POST'])
@admin_required
def handle_tailscale_config():
    """Get or update Tailscale configuration."""
    if request.method == 'GET':
        try:
            tailnet_name = get_tailnet_name()
            return jsonify({"tailnet": tailnet_name}), 200
            
        except Exception as e:
            current_app.logger.error(f"[TAIL] Error getting Tailscale config: {str(e)}")
            return jsonify({"error": str(e)}), 500
            
    elif request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                current_app.logger.error("[TAIL] No JSON data received in config update")
                return jsonify({"error": "No JSON data received"}), 400
                
            tailnet_name = data.get('tailnetName')
            if not tailnet_name:
                current_app.logger.error("[TAIL] Missing tailnetName parameter in config update")
                return jsonify({"error": "Missing tailnetName parameter"}), 400
                
            success, message = update_tailnet_name(tailnet_name)
            if success:
                write_to_log('admin', f'[TAIL] Tailscale tailnet name updated to: {tailnet_name}', 'info')
                return jsonify({"success": True, "message": message}), 200
            else:
                current_app.logger.error(f"[TAIL] Failed to update tailnet name: {message}")
                return jsonify({"success": False, "error": message}), 500
                
        except Exception as e:
            current_app.logger.error(f"[TAIL] Error in POST /api/status/tailscale/config: {str(e)}")
            return jsonify({"error": str(e)}), 500

@bp.route('/api/status/tailscale/update-tailnet', methods=['POST'])
@admin_required
def update_tailnet():
    """Update nginx config and SSL certs to match the current tailnet using the system script."""
    try:
        current_app.logger.info("[TAIL] Starting tailnet update process")
        
        data = request.get_json()
        if not data:
            current_app.logger.error("[TAIL] No JSON data received in update request")
            return jsonify({"error": "No JSON data received"}), 400
            
        tailnet_name = data.get('tailnetName')
        if not tailnet_name:
            current_app.logger.error("[TAIL] Missing tailnetName parameter in update request")
            return jsonify({"error": "Missing tailnetName parameter"}), 400
        
        success, message = update_tailnet_name(tailnet_name)
        
        if success:
            current_app.logger.info("[TAIL] Successfully updated tailnet configuration")
            return jsonify({"success": True, "message": message}), 200
        else:
            current_app.logger.error(f"[TAIL] Failed to update tailnet configuration: {message}")
            return jsonify({"success": False, "error": message}), 500
            
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error in update_tailnet endpoint: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500 