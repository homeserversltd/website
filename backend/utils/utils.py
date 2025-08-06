"""
Shared utility functions used across the application.
"""
import os
import json
import subprocess
import re
from typing import Tuple, Dict, Optional, List, Any
from pathlib import Path
from flask import current_app, jsonify
import socket
import time
import base64
import logging
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.padding import PKCS7 as PKCS7Padding
from cryptography.hazmat.backends import default_backend
from datetime import datetime

# Get the specific logger used in other parts of the app
logger = logging.getLogger('homeserver')

# --- AES Encryption/Decryption Configuration ---
# IMPORTANT: Use the SAME key as the frontend! Keep this secure.
# Read key from file instead of hardcoding
def _get_secret_key():
    key_file = "/var/www/homeserver/src/config/secret.key"
    try:
        with open(key_file, 'r') as f:
            key_hex = f.read().strip()
            # Convert hex string to bytes
            logger.info(f"[PIN] Found and loaded secret key from file: {key_file} (first 4 chars: {key_hex[:4]}...)")
            return bytes.fromhex(key_hex)
    except Exception as e:
        # Fall back to default key if file can't be read
        logger.error(f"[PIN] Failed to read secret key file, using fallback key: {str(e)}")
        return b'0123456789abcdef0123456789abcdef'

# Force key refresh on each import
SECRET_KEY = _get_secret_key()  # Must be 32 bytes for AES-256
IV_LENGTH = 16 # AES block size in bytes
# --- End AES Configuration ---

# Function to refresh the secret key if needed
def refresh_secret_key():
    """Refresh the SECRET_KEY by reading from the file again."""
    global SECRET_KEY
    key_file = "/var/www/homeserver/src/config/secret.key"
    try:
        # Only refresh if the file exists and has changed
        if os.path.exists(key_file):
            with open(key_file, 'r') as f:
                key_hex = f.read().strip()
                new_key = bytes.fromhex(key_hex)
                # Only update if key has changed 
                if new_key != SECRET_KEY:
                    logger.info(f"[PIN] Refreshing secret key: old={SECRET_KEY[:4]}..., new={new_key[:4]}...")
                    SECRET_KEY = new_key
                    return True
        return False
    except Exception as e:
        logger.error(f"[PIN] Error refreshing secret key: {str(e)}")
        return False

# --- Factory Config Helpers ---
def is_using_factory_config() -> bool:
    """
    Check if we're operating in factory fallback mode.
    This means homeserver.json was invalid/corrupted and we're using the factory defaults.
    """
    return current_app.config['HOMESERVER_CONFIG'].endswith('.factory')

def factory_mode_error() -> Tuple[Dict[str, Any], int]:
    """
    Standard error response for factory mode.
    Returns a tuple of (response_dict, status_code) for use with flask's return.
    
    Usage:
        if is_using_factory_config():
            return factory_mode_error()
    """
    return jsonify({
        'error': 'System is in factory fallback mode. Please fix homeserver.json to make changes.',
        'code': 'FACTORY_FALLBACK_MODE',
        'details': 'Your configuration file is invalid or corrupted. Using read-only factory defaults.',
        'userAction': 'Please check and fix your homeserver.json file to restore write functionality.'
    }), 403

def get_cached_global_mounts() -> Tuple[Dict[str, Any], List[str]]:
    """Get global mounts and ignored mounts with TTL-based caching."""
    # Use current_app.config to access cache variables
    
    if (time.time() - current_app.config['CONFIG_CACHE_TIME']) < current_app.config['CACHE_TTL']:
        return current_app.config['CONFIG_CACHE'].get('mounts', {}), current_app.config['CONFIG_CACHE'].get('ignored_mounts', [])
    
    try:
        with open(current_app.config['HOMESERVER_CONFIG'], 'r') as f:
            config = json.load(f)
            global_config = config.get('global', {})
            
            # Update cache in app config
            current_app.config['CONFIG_CACHE'] = {
                'mounts': global_config.get('mounts', {}),
                'ignored_mounts': global_config.get('ignoredMounts', [])
            }
            current_app.config['CONFIG_CACHE_TIME'] = time.time()
            
        return current_app.config['CONFIG_CACHE']['mounts'], current_app.config['CONFIG_CACHE']['ignored_mounts']
        
    except Exception as e:
        current_app.logger.error(f'Config cache error: {str(e)}')
        return {}, []

