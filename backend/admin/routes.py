"""
Admin routes and authentication functions.
"""
import json
import os
import re
import subprocess
import time
from typing import Tuple, Dict, Optional
import psutil
from flask import current_app, jsonify, request, Response, stream_with_context, send_file
from . import bp
from backend.utils.utils import write_to_log, get_global_mounts, decrypt_data, execute_command, safe_write_config, update_config, is_using_factory_config, factory_mode_error, execute_systemctl_command
from .utils import (
    check_vault_mounted, 
    attempt_mount_vault, 
    verify_theme
)
from backend.auth.decorators import visibility_required, admin_required

@bp.route('/api/pre-unlock', methods=['POST'])
def pre_unlock_vault():
    """
    API endpoint to attempt unlocking the vault before app initialization.
    This is used by the pre-app vault authentication screen.
    Expects JSON: {'encryptedPassword': 'encrypted_password_string'}
    Returns JSON: {'success': true/false, 'message': 'success/error message'}
    """
    try:
        # Check if vault is already mounted
        if check_vault_mounted():
            return jsonify({'success': True, 'message': 'Vault is already mounted.'}), 200

        # Verify payload
        data = request.get_json()
        if not data or 'encryptedPassword' not in data:
            return jsonify({'success': False, 'message': 'Encrypted password is required'}), 400

        encrypted_password = data['encryptedPassword']
        
        # Decrypt the password
        password = decrypt_data(encrypted_password)
        if not password:
            return jsonify({'success': False, 'message': 'Failed to decrypt password data'}), 400
            
        # Use our dedicated script to mount the vault
        process = subprocess.Popen(
            ['/usr/bin/sudo', '/usr/local/sbin/websiteMountVault.sh'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Send the password to the script via stdin
        stdout, stderr = process.communicate(input=password)
        
        # Check if the command was successful
        if process.returncode == 0:
            # Successfully mounted
            write_to_log('system', 'Vault successfully mounted via web pre-auth', 'info')
            return jsonify({'success': True, 'message': 'Vault mounted successfully'}), 200
        else:
            # Failed to mount
            current_app.logger.error(f"Vault pre-unlock failed: {stderr}")
            write_to_log('system', 'Vault pre-unlock failed', 'error')
            return jsonify({
                'success': False, 
                'message': 'Failed to unlock the vault. Please check your password and try again.',
                'error': stderr
            }), 400

    except Exception as e:
        current_app.logger.error(f"Error in /api/pre-unlock: {str(e)}")
        return jsonify({'success': False, 'message': 'Internal server error', 'error': str(e)}), 500

@bp.route('/api/validatePin', methods=['POST'])
def validate_pin():
    """Validate admin PIN against stored configuration."""
    try:
        data = request.get_json()
        pin = data.get('pin')
        
        if not pin:
            return jsonify({'error': 'PIN is required'}), 400
            
        # Read PIN from config file
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            stored_pin = config.get('global', {}).get('admin', {}).get('pin')
            
        if not stored_pin:
            return jsonify({'error': 'Admin PIN not configured'}), 500
            
        # Compare PINs
        if pin == stored_pin:
            # Import functions from auth.validation
            from backend.auth.validation import generate_admin_token, register_admin_token
            
            # Generate a secure session token
            session_token = generate_admin_token()
            
            # Register the token in our token store
            register_admin_token(session_token)
            
            write_to_log('admin', 'Admin PIN validated successfully - entering admin mode', 'info')
            return jsonify({
                'success': True,
                'token': session_token,
                'sessionTimeout': 30 * 60  # 30 minutes in seconds
            }), 200
        else:
            write_to_log('admin', 'Failed admin PIN validation attempt', 'warn')
            return jsonify({'error': 'Invalid PIN'}), 401
            
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error validating PIN: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/admin/pin', methods=['POST'])
@admin_required
def change_pin():
    """Change admin PIN with current PIN verification."""
    try:
        # Check if we're using factory config
        if is_using_factory_config():
            return factory_mode_error()

        data = request.get_json()
        new_pin = data.get('pin')
        current_pin = data.get('currentPin')
        
        if not new_pin or not current_pin:
            return jsonify({'error': 'Both current and new PIN are required'}), 400
            
        # Read current config and verify current PIN
        with open(current_app.config['HOMESERVER_CONFIG'], 'r') as f:
            config = json.load(f)
            stored_pin = config.get('global', {}).get('admin', {}).get('pin')
            
        # Verify current PIN matches
        if current_pin != stored_pin:
            return jsonify({'error': 'Current PIN is incorrect'}), 401
            
        # Update PIN in config
        if 'global' not in config:
            config['global'] = {}
        if 'admin' not in config['global']:
            config['global']['admin'] = {}
            
        config['global']['admin']['pin'] = new_pin
        
        # Write updated config safely
        success = update_config(config)
        if not success:
            return jsonify({'error': 'Failed to update PIN'}), 500
            
        write_to_log('admin', 'Admin PIN updated successfully', 'info')
            
        return jsonify({'success': True}), 200
            
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error changing PIN: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/logout', methods=['POST'])
def logout():
    """Handle admin logout."""
    try:
        # Get the token from headers
        token = request.headers.get('X-Admin-Token')
        
        # If token exists, remove it from the valid tokens
        if token:
            from backend.auth.validation import ADMIN_TOKENS
            if token in ADMIN_TOKENS:
                del ADMIN_TOKENS[token]
                current_app.logger.info(f"Admin token invalidated during logout: {token[:5]}***")
        
        write_to_log('admin', 'Admin logged out', 'info')
        return jsonify({'success': True}), 200
    except Exception as e:
        current_app.logger.error(f'Error during logout: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/vault/status', methods=['GET'])
def get_vault_status():
    """
    API endpoint to check the vault's mount status.
    Returns JSON: {'mounted': true/false}.
    """
    try:
        is_mounted = check_vault_mounted()
        current_app.logger.info(f"Vault status check: mounted={is_mounted}")
        return jsonify({'mounted': is_mounted}), 200
    except Exception as e:
        current_app.logger.error(f"Error in /api/vault/status: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/vault/unlock', methods=['POST'])
def unlock_vault():
    """
    API endpoint to attempt unlocking (mounting) the vault.
    Expects JSON: {'password': 'user_provided_password'}
    Returns JSON: {'success': true/false, 'message': 'success/error message'}
    """
    try:
        data = request.get_json()
        if not data or 'password' not in data:
            return jsonify({'success': False, 'message': 'Password is required'}), 400

        password = data['password']
        success, message = attempt_mount_vault(password)
        return jsonify({'success': success, 'message': message}), 200 if success else 400

    except Exception as e:
        current_app.logger.error(f"Error in /api/vault/unlock: {str(e)}")
        return jsonify({'success': False, 'message': 'Internal server error'}), 500

@bp.route('/api/themes')
def get_themes():
    try:
        themes_dir = '/var/www/homeserver/src/config/themes'
        themes = {}
        
        # Ensure themes directory exists
        if not os.path.exists(themes_dir):
            os.makedirs(themes_dir)
            
        # Retrieve default theme properties from configuration for validation and defaults
        required_props = current_app.config.get('DEFAULT_THEME')
            
        # Load each theme file
        for filename in os.listdir(themes_dir):
            if filename.endswith('.json'):
                theme_name = filename[:-5]  # Remove .json extension
                try:
                    with open(os.path.join(themes_dir, filename)) as f:
                        theme_data = json.load(f)
                        
                    # Validate theme using the helper function
                    if verify_theme(theme_data, required_props):
                        themes[theme_name] = theme_data
                    else:
                        current_app.logger.warning(f'Theme {filename} is missing required properties or has invalid color values')
                        
                except json.JSONDecodeError:
                    current_app.logger.error(f'Invalid JSON in theme file: {filename}')
                except Exception as e:
                    current_app.logger.error(f'Error loading theme {filename}: {str(e)}')
                    
        # If no valid themes found, create default light theme
        if not themes:
            themes['light'] = required_props
            
            # Save default theme
            with open(os.path.join(themes_dir, 'light.json'), 'w') as f:
                json.dump(required_props, f, indent=2)
                
            current_app.logger.info('Created default light theme')
        
        return jsonify(themes), 200
        
    except Exception as e:
        current_app.logger.error(f'Error loading themes: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/system/log', methods=['POST'])
def system_log():
    """
    Centralized logging endpoint for all tablets.
    Expects JSON: {'tablet': 'tablet_name', 'message': 'log_message', 'level': 'info/error/warn'}
    Returns JSON: {'success': true/false}
    """
    try:
        data = request.get_json()
        if not data or 'tablet' not in data or 'message' not in data:
            return jsonify({'error': 'Missing tablet or message'}), 400
            
        tablet = data.get('tablet')
        message = data.get('message')
        level = data.get('level', 'info')
        
        # Validate tablet name
        if not re.match(r'^[a-zA-Z0-9_-]+$', tablet):
            return jsonify({'error': 'Invalid tablet name'}), 400
            
        # Validate log level
        if level not in ['info', 'error', 'warn']:
            return jsonify({'error': 'Invalid log level'}), 400
            
        success = write_to_log(tablet, message, level)
        if success:
            return jsonify({'success': True}), 200
        else:
            return jsonify({'error': 'Failed to write to log'}), 500
            
    except Exception as e:
        current_app.logger.error(f'Error in system_log: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/system/update', methods=['POST'])
@admin_required
def update_system():
    """Update the system software and configurations."""
    try:
        # Log the update attempt
        write_to_log('admin', 'System update initiated', 'info')
        
        # Path to update manager script
        update_script = '/usr/local/sbin/updateManager.sh'
        
        if not os.path.exists(update_script):
            raise FileNotFoundError('Update manager not found')
            
        if not os.access(update_script, os.X_OK):
            raise PermissionError('Update manager is not executable')

        def generate_output():
            process = subprocess.Popen(
                ['/usr/bin/sudo', 'bash', update_script],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                universal_newlines=True
            )
            
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    yield f"data: {json.dumps({'output': output.strip()})}\n\n"
            
            rc = process.poll()
            yield f"data: {json.dumps({'complete': True, 'exitCode': rc})}\n\n"

        return Response(
            stream_with_context(generate_output()),
            mimetype='text/event-stream'
        )
        
    except (FileNotFoundError, PermissionError) as e:
        current_app.logger.error(f'Update failed: {str(e)}')
        write_to_log('admin', f'Update failed: {str(e)}', 'error')
        return jsonify({
            'error': str(e),
            'details': 'Ensure updateManager.sh exists in /usr/local/sbin and is executable'
        }), 404 if isinstance(e, FileNotFoundError) else 403
        
    except Exception as e:
        current_app.logger.error(f'Error during system update: {str(e)}')
        write_to_log('admin', f'Update failed: {str(e)}', 'error')
        return jsonify({
            'error': 'Failed to update system',
            'details': str(e)
        }), 500

@bp.route('/api/admin/system/update-password', methods=['POST'])
@admin_required
def update_admin_password():
    """
    Update the admin password.
    
    This endpoint:
    1. Verifies the current admin password
    2. Updates the service suite key
    3. Updates the system user password
    4. Rolls back service suite key change if system password update fails
    
    Request JSON: {
        oldPassword: encrypted old password,
        newPassword: encrypted new password
    }
    """
    try:
        data = request.get_json()
        if not data or 'oldPassword' not in data or 'newPassword' not in data:
            return jsonify({
                'success': False,
                'error': 'Both old and new passwords are required'
            }), 400
        
        # Decrypt the passwords
        encrypted_old_password = data.get('oldPassword')
        encrypted_new_password = data.get('newPassword')
        
        old_password = decrypt_data(encrypted_old_password)
        new_password = decrypt_data(encrypted_new_password)
        
        if not old_password or not new_password:
            return jsonify({
                'success': False,
                'error': 'Failed to decrypt password data'
            }), 400
        
        # Verify current password by running exportServiceSuite.sh
        current_app.logger.info("[PWMAN] Verifying current admin password")
        
        # Use execute_command instead of subprocess.run
        success, actual_password, error = execute_command(['/usr/bin/sudo', '/vault/scripts/exportServiceSuite.sh'])
        
        if not success:
            current_app.logger.error(f"[PWMAN] Export service suite failed: {error}")
            return jsonify({
                'success': False,
                'error': 'Failed to verify current password'
            }), 500
        
        actual_password = actual_password.strip()
        
        # Compare passwords
        if old_password != actual_password:
            current_app.logger.warning("[PWMAN] Invalid current password provided")
            return jsonify({
                'success': False,
                'error': 'Current password is incorrect'
            }), 401
        
        # Update service suite key using change_service_suite_key.sh with non-interactive mode
        current_app.logger.info("[PWMAN] Updating service suite key")
        
        # Call the script with the --non-interactive flag and both passwords
        service_key_success, output, error = execute_command([
            '/usr/bin/sudo', 
            '/vault/keyman/change_service_suite_key.sh',
            '--non-interactive',
            old_password,
            new_password
        ])
        
        if not service_key_success:
            current_app.logger.error(f"[PWMAN] Service suite key update failed: {error}")
            write_to_log('admin', 'Service suite key update failed', 'error')
            detailed_error = f"Failed to update service suite key: {error}"
            if output:
                detailed_error += f" | Output: {output}"
            return jsonify({
                'success': False,
                'error': detailed_error
            }), 500
        
        write_to_log('admin', 'Service suite key updated successfully', 'info')
        
        # Update the system admin user password
        current_app.logger.info("[PWMAN] Updating system admin user password")
        
        # Create a temporary file in ramdisk with the password change command
        temp_file = '/mnt/ramdisk/pwd_change.txt'
        try:
            # Ensure temp file is removed even if it exists
            if os.path.exists(temp_file):
                os.unlink(temp_file)
                
            with open(temp_file, 'w') as f:
                f.write(f"admin:{new_password}")
            os.chmod(temp_file, 0o600)  # Secure the file
            
            # Log the command we're about to run (without the password)
            current_app.logger.info("[PWMAN] Executing chpasswd with sudo")
            
            # Use subprocess directly with the file
            with open(temp_file, 'r') as f:
                password_data = f.read()
            
            result = subprocess.run(
                ['/usr/bin/sudo', '/usr/sbin/chpasswd'],
                input=password_data,
                text=True,
                capture_output=True,
                env={"LANG": "C"}  # Force English error messages
            )
            
            # Immediately remove the temp file
            os.unlink(temp_file)
            
            # Detailed logging of the result
            if result.returncode != 0:
                current_app.logger.error(f"[PWMAN] chpasswd failed with return code: {result.returncode}")
                if result.stderr:
                    current_app.logger.error(f"[PWMAN] chpasswd stderr: {result.stderr}")
                if result.stdout:
                    current_app.logger.error(f"[PWMAN] chpasswd stdout: {result.stdout}")
                    
                # Check if we can get more details about PAM failure
                try:
                    auth_log = subprocess.run(
                        ['/usr/bin/sudo', '/usr/bin/tail', '-n', '50', '/var/log/auth.log'],
                        capture_output=True,
                        text=True
                    )
                    if auth_log.stdout:
                        current_app.logger.error(f"[PWMAN] Recent auth.log entries:\n{auth_log.stdout}")
                except Exception as auth_err:
                    current_app.logger.error(f"[PWMAN] Failed to check auth.log: {str(auth_err)}")
            
            user_pwd_success = result.returncode == 0
            error = result.stderr if result.stderr else result.stdout
            
        except Exception as e:
            current_app.logger.error(f"[PWMAN] Failed to update password: {str(e)}")
            # Ensure temp file is cleaned up even on error
            if os.path.exists(temp_file):
                os.unlink(temp_file)
            user_pwd_success = False
            error = str(e)

        if not user_pwd_success:
            current_app.logger.error(f"[PWMAN] Admin user password update failed: {error}")
            
            # Attempt to roll back the service suite key change using non-interactive mode
            current_app.logger.warning("[PWMAN] Rolling back service suite key change")
            
            rollback_success, _, rollback_error = execute_command([
                '/usr/bin/sudo', 
                '/vault/keyman/change_service_suite_key.sh',
                '--non-interactive',
                new_password,  # Now new password is the current one
                old_password   # And old password is what we want to restore
            ])
            
            if not rollback_success:
                current_app.logger.error(f"[PWMAN] Service suite key rollback failed: {rollback_error}")
                return jsonify({
                    'success': False,
                    'error': 'Critical error: Failed to update admin user password AND failed to roll back service suite key',
                    'details': {
                        'passwordUpdated': False,
                        'serviceKeyUpdated': True,
                        'rollbackFailed': True
                    }
                }), 500
            
            return jsonify({
                'success': False,
                'error': 'Failed to update admin user password, service suite key has been rolled back',
                'details': {
                    'passwordUpdated': False,
                    'serviceKeyUpdated': False,
                    'rollbackSucceeded': True
                }
            }), 500
        
        try:
            samba_user = current_app.config['SAMBA_ADMIN_USER']
            smbpwd_proc = subprocess.run(
                ['/usr/bin/sudo', '/usr/bin/smbpasswd', '-s', samba_user],
                input=f"{new_password}\n{new_password}\n",
                text=True,
                capture_output=True
            )
            if smbpwd_proc.returncode != 0:
                current_app.logger.error(f"[PWMAN] smbpasswd failed: {smbpwd_proc.stderr}")
                return jsonify({
                    'success': False,
                    'error': 'Failed to update Samba password',
                    'details': smbpwd_proc.stderr
                }), 500
            else:
                current_app.logger.info("[PWMAN] Samba password updated successfully for admin user")
        except Exception as e:
            current_app.logger.error(f"[PWMAN] Exception updating Samba password: {str(e)}")
            return jsonify({
                'success': False,
                'error': 'Exception updating Samba password',
                'details': str(e)
            }), 500
        
        ssh_restart_success, ssh_restart_output = execute_systemctl_command('restart', 'ssh.service')
        if not ssh_restart_success:
            current_app.logger.warning(f"[PWMAN] Failed to restart ssh.service, trying sshd.service: {ssh_restart_output}")
            ssh_restart_success, ssh_restart_output = execute_systemctl_command('restart', 'sshd.service')
        if ssh_restart_success:
            current_app.logger.info("[PWMAN] SSH service restarted successfully")
        else:
            current_app.logger.error(f"[PWMAN] Failed to restart SSH service: {ssh_restart_output}")
        
        samba_restart_success, samba_restart_output = execute_systemctl_command('restart', 'smbd.service')
        if samba_restart_success:
            current_app.logger.info("[PWMAN] Samba (smbd) service restarted successfully")
        else:
            current_app.logger.error(f"[PWMAN] Failed to restart Samba (smbd) service: {samba_restart_output}")
        current_app.logger.info("[PWMAN] Admin password updated successfully")
        write_to_log('admin', 'Admin password updated successfully', 'info')
        
        return jsonify({
            'success': True,
            'message': 'Admin password updated successfully',
            'details': {
                'passwordUpdated': True,
                'serviceKeyUpdated': True
            }
        }), 200
            
    except Exception as e:
        current_app.logger.error(f'[PWMAN] Error updating admin password: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@bp.route('/api/verifyPin', methods=['POST'])
def verify_pin():
    """
    Simple PIN verification that returns a boolean without transitioning to admin mode.
    Expects encrypted PIN in request body.
    Returns: {'verified': true/false}
    """
    try:
        data = request.get_json()
        encrypted_pin = data.get('encryptedPin')
        
        if not encrypted_pin:
            return jsonify({'verified': False, 'error': 'Encrypted PIN is required'}), 400
            
        # Decrypt the PIN using our secure transmission system
        pin = decrypt_data(encrypted_pin)
        if pin is None:
            # Primary decryption failed, try with client's fallback key
            current_app.logger.info("[VERIFY-PIN] Primary key decryption failed. Attempting with client fallback key.")
            FALLBACK_KEY_STRING = '0123456789abcdef0123456789abcdef' # Client's fallback
            FALLBACK_KEY_BYTES = FALLBACK_KEY_STRING.encode('utf-8') # Ensure this matches client-side key derivation for CryptoJS.enc.Utf8.parse
            
            pin = decrypt_data(encrypted_pin, key_override=FALLBACK_KEY_BYTES)
            
            if pin is None:
                current_app.logger.error("[VERIFY-PIN] Fallback key decryption also failed.")
                return jsonify({'verified': False, 'error': 'Failed to decrypt PIN (tried main and fallback keys)'}), 400
            else:
                current_app.logger.info("[VERIFY-PIN] PIN successfully decrypted with client fallback key.")
            
        # Read PIN from config file
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            stored_pin = config.get('global', {}).get('admin', {}).get('pin')
            
        if not stored_pin:
            return jsonify({'verified': False, 'error': 'Admin PIN not configured'}), 500
            
        # Compare PINs and return simple boolean response
        is_verified = pin == stored_pin
        write_to_log('admin', f'PIN verification attempt: {"successful" if is_verified else "failed"}', 'info')
        return jsonify({'verified': is_verified}), 200
            
    except FileNotFoundError:
        return jsonify({'verified': False, 'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'verified': False, 'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error verifying PIN: {str(e)}')
        return jsonify({'verified': False, 'error': 'Internal server error'}), 500

@bp.route('/api/admin/logs/homeserver', methods=['GET'])
@admin_required
def get_homeserver_logs():
    """
    API endpoint to retrieve contents of the homeserver.log file.
    Now returns logs in reverse chronological order (newest first).
    Supports pagination via offset and limit query parameters, where offset=0 means the most recent lines.

    Returns:
        Response with log content and pagination metadata
    """
    try:
        # Get pagination parameters with defaults
        offset = request.args.get('offset', default=0, type=int)
        limit = request.args.get('limit', default=1000, type=int)

        # Cap the limit to prevent excessive memory usage
        if limit > 5000:
            limit = 5000

        log_file = '/var/log/homeserver/homeserver.log'

        if not os.path.exists(log_file):
            return jsonify({
                'status': 'error',
                'message': 'Log file not found',
                'logs': []
            }), 404

        # Get file size for metadata
        file_size = os.path.getsize(log_file)

        # Read all lines (safe for rotated logs, but optimize if needed)
        with open(log_file, 'r') as f:
            all_lines = f.readlines()
        total_lines = len(all_lines)

        # Calculate slice for newest-first paging
        # offset=0 means most recent, offset=limit means next page, etc.
        start = max(total_lines - offset - limit, 0)
        end = total_lines - offset
        lines = all_lines[start:end]
        # Reverse so newest is first
        lines = [line.rstrip('\n') for line in reversed(lines)]
        line_count = len(lines)

        return jsonify({
            'status': 'success',
            'logs': lines,
            'metadata': {
                'offset': offset,
                'limit': limit,
                'returned_lines': line_count,
                'total_lines': total_lines,
                'file_size': file_size,
                'file_path': log_file
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f'Error retrieving homeserver logs: {str(e)}')
        return jsonify({
            'status': 'error',
            'message': f'Failed to retrieve logs: {str(e)}',
            'logs': []
        }), 500

@bp.route('/api/admin/logs/homeserver/clear', methods=['POST'])
@admin_required
def clear_homeserver_logs():
    """
    API endpoint to clear the homeserver.log file.
    Requires admin authentication.
    
    Returns:
        JSON response indicating success or failure
    """
    try:
        log_file = '/var/log/homeserver/homeserver.log'
        
        if not os.path.exists(log_file):
            return jsonify({
                'status': 'error',
                'message': 'Log file not found'
            }), 404
            
        # Clear the log file
        with open(log_file, 'w') as f:
            f.write('')  # Write empty string to clear the file
            
        write_to_log('admin', 'Homeserver logs cleared', 'info')
            
        return jsonify({
            'status': 'success',
            'message': 'Log file cleared successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f'Error clearing homeserver logs: {str(e)}')
        return jsonify({
            'status': 'error',
            'message': f'Failed to clear logs: {str(e)}'
        }), 500

@bp.route('/api/admin/ping', methods=['GET'])
@admin_required
def admin_ping():
    """
    Lightweight endpoint to keep the admin session alive.
    """
    return jsonify({'success': True}), 200

@bp.route('/api/admin/download-root-crt')
@admin_required
def download_root_crt():
    """Create and download a platform-specific certificate bundle.
    
    Platform options:
    - windows: .cer file in DER format
    - android: .crt file in PEM format
    - chromeos: .crt file in PEM format
    - linux: .p12 bundle with private key
    - macos: .p12 bundle with private key
    """
    try:
        platform = request.args.get('platform', 'linux')
        
        # Validate platform
        valid_platforms = ['windows', 'android', 'chromeos', 'linux', 'macos']
        if platform not in valid_platforms:
            return jsonify({'error': f'Invalid platform. Must be one of: {", ".join(valid_platforms)}'}), 400
        
        # Create the certificate bundle
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/local/sbin/createCertBundle.sh', platform],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Set output file based on platform
        if platform == 'windows':
            output_file = '/tmp/homeserver_certs/homeserver_ca.cer'
            mime_type = 'application/x-x509-ca-cert'
            filename = 'homeserver_ca.cer'
        elif platform in ['android', 'chromeos']:
            output_file = '/tmp/homeserver_certs/homeserver_ca.crt'
            mime_type = 'application/x-x509-ca-cert'
            filename = 'homeserver_ca.crt'
        else:  # linux or macos
            output_file = '/tmp/homeserver_certs/homeserver_ca.p12'
            mime_type = 'application/x-pkcs12'
            filename = 'homeserver_ca.p12'
        
        # Clean up any existing files
        subprocess.run(['/usr/bin/sudo', '/bin/rm', '-f', '/tmp/homeserver_certs/homeserver_ca.*'])
        
        # Log the certificate download
        write_to_log('admin', f'Root CA certificate downloaded for platform: {platform}', 'info')
        
        return send_file(
            output_file,
            mimetype=mime_type,
            as_attachment=True,
            download_name=filename
        )
        
    except subprocess.CalledProcessError as e:
        current_app.logger.error(f"Error creating certificate bundle: {e.stderr}")
        write_to_log('admin', f'Failed to create certificate bundle: {e.stderr}', 'error')
        return jsonify({'error': 'Failed to create certificate bundle'}), 500
    except Exception as e:
        current_app.logger.error(f"Unexpected error: {str(e)}")
        write_to_log('admin', f'Unexpected error during certificate download: {str(e)}', 'error')
        return jsonify({'error': 'An unexpected error occurred'}), 500

@bp.route('/api/admin/refresh-root-crt', methods=['POST'])
@admin_required
def refresh_root_crt():
    """
    Refresh the HomeServer root CA certificate by generating a new one.
    This will:
    1. Generate a new self-signed certificate using sslKey.sh
    2. Copy the new certificate to the web root
    3. Restart nginx to use the new certificate
    """
    current_app.logger.info('[CACERT] /api/admin/refresh-root-crt accessed')
    write_to_log('admin', 'Root CA certificate refresh initiated', 'info')

    try:
        # Run sslKey.sh to generate new certificate
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/local/sbin/sslKey.sh'],
            capture_output=True,
            text=True,
            check=True
        )
        
        if result.returncode != 0:
            current_app.logger.error(f"[CACERT] Failed to generate new certificate: {result.stderr}")
            write_to_log('admin', f'Failed to generate new certificate: {result.stderr}', 'error')
            return jsonify({
                'success': False,
                'error': 'Failed to generate new certificate',
                'details': result.stderr
            }), 500

        # Copy the new certificate to web root
        copy_result = subprocess.run(
            ['/usr/bin/sudo', '/bin/cp', '/etc/ssl/home.arpa/cert.pem', '/var/www/homeserver/certs/root.crt'],
            capture_output=True,
            text=True,
            check=True
        )

        if copy_result.returncode != 0:
            current_app.logger.error(f"[CACERT] Failed to copy certificate to web root: {copy_result.stderr}")
            write_to_log('admin', f'Failed to copy certificate to web root: {copy_result.stderr}', 'error')
            return jsonify({
                'success': False,
                'error': 'Failed to copy certificate to web root',
                'details': copy_result.stderr
            }), 500

        # Set proper permissions on the web-accessible certificate
        chmod_result = subprocess.run(
            ['/usr/bin/sudo', '/bin/chmod', '644', '/var/www/homeserver/certs/root.crt'],
            capture_output=True,
            text=True,
            check=True
        )

        if chmod_result.returncode != 0:
            current_app.logger.error(f"[CACERT] Failed to set certificate permissions: {chmod_result.stderr}")
            write_to_log('admin', f'Failed to set certificate permissions: {chmod_result.stderr}', 'error')
            return jsonify({
                'success': False,
                'error': 'Failed to set certificate permissions',
                'details': chmod_result.stderr
            }), 500

        # Restart nginx to use the new certificate
        nginx_result = subprocess.run(
            ['/usr/bin/sudo', '/usr/bin/systemctl', 'restart', 'nginx.service'],
            capture_output=True,
            text=True,
            check=True
        )

        if nginx_result.returncode != 0:
            current_app.logger.error(f"[CACERT] Failed to restart nginx: {nginx_result.stderr}")
            write_to_log('admin', f'Failed to restart nginx: {nginx_result.stderr}', 'error')
            return jsonify({
                'success': False,
                'error': 'Failed to restart nginx',
                'details': nginx_result.stderr
            }), 500

        write_to_log('admin', 'Root CA certificate refreshed successfully', 'info')
        
        return jsonify({
            'success': True,
            'message': 'Root CA certificate refreshed successfully. You will need to clear your browser\'s SSL state and reinstall the new certificate.',
            'requiresReinstall': True
        }), 200

    except subprocess.CalledProcessError as e:
        current_app.logger.error(f"[CACERT] Process error while refreshing certificate: {e.stderr}")
        write_to_log('admin', f'Process error while refreshing certificate: {e.stderr}', 'error')
        return jsonify({
            'success': False,
            'error': 'Failed to refresh certificate',
            'details': e.stderr
        }), 500
    except Exception as e:
        current_app.logger.error(f"[CACERT] Unexpected error while refreshing certificate: {str(e)}")
        write_to_log('admin', f'Unexpected error while refreshing certificate: {str(e)}', 'error')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@bp.route('/api/crypto/getKey', methods=['GET'])
def get_crypto_key():
    """
    Get the encryption key used for secure transmissions.
    This endpoint is protected by admin authentication.
    """
    try:
        key_file = '/var/www/homeserver/src/config/secret.key'
        
        # Check if key file exists
        if not os.path.exists(key_file):
            current_app.logger.error(f"Secret key file not found at {key_file}")
            return jsonify({
                'success': False,
                'error': 'Secret key file not found'
            }), 404
            
        # Read the key from the file
        with open(key_file, 'r') as f:
            key = f.read().strip()
            
        # Log the access
        # write_to_log('admin', 'Crypto key retrieved', 'info')
        
        return jsonify({
            'success': True,
            'key': key
        }), 200
        
    except Exception as e:
        current_app.logger.error(f'Error retrieving crypto key: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@bp.route('/api/admin/crypto/test', methods=['POST'])
@admin_required
def crypto_test():
    """
    Test endpoint for crypto functions.
    Allows testing various encoding/encryption methods.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body required'}), 400
            
        # Import the decode function from controlman utils 
        from backend.admin.controlman.utils import decode_crypto_payload
        
        # Process the payload
        results = decode_crypto_payload(data)
        
        return jsonify({
            'success': True,
            'results': results
        }), 200
            
    except Exception as e:
        current_app.logger.error(f'Error in crypto test endpoint: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/api/admin/diskman/unlock-with-password', methods=['POST'])
@admin_required
def unlock_device_with_manual_password():
    """
    Unlock an encrypted LUKS device using a manually provided password.
    
    Expected JSON payload:
    {
        "device": "sdb",                    # Device name to unlock
        "encryptedPassword": "..."          # Encrypted password for the device
    }
    
    Returns:
        JSON response with status and details of the unlock operation
    """
    try:
        current_app.logger.info("[DISKMAN] Starting manual password unlock operation")
        data = request.get_json()
        
        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return jsonify({
                "status": "error",
                "message": "No JSON data provided"
            }), 400
            
        device = data.get('device')
        encrypted_password = data.get('encryptedPassword')
        
        current_app.logger.info(f"[DISKMAN] Manual unlock request for device: {device}")
        
        if not device or not encrypted_password:
            current_app.logger.error("[DISKMAN] Missing required parameters: device and encryptedPassword")
            return jsonify({
                "status": "error",
                "message": "Missing required parameters: device and encryptedPassword"
            }), 400
        
        # Decrypt the password using secure transmission utility
        password = decrypt_data(encrypted_password)
        if not password:
            current_app.logger.error("[DISKMAN] Failed to decrypt password")
            return jsonify({
                "status": "error",
                "message": "Failed to decrypt password data"
            }), 400
        
        # Use the existing diskman unlock functionality
        from backend.admin.diskman.utils import format_device_path, generate_mapper_name, get_disk_info, unlock_luks_device
        
        # Format device path
        device_path, device_name = format_device_path(device)
        current_app.logger.info(f"[DISKMAN] Formatted device path: {device_path}")
        
        # Check if device exists
        if not os.path.exists(device_path):
            current_app.logger.error(f"[DISKMAN] Device {device_path} does not exist")
            return jsonify({
                "status": "error",
                "message": f"Device {device_path} does not exist"
            }), 404
        
        # Get disk information to verify device is encrypted
        disk_info = get_disk_info()
        encrypted_devices = disk_info.get("encryptionInfo", {}).get("encrypted_devices", [])
        encrypted_device = next((ed for ed in encrypted_devices if ed.get("device") == device_path), None)
        
        if not encrypted_device:
            current_app.logger.error(f"[DISKMAN] Device {device_path} is not an encrypted LUKS device")
            return jsonify({
                "status": "error",
                "message": f"Device {device_path} is not an encrypted LUKS device"
            }), 400
        
        if encrypted_device.get("is_open", False):
            current_app.logger.error(f"[DISKMAN] Device {device_path} is already unlocked")
            return jsonify({
                "status": "error",
                "message": f"Device {device_path} is already unlocked"
            }), 400
        
        # Generate mapper name
        mapper_name = generate_mapper_name(device_name)
        current_app.logger.info(f"[DISKMAN] Using mapper name: {mapper_name}")
        
        # Attempt to unlock with the provided password
        current_app.logger.info(f"[DISKMAN] Attempting unlock with manual password for {device_path}")
        success, error_message = unlock_luks_device(device_path, mapper_name, password)
        
        if not success:
            current_app.logger.error(f"[DISKMAN] Manual password failed to unlock device: {error_message}")
            write_to_log('admin', f'Manual password unlock failed for device {device_name}: {error_message}', 'error')
            return jsonify({
                "status": "error",
                "message": "Manual password failed to unlock device. Please verify the password and try again.",
                "details": error_message
            }), 422
        
        # Success response
        mapper_path = f"/dev/mapper/{mapper_name}"
        result = {
            "device": device_path,
            "mapper": mapper_path,
            "is_open": True,
            "unlocked_with": "manual_password"
        }
        
        current_app.logger.info(f"[DISKMAN] Successfully unlocked device {device_path} with manual password")
        write_to_log('admin', f'Device {device_name} unlocked successfully with manual password', 'info')
        
        return jsonify({
            "status": "success",
            "message": f"Device {device_path} unlocked successfully with manual password",
            "details": result
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error during manual password unlock: {str(e)}")
        import traceback
        current_app.logger.error(f"[DISKMAN] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Internal server error during unlock operation",
            "details": str(e)
        }), 500
