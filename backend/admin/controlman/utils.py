"""
SSH control utilities for managing SSH password authentication.
"""
import subprocess
import re
import logging
from typing import Dict, Tuple
from backend.utils.utils import execute_systemctl_command, get_service_status, _get_secret_key
import base64
import urllib.parse
# Imports for AES decryption
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.padding import PKCS7
from cryptography.hazmat.backends import default_backend
import os

logger = logging.getLogger('homeserver')

# --- AES Decryption Helper ---
# IMPORTANT: Use the SAME key as the frontend!
SECRET_KEY = _get_secret_key()  # Must be bytes
# --- End AES Decryption Helper ---

def get_ssh_password_status() -> Dict[str, bool]:
    """
    Get the status of SSH password authentication.
    
    Returns:
        Dict with password_auth_enabled key indicating if SSH password authentication is enabled.
    """
    logger.debug("[CTLMAN] Getting SSH password authentication status")
    try:
        logger.debug("[CTLMAN] Reading SSH config file with sudo")
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/bin/cat', '/etc/ssh/sshd_config'],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            error_msg = f"Failed to read SSH config: {result.stderr}"
            logger.error(f"[CTLMAN] {error_msg}")
            return {"error": error_msg, "password_auth_enabled": False}
            
        # Look for uncommented PasswordAuthentication setting
        logger.debug("[CTLMAN] Parsing SSH config for PasswordAuthentication setting")
        match = re.search(r'^PasswordAuthentication\s+(yes|no)', result.stdout, re.MULTILINE)
        if match:
            status = match.group(1).lower() == "yes"
            logger.debug(f"[CTLMAN] Found explicit PasswordAuthentication setting: {match.group(0)}")
            return {"password_auth_enabled": status}
        else:
            # If not explicitly set, SSH defaults to 'yes'
            logger.debug("[CTLMAN] No explicit PasswordAuthentication setting found, default is 'yes'")
            return {"password_auth_enabled": True}
            
    except Exception as e:
        error_msg = f"Error checking SSH status: {str(e)}"
        logger.exception(f"[CTLMAN] {error_msg}")
        return {"error": error_msg, "password_auth_enabled": False}

