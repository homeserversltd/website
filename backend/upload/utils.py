import grp
import os
import subprocess
from typing import Tuple
from flask import current_app
from backend.utils.utils import validate_upload_path, write_to_log
import json

def get_raw_upload_blacklist() -> list:
    """Fetch the raw upload blacklist from homeserver.json without normalization.
    
    Returns the blacklist exactly as stored in the config file.
    This is used for display/editing purposes.
    """
    try:
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        raw_blacklist = config.get('tabs', {}).get('upload', {}).get('data', {}).get('blacklist', [])
        
        # Normalize entries (remove trailing slashes) but don't add variations
        normalized_blacklist = []
        for entry in raw_blacklist:
            # Remove trailing slashes for consistency
            normalized_entry = entry.rstrip('/')
            if normalized_entry:  # Only add non-empty entries
                normalized_blacklist.append(normalized_entry)
        
        return normalized_blacklist
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Error loading raw blacklist: {str(e)}")
        return []

def get_upload_blacklist() -> list:
    """Fetch the upload blacklist from homeserver.json.
    
    Returns a normalized list of blacklist entries, handling both
    absolute paths, relative paths, and name-based patterns.
    This is used for filtering purposes and includes variations.
    """
    try:
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        raw_blacklist = config.get('tabs', {}).get('upload', {}).get('data', {}).get('blacklist', [])
        
        # Normalize blacklist entries
        normalized_blacklist = []
        for entry in raw_blacklist:
            # Remove trailing slashes for consistency
            entry = entry.rstrip('/')
            
            # Add entry to normalized list
            normalized_blacklist.append(entry)
            
            # For name-only patterns, also add common variations
            if '/' not in entry:
                # If it's just a name (like "git"), also block ".git"
                if not entry.startswith('.'):
                    normalized_blacklist.append(f".{entry}")
        
        current_app.logger.debug(f"[UPLOAD] Normalized blacklist: {normalized_blacklist}")
        return normalized_blacklist
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Error loading blacklist: {str(e)}")
        return []

def add_user_to_group(directory: str) -> Tuple[bool, str]:
    """Add www-data to directory's group."""
    try:
        current_app.logger.debug(f"[UPLOAD] add_user_to_group called with directory: {directory}")
        
        if not validate_upload_path(directory):
            current_app.logger.error(f"[UPLOAD] Invalid directory path in add_user_to_group: {directory}")
            return False, "Invalid directory path"
        
        # current_app.logger.debug(f"[UPLOAD] Getting stat info for directory: {directory}")
        stat_info = os.stat(directory)
        # current_app.logger.debug(f"[UPLOAD] Directory stat - UID: {stat_info.st_uid}, GID: {stat_info.st_gid}")
        
        group_name = grp.getgrgid(stat_info.st_gid).gr_name
        # current_app.logger.debug(f"[UPLOAD] Directory group name: {group_name}")
        
        current_app.logger.debug(f"[UPLOAD] Adding www-data to group {group_name} for directory {directory}")
        
        # Check if user is already in the group
        # current_app.logger.debug(f"[UPLOAD] Checking if www-data is already in group {group_name}")
        result = subprocess.run(
            ['/usr/bin/groups', 'www-data'],
            capture_output=True,
            text=True
        )
        # current_app.logger.debug(f"[UPLOAD] Groups command result - returncode: {result.returncode}, stdout: {result.stdout.strip()}")
        
        if group_name in result.stdout:
            current_app.logger.debug(f"[UPLOAD] www-data already in group {group_name}")
            return True, f"www-data already in {group_name}"

        # Add user to group
        # current_app.logger.debug(f"[UPLOAD] Executing usermod to add www-data to group {group_name}")
        usermod_cmd = ['/usr/bin/sudo', '/usr/sbin/usermod', '-aG', group_name, 'www-data']
        # current_app.logger.debug(f"[UPLOAD] Usermod command: {' '.join(usermod_cmd)}")
        
        result = subprocess.run(
            usermod_cmd,
            capture_output=True,
            text=True
        )
        # current_app.logger.debug(f"[UPLOAD] Usermod result - returncode: {result.returncode}")
        # current_app.logger.debug(f"[UPLOAD] Usermod stdout: {result.stdout.strip()}")
        # current_app.logger.debug(f"[UPLOAD] Usermod stderr: {result.stderr.strip()}")
        
        if result.returncode != 0:
            msg = f"usermod failed: {result.stderr.strip() or result.stdout.strip()}"
            current_app.logger.error(f"[UPLOAD] {msg}")
            write_to_log('upload', msg, 'error')
            return False, msg
            
        current_app.logger.info(f"[UPLOAD] Successfully added www-data to group {group_name}")
        return True, "Group updated successfully"
        
    except Exception as e:
        error_msg = f"Group update error: {str(e)}"
        current_app.logger.error(f"[UPLOAD] {error_msg}")
        current_app.logger.error(f"[UPLOAD] Exception type: {type(e).__name__}")
        current_app.logger.error(f"[UPLOAD] Exception traceback:", exc_info=True)
        write_to_log('upload', error_msg, 'error')
        return False, error_msg

