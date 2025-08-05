"""
File upload and management routes and functions.
"""
import os
import json
import subprocess
import grp
from pathlib import Path
from typing import Tuple
from flask import current_app, jsonify, request
from . import bp
from backend.utils.utils import validate_upload_path, write_to_log, safe_write_config, is_using_factory_config, factory_mode_error
from .utils import get_upload_blacklist, add_user_to_group, make_directory_writable, check_disk_space
from backend.auth.decorators import admin_required

@bp.route('/api/files/browse', methods=['GET'])
def browse_files():
    """Browse directory under /mnt/nas with blacklist filtering."""
    path = request.args.get('path', '/mnt/nas')
    if not validate_upload_path(path):
        return jsonify({'error': 'Invalid directory'}), 400
    
    # CRITICAL SECURITY CHECK: Simple and reliable NAS mount verification
    if not os.path.isdir('/mnt/nas'):
        current_app.logger.warning(f"[UPLOAD] /mnt/nas directory does not exist - blocking directory access")
        return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not available'}), 503
    
    # Simple mount check: verify /mnt/nas is actually mounted
    try:
        result = subprocess.run(['/usr/bin/mountpoint', '-q', '/mnt/nas'], 
                              capture_output=True, check=False)
        if result.returncode != 0:
            current_app.logger.warning(f"[UPLOAD] /mnt/nas is not a mount point - blocking directory access")
            return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not mounted'}), 503
            
        current_app.logger.debug(f"[UPLOAD] /mnt/nas is properly mounted")
        
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Mount check failed for /mnt/nas: {str(e)}")
        return jsonify({'nas_unavailable': True, 'error': 'NAS storage mount check failed'}), 503
    
    blacklist = get_upload_blacklist()
    current_app.logger.debug(f"[UPLOAD] Processing directory listing for {path} with blacklist: {blacklist}")

    def list_directory(curr_path: str, max_depth: int = 10) -> list | None:
        """
        Recursively list directories while respecting blacklist and access permissions.
        
        Args:
            curr_path: Current directory path to scan
            max_depth: Maximum recursion depth (default 10)
            
        Returns:
            List of directory entries or None if path is inaccessible/blacklisted
        """
        # Early exit if max depth reached
        if max_depth <= 0:
            return None
            
        try:
            # Check if path is blacklisted
            for bl in blacklist:
                resolved_bl = os.path.realpath(os.path.join('/mnt/nas', bl.lstrip('/')))
                curr_path_real = os.path.realpath(curr_path)
                
                # Block if current path is or contains a blacklisted path
                if curr_path_real.startswith(resolved_bl):
                    current_app.logger.debug(f"[UPLOAD] Path {curr_path} blacklisted by {bl}")
                    return None
                
                # Block if current path's basename matches a blacklisted basename
                # This handles both '.git' and '/mnt/nas/git' style patterns
                if os.path.basename(curr_path) == os.path.basename(bl.rstrip('/')):
                    current_app.logger.debug(f"[UPLOAD] Path {curr_path} blacklisted by basename match with {bl}")
                    return None

            # Check if we have read access
            if not os.access(curr_path, os.R_OK):
                return None

            entries = []
            for entry in os.scandir(curr_path):
                # Skip if not a directory
                if not entry.is_dir():
                    continue
                    
                full_path = entry.path
                entry_name = entry.name
                
                # Skip blacklisted paths - check both full path and basename
                skip = False
                for bl in blacklist:
                    # Check path based blacklisting
                    resolved_bl = os.path.realpath(os.path.join('/mnt/nas', bl.lstrip('/')))
                    if os.path.realpath(full_path).startswith(resolved_bl):
                        skip = True
                        break
                        
                    # Check name based blacklisting
                    if entry_name == os.path.basename(bl.rstrip('/')):
                        skip = True
                        break
                        
                if skip:
                    current_app.logger.debug(f"[UPLOAD] Skipping blacklisted directory: {full_path}")
                    continue
                
                # Only include directories we can read
                if not os.access(full_path, os.R_OK):
                    continue
                    
                # Recursively get children
                children = list_directory(full_path, max_depth - 1)
                
                entry_info = {
                    'name': entry_name,
                    'path': full_path,
                    'type': 'directory',
                    'children': children
                }
                entries.append(entry_info)
                
            return sorted(entries, key=lambda x: x['name'].lower())
            
        except (PermissionError, OSError) as e:
            current_app.logger.error(f"[UPLOAD] Error listing directory {curr_path}: {str(e)}")
            return None
        except Exception as e:
            current_app.logger.error(f"[UPLOAD] Unexpected error listing {curr_path}: {str(e)}")
            return None

    try:
        entries = list_directory(path)
        if entries is None:
            return jsonify({'error': 'Directory not accessible'}), 403
            
        content = {
            'path': path,
            'entries': entries,
            'parent': os.path.dirname(path) if path != '/mnt/nas' else None
        }
        return jsonify(content)
        
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Error in browse_files: {str(e)}")
        return jsonify({'error': 'Failed to list directory contents'}), 500