def toggle_ssh_password_auth(enable: bool) -> Tuple[bool, str]:
    """
    Enable or disable SSH password authentication.
    
    Args:
        enable: True to enable password authentication, False to disable it.
        
    Returns:
        Tuple of (success, message)
    """
    logger.info(f"[CTLMAN] Toggling SSH password authentication to {'enabled' if enable else 'disabled'}")
    try:
        # Get current status first
        logger.debug("[CTLMAN] Checking current SSH password authentication status")
        current_status = get_ssh_password_status()
        if "error" in current_status:
            logger.error(f"[CTLMAN] Could not determine current status: {current_status['error']}")
            return False, current_status["error"]
            
        # If already in the desired state, no change needed
        if current_status["password_auth_enabled"] == enable:
            msg = f"SSH password authentication already {'enabled' if enable else 'disabled'}"
            logger.info(f"[CTLMAN] {msg}")
            return True, msg
            
        # Step 1: Copy sshd_config to a temp file
        logger.debug("[CTLMAN] STEP 1: Creating temporary copy of SSH config")
        copy_cmd = ['/usr/bin/sudo', '/usr/bin/cp', '/etc/ssh/sshd_config', '/tmp/sshd_config.new']
        logger.debug(f"[CTLMAN] Executing command: {' '.join(copy_cmd)}")
        copy_result = subprocess.run(
            copy_cmd,
            capture_output=True,
            text=True
        )
        
        if copy_result.returncode != 0:
            error_msg = f"Failed to create temp SSH config: {copy_result.stderr}"
            logger.error(f"[CTLMAN] Step 1 failed: {error_msg}")
            return False, error_msg
        logger.debug("[CTLMAN] Step 1 completed successfully")
            
        # Step 2: First, remove any existing uncommented PasswordAuthentication lines
        logger.debug("[CTLMAN] STEP 2.1: Removing any existing PasswordAuthentication lines")
        remove_cmd = ['/usr/bin/sudo', '/usr/bin/sed', '-i', '/^PasswordAuthentication/d', '/tmp/sshd_config.new']
        logger.debug(f"[CTLMAN] Executing remove command: {' '.join(remove_cmd)}")
        remove_result = subprocess.run(remove_cmd, capture_output=True, text=True)
        
        if remove_result.returncode != 0:
            # Clean up temp file
            logger.debug("[CTLMAN] Cleaning up temp file after removal command failure")
            subprocess.run(['/usr/bin/sudo', '/usr/bin/rm', '-f', '/tmp/sshd_config.new'])
            error_msg = f"Failed to remove existing SSH config lines: {remove_result.stderr}"
            logger.error(f"[CTLMAN] Step 2.1 failed: {error_msg}")
            return False, error_msg
        logger.debug("[CTLMAN] Step 2.1 completed successfully")
        
        # Step 2.2: Now add our desired setting after UsePAM
        logger.debug(f"[CTLMAN] STEP 2.2: Adding PasswordAuthentication {'yes' if enable else 'no'}")
        if enable:
            add_cmd = ['/usr/bin/sudo', '/usr/bin/sed', '-i', '/UsePAM/a PasswordAuthentication yes', '/tmp/sshd_config.new']
        else:
            add_cmd = ['/usr/bin/sudo', '/usr/bin/sed', '-i', '/UsePAM/a PasswordAuthentication no', '/tmp/sshd_config.new'] 
        
        logger.debug(f"[CTLMAN] Executing add command: {' '.join(add_cmd)}")
        add_result = subprocess.run(add_cmd, capture_output=True, text=True)
        
        if add_result.returncode != 0:
            # Clean up temp file
            logger.debug("[CTLMAN] Cleaning up temp file after add command failure")
            subprocess.run(['/usr/bin/sudo', '/usr/bin/rm', '-f', '/tmp/sshd_config.new'])
            error_msg = f"Failed to add SSH config setting: {add_result.stderr}"
            logger.error(f"[CTLMAN] Step 2.2 failed: {error_msg}")
            return False, error_msg
        logger.debug("[CTLMAN] Step 2.2 completed successfully")
            
        # Step 3: Copy the temp file back to the original location using dd
        logger.debug("[CTLMAN] STEP 3: Applying changes to system SSH config")
        dd_cmd = ['/usr/bin/sudo', '/usr/bin/dd', 'if=/tmp/sshd_config.new', 'of=/etc/ssh/sshd_config']
        logger.debug(f"[CTLMAN] Executing command: {' '.join(dd_cmd)}")
        dd_result = subprocess.run(
            dd_cmd,
            capture_output=True,
            text=True
        )
        
        # Step 4: Clean up temp file
        logger.debug("[CTLMAN] STEP 4: Cleaning up temp file")
        rm_cmd = ['/usr/bin/sudo', '/usr/bin/rm', '-f', '/tmp/sshd_config.new']
        logger.debug(f"[CTLMAN] Executing command: {' '.join(rm_cmd)}")
        rm_result = subprocess.run(rm_cmd, capture_output=True, text=True)
        
        if rm_result.returncode != 0:
            logger.warning(f"[CTLMAN] Failed to clean up temp file: {rm_result.stderr}")
        
        if dd_result.returncode != 0:
            error_msg = f"Failed to update SSH config: {dd_result.stderr}"
            logger.error(f"[CTLMAN] Step 3 failed: {error_msg}")
            return False, error_msg
        logger.debug("[CTLMAN] Step 3 completed successfully")
            
        # Step 5: Restart SSH service to apply changes
        logger.debug("[CTLMAN] STEP 5: Restarting SSH service")
        service_name = 'ssh.service'  # Default for most systems
        logger.info(f"[CTLMAN] Restarting SSH service ({service_name})")
        success, output = execute_systemctl_command('restart', service_name)
        
        if not success:
            # Try alternate service name for some distros
            alternate_service = 'sshd.service'
            logger.info(f"[CTLMAN] Failed to restart {service_name}, trying {alternate_service}")
            success, output = execute_systemctl_command('restart', alternate_service)
            
        if not success:
            error_msg = f"Failed to restart SSH service: {output}"
            logger.error(f"[CTLMAN] Step 5 failed: {error_msg}")
            return False, error_msg
        logger.debug("[CTLMAN] Step 5 completed successfully")
            
        success_msg = f"SSH password authentication successfully {'enabled' if enable else 'disabled'}"
        logger.info(f"[CTLMAN] {success_msg}")
        return True, success_msg
        
    except Exception as e:
        # Ensure temp file is cleaned up in case of exceptions
        try:
            logger.debug("[CTLMAN] Cleaning up temp file after exception")
            subprocess.run(['/usr/bin/sudo', '/usr/bin/rm', '-f', '/tmp/sshd_config.new'])
        except:
            pass
        
        error_msg = f"Error toggling SSH password authentication: {str(e)}"
        logger.exception(f"[CTLMAN] {error_msg}")
        return False, error_msg