def make_directory_writable(directory: str) -> Tuple[bool, str]:
    """Make directory world-writable."""
    try:
        current_app.logger.debug(f"[UPLOAD] make_directory_writable called with directory: {directory}")
        # current_app.logger.debug(f"[UPLOAD] Making directory writable: {directory}")
        
        # Check current permissions first
        current_perms = oct(os.stat(directory).st_mode)[-3:]
        # current_app.logger.debug(f"[UPLOAD] Current directory permissions: {current_perms}")
        
        chmod_cmd = ['/usr/bin/sudo', '/usr/bin/chmod', '+w', directory]
        # current_app.logger.debug(f"[UPLOAD] Chmod command: {' '.join(chmod_cmd)}")
        
        result = subprocess.run(
            chmod_cmd,
            capture_output=True,
            text=True
        )
        
        # current_app.logger.debug(f"[UPLOAD] Chmod result - returncode: {result.returncode}")
        # current_app.logger.debug(f"[UPLOAD] Chmod stdout: {result.stdout.strip()}")
        # current_app.logger.debug(f"[UPLOAD] Chmod stderr: {result.stderr.strip()}")
        
        if result.returncode != 0:
            error_msg = f"chmod failed: {result.stderr.strip() or result.stdout.strip()}"
            current_app.logger.error(f"[UPLOAD] {error_msg}")
            return False, error_msg
        
        # Check new permissions
        new_perms = oct(os.stat(directory).st_mode)[-3:]
        # current_app.logger.debug(f"[UPLOAD] New directory permissions: {new_perms}")
        current_app.logger.info(f"[UPLOAD] Successfully made directory writable: {directory}")
        return True, "Permissions updated successfully"
        
    except Exception as e:
        error_msg = str(e)
        current_app.logger.error(f"[UPLOAD] Exception in make_directory_writable: {error_msg}")
        current_app.logger.error(f"[UPLOAD] Exception type: {type(e).__name__}")
        current_app.logger.error(f"[UPLOAD] Exception traceback:", exc_info=True)
        return False, error_msg

def check_disk_space(file_size: int) -> Tuple[bool, str]:
    """Check if there is enough disk space for a file upload.
    
    Args:
        file_size: Size of the file to be uploaded in bytes
        
    Returns:
        Tuple[bool, str]: (True if enough space, message about space status)
    """
    try:
        current_app.logger.debug(f"[UPLOAD] Checking disk space for file size: {file_size} bytes")
        
        # Run df command with human readable output
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/bin/df', '-h', '/mnt/nas'],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            error_msg = f"Failed to check disk space: {result.stderr.strip()}"
            current_app.logger.error(f"[UPLOAD] {error_msg}")
            return False, error_msg
            
        # Parse df output - get available space
        # Skip header line and split into columns
        lines = result.stdout.strip().split('\n')
        if len(lines) < 2:
            error_msg = "Invalid df output format"
            current_app.logger.error(f"[UPLOAD] {error_msg}")
            return False, error_msg
            
        # Get available space in bytes (df outputs in 1K blocks by default)
        columns = lines[1].split()
        if len(columns) < 4:
            error_msg = "Invalid df output format"
            current_app.logger.error(f"[UPLOAD] {error_msg}")
            return False, error_msg
            
        # Convert human readable size to bytes
        available_str = columns[3]
        multipliers = {'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4}
        
        # Parse available space
        available_bytes = 0
        if available_str[-1] in multipliers:
            number = float(available_str[:-1])
            multiplier = multipliers[available_str[-1]]
            available_bytes = int(number * multiplier)
        else:
            # Assume bytes if no unit
            available_bytes = int(available_str)
            
        # Add 5% buffer to required space
        required_space = int(file_size * 1.05)
        
        current_app.logger.debug(f"[UPLOAD] Available: {available_bytes} bytes, Required: {required_space} bytes")
        
        if available_bytes < required_space:
            human_available = available_str
            human_required = f"{required_space/1024/1024:.1f}M"
            error_msg = f"Insufficient disk space. Available: {human_available}, Required: {human_required}"
            current_app.logger.warning(f"[UPLOAD] {error_msg}")
            return False, error_msg
            
        current_app.logger.debug(f"[UPLOAD] Sufficient disk space available")
        return True, "Sufficient disk space available"
        
    except Exception as e:
        error_msg = f"Error checking disk space: {str(e)}"
        current_app.logger.error(f"[UPLOAD] {error_msg}")
        write_to_log('upload', error_msg, 'error')
        return False, error_msg