@bp.route('/api/files/browse-hierarchical', methods=['GET'])
def browse_files_hierarchical():
    """Browse directory hierarchically - only load one level at a time."""
    path = request.args.get('path', '/mnt/nas')
    expand = request.args.get('expand', 'false').lower() == 'true'
    
    if not validate_upload_path(path):
        return jsonify({'error': 'Invalid directory'}), 400
    
    # CRITICAL SECURITY CHECK: Simple and reliable NAS mount verification
    if not os.path.isdir('/mnt/nas'):
        current_app.logger.warning(f"[UPLOAD] /mnt/nas directory does not exist - blocking directory access")
        return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not available'}), 503
    
    # Simple mount check: verify /mnt/nas is actually mounted
    try:
        result = subprocess.run(['/usr/bin/mountpoint', '-q', '/mnt/nas'], 
                              capture_output=True, check=False)
        if result.returncode != 0:
            current_app.logger.warning(f"[UPLOAD] /mnt/nas is not a mount point - blocking directory access")
            return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not mounted'}), 503
            
        current_app.logger.debug(f"[UPLOAD] /mnt/nas is properly mounted")
        
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Mount check failed for /mnt/nas: {str(e)}")

    blacklist = get_upload_blacklist()
    current_app.logger.debug(f"[UPLOAD] Browsing hierarchical {path} with blacklist: {blacklist}")

    def get_immediate_children(curr_path: str) -> list:
        """Get only immediate children of a directory."""
        try:
            # Check if path is blacklisted
            for bl in blacklist:
                resolved_bl = os.path.realpath(os.path.join('/mnt/nas', bl.lstrip('/')))
                curr_path_real = os.path.realpath(curr_path)
                
                # Block if current path is or contains a blacklisted path
                if curr_path_real.startswith(resolved_bl):
                    current_app.logger.debug(f"[UPLOAD] Path {curr_path} blacklisted by {bl}")
                    return []
                
                # Block if current path's basename matches a blacklisted basename
                if os.path.basename(curr_path) == os.path.basename(bl.rstrip('/')):
                    current_app.logger.debug(f"[UPLOAD] Path {curr_path} blacklisted by basename match with {bl}")
                    return []

            # Check if we have read access
            if not os.access(curr_path, os.R_OK):
                return []

            entries = []
            total_found = 0
            skipped_blacklist = 0
            skipped_permissions = 0
            
            current_app.logger.debug(f"[UPLOAD] Scanning directory: {curr_path}")
            
            for entry in os.scandir(curr_path):
                total_found += 1
                
                # Skip if not a directory
                if not entry.is_dir():
                    current_app.logger.debug(f"[UPLOAD] Skipping non-directory: {entry.name}")
                    continue
                    
                full_path = entry.path
                entry_name = entry.name
                
                current_app.logger.debug(f"[UPLOAD] Processing directory: {entry_name} at {full_path}")
                
                # Skip blacklisted paths - check both full path and basename
                skip = False
                skip_reason = ""
                for bl in blacklist:
                    # Check path based blacklisting
                    resolved_bl = os.path.realpath(os.path.join('/mnt/nas', bl.lstrip('/')))
                    if os.path.realpath(full_path).startswith(resolved_bl):
                        skip = True
                        skip_reason = f"path blacklist match: {bl}"
                        break
                        
                    # Check name based blacklisting
                    if entry_name == os.path.basename(bl.rstrip('/')):
                        skip = True
                        skip_reason = f"name blacklist match: {bl}"
                        break
                        
                if skip:
                    skipped_blacklist += 1
                    current_app.logger.debug(f"[UPLOAD] Skipping blacklisted directory: {full_path} - {skip_reason}")
                    continue
                
                # Only include directories we can read
                if not os.access(full_path, os.R_OK):
                    skipped_permissions += 1
                    current_app.logger.debug(f"[UPLOAD] Skipping directory due to permissions: {full_path}")
                    continue
                
                # Check if this directory has children
                has_children = False
                try:
                    # Quick check for subdirectories
                    for sub_entry in os.scandir(full_path):
                        if sub_entry.is_dir() and os.access(sub_entry.path, os.R_OK):
                            # Check if subdirectory is not blacklisted
                            sub_skip = False
                            for bl in blacklist:
                                if (os.path.basename(sub_entry.name) == os.path.basename(bl.rstrip('/')) or
                                    os.path.realpath(sub_entry.path).startswith(
                                        os.path.realpath(os.path.join('/mnt/nas', bl.lstrip('/'))))):
                                    sub_skip = True
                                    break
                            if not sub_skip:
                                has_children = True
                                break
                except (PermissionError, OSError):
                    pass
                
                entry_info = {
                    'name': entry_name,
                    'path': full_path,
                    'type': 'directory',
                    'hasChildren': has_children,
                    'isExpanded': False,
                    'children': None
                }
                entries.append(entry_info)
                current_app.logger.debug(f"[UPLOAD] Added directory: {entry_name} (has_children: {has_children})")
                
            current_app.logger.info(f"[UPLOAD] Directory scan complete for {curr_path}: {len(entries)} entries returned (total: {total_found}, blacklisted: {skipped_blacklist}, permission_denied: {skipped_permissions})")
            return sorted(entries, key=lambda x: x['name'].lower())
            
        except (PermissionError, OSError) as e:
            current_app.logger.error(f"[UPLOAD] Error listing directory {curr_path}: {str(e)}")
            return []
        except Exception as e:
            current_app.logger.error(f"[UPLOAD] Unexpected error in get_immediate_children for {curr_path}: {str(e)}")
            return []

    try:
        entries = get_immediate_children(path)
        
        content = {
            'path': path,
            'entries': entries,
            'parent': os.path.dirname(path) if path != '/mnt/nas' else None,
            'hasChildren': len(entries) > 0
        }
        return jsonify(content)
        
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Error in browse_files_hierarchical: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/files/upload', methods=['POST'])
def upload_file():
    """Upload a file to a validated directory."""
    try:
        if 'file' not in request.files:
            write_to_log('upload', 'Upload failed: No file in request', 'error')
            return jsonify({'error': 'No file part in the request'}), 400

        file = request.files['file']
        path = request.form.get('path', '/mnt/nas')

        if not validate_upload_path(path):
            write_to_log('upload', f'Upload failed: Invalid path {path}', 'error')
            return jsonify({'error': 'Invalid upload directory'}), 400

        # CRITICAL SECURITY CHECK: Simple and reliable NAS mount verification  
        if not os.path.isdir('/mnt/nas'):
            write_to_log('upload', 'Upload failed: /mnt/nas directory does not exist', 'error')
            return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not available'}), 503

        # Simple mount check: verify /mnt/nas is actually mounted
        try:
            result = subprocess.run(['/usr/bin/mountpoint', '-q', '/mnt/nas'], 
                                  capture_output=True, check=False)
            if result.returncode != 0:
                write_to_log('upload', 'Upload failed: /mnt/nas is not a mount point', 'error')
                return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not mounted'}), 503
        except Exception as e:
            write_to_log('upload', f'Upload failed: Mount check failed: {str(e)}', 'error')
            return jsonify({'nas_unavailable': True, 'error': 'NAS storage mount check failed'}), 503

        # Check available disk space
        file.seek(0, 2)  # Seek to end to get size
        file_size = file.tell()
        file.seek(0)  # Reset to beginning
        
        has_space, space_msg = check_disk_space(file_size)
        if not has_space:
            write_to_log('upload', f'Upload failed: {space_msg}', 'error')
            return jsonify({'error': space_msg, 'type': 'insufficient_space'}), 403

        file_path = os.path.join(path, file.filename)
        
        try:
            file.save(file_path)
            write_to_log('upload', f'Successfully uploaded {file.filename} to {path}', 'info')
            return jsonify({'success': True})
        except PermissionError:
            error_msg = f"Permission denied: Cannot write to {path}"
            write_to_log('upload', error_msg, 'error')
            return jsonify({'error': error_msg, 'type': 'permission_denied'}), 403

    except Exception as e:
        error_msg = str(e)
        write_to_log('upload', f'Upload failed: {error_msg}', 'error')
        return jsonify({'error': error_msg}), 500