def get_ssh_service_status() -> Dict:
    """
    Get the status of the SSH service (enabled/disabled and running/stopped).
    
    Returns:
        Dict with is_enabled and is_running keys indicating the SSH service status.
    """
    logger.debug("[CTLMAN] Getting SSH service status")
    try:
        # Try ssh service first
        service_result = get_service_status('ssh')
        
        # If service is unknown, try sshd
        if service_result['status'] == 'unknown':
            service_result = get_service_status('sshd')
        
        logger.debug(f"[CTLMAN] SSH service status: enabled={service_result['isEnabled']}, running={service_result['isActive']}")
        
        return {
            "is_enabled": service_result['isEnabled'],
            "is_running": service_result['isActive'],
            "service_name": service_result['systemdName']
        }
        
    except Exception as e:
        error_msg = f"Error checking SSH service status: {str(e)}"
        logger.exception(f"[CTLMAN] {error_msg}")
        return {"error": error_msg, "is_enabled": False, "is_running": False}

def control_ssh_service(enable: bool) -> Tuple[bool, str]:
    """
    Enable/disable and start/stop the SSH service.
    
    Args:
        enable: True to enable and start, False to disable and stop the SSH service.
        
    Returns:
        Tuple of (success, message)
    """
    logger.info(f"[CTLMAN] Controlling SSH service: {'enable+start' if enable else 'disable+stop'}")
    try:
        # Get the correct service name first
        status = get_ssh_service_status()
        if "error" in status:
            logger.error(f"[CTLMAN] Could not determine SSH service status: {status['error']}")
            return False, status["error"]
            
        service_name = status.get("service_name", "ssh.service")
        service_base_name = service_name.replace('.service', '')
        
        # Check current state to avoid redundant operations
        if enable and status.get("is_enabled", False) and status.get("is_running", False):
            msg = f"SSH service ({service_name}) is already enabled and running"
            logger.info(f"[CTLMAN] {msg}")
            return True, msg
            
        if not enable and not status.get("is_enabled", True) and not status.get("is_running", True):
            msg = f"SSH service ({service_name}) is already disabled and stopped"
            logger.info(f"[CTLMAN] {msg}")
            return True, msg
        
        # Step 1: Enable/disable service
        logger.debug(f"[CTLMAN] Step 1: {'Enabling' if enable else 'Disabling'} SSH service ({service_name})")
        if enable:
            success, output = execute_systemctl_command('enable', service_name)
        else:
            success, output = execute_systemctl_command('disable', service_name)
            
        if not success:
            error_msg = f"Failed to {'enable' if enable else 'disable'} SSH service: {output}"
            logger.error(f"[CTLMAN] {error_msg}")
            return False, error_msg
            
        # Step 2: Start/stop service
        logger.debug(f"[CTLMAN] Step 2: {'Starting' if enable else 'Stopping'} SSH service ({service_name})")
        if enable:
            success, output = execute_systemctl_command('start', service_name)
        else:
            success, output = execute_systemctl_command('stop', service_name)
            
        if not success:
            error_msg = f"Failed to {'start' if enable else 'stop'} SSH service: {output}"
            logger.error(f"[CTLMAN] {error_msg}")
            return False, error_msg
            
        success_msg = f"SSH service ({service_name}) successfully {'enabled and started' if enable else 'disabled and stopped'}"
        logger.info(f"[CTLMAN] {success_msg}")
        return True, success_msg
        
    except Exception as e:
        error_msg = f"Error controlling SSH service: {str(e)}"
        logger.exception(f"[CTLMAN] {error_msg}")
        return False, error_msg

# New functions for Samba services