def get_global_mounts() -> Dict:
    """
    Retrieve the 'mounts' configuration from homeserver.json.
    Returns a dictionary with the mounts data, or an empty dictionary on error.
    """
    try:
        with open(current_app.config['HOMESERVER_CONFIG'], 'r') as f:
            config = json.load(f)
            mounts = config.get('global', {}).get('mounts', {})
            return mounts
    except FileNotFoundError:
        current_app.logger.error('homeserver.json not found')
        return {}
    except json.JSONDecodeError:
        current_app.logger.error('Invalid JSON in homeserver.json')
        return {}
    except Exception as e:
        current_app.logger.error(f'Error reading mounts config: {str(e)}')
        return {}
    
def validate_upload_path(path: str) -> bool:
    """
    CRITICAL SECURITY FUNCTION: Allow only paths under /mnt/nas.
    This prevents access to root filesystem and other sensitive areas.
    NEVER modify this function to allow paths outside /mnt/nas!
    """
    try:
        # Resolve any symlinks or relative paths to prevent directory traversal
        resolved = os.path.realpath(path)
        
        # SECURITY: Only allow paths that start with /mnt/nas
        # This prevents access to /, /home, /etc, /var, and other system directories
        is_valid = resolved.startswith('/mnt/nas')
        
        if not is_valid:
            current_app.logger.warning(f"[SECURITY] Upload path validation failed for: {path} (resolved to: {resolved})")
        
        return is_valid
    except Exception as e:
        current_app.logger.error(f"[SECURITY] Upload path validation error for {path}: {str(e)}")
        return False

def write_to_log(tablet: str, message: str, level: str = 'info') -> bool:
    """Write a message to the centralized log file and tablet-specific log if applicable."""
    try:
        # Use concise timestamp format: YYYY-MM-DD HH:MM
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
        
        # Format log line differently for each log type
        main_log_line = f"[{timestamp}] [{tablet}] [{level}] {message}\n"
        upload_log_line = f"[{timestamp}] [{level}] {message}\n"
        
        # Ensure log directory exists
        Path(current_app.config['HOMESERVER_LOG_DIR']).mkdir(parents=True, exist_ok=True)
        
        # Write to main log
        with open(os.path.join(current_app.config['HOMESERVER_LOG_DIR'], 'homeserver.log'), "a") as log_file:
            log_file.write(main_log_line)
            
        # Write to upload log only if it's an upload event (not errors/system)
        if tablet == 'upload' and level != 'error' and not message.startswith('Failed to'):
            with open(current_app.config['UPLOAD_LOG_PATH'], "a") as upload_log:
                upload_log.write(upload_log_line)
                
        return True
    except Exception as e:
        current_app.logger.error(f'Failed to write to log: {str(e)}')
        return False

def execute_command(command: List[str], input_data: Optional[str] = None, pipe_output_to: Optional[List[str]] = None) -> Tuple[bool, str, str]:
    """
    Execute a command with proper error handling.
    
    Args:
        command: List of command arguments
        input_data: Optional string to pass to stdin
        pipe_output_to: Optional command to pipe the output to
        
    Returns:
        Tuple of (success, stdout, stderr)
    """
    try:
        # Remove the special -n flag handling for sudo commands
        if pipe_output_to:
            current_app.logger.info(f"Executing piped command: {' '.join(command)} | {' '.join(pipe_output_to)}")
        else:
            current_app.logger.info(f"Executing command: {' '.join(command)}")
        
        # Set up environment with proper PATH for system commands
        env = os.environ.copy()
        env['PATH'] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        
        if pipe_output_to:
            # Set up piping between two commands
            first_process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE if input_data else None,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env
            )
            
            second_process = subprocess.Popen(
                pipe_output_to,
                stdin=first_process.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env
            )
            
            # Close first process's stdout to signal EOF to second process
            first_process.stdout.close()
            
            if input_data:
                first_process.communicate(input=input_data)
            
            stdout, stderr = second_process.communicate()
            
            # Get the first process's stderr
            _, first_stderr = first_process.communicate()
            
            # Combine stderr from both processes
            combined_stderr = first_stderr + stderr if first_stderr and stderr else first_stderr or stderr
            
            return second_process.returncode == 0, stdout.strip(), combined_stderr.strip()
        elif input_data:
            # Use Popen for commands that need stdin input
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env
            )
            stdout, stderr = process.communicate(input=input_data)
            return process.returncode == 0, stdout.strip(), stderr.strip()
        else:
            # Use run for commands that don't need stdin
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                env=env
            )
            
            return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
            
    except Exception as e:
        current_app.logger.error(f"Error executing command: {str(e)}")
        return False, "", str(e)

