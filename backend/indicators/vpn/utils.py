"""
VPN helper functions and utilities.
"""
import subprocess
from typing import Optional, Tuple
from flask import current_app # Import current_app for logging
from backend.utils.utils import get_config, execute_systemctl_command, get_systemd_service_name # Import necessary utils

def check_process_running(process_name: str) -> bool:
    """
    Check if a process is running using pgrep.
    
    Args:
        process_name: Name of the process to check
        
    Returns:
        bool: True if process is running, False otherwise
    """
    try:
        result = subprocess.run(
            ['/usr/bin/pgrep', process_name],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except Exception:
        return False

def validate_credentials(username: str, password: str) -> Tuple[bool, str]:
    """
    Validate PIA credentials format using character sets from utils.sh.
    
    Args:
        username: PIA username
        password: PIA password
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    # Match utils.sh character sets:
    # UPPERCASE="ABCDEFGHIJKLMNOPQRSTUVWXYZ"  
    # LOWERCASE="abcdefghijklmnopqrstuvwxyz"  
    # NUMBERS="0123456789"                    
    # SYMBOLS="-._~"
    
    current_app.logger.debug(f'[PIAVPN] Validating credentials - Username length: {len(username)}, Password length: {len(password)}')
    
    # Use the same character set as in utils.sh
    allowed_chars = (
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )
    
    # Check for any characters not in our allowed set
    invalid_chars_username = set(username) - set(allowed_chars)
    if invalid_chars_username:
        current_app.logger.error(f'[PIAVPN] Username contains invalid characters: {", ".join(invalid_chars_username)}')
        return False, f"Username contains invalid characters: {', '.join(invalid_chars_username)}"
    
    invalid_chars_password = set(password) - set(allowed_chars)
    if invalid_chars_password:
        current_app.logger.error(f'[PIAVPN] Password contains invalid characters: {", ".join(invalid_chars_password)}')
        return False, f"Password contains invalid characters: {', '.join(invalid_chars_password)}"
    
    # Basic length checks - make less restrictive
    if len(username) > 64 or len(password) > 64:
        current_app.logger.error('[PIAVPN] Username or password too long')
        return False, "Username or password too long"
    
    # Removed the min length check that was causing the error
    
    current_app.logger.debug('[PIAVPN] Credentials validated successfully')
    return True, ""

def update_pia_credentials(username: str, new_password: str) -> Tuple[bool, str]:
    """
    Update PIA VPN credentials using change_key.sh script.
    Also stops the Transmission-related service(s) listed in homeserver.json.
    
    Args:
        username: PIA username
        new_password: New PIA password
        
    Returns:
        Tuple[bool, str]: Success status and error message if any
    """
    # --- Stop Transmission Services --- 
    stop_success = True
    stop_message_details = []
    try:
        current_app.logger.info(f'[PIAVPN] Attempting to stop Transmission services before updating PIA credentials')
        config = get_config()
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        transmission_portal = next((p for p in portals if p.get('name') == 'Transmission'), None)
        
        if transmission_portal:
            service_names_to_manage = transmission_portal.get('services', [])
            systemd_service_names = [get_systemd_service_name(s) for s in service_names_to_manage]
            current_app.logger.info(f"[PIAVPN] Found Transmission services to stop: {service_names_to_manage} -> {systemd_service_names}")
            
            for service_name in systemd_service_names:
                # First check if service is running
                current_app.logger.info(f"[PIAVPN] Checking if {service_name} is running before attempting to stop.")
                is_active, status = execute_systemctl_command('is-active', service_name)
                
                if is_active:
                    current_app.logger.info(f"[PIAVPN] Attempting to stop running service {service_name} before PIA update.")
                    success, output = execute_systemctl_command('stop', service_name)
                    if not success:
                        stop_success = False
                        msg = f"Failed to stop {service_name}: {output}"
                        stop_message_details.append(msg)
                        current_app.logger.warning(f"[PIAVPN] {msg}")
                    else:
                        msg = f"{service_name} stopped successfully."
                        stop_message_details.append(msg)
                        current_app.logger.info(f"[PIAVPN] {msg}")
                else:
                    msg = f"{service_name} is not running (status: {status}), no need to stop."
                    stop_message_details.append(msg)
                    current_app.logger.info(f"[PIAVPN] {msg}")
        else:
            current_app.logger.warning("[PIAVPN] Could not find 'Transmission' portal in homeserver.json; cannot stop associated services.")
            # No services found, so technically stopping was successful (did nothing)
            
    except Exception as e:
        current_app.logger.error(f"[PIAVPN] Error stopping Transmission services before PIA update: {str(e)}")
        # Consider this a failure or just log? For now, log and continue.
        stop_success = False # Treat config read error as a stop failure
        stop_message_details.append(f"Error reading/stopping Transmission services: {str(e)}")
        
    # --- Update PIA Credentials --- 
    # Validate credentials first
    current_app.logger.info(f'[PIAVPN] About to validate PIA credentials')
    is_valid, error_msg = validate_credentials(username, new_password)
    if not is_valid:
        # Add note about attempted service stops
        stop_info = " (Transmission services attempted stop: " + ("; ".join(stop_message_details) if stop_message_details else "None") + ")"
        current_app.logger.error(f'[PIAVPN] PIA credentials validation failed: {error_msg}')
        return False, error_msg + stop_info

    update_success = False
    update_message = ""
    try:
        current_app.logger.info(f"[PIAVPN] Running change_key.sh for PIA with user {username}")
        # Use sudo to run change_key.sh
        result = subprocess.run(
            ['/usr/bin/sudo', '/vault/keyman/newkey.sh', 'pia', username, new_password],
            capture_output=True,
            text=True,
            check=True,
            shell=False
        )
        update_success = True
        update_message = "PIA credentials updated successfully."
        current_app.logger.info(f"[PIAVPN] {update_message}")

    except subprocess.CalledProcessError as e:
        error_details = e.stderr.strip() or e.stdout.strip() or "No output from script."
        update_message = f"Failed to update PIA credentials: {error_details}"
        current_app.logger.error(f"[PIAVPN] {update_message}")
    except Exception as e:
        update_message = f"Unexpected error updating PIA credentials: {str(e)}"
        current_app.logger.error(f"[PIAVPN] {update_message}")
        
    # --- Final Result --- 
    final_message = update_message
    if stop_message_details:
        final_message += " Transmission service stop results: " + "; ".join(stop_message_details)
    if not stop_success:
         final_message += " (Note: One or more Transmission services may not have stopped correctly)"
         
    return update_success, final_message

def update_transmission_credentials(username: str, password: str) -> Tuple[bool, str]:
    """
    Update Transmission credentials using change_key.sh script.
    Stops the service(s) listed in homeserver.json for the Transmission portal first,
    runs change_key.sh (which updates vault key and settings.json),
    and leaves the services stopped.

    Args:
        username: Transmission username.
        password: Transmission password.

    Returns:
        Tuple[bool, str]: Success status and error message if any.
    """
    # Basic length checks (optional, can be refined)
    if not username or len(username) > 64:
        return False, "Invalid Transmission username length."
    if not password or len(password) < 1 or len(password) > 128: # Example length check
        return False, "Invalid Transmission password length."

    # Ensure username is not empty
    if not username or username.strip() == "":
        return False, "Username cannot be empty for Transmission updates."

    # --- Get service names from config --- 
    service_names_to_manage = []
    systemd_service_names = []
    try:
        config = get_config()
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        transmission_portal = next((p for p in portals if p.get('name') == 'Transmission'), None)
        
        if transmission_portal:
            service_names_to_manage = transmission_portal.get('services', [])
            systemd_service_names = [get_systemd_service_name(s) for s in service_names_to_manage]
            current_app.logger.info(f"Found Transmission services in config: {service_names_to_manage} -> {systemd_service_names}")
        else:
            current_app.logger.warning("Could not find 'Transmission' portal in homeserver.json to get service names.")
            # Proceeding without specific services to stop.
            
    except Exception as e:
        current_app.logger.error(f"Error reading service names from homeserver.json: {str(e)}")
        return False, f"Error reading configuration: {str(e)}"
        
    # --- Check and stop configured services --- 
    stop_success = True
    stop_message_details = []
    if not systemd_service_names:
         current_app.logger.warning("No specific Transmission services found in config to stop.")
    else:
        for service_name in systemd_service_names:
            current_app.logger.info(f"Checking status of service: {service_name}")
            # First check if the service is running
            is_active, _ = execute_systemctl_command('is-active', service_name)
            
            if is_active:
                current_app.logger.info(f"Service {service_name} is running, attempting to stop")
                success, output = execute_systemctl_command('stop', service_name)
                if not success:
                    stop_success = False
                    msg = f"Failed to stop {service_name}: {output}"
                    stop_message_details.append(msg)
                    current_app.logger.warning(msg)
                else:
                    msg = f"{service_name} stopped successfully."
                    stop_message_details.append(msg)
                    current_app.logger.info(msg)
            else:
                msg = f"{service_name} is not running, no need to stop."
                stop_message_details.append(msg)
                current_app.logger.info(msg)
    
    if not stop_success:
        current_app.logger.warning("One or more Transmission services failed to stop. Proceeding with key update anyway.")

    # --- Run change_key.sh to update vault key and settings.json --- 
    update_success = False
    update_message = ""
    try:
        current_app.logger.info(f"Running updateTransmissionKey.sh for transmission with user '{username}' and password length {len(password)}")
        # Log the exact parameters being passed to help with debugging
        current_app.logger.debug(f"Username value: '{username}', Password value: '{password[:3]}...'")
        result = subprocess.run(
            ['/usr/bin/sudo', '/vault/keyman/updateTransmissionKey.sh', password, username],
            capture_output=True,
            text=True,
            check=True, # Raise exception on non-zero exit code
            shell=False
        )
        update_success = True
        update_message = "Transmission credentials updated successfully."
        current_app.logger.info(update_message)
        
    except subprocess.CalledProcessError as e:
        error_details = e.stderr.strip() or e.stdout.strip() or "No output from script."
        update_message = f"updateTransmissionKey.sh failed: {error_details}"
        current_app.logger.error(f"updateTransmissionKey.sh error: {e.returncode} - {error_details}")
    except Exception as e:
        update_message = f"Unexpected error running updateTransmissionKey.sh: {str(e)}"
        current_app.logger.error(update_message)
        
    # --- Determine overall result --- 
    # Success only depends on the change_key.sh script now
    final_success = update_success 
    final_message = update_message
    
    # Add notes about service stopping status
    if stop_message_details:
        final_message += " Service stop results: " + "; ".join(stop_message_details)
    if not stop_success:
        final_message += " (Note: One or more services failed to stop initially)"
        
    if final_success:
         final_message += " Services associated with Transmission portal were stopped and left inactive."
    else:
         final_message += " Services may or may not have been stopped due to the update failure."

    return final_success, final_message