def get_samba_services_status() -> Dict:
    """
    Get the status of all Samba-related services (smbd, nmbd, avahi-daemon, wsdd2).
    
    Returns:
        Dict with statuses of all services and overall status.
    """
    logger.debug("[CTLMAN] Getting Samba services status")
    
    # List of services to check - make sure service names match systemd exactly
    services = ['smbd', 'nmbd', 'avahi-daemon', 'wsdd2']
    service_statuses = {}
    all_enabled = True
    all_running = True
    any_running = False
    
    try:
        for service in services:
            service_result = get_service_status(service)
            service_statuses[service] = {
                "is_enabled": service_result['isEnabled'],
                "is_running": service_result['isActive'],
                "service_name": service_result['systemdName'],
                "status": service_result['status']
            }
            
            # Update overall status
            all_enabled = all_enabled and service_result['isEnabled']
            all_running = all_running and service_result['isActive']
            any_running = any_running or service_result['isActive']
            
        logger.debug(f"[CTLMAN] Samba services status: all_enabled={all_enabled}, all_running={all_running}")
        
        return {
            "services": service_statuses,
            "all_enabled": all_enabled,
            "all_running": all_running, 
            "any_running": any_running,
            "is_enabled": all_enabled,  # For compatibility with SSH style interface
            "is_running": all_running   # For compatibility with SSH style interface
        }
        
    except Exception as e:
        error_msg = f"Error checking Samba services status: {str(e)}"
        logger.exception(f"[CTLMAN] {error_msg}")
        return {"error": error_msg, "is_enabled": False, "is_running": False}

def control_samba_services(enable: bool) -> Tuple[bool, str]:
    """
    Enable/disable and start/stop all Samba-related services.
    
    Args:
        enable: True to enable and start, False to disable and stop Samba services.
        
    Returns:
        Tuple of (success, message)
    """
    logger.info(f"[CTLMAN] Controlling Samba services: {'enable+start' if enable else 'disable+stop'}")
    
    # List of services to control in order of dependency - make sure service names match systemd exactly
    services = ['smbd', 'nmbd', 'avahi-daemon', 'wsdd2']
    
    if not enable:
        # Reverse order for stopping to respect dependencies
        services = services[::-1]
    
    try:
        # Get current status
        status = get_samba_services_status()
        if "error" in status:
            logger.error(f"[CTLMAN] Could not determine Samba services status: {status['error']}")
            return False, status["error"]
            
        # Check if already in desired state
        if enable and status.get("all_enabled", False) and status.get("all_running", False):
            msg = "Samba services are already enabled and running"
            logger.info(f"[CTLMAN] {msg}")
            return True, msg
            
        if not enable and not status.get("any_running", False):
            msg = "Samba services are already disabled and stopped"
            logger.info(f"[CTLMAN] {msg}")
            return True, msg
        
        # Process each service
        failed_services = []
        
        for service in services:
            # Ensure we use the exact systemd service name with .service suffix
            service_name = f"{service}.service"
            
            # Step 1: Enable/disable service
            logger.debug(f"[CTLMAN] {'Enabling' if enable else 'Disabling'} {service_name}")
            if enable:
                success, output = execute_systemctl_command('enable', service_name)
            else:
                success, output = execute_systemctl_command('disable', service_name)
                
            if not success:
                logger.warning(f"[CTLMAN] Failed to {'enable' if enable else 'disable'} {service_name}: {output}")
                failed_services.append(f"{service} (enable/disable)")
            
            # Step 2: Start/stop service
            logger.debug(f"[CTLMAN] {'Starting' if enable else 'Stopping'} {service_name}")
            if enable:
                success, output = execute_systemctl_command('start', service_name)
            else:
                success, output = execute_systemctl_command('stop', service_name)
                
            if not success:
                logger.warning(f"[CTLMAN] Failed to {'start' if enable else 'stop'} {service_name}: {output}")
                failed_services.append(f"{service} (start/stop)")
        
        # Return results
        if failed_services:
            error_msg = f"Some Samba services failed: {', '.join(failed_services)}"
            logger.error(f"[CTLMAN] {error_msg}")
            return False, error_msg
            
        success_msg = f"Samba services successfully {'enabled and started' if enable else 'disabled and stopped'}"
        logger.info(f"[CTLMAN] {success_msg}")
        return True, success_msg
        
    except Exception as e:
        error_msg = f"Error controlling Samba services: {str(e)}"
        logger.exception(f"[CTLMAN] {error_msg}")
        return False, error_msg