def execute_systemctl_command(command: str, service: str) -> Tuple[bool, str]:
    """Execute a systemctl command, using sudo only when necessary."""
    try:
        # Read-only commands that don't require sudo
        readonly_commands = {'is-active', 'is-enabled', 'status'}
        
        if command in readonly_commands:
            # Try direct systemctl call first for read-only operations
            base_cmd = ['systemctl', command, service]
            current_app.logger.debug(f"Executing systemctl command directly: {' '.join(base_cmd)}")
            
            try:
                result = subprocess.run(
                    base_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=False,
                    env={"SYSTEMD_COLORS": "0"}
                )
                
                clean_stdout = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', result.stdout)
                return result.returncode == 0, clean_stdout.strip()
                
            except PermissionError:
                # Fallback to sudo if direct call fails
                current_app.logger.debug(f"Direct systemctl call failed for {command}, falling back to sudo")
        
        # Use sudo for write operations or when direct call fails
        base_cmd = ['/usr/bin/sudo', 'systemctl', command, service]
        current_app.logger.debug(f"Executing systemctl command with sudo: {' '.join(base_cmd)}")
        
        # Redirect stderr to devnull to suppress sudo logging
        with open(os.devnull, 'w') as devnull:
            result = subprocess.run(
                base_cmd,
                stdout=subprocess.PIPE,
                stderr=devnull,
                text=True,
                check=False,
                env={"SYSTEMD_COLORS": "0"}
            )
        
        clean_stdout = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', result.stdout)
        
        return result.returncode == 0, clean_stdout.strip()
            
    except Exception as e:
        current_app.logger.error(f"Error in execute_systemctl_command: {str(e)}")
        return False, str(e)

def execute_systemctl_system_command(command: str) -> Tuple[bool, str]:
    """Execute a systemctl system-level command (reboot, poweroff, etc.) that doesn't take a service parameter."""
    try:
        # System-level commands always require sudo
        base_cmd = ['/usr/bin/sudo', 'systemctl', command]
        current_app.logger.debug(f"Executing systemctl system command with sudo: {' '.join(base_cmd)}")
        
        # Redirect stderr to devnull to suppress sudo logging
        with open(os.devnull, 'w') as devnull:
            result = subprocess.run(
                base_cmd,
                stdout=subprocess.PIPE,
                stderr=devnull,
                text=True,
                check=False,
                env={"SYSTEMD_COLORS": "0"}
            )
        
        clean_stdout = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', result.stdout)
        
        return result.returncode == 0, clean_stdout.strip()
            
    except Exception as e:
        current_app.logger.error(f"Error in execute_systemctl_system_command: {str(e)}")
        return False, str(e)

def get_service_names_from_config() -> List[str]:
    """
    Get all service names defined in the homeserver.json configuration.
    Also returns the mapping between normalized service names and actual service names.
    
    Returns:
        List[str]: List of service names
    """
    try:
        config = get_config()
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        
        # Import here to avoid circular imports
        from backend.portals.utils import get_service_mappings
        
        # Get service mappings
        service_map = get_service_mappings()
        
        # Collect all service names from all portals
        services = []
        for portal in portals:
            portal_services = portal.get('services', [])
            services.extend(portal_services)
        
        # Remove duplicates by converting to a set then back to a list
        return list(set(services))
    except Exception as e:
        current_app.logger.error(f"Error getting service names: {str(e)}")
        return []

def get_normalized_service_name(service_name: str) -> str:
    """
    Normalize a service name to match the format used in the portal service mapping.
    
    Args:
        service_name (str): The service name to normalize
        
    Returns:
        str: Normalized service name
    """
    return service_name.lower().replace(' ', '').replace('-', '').replace('.', '')

def get_systemd_service_name(service_name: str) -> str:
    """
    Convert a service name to its systemd service name using the mapping from portal utils.
    
    Args:
        service_name (str): The service name to convert
        
    Returns:
        str: Systemd service name
    """
    try:
        # Special case for services with hyphens in their names
        if service_name in ['avahi-daemon']:
            return f"{service_name}.service"
            
        # Import here to avoid circular imports
        from backend.portals.utils import get_service_mappings
        
        # Get service mappings
        service_map = get_service_mappings()
        
        # Normalize service name
        normalized_service = get_normalized_service_name(service_name)
        
        # Get the actual service name
        systemd_service = service_map.get(normalized_service, normalized_service)
        if not systemd_service.endswith('.service'):
            systemd_service = f"{systemd_service}.service"
            
        return systemd_service
    except Exception as e:
        current_app.logger.error(f"Error getting systemd service name: {str(e)}")
        # Fallback to adding .service suffix if mapping fails
        if not service_name.endswith('.service'):
            return f"{service_name}.service"
        return service_name