@bp.route('/api/upload/force-permissions', methods=['POST'])
@admin_required
def force_allow_upload():
    """Force update directory permissions for upload."""
    try:
        # Enhanced logging for debugging
        current_app.logger.debug(f"[UPLOAD] Force permissions endpoint called")
        # current_app.logger.debug(f"[UPLOAD] Request method: {request.method}")
        # current_app.logger.debug(f"[UPLOAD] Request headers: {dict(request.headers)}")
        
        data = request.get_json()
        # current_app.logger.debug(f"[UPLOAD] Request data received: {data}")
        
        if not data:
            current_app.logger.error(f"[UPLOAD] No JSON data in request")
            return jsonify({'error': 'No data provided'}), 400
            
        directory = data.get('directory')
        # current_app.logger.debug(f"[UPLOAD] Directory from request: {directory}")
        
        if not directory:
            current_app.logger.error(f"[UPLOAD] No directory specified in request")
            return jsonify({'error': 'Directory parameter missing'}), 400
            
        if not validate_upload_path(directory):
            current_app.logger.error(f"[UPLOAD] Invalid directory path: {directory}")
            return jsonify({'error': 'Invalid directory path'}), 400
            
        # CRITICAL SECURITY CHECK: Simple and reliable NAS mount verification
        if not os.path.isdir('/mnt/nas'):
            current_app.logger.error(f"[UPLOAD] Force permissions denied: /mnt/nas directory does not exist")
            return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not available'}), 503
            
        # Simple mount check: verify /mnt/nas is actually mounted
        try:
            result = subprocess.run(['/usr/bin/mountpoint', '-q', '/mnt/nas'], 
                                  capture_output=True, check=False)
            if result.returncode != 0:
                current_app.logger.error(f"[UPLOAD] Force permissions denied: /mnt/nas is not a mount point")
                return jsonify({'nas_unavailable': True, 'error': 'NAS storage is not mounted'}), 503
        except Exception as e:
            current_app.logger.error(f"[UPLOAD] Force permissions denied: Mount check failed: {str(e)}")
            return jsonify({'nas_unavailable': True, 'error': 'NAS storage mount check failed'}), 503
            
        if not os.path.exists(directory):
            current_app.logger.error(f"[UPLOAD] Directory does not exist: {directory}")
            return jsonify({'error': 'Directory does not exist'}), 400
        
        current_app.logger.info(f"[UPLOAD] Force permissions requested for directory: {directory}")
        
        # Execute both operations with detailed logging
        # current_app.logger.debug(f"[UPLOAD] Starting group operation for {directory}")
        group_success, group_msg = add_user_to_group(directory)
        # current_app.logger.debug(f"[UPLOAD] Group operation completed - Success: {group_success}, Message: {group_msg}")
        
        # current_app.logger.debug(f"[UPLOAD] Starting writable operation for {directory}")
        writable_success, writable_msg = make_directory_writable(directory)
        # current_app.logger.debug(f"[UPLOAD] Writable operation completed - Success: {writable_success}, Message: {writable_msg}")
        
        if group_success and writable_success:
            success_msg = 'Permissions updated successfully'
            current_app.logger.info(f"[UPLOAD] {success_msg} for {directory}")
            return jsonify({'success': True, 'message': success_msg})
            
        errors = []
        if not group_success:
            errors.append(f"Group update failed: {group_msg}")
        if not writable_success:
            errors.append(f"Permissions update failed: {writable_msg}")
            
        error_msg = ' | '.join(errors)
        current_app.logger.error(f"[UPLOAD] Force permissions failed: {error_msg}")
        return jsonify({'error': error_msg}), 500
        
    except Exception as e:
        current_app.logger.error(f"[UPLOAD] Exception in force_allow_upload: {str(e)}")
        current_app.logger.error(f"[UPLOAD] Exception type: {type(e).__name__}")
        current_app.logger.error(f"[UPLOAD] Exception traceback:", exc_info=True)
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@bp.route('/api/upload/history', methods=['GET'])
@admin_required
def upload_history():
    """Retrieve upload history from the dedicated log file."""
    try:
        # Ensure log directory and file exist
        Path(current_app.config['HOMESERVER_LOG_DIR']).mkdir(parents=True, exist_ok=True)
        if not os.path.exists(current_app.config['UPLOAD_LOG_PATH']):
            Path(current_app.config['UPLOAD_LOG_PATH']).touch()
            
        # Check if file is empty
        if os.path.getsize(current_app.config['UPLOAD_LOG_PATH']) == 0:
            return jsonify({'history': []})
            
        with open(current_app.config['UPLOAD_LOG_PATH'], 'r') as log_file:
            # Read all lines and filter out error messages and system logs
            lines = [line.strip() for line in log_file.readlines() 
                    if '[error]' not in line.lower() and 
                    'failed to' not in line.lower() and
                    '[system]' not in line]
            
            # Reverse the order to show newest first
            lines = lines[::-1]
            
        return jsonify({'history': lines})
        
    except Exception as e:
        error_msg = f'Error retrieving upload history: {str(e)}'
        current_app.logger.error(f'[UPLOAD] {error_msg}')
        write_to_log('system', error_msg, 'error')
        return jsonify({'error': error_msg}), 500