# New function to decode crypto test payload
def decode_crypto_payload(payload: Dict[str, str]) -> Dict[str, str]:
    """Attempt to decode the provided payload using various methods."""
    results = {}
    logger.debug(f"[CTLMAN][CRYPTO] Decoding payload: {payload}")
    
    for key, encoded_value in payload.items():
        decoded = f"error: method '{key}' not implemented or failed"
        try:
            if key == 'base64_encoded':
                logger.debug(f"[CTLMAN][CRYPTO] Attempting Base64 decode for key: {key}, value: {encoded_value}")
                # Ensure padding is correct for standard Base64
                padded_value = encoded_value + '=' * (-len(encoded_value) % 4)
                decoded_bytes = base64.b64decode(padded_value)
                decoded = decoded_bytes.decode('utf-8')
                logger.debug(f"[CTLMAN][CRYPTO] Base64 decode successful: {decoded}")
            elif key == 'url_encoded':
                logger.debug(f"[CTLMAN][CRYPTO] Attempting URL decode for key: {key}, value: {encoded_value}")
                decoded = urllib.parse.unquote(encoded_value)
                logger.debug(f"[CTLMAN][CRYPTO] URL decode successful: {decoded}")
            elif key == 'raw_string':
                logger.debug(f"[CTLMAN][CRYPTO] Passing through raw string for key: {key}, value: {encoded_value}")
                decoded = encoded_value # No decoding needed
            elif key == 'simple_shift':
                logger.debug(f"[CTLMAN][CRYPTO] Attempting simple shift decode for key: {key}, value: {encoded_value}")
                decoded = ''.join([chr(ord(char) - 1) for char in encoded_value])
                logger.debug(f"[CTLMAN][CRYPTO] Simple shift decode successful: {decoded}")
            elif key == 'aes_cbc_pkcs7':
                logger.debug(f"[CTLMAN][CRYPTO] Attempting AES-CBC decode for key: {key}, value: {encoded_value}")
                if isinstance(encoded_value, dict) and 'iv' in encoded_value and 'encryptedData' in encoded_value:
                    iv_b64 = encoded_value['iv']
                    encrypted_data_b64 = encoded_value['encryptedData']
                    
                    # Base64 decode IV and ciphertext
                    iv = base64.b64decode(iv_b64)
                    encrypted_data = base64.b64decode(encrypted_data_b64)
                    
                    # Create AES cipher (CBC mode requires IV)
                    cipher = Cipher(algorithms.AES(SECRET_KEY), modes.CBC(iv), backend=default_backend())
                    decryptor = cipher.decryptor()
                    
                    # Decrypt and unpad
                    decrypted_padded = decryptor.update(encrypted_data) + decryptor.finalize()
                    unpadder = PKCS7(algorithms.AES.block_size).unpadder()
                    decrypted = unpadder.update(decrypted_padded) + unpadder.finalize()
                    
                    decoded = decrypted.decode('utf-8')
                    logger.debug(f"[CTLMAN][CRYPTO] AES decode successful: {decoded}")
                elif isinstance(encoded_value, dict) and 'error' in encoded_value:
                     decoded = f"error: frontend encryption failed - {encoded_value['error']}"
                     logger.error(f"[CTLMAN][CRYPTO] Received frontend AES encryption error: {decoded}")
                else:
                    decoded = "error: invalid AES payload format. Expected {iv: 'b64', encryptedData: 'b64'}"
                    logger.error(f"[CTLMAN][CRYPTO] Invalid AES payload format received: {encoded_value}")
            else:
                logger.warning(f"[CTLMAN][CRYPTO] Unknown encoding method key: {key}")
                decoded = f"error: unknown encoding method '{key}'"
                
        except Exception as e:
            error_msg = f"Error decoding '{key}': {str(e)}"
            logger.error(f"[CTLMAN][CRYPTO] {error_msg}")
            decoded = f"error: {str(e)}"
            
        results[key] = decoded
        
    logger.debug(f"[CTLMAN][CRYPTO] Final decoded results: {results}")
    return results