def get_service_status(service_name: str) -> Dict[str, Any]:
    """
    Get the status of a service including whether it's running and enabled.
    
    Args:
        service_name (str): Name of the service
        
    Returns:
        Dict[str, Any]: Dictionary with service status information
    """
    try:
        # Get portal service configurations
        config = get_config()
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        
        # Find if this service is defined in any portal
        service_portal = None
        for portal in portals:
            if service_name in portal.get('services', []):
                service_portal = portal
                break
                
        # Check if this is a script-managed service
        is_script_managed = False
        if service_portal and service_portal.get('type', '').lower() == 'script':
            is_script_managed = True
            
        # For script-managed services, we need to handle differently
        if is_script_managed:
            # Use port check as a proxy for running status
            port = service_portal.get('port')
            is_active = False
            status_output = "unknown"
            
            if port:
                port_status = check_port(port)
                is_active = port_status == "running"
                status_output = port_status
                
            return {
                'name': service_name,
                'systemdName': None,
                'isEnabled': True,  # Assume script services are enabled
                'isActive': is_active,
                'status': status_output,
                'statusDetails': f"Script-managed service checked via port {port}",
                'isScriptManaged': True,
                'port': port,
                'needsReboot': True  # Script services need reboot for restart
            }
        
        # Standard systemd service path
        # Get the systemd service name
        service_with_suffix = get_systemd_service_name(service_name)
        
        # Check if service is enabled
        is_enabled, _ = execute_systemctl_command('is-enabled', service_with_suffix)
        
        # Check if service is active
        is_active, status_output = execute_systemctl_command('is-active', service_with_suffix)
        
        return {
            'name': service_name,
            'systemdName': service_with_suffix,
            'isEnabled': is_enabled,
            'isActive': is_active,
            'status': 'running' if is_active else 'stopped',
            'statusDetails': status_output,
            'isScriptManaged': False,
            'needsReboot': False  # Standard systemd services don't need reboot
        }
    except Exception as e:
        current_app.logger.error(f"Error getting status for {service_name}: {str(e)}")
        return {
            'name': service_name,
            'systemdName': service_name,
            'isEnabled': False,
            'isActive': False,
            'status': 'unknown',
            'statusDetails': str(e),
            'isScriptManaged': False,
            'needsReboot': False
        }

def get_all_services_status() -> List[Dict[str, Any]]:
    """
    Get status information for all services defined in homeserver.json.
    
    Returns:
        List[Dict[str, Any]]: List of dictionaries with service status information
    """
    services = get_service_names_from_config()
    return [get_service_status(service) for service in services]

def check_services_running(enabled_only: bool = True) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Check if any services are running.
    
    Args:
        enabled_only (bool): If True, only check enabled services. Default is True.
    
    Returns:
        Tuple[bool, List[Dict[str, Any]]]: Tuple containing:
            - Boolean indicating if any services are running
            - List of running services information
    """
    all_services = get_all_services_status()
    
    if enabled_only:
        running_services = [svc for svc in all_services if svc['isEnabled'] and svc['isActive']]
    else:
        running_services = [svc for svc in all_services if svc['isActive']]
    
    # Count by type for metadata
    script_managed_count = sum(1 for svc in running_services if svc.get('isScriptManaged', False))
    systemd_count = len(running_services) - script_managed_count
    
    # Add metadata to each service entry
    for service in running_services:
        needs_reboot = service.get('isScriptManaged', False)
        service['needsRebootToStop'] = needs_reboot
        service['stopMessage'] = "Requires reboot to ensure complete stop" if needs_reboot else "Can be stopped normally"
    
    # Add metadata object for the entire response
    metadata = {
        'hasScriptManagedServices': script_managed_count > 0,
        'scriptManagedCount': script_managed_count,
        'systemdCount': systemd_count,
        'totalCount': len(running_services),
        'rebootRequiredForCompleteStop': script_managed_count > 0
    }
    
    # Return the running services and also include the metadata
    for service in running_services:
        service['metadata'] = metadata
        
    return bool(running_services), running_services

def check_services_stopped(enabled_only: bool = True) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Check if any services are stopped.
    
    Args:
        enabled_only (bool): If True, only check enabled services. Default is True.
    
    Returns:
        Tuple[bool, List[Dict[str, Any]]]: Tuple containing:
            - Boolean indicating if any services are stopped
            - List of stopped services information
    """
    all_services = get_all_services_status()
    
    if enabled_only:
        stopped_services = [svc for svc in all_services if svc['isEnabled'] and not svc['isActive']]
    else:
        stopped_services = [svc for svc in all_services if not svc['isActive']]
    
    # Count by type for metadata
    script_managed_count = sum(1 for svc in stopped_services if svc.get('isScriptManaged', False))
    systemd_count = len(stopped_services) - script_managed_count
    
    # Add metadata to each service entry
    for service in stopped_services:
        needs_reboot = service.get('isScriptManaged', False)
        service['needsRebootToStart'] = needs_reboot
        service['startMessage'] = "Requires reboot to start properly" if needs_reboot else "Can be started normally"
    
    # Add metadata object for the entire response
    metadata = {
        'hasScriptManagedServices': script_managed_count > 0,
        'scriptManagedCount': script_managed_count,
        'systemdCount': systemd_count,
        'totalCount': len(stopped_services),
        'rebootRequiredForCompleteStart': script_managed_count > 0
    }
    
    # Return the stopped services and also include the metadata
    for service in stopped_services:
        service['metadata'] = metadata
        
    return bool(stopped_services), stopped_services

def start_service(service_name: str) -> Tuple[bool, str]:
    """
    Start a systemd service.
    
    Args:
        service_name (str): Name of the service to start
        
    Returns:
        Tuple[bool, str]: Success flag and output/error message
    """
    try:
        # Get service status which includes script-managed info
        service_status = get_service_status(service_name)
        
        # For script-managed services, we can't directly start
        if service_status.get('isScriptManaged', False):
            return False, "Script-managed service requires a system reboot to start properly"
        
        # Get the systemd service name
        service_with_suffix = get_systemd_service_name(service_name)
            
        current_app.logger.info(f"Starting service: {service_with_suffix}")
        success, output = execute_systemctl_command('start', service_with_suffix)
        
        if success:
            return True, f"Service {service_name} started successfully"
        else:
            return False, f"Failed to start service {service_name}: {output}"
    except Exception as e:
        current_app.logger.error(f"Error starting service {service_name}: {str(e)}")
        return False, str(e)

def stop_service(service_name: str) -> Tuple[bool, str]:
    """
    Stop a systemd service.
    
    Args:
        service_name (str): Name of the service to stop
        
    Returns:
        Tuple[bool, str]: Success flag and output/error message
    """
    try:
        # Get service status which includes script-managed info
        service_status = get_service_status(service_name)
        
        # For script-managed services, add a note but treat like systemd service
        is_script_managed = service_status.get('isScriptManaged', False)
        
        # Get the systemd service name
        service_with_suffix = get_systemd_service_name(service_name)
            
        current_app.logger.info(f"Stopping service: {service_with_suffix}")
        success, output = execute_systemctl_command('stop', service_with_suffix)
        
        if success:
            message = f"Service {service_name} stopped successfully"
            if is_script_managed:
                message += ". Note: Script-managed service may require reboot for complete cleanup."
            return True, message
        else:
            return False, f"Failed to stop service {service_name}: {output}"
    except Exception as e:
        current_app.logger.error(f"Error stopping service {service_name}: {str(e)}")
        return False, str(e)

def start_all_enabled_services() -> List[Dict[str, Any]]:
    """
    Start all enabled services defined in homeserver.json.
    
    Returns:
        List[Dict[str, Any]]: List of dictionaries with service start results
    """
    all_services = get_all_services_status()
    enabled_services = [svc for svc in all_services if svc['isEnabled']]
    
    results = []
    script_managed_services = []
    standard_services = []
    
    # Separate services by type
    for service in enabled_services:
        if service.get('isScriptManaged', False):
            script_managed_services.append(service)
        else:
            standard_services.append(service)
    
    # Handle standard services first
    for service in standard_services:
        service_name = service['name']
        success, message = start_service(service_name)
        results.append({
            'name': service_name,
            'success': success,
            'message': message,
            'isScriptManaged': False
        })
    
    # Handle script-managed services
    for service in script_managed_services:
        service_name = service['name']
        results.append({
            'name': service_name,
            'success': False,  # We can't actually start script-managed services
            'message': "Script-managed service requires a system reboot to start properly",
            'isScriptManaged': True,
            'needsReboot': True
        })
    
    # Add metadata to results
    metadata = {
        'scriptManagedCount': len(script_managed_services),
        'standardServicesCount': len(standard_services),
        'totalCount': len(enabled_services),
        'rebootRequiredForScriptServices': len(script_managed_services) > 0,
        'rebootNote': "Some services are script-managed and will require a system reboot to start properly" if script_managed_services else ""
    }
    
    return {
        'results': results,
        'metadata': metadata
    }