@bp.route('/api/upload/history/clear', methods=['POST'])
@admin_required
def clear_upload_history():
    """Clear the upload history log file."""
    try:
        # Create log directory if it doesn't exist
        Path(current_app.config['HOMESERVER_LOG_DIR']).mkdir(parents=True, exist_ok=True)
        
        # Clear the file contents while preserving the file
        with open(current_app.config['UPLOAD_LOG_PATH'], 'w') as f:
            f.write('')
            
        # Log the clear action to main log only
        current_app.logger.info('[UPLOAD] Upload history cleared by admin')
        write_to_log('system', 'Upload history cleared by admin', 'info')
        
        return jsonify({
            'success': True,
            'message': 'Upload history cleared successfully'
        })
        
    except Exception as e:
        error_msg = f'Error in clear_upload_history: {str(e)}'
        current_app.logger.error(f'[UPLOAD] {error_msg}')
        write_to_log('system', error_msg, 'error')
        return jsonify({
            'error': 'Internal server error'
        }), 500

@bp.route('/api/upload/default-directory', methods=['GET', 'POST'])
def handle_default_directory():
    """Get or set the default upload directory."""
    if request.method == 'GET':
        try:
            with open(current_app.config['HOMESERVER_CONFIG']) as f:
                config = json.load(f)
            default_path = config.get('tabs', {}).get('upload', {}).get('data', {}).get('default-directory', '/mnt/nas')
            return jsonify({'defaultPath': default_path}), 200
        except Exception:
            return jsonify({'defaultPath': '/mnt/nas'}), 200
            
    elif request.method == 'POST':
        try:
            # Check for factory config mode first
            if is_using_factory_config():
                return factory_mode_error()
                
            data = request.get_json()
            if not data or 'directory' not in data:
                return jsonify({'error': 'Missing directory parameter'}), 400
                
            directory = data.get('directory')
            if not directory or not validate_upload_path(directory):
                return jsonify({'error': 'Invalid directory'}), 400
                
            # Read current config
            with open(current_app.config['HOMESERVER_CONFIG']) as f:
                config = json.load(f)
                
            # Update config structure
            config.setdefault('tabs', {}).setdefault('upload', {}).setdefault('data', {})['default-directory'] = directory
            
            # Use safe write function
            def write_operation():
                with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                    json.dump(config, f, indent=2)
                    
            if not safe_write_config(write_operation):
                return jsonify({'error': 'Failed to update configuration'}), 500
            
            write_to_log('upload', f'Updated default directory to: {directory}', 'info')
            return jsonify({'success': True, 'directory': directory}), 200
            
        except Exception as e:
            error_msg = f'Error setting default directory: {str(e)}'
            write_to_log('upload', error_msg, 'error')
            return jsonify({'error': error_msg}), 500

