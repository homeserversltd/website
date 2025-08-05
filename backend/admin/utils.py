import psutil
import subprocess
import re  # Newly added import for regex operations
import json
from typing import Tuple, Callable
from functools import wraps
from flask import current_app, jsonify, request
from backend.utils.utils import write_to_log, get_global_mounts


def check_vault_mounted() -> bool:
    """
    Checks if the vault partition is currently mounted.
    Returns True if mounted, False otherwise.
    """
    try:
        mounts_config = get_global_mounts()
        if not mounts_config or 'vault' not in mounts_config:
            current_app.logger.error("Vault configuration missing in homeserver.json")
            return False

        vault_config = mounts_config['vault']
        device = vault_config.get('device')
        mount_point = vault_config.get('mountPoint')
        # Get 'encrypted' flag, default to True if not specified
        encrypted = vault_config.get('encrypted', True)

        if not device or not mount_point:
            current_app.logger.error("Invalid vault configuration: missing device or mountPoint")
            return False

        # Use psutil to check for mounted partitions
        partitions = psutil.disk_partitions()
        for partition in partitions:
            # If encrypted, check for the mapped device name. Otherwise, check directly.
            if encrypted:
                if partition.device == f'/dev/mapper/vault' and partition.mountpoint == mount_point:
                    current_app.logger.info(f"Vault is mounted: /dev/mapper/vault at {partition.mountpoint}")
                    return True
            else:
                if partition.device == f'/dev/{device}' and partition.mountpoint == mount_point:
                    current_app.logger.info(f"Vault is mounted: {partition.device} at {partition.mountpoint}")
                    return True

        current_app.logger.info(f"Vault is not mounted: {device} at {mount_point}")
        return False

    except Exception as e:
        current_app.logger.error(f"Error checking vault mount status: {str(e)}")
        return False

def attempt_mount_vault(password: str) -> Tuple[bool, str]:
    """
    Attempts to mount the vault partition using the provided password.
    First uses cryptsetup to open the encrypted device, then mounts it.
    Returns (True, success_message) on success, (False, error_message) on failure.
    """
    try:
        mounts_config = get_global_mounts()
        if not mounts_config or 'vault' not in mounts_config:
            return False, "Vault configuration missing"

        vault_config = mounts_config['vault']
        device = vault_config.get('device')
        mount_point = vault_config.get('mountPoint')
        # Get encrypted flag, default to true
        encrypted = vault_config.get('encrypted', True)

        if not device or not mount_point:
            return False, "Invalid vault configuration"

        if not encrypted:
            # Construct the mount command for non-encrypted
            command = [
                '/usr/bin/sudo',
                '/usr/bin/mount',
                '-t', 'ext4',  # Assuming ext4 filesystem
                f'/dev/{device}',
                mount_point
            ]
            # Execute the command
            process = subprocess.run(command, capture_output=True, text=True)
            if process.returncode == 0:
                write_to_log('vault', f'Vault mounted successfully at {mount_point}', 'info')
                return True, "Vault mounted successfully"
            else:
                error_message = process.stderr or process.stdout or "Unknown mount error"
                write_to_log('vault', f'Failed to mount vault: {error_message}', 'error')
                return False, f"Mount failed: {error_message}"

        # --- Encrypted device handling ---
        # 1. Open the encrypted device using cryptsetup
        cryptsetup_command = [
            '/usr/bin/sudo',
            '/usr/sbin/cryptsetup',
            'luksOpen',
            f'/dev/{device}',
            'vault'  # The mapped device name will be /dev/mapper/vault
        ]
        process = subprocess.run(cryptsetup_command, capture_output=True, text=True, input=password)

        if process.returncode != 0:
            error_message = process.stderr or process.stdout or "Unknown cryptsetup error"
            write_to_log('vault', f'Failed to open encrypted vault: {error_message}', 'error')
            return False, f"Cryptsetup failed: {error_message}"

        # 2. Mount the decrypted device mapper
        mount_command = [
            '/usr/bin/sudo',
            '/usr/bin/mount',
            '/dev/mapper/vault',
            mount_point
        ]
        process = subprocess.run(mount_command, capture_output=True, text=True)

        if process.returncode == 0:
            write_to_log('vault', f'Vault mounted successfully at {mount_point}', 'info')
            return True, "Vault mounted successfully"
        else:
            error_message = process.stderr or process.stdout or "Unknown mount error"
            # Close the device mapper if mount fails
            close_command = ['/usr/bin/sudo', '/usr/sbin/cryptsetup', 'luksClose', 'vault']
            subprocess.run(close_command)  # Best effort close
            write_to_log('vault', f'Failed to mount vault: {error_message}', 'error')
            return False, f"Mount failed: {error_message}"

    except Exception as e:
        write_to_log('vault', f'Exception during vault mount: {str(e)}', 'error')
        return False, str(e)

def verify_theme(theme_data: dict, required_props: dict) -> bool:
    """
    Validates that a theme configuration contains all required properties with valid hex color values.
    
    Args:
        theme_data: The theme settings parsed from a JSON file.
        required_props: A dictionary of required theme properties and their default values.
        
    Returns:
        bool: True if theme_data is valid, False otherwise.
    """
    for prop in required_props:
        if prop not in theme_data:
            return False
        if not isinstance(theme_data[prop], str):
            return False
        if not re.match(r'^#[0-9A-Fa-f]{6}$', theme_data[prop]):
            return False
    return True

def validate_admin_request() -> bool:
    """
    Validates the current request has proper admin authentication.
    Checks headers and any other required admin validation methods.
    """
    try:
        # Get stored PIN from config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            stored_pin = config.get('global', {}).get('admin', {}).get('pin')

        if not stored_pin:
            current_app.logger.error('No admin PIN configured')
            return False

        # Check for admin token in headers
        admin_token = request.headers.get('X-Admin-Token')
        if not admin_token:
            return False

        # Here you would validate the admin token against your stored PIN
        # This is a simplified example - you might want to use proper token validation
        return admin_token == stored_pin

    except Exception as e:
        current_app.logger.error(f'Error validating admin request: {str(e)}')
        return False


def validate_admin_session(token: str) -> bool:
    """
    Validate admin session token.

    This function validates the provided token against the admin PIN
    stored in homeserver.json.
    
    Returns:
        bool: True if token is valid; False otherwise.
    """
    try:
        # Use the validation function from auth module
        from backend.auth.validation import validate_admin_token
        
        # Log what we're trying to validate for debugging
        current_app.logger.info(f"Validating admin session with token: '{token}'")
        
        # Use the correct validation function
        result = validate_admin_token(token)
        current_app.logger.info(f"Admin session validation result: {result}")
        return result
    except Exception as e:
        current_app.logger.error(f"Error validating admin session: {str(e)}")
        return False
    
    