def stop_all_services(enabled_only: bool = False) -> Dict[str, Any]:
    """
    Stop all services defined in homeserver.json.
    
    Args:
        enabled_only (bool): If True, only stop enabled services. Default is False (stop all services).
        
    Returns:
        Dict[str, Any]: Dictionary with results and metadata
    """
    all_services = get_all_services_status()
    
    # Filter services based on enabled_only parameter
    if enabled_only:
        target_services = [svc for svc in all_services if svc['isEnabled']]
    else:
        target_services = all_services
    
    results = []
    script_managed_services = []
    standard_services = []
    
    # Separate services by type (for metadata only)
    for service in target_services:
        if service.get('isScriptManaged', False):
            script_managed_services.append(service)
        else:
            standard_services.append(service)
    
    # Stop all services using systemctl
    for service in target_services:
        service_name = service['name']
        is_script_managed = service.get('isScriptManaged', False)
        
        success, message = stop_service(service_name)
        results.append({
            'name': service_name,
            'success': success,
            'message': message,
            'isScriptManaged': is_script_managed,
            'needsReboot': is_script_managed
        })
    
    # Add metadata to results
    metadata = {
        'scriptManagedCount': len(script_managed_services),
        'standardServicesCount': len(standard_services),
        'totalCount': len(target_services),
        'rebootRecommended': len(script_managed_services) > 0,
        'rebootNote': "Some script-managed services may require a system reboot for complete cleanup" if script_managed_services else ""
    }
    
    return {
        'results': results,
        'metadata': metadata
    }

# Keep the old function name for backward compatibility
def stop_all_enabled_services() -> List[Dict[str, Any]]:
    """
    Stop all enabled services defined in homeserver.json.
    This is a backward compatibility wrapper around stop_all_services.
    
    Returns:
        List[Dict[str, Any]]: List of dictionaries with service stop results
    """
    return stop_all_services(enabled_only=True)

def get_vault_device_pattern() -> str:
    """
    Get the vault device pattern from config (sda or nvme).
    Used by key management system to identify vault devices.
    
    Returns:
        str: Device pattern ('sda' or 'nvme')
    """
    try:
        config = get_config()
        root_type = config.get('global', {}).get('root', 'nvme')  # Default to nvme for backward compatibility
        logger.debug(f"[UTILS] Root type from config: {root_type}")
        return root_type
    except Exception as e:
        logger.warning(f"[UTILS] Failed to get root type from config: {e}, defaulting to nvme")
        return 'nvme'

def get_config() -> Dict:
    """
    Load and parse homeserver.json configuration.
    First tries factoryFallback.sh, then falls back to direct file reads if that fails.
    """
    try:
        # Try factoryFallback.sh first
        result = subprocess.run(['/usr/local/sbin/factoryFallback.sh'], 
                              capture_output=True, 
                              text=True)
        
        if result.returncode == 0:
            config_path = result.stdout.strip()
            current_app.config['HOMESERVER_CONFIG'] = config_path
        else:
            # If factoryFallback fails, try reading files directly
            main_config = '/var/www/homeserver/src/config/homeserver.json'
            factory_config = '/etc/homeserver.factory'
            
            # Try main config first
            try:
                with open(main_config) as f:
                    json.load(f)  # Validate JSON
                config_path = main_config
            except (FileNotFoundError, json.JSONDecodeError):
                # Try factory config as last resort
                try:
                    with open(factory_config) as f:
                        json.load(f)  # Validate JSON
                    config_path = factory_config
                except (FileNotFoundError, json.JSONDecodeError):
                    current_app.logger.error('Both main and factory configs are invalid or missing')
                    return {}
                    
            current_app.config['HOMESERVER_CONFIG'] = config_path
            
        # Read from the determined valid path
        with open(config_path) as f:
            return json.load(f)
            
    except FileNotFoundError:
        current_app.logger.error('Config file not found')
        return {}
    except json.JSONDecodeError:
        current_app.logger.error('Invalid JSON in config file')
        return {}
    except Exception as e:
        current_app.logger.error(f'Error reading config: {str(e)}')
        return {}

# --- Config Write Protection ---

def safe_write_config(write_operation: callable) -> bool:
    """
    Safely execute a config write operation with factory fallback protection.
    
    Args:
        write_operation: Callable that performs the actual write operation
        
    Returns:
        bool: True if write succeeded, False otherwise
        
    Example:
        def my_write():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(data, f)
        success = safe_write_config(my_write)
    """
    try:
        # Check if we're in factory config mode
        if is_using_factory_config():
            current_app.logger.error('Cannot write to config while using factory fallback configuration')
            return False
            
        # Execute the write operation
        write_operation()
        return True
    except Exception as e:
        current_app.logger.error(f'Error writing to config: {str(e)}')
        return False

def update_config(config: Dict) -> bool:
    """Update homeserver.json configuration."""
    def write_operation():
        with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
            json.dump(config, f, indent=2)
            
    return safe_write_config(write_operation)

def check_port(port: int) -> str:
    """Check if a port is listening locally."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            return "running" if s.connect_ex(('127.0.0.1', port)) == 0 else "stopped"
    except:
        return "unknown"

def should_filter_mount(entry: Dict[str, Any], ignored_mounts: List[str], logger=None) -> Tuple[bool, str]:
    """
    Check if a filesystem entry should be filtered based on ignored mounts.
    Unmounted devices are never filtered out, except for loop devices.
    
    Args:
        entry: Dictionary containing filesystem entry data
        ignored_mounts: List of mount points or filesystem types to ignore
        logger: Optional logger for debug messages
        
    Returns:
        Tuple of (should_filter, reason)
    """
    # System-critical paths that should be filtered out
    system_critical_paths = ['/', '/boot', '/home', '/usr', '/var']
    
    # Filter out loop devices
    device_name = entry.get('name', '')
    if device_name.startswith('loop'):
        return True, f"Filtered out loop device: {device_name}"
    
    # Special case: Never filter out unmounted devices
    if entry.get('mountpoint') is None and entry.get('mounted') is None:
        # Exception: Still filter out swap partitions
        if entry.get('fstype') == 'swap' or entry.get('type') == 'swap':
            return True, f"Filtered out swap partition"
        return False, ""
    
    # Handle tmpfs entries
    if entry.get('type') == 'tmpfs' or entry.get('fstype') == 'tmpfs':
        mount = entry.get('mounted', entry.get('mountpoint', 'unknown'))
        return True, f"Filtered out tmpfs mounted at {mount}"
    
    # Special case for udev
    if 'udev' in ignored_mounts:
        if (entry.get('filesystem') == 'udev' or 
            entry.get('name') == 'udev' or 
            entry.get('type') == 'devtmpfs' or 
            entry.get('fstype') == 'devtmpfs'):
            return True, f"Filtered out udev entry"
    
    # Check filesystem type
    fs_type = entry.get('type', entry.get('fstype'))
    if fs_type and any(fs_type == ignored for ignored in ignored_mounts):
        return True, f"Filtered out ignored filesystem type: {fs_type}"
    
    # Check filesystem name
    fs_name = entry.get('filesystem', entry.get('name'))
    if fs_name:
        # Extract just the name without path
        fs_basename = fs_name.split('/')[-1] if '/' in fs_name else fs_name
        if any(fs_basename == ignored for ignored in ignored_mounts):
            return True, f"Filtered out ignored filesystem name: {fs_name}"
    
    # Check if the mount point is in the system-critical paths
    mount_point = entry.get('mounted', entry.get('mountpoint'))
    if mount_point and mount_point in system_critical_paths:
        return True, f"Filtered out system-critical path: {mount_point}"
    
    # Check mount point against ignored mounts
    if mount_point and any(mount_point == ignored for ignored in ignored_mounts):
        return True, f"Filtered out ignored mount point: {mount_point}"
    
    return False, ""

def error_response(message, status_code=400, details=None):
    """
    Create an error JSON response.
    
    Args:
        message (str): Error message
        status_code (int): HTTP status code
        details (dict, optional): Additional details
        
    Returns:
        tuple: (jsonify response, status_code)
    """
    response = {
        "status": "error",
        "message": message
    }
    
    if details:
        response["details"] = details
        
    return jsonify(response), status_code

def success_response(message, details=None):
    """
    Create a success JSON response.
    
    Args:
        message (str): Success message
        details (dict, optional): Additional details
        
    Returns:
        tuple: (jsonify response, status_code)
    """
    response = {
        "status": "success",
        "message": message
    }
    
    if details:
        response["details"] = details
        
    return jsonify(response), 200

# --- AES Encryption/Decryption Utilities ---

def encrypt_data(plain_text: str) -> Optional[str]:
    """
    Encrypt data using AES-CBC with the shared secret key.
    Generates a random IV, prepends it to the ciphertext, and returns Base64 encoded result.
    
    Args:
        plain_text (str): The data to encrypt.
        
    Returns:
        Optional[str]: Base64 encoded string (IV + Ciphertext) or None on error.
    """
    try:
        # Generate random IV
        iv = os.urandom(IV_LENGTH)
        
        # Pad the plaintext
        padder = PKCS7Padding(algorithms.AES.block_size).padder()
        padded_data = padder.update(plain_text.encode('utf-8')) + padder.finalize()
        
        # Create AES cipher
        cipher = Cipher(algorithms.AES(SECRET_KEY), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        
        # Encrypt
        ciphertext = encryptor.update(padded_data) + encryptor.finalize()
        
        # Prepend IV and Base64 encode
        iv_and_ciphertext = iv + ciphertext
        encrypted_payload_b64 = base64.b64encode(iv_and_ciphertext).decode('utf-8')
        
        current_app.logger.debug(f"AES Encryption successful. Payload length (Base64): {len(encrypted_payload_b64)}")
        return encrypted_payload_b64
        
    except Exception as e:
        current_app.logger.error(f"AES encryption failed: {str(e)}")
        return None

def decrypt_data(encrypted_payload_b64: str, key_override: Optional[bytes] = None) -> Optional[str]:
    """
    Decrypt data encrypted with AES-CBC using the shared secret key.
    Expects a Base64 encoded string containing IV + Ciphertext.
    Allows overriding the default SECRET_KEY for special cases (e.g., fallback).
    
    Args:
        encrypted_payload_b64 (str): Base64 encoded string (IV + Ciphertext).
        key_override (Optional[bytes]): An optional key to use instead of the global SECRET_KEY.
        
    Returns:
        Optional[str]: Decrypted string or None on error.
    """
    try:
        key_to_use = key_override if key_override is not None else SECRET_KEY
        if key_override is not None:
            logger.info(f"[PIN-DECRYPT] Attempting decryption with overridden key (len: {len(key_to_use)})")
        else:
            logger.debug(f"[PIN-DECRYPT] Attempting decryption with default key (len: {len(key_to_use)})")

        encrypted_bytes = base64.b64decode(encrypted_payload_b64)
        
        # Check minimum length (IV + at least 1 block)
        if len(encrypted_bytes) < (IV_LENGTH + algorithms.AES.block_size // 8): 
            current_app.logger.error(f"AES payload too short after base64 decode: {len(encrypted_bytes)} bytes")
            return None
            
        # Extract IV and ciphertext
        iv = encrypted_bytes[:IV_LENGTH]
        ciphertext = encrypted_bytes[IV_LENGTH:]
        # current_app.logger.debug(f"AES Decryption: Extracted IV (len={len(iv)}), Ciphertext (len={len(ciphertext)})")

        # Create AES cipher
        cipher = Cipher(algorithms.AES(key_to_use), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        
        # Decrypt
        decrypted_padded = decryptor.update(ciphertext) + decryptor.finalize()
        
        # Unpad
        unpadder = PKCS7Padding(algorithms.AES.block_size).unpadder()
        decrypted_bytes = unpadder.update(decrypted_padded) + unpadder.finalize()
        
        decrypted_string = decrypted_bytes.decode('utf-8')
        current_app.logger.debug("AES Decryption successful.")
        return decrypted_string
        
    except ValueError as ve: # Specific error for padding issues
        # Use the specific 'homeserver' logger
        logger.error(f"[KEYMAN-DECRYPT] AES decryption failed - likely incorrect key or padding error: {str(ve)}")
        # Log the input payload for debugging
        logger.error(f"[KEYMAN-DECRYPT] AES decryption failed for payload (first 50 chars): {encrypted_payload_b64[:50]}...") 
        return None
    except Exception as e:
        # Use the specific 'homeserver' logger
        logger.error(f"[KEYMAN-DECRYPT] AES decryption failed: {str(e)}")
        # Log the type of exception and the input payload for debugging
        logger.error(f"[KEYMAN-DECRYPT] AES decryption failed with exception type: {type(e).__name__}") 
        logger.error(f"[KEYMAN-DECRYPT] AES decryption failed for payload (first 50 chars): {encrypted_payload_b64[:50]}...") 
        return None