@bp.route('/api/upload/blacklist/list', methods=['GET'])
@admin_required
def get_blacklist():
    """Get the current upload blacklist."""
    try:
        blacklist = get_upload_blacklist()
        return jsonify({'blacklist': blacklist}), 200
            
    except Exception as e:
        current_app.logger.error(f'[UPLOAD] Error loading blacklist: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/upload/blacklist/update', methods=['PUT'])
@admin_required
def update_blacklist():
    """Update the entire blacklist."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            return factory_mode_error()
            
        data = request.get_json()
        if not isinstance(data.get('blacklist'), list):
            return jsonify({'error': 'Invalid blacklist format'}), 400
            
        # Read current config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
        
        # Ensure path exists
        if 'tabs' not in config:
            config['tabs'] = {}
        if 'upload' not in config['tabs']:
            config['tabs']['upload'] = {}
        if 'data' not in config['tabs']['upload']:
            config['tabs']['upload']['data'] = {}
            
        # Update blacklist
        config['tabs']['upload']['data']['blacklist'] = data['blacklist']
        
        # Use safe write function
        def write_operation():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(config, f, indent=2)
                
        if not safe_write_config(write_operation):
            return jsonify({'error': 'Failed to update configuration'}), 500
            
        write_to_log('upload', f'Updated blacklist: {data["blacklist"]}', 'info')
        return jsonify({
            'success': True,
            'blacklist': data['blacklist']
        }), 200
            
    except Exception as e:
        current_app.logger.error(f'[UPLOAD] Error updating blacklist: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/upload/pin-required-status', methods=['GET'])
def get_upload_pin_required_status():
    """
    Gets the status of whether a PIN is required for uploads.
    Returns: {'isPinRequired': true/false}
    """
    try:
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            is_pin_required = config.get('tabs', {}).get('upload', {}).get('data', {}).get('isPinRequired', False)
        return jsonify({'isPinRequired': is_pin_required}), 200
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'[UPLOAD] Error getting upload PIN status: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/upload/pin-required-status', methods=['POST'])
@admin_required
def set_upload_pin_required_status():
    """
    Sets the status of whether a PIN is required for uploads.
    Expects {'isPinRequired': true/false} in request body.
    Admin privileges required.
    """
    try:
        data = request.get_json()
        is_pin_required = data.get('isPinRequired')

        if not isinstance(is_pin_required, bool):
            return jsonify({'error': 'Invalid value for isPinRequired. Must be boolean.'}), 400

        with open(current_app.config['HOMESERVER_CONFIG'], 'r+') as f:
            config = json.load(f)
            config.setdefault('tabs', {}).setdefault('upload', {}).setdefault('data', {})['isPinRequired'] = is_pin_required
            f.seek(0)
            json.dump(config, f, indent=4)
            f.truncate()
        
        write_to_log('upload', f'Upload PIN required status set to: {is_pin_required}', 'info')
        return jsonify({'message': 'Upload PIN required status updated successfully.'}), 200

    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'[UPLOAD] Error setting upload PIN status: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500
