import os
from flask import request, jsonify, current_app
from backend.auth.decorators import admin_required
from backend.utils.utils import execute_command, get_config, check_services_running, check_services_stopped, start_service, stop_service, start_all_enabled_services, stop_all_services, get_service_status, write_to_log
from . import bp
from . import utils
import time
import subprocess
import shutil
import re
import json
from pathlib import Path
import logging

# Get logger
logger = logging.getLogger('homeserver')

@bp.route('/api/dev/disable', methods=['POST'])
def disable_dev_tab():
    """
    Disable the developer tab by setting isEnabled to false in homeserver.json
    """
    try:
        config_path = '/var/www/homeserver/src/config/homeserver.json'
        
        # Read current config
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Update the dev tab configuration
        if 'tabs' in config and 'dev' in config['tabs']:
            config['tabs']['dev']['config']['isEnabled'] = False
            logger.info("Developer tab disabled via API")
        else:
            return utils.error_response("Developer tab configuration not found", 404)
        
        # Write updated config back to file
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        return utils.success_response("Developer tab disabled successfully")
        
    except FileNotFoundError:
        logger.error(f"Config file not found: {config_path}")
        return utils.error_response("Configuration file not found", 404)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in config file: {e}")
        return utils.error_response("Invalid configuration file format", 500)
    except Exception as e:
        logger.error(f"Error disabling developer tab: {e}")
        return utils.error_response(f"Failed to disable developer tab: {str(e)}", 500)

@bp.route('/api/dev/files', methods=['GET'])
def get_dev_files():
    """
    Retrieve contents of /deploy/results.txt and /deploy/password.txt if they exist
    """
    try:
        deploy_dir = '/deploy'
        
        files_data = {}
        
        # Check for results.txt in /deploy
        results_path = os.path.join(deploy_dir, 'results.txt')
        try:
            success, stdout, stderr = execute_command(['sudo', '/usr/bin/cat', results_path])
            if success:
                files_data['results'] = {
                    'exists': True,
                    'content': stdout,
                    'path': results_path
                }
            else:
                files_data['results'] = {
                    'exists': False,
                    'content': None,
                    'path': results_path
                }
        except Exception as e:
            files_data['results'] = {
                'exists': False,
                'content': None,
                'error': f"Error reading file: {str(e)}",
                'path': results_path
            }
        
        # Check for password.txt in /deploy
        password_path = os.path.join(deploy_dir, 'password.txt')
        try:
            success, stdout, stderr = execute_command(['sudo', '/usr/bin/cat', password_path])
            if success:
                files_data['password'] = {
                    'exists': True,
                    'content': stdout,
                    'path': password_path
                }
            else:
                files_data['password'] = {
                    'exists': False,
                    'content': None,
                    'path': password_path
                }
        except Exception as e:
            files_data['password'] = {
                'exists': False,
                'content': None,
                'error': f"Error reading file: {str(e)}",
                'path': password_path
            }
        
        logger.info(f"Dev files retrieved successfully from {deploy_dir}")
        return jsonify({
            'status': 'success',
            'files': files_data
        }), 200
        
    except Exception as e:
        logger.error(f"Error retrieving dev files: {e}")
        return utils.error_response(f"Failed to retrieve dev files: {str(e)}", 500)

@bp.route('/api/dev/wipe-deploy-partition', methods=['POST'])
def wipe_deploy_partition():
    """
    Execute the wipeDeployPartition.sh script to cryptographically destroy the deploy partition
    """
    try:
        script_path = '/usr/local/sbin/wipeDeployPartition.sh'
        
        # Check if script exists
        if not os.path.exists(script_path):
            logger.error(f"Wipe script not found at {script_path}")
            return utils.error_response("Wipe script not found", 404)
        
        logger.info("Starting deploy partition wipe process")
        
        # Execute the wipe script with sudo
        # Note: This is a destructive operation that will run in the background
        success, stdout, stderr = execute_command(['sudo', script_path])
        
        if success:
            logger.info("Deploy partition wipe script executed successfully")
            return utils.success_response("Deploy partition wipe completed successfully", {
                'output': stdout,
                'timestamp': time.time()
            })
        else:
            logger.error(f"Deploy partition wipe failed: {stderr}")
            return utils.error_response(f"Deploy partition wipe failed: {stderr}", 500)
        
    except Exception as e:
        logger.error(f"Error executing deploy partition wipe: {e}")
        return utils.error_response(f"Failed to execute deploy partition wipe: {str(e)}", 500)

@bp.route('/api/dev/finale-wrapup', methods=['POST'])
def finale_wrapup():
    """
    Delete the wipeDeployPartition.sh script, deployment.log file, and clean up dev tab to minimal state
    """
    try:
        script_path = '/usr/local/sbin/wipeDeployPartition.sh'
        log_path = '/var/www/homeserver/deployment.log'
        
        deleted_files = []
        cleaned_components = []
        errors = []
        
        # Delete the wipe script if it exists
        if os.path.exists(script_path):
            try:
                success, stdout, stderr = execute_command(['sudo', 'rm', script_path])
                if success:
                    deleted_files.append(script_path)
                    logger.info(f"Successfully deleted wipe script: {script_path}")
                else:
                    errors.append(f"Failed to delete script: {stderr}")
                    logger.error(f"Failed to delete script {script_path}: {stderr}")
            except Exception as e:
                errors.append(f"Error deleting script: {str(e)}")
                logger.error(f"Error deleting script {script_path}: {e}")
        else:
            logger.info(f"Script {script_path} does not exist, skipping")
        
        # Delete the deployment log if it exists
        if os.path.exists(log_path):
            try:
                success, stdout, stderr = execute_command(['sudo', 'rm', log_path])
                if success:
                    deleted_files.append(log_path)
                    logger.info(f"Successfully deleted deployment log: {log_path}")
                else:
                    errors.append(f"Failed to delete log: {stderr}")
                    logger.error(f"Failed to delete log {log_path}: {stderr}")
            except Exception as e:
                errors.append(f"Error deleting log: {str(e)}")
                logger.error(f"Error deleting log {log_path}: {e}")
        else:
            logger.info(f"Log file {log_path} does not exist, skipping")
        
        # Set vault password to skeleton key as part of finale wrapup
        vault_script_path = '/usr/local/sbin/setVaultPassword.sh'
        password_file = '/deploy/password.txt'
        
        if os.path.exists(vault_script_path) and os.path.exists(password_file):
            try:
                logger.info("[DEV] Setting vault password to skeleton key as part of finale wrapup")
                vault_success, vault_stdout, vault_stderr = execute_command(['sudo', vault_script_path])
                
                if vault_success:
                    cleaned_components.append("vault password (set to skeleton key)")
                    logger.info("Successfully set vault password to skeleton key")
                    write_to_log('admin', 'Vault LUKS password set to skeleton key during finale wrapup', 'info')
                else:
                    errors.append(f"Failed to set vault password: {vault_stderr}")
                    logger.error(f"Failed to set vault password: {vault_stderr}")
            except Exception as e:
                errors.append(f"Error setting vault password: {str(e)}")
                logger.error(f"Error setting vault password: {e}")
        else:
            if not os.path.exists(vault_script_path):
                logger.info(f"Vault password script not found at {vault_script_path}, skipping")
            if not os.path.exists(password_file):
                logger.info(f"Password file not found at {password_file}, skipping")
        
        # Clean up dev tab components - remove all files except DisableDevTab
        dev_components_path = '/var/www/homeserver/src/tablets/dev/components'
        if os.path.exists(dev_components_path):
            try:
                # List of files to keep (only disable functionality)
                keep_files = ['DisableDevTab.tsx']
                
                # Get all files in the components directory
                for filename in os.listdir(dev_components_path):
                    if filename not in keep_files and filename != '__pycache__':
                        file_path = os.path.join(dev_components_path, filename)
                        try:
                            if os.path.isfile(file_path):
                                os.remove(file_path)
                                cleaned_components.append(f"components/{filename}")
                                logger.info(f"Removed dev component: {filename}")
                        except Exception as e:
                            errors.append(f"Failed to remove {filename}: {str(e)}")
                            logger.error(f"Error removing {filename}: {e}")
                            
            except Exception as e:
                errors.append(f"Error cleaning dev components: {str(e)}")
                logger.error(f"Error cleaning dev components: {e}")
        
        # Clean up dev tab types - create minimal types file
        dev_types_path = '/var/www/homeserver/src/tablets/dev/types.ts'
        if os.path.exists(dev_types_path):
            try:
                minimal_types = '''export interface DevTabConfig {
  displayName: string;
  adminOnly: boolean;
  order: number;
  isEnabled: boolean;
}

export interface DevTabVisibility {
  tab: boolean;
  elements: {
    placeholder: boolean;
  };
}

export interface DevTabData {
  // Minimal dev tab data
}

export interface DevTab {
  config: DevTabConfig;
  visibility: DevTabVisibility;
  data: DevTabData;
}
'''
                with open(dev_types_path, 'w') as f:
                    f.write(minimal_types)
                cleaned_components.append("types.ts (minimized)")
                logger.info("Minimized dev types file")
            except Exception as e:
                errors.append(f"Error minimizing types: {str(e)}")
                logger.error(f"Error minimizing types: {e}")
        
        # Clean up dev tab index - create minimal index
        dev_index_path = '/var/www/homeserver/src/tablets/dev/index.tsx'
        if os.path.exists(dev_index_path):
            try:
                minimal_index = '''import React from 'react';
import { useVisibility } from '../../hooks/useVisibility';
import DisableDevTab from './components/DisableDevTab';

export default function DevTab() {
  const { checkTabVisibility } = useVisibility();
  
  if (!checkTabVisibility('dev')) {
    return null;
  }
  
  return (
    <div className="dev-tab">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '200px',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          textAlign: 'center',
          color: 'var(--text)',
          opacity: 0.7
        }}>
        </div>
        <DisableDevTab />
      </div>
    </div>
  );
}'''
                with open(dev_index_path, 'w') as f:
                    f.write(minimal_index)
                cleaned_components.append("index.tsx (minimized)")
                logger.info("Minimized dev index file")
            except Exception as e:
                errors.append(f"Error minimizing index: {str(e)}")
                logger.error(f"Error minimizing index: {e}")
        
        # Clean up useDev hook - create minimal hook
        use_dev_path = '/var/www/homeserver/src/tablets/dev/useDev.ts'
        if os.path.exists(use_dev_path):
            try:
                minimal_hook = '''import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { API_ENDPOINTS } from '../../api/endpoints';

interface DevDisableResponse {
  status: string;
  message?: string;
}

export const useDev = () => {
  const { post } = useApi();
  const { success, error } = useToast();

  const disableDevTab = async (): Promise<boolean> => {
    try {
      const response = await post<DevDisableResponse>(API_ENDPOINTS.dev.disable);
      
      if (response.status === 'success') {
        success('Developer tab disabled successfully');
        return true;
      } else {
        error(response.message || 'Failed to disable developer tab');
        return false;
      }
    } catch (err: any) {
      console.error('Error disabling developer tab:', err);
      error(err.response?.data?.message || 'Failed to disable developer tab');
      return false;
    }
  };

  return {
    disableDevTab
  };
};'''
                with open(use_dev_path, 'w') as f:
                    f.write(minimal_hook)
                cleaned_components.append("useDev.ts (minimized)")
                logger.info("Minimized useDev hook")
            except Exception as e:
                errors.append(f"Error minimizing useDev: {str(e)}")
                logger.error(f"Error minimizing useDev: {e}")
        
        # Clean up API endpoints - remove dev endpoints except disable
        endpoints_path = '/var/www/homeserver/src/api/endpoints.ts'
        if os.path.exists(endpoints_path):
            try:
                # Read the current file
                with open(endpoints_path, 'r') as f:
                    content = f.read()
                
                # Replace the DevEndpoints type and dev section
                import re
                
                # Replace DevEndpoints type
                dev_endpoints_pattern = r'export type DevEndpoints = \{[^}]*\};'
                minimal_dev_endpoints = '''export type DevEndpoints = {
  disable: string;
};'''
                content = re.sub(dev_endpoints_pattern, minimal_dev_endpoints, content)
                
                # Replace dev endpoints in API_ENDPOINTS
                dev_section_pattern = r'// Dev endpoints\s*dev: \{[^}]*\},'
                minimal_dev_section = '''// Dev endpoints
    dev: {
      disable: '/admin/dev/disable',
    },'''
                content = re.sub(dev_section_pattern, minimal_dev_section, content, flags=re.DOTALL)
                
                with open(endpoints_path, 'w') as f:
                    f.write(content)
                cleaned_components.append("endpoints.ts (minimized)")
                logger.info("Minimized API endpoints")
            except Exception as e:
                errors.append(f"Error minimizing endpoints: {str(e)}")
                logger.error(f"Error minimizing endpoints: {e}")
        
        # Rebuild the frontend after cleanup
        try:
            logger.info("Starting npm build after dev tab cleanup")
            build_success, build_stdout, build_stderr = execute_command([
                'sudo', 'bash', '-c', 
                'cd /var/www/homeserver && npm run build'
            ])
            
            if build_success:
                cleaned_components.append("npm build (completed)")
                logger.info("Successfully rebuilt frontend after cleanup")
            else:
                errors.append(f"Failed to rebuild frontend: {build_stderr}")
                logger.error(f"Failed to rebuild frontend: {build_stderr}")
                
        except Exception as e:
            errors.append(f"Error during npm build: {str(e)}")
            logger.error(f"Error during npm build: {e}")
        
        # Remove the flask-dev sudo permissions file as final cleanup
        try:
            flask_dev_path = '/etc/sudoers.d/flask-dev'
            logger.info("Removing flask-dev sudo permissions file")
            
            permissions_success, permissions_stdout, permissions_stderr = execute_command([
                'sudo', 'rm', flask_dev_path
            ])
            
            if permissions_success:
                cleaned_components.append("flask-dev permissions (removed)")
                logger.info("Successfully removed flask-dev sudo permissions file")
            else:
                errors.append(f"Failed to remove flask-dev permissions: {permissions_stderr}")
                logger.error(f"Failed to remove flask-dev permissions: {permissions_stderr}")
                
        except Exception as e:
            errors.append(f"Error removing flask-dev permissions: {str(e)}")
            logger.error(f"Error removing flask-dev permissions: {e}")
        
        # Remove the sbin scripts used in finale wrapup
        sbin_scripts = [
            '/usr/local/sbin/setVaultPassword.sh',
            '/usr/local/sbin/wipeDeployPartition.sh'  # In case it wasn't deleted earlier
        ]
        
        for script_path in sbin_scripts:
            if os.path.exists(script_path):
                try:
                    logger.info(f"Removing sbin script: {script_path}")
                    script_success, script_stdout, script_stderr = execute_command([
                        'sudo', 'rm', script_path
                    ])
                    
                    if script_success:
                        deleted_files.append(script_path)
                        logger.info(f"Successfully removed sbin script: {script_path}")
                    else:
                        errors.append(f"Failed to remove {script_path}: {script_stderr}")
                        logger.error(f"Failed to remove {script_path}: {script_stderr}")
                        
                except Exception as e:
                    errors.append(f"Error removing {script_path}: {str(e)}")
                    logger.error(f"Error removing {script_path}: {e}")
            else:
                logger.info(f"Sbin script {script_path} does not exist, skipping")
        
        # Prepare response
        total_cleaned = len(deleted_files) + len(cleaned_components)
        
        if (deleted_files or cleaned_components) and not errors:
            logger.info("Finale wrapup and dev tab cleanup completed successfully")
            return utils.success_response("Finale wrapup and dev tab cleanup completed successfully", {
                'deleted_files': deleted_files,
                'cleaned_components': cleaned_components,
                'total_cleaned': total_cleaned,
                'timestamp': time.time()
            })
        elif (deleted_files or cleaned_components) and errors:
            logger.warning("Finale wrapup completed with some errors")
            return utils.success_response("Finale wrapup completed with some issues", {
                'deleted_files': deleted_files,
                'cleaned_components': cleaned_components,
                'errors': errors,
                'total_cleaned': total_cleaned,
                'timestamp': time.time()
            })
        elif not deleted_files and not cleaned_components and not errors:
            logger.info("Finale wrapup completed - no files found to clean")
            return utils.success_response("Finale wrapup completed - no files found to clean", {
                'deleted_files': [],
                'cleaned_components': [],
                'total_cleaned': 0,
                'timestamp': time.time()
            })
        else:
            logger.error("Finale wrapup failed")
            return utils.error_response("Finale wrapup failed", 500, {
                'errors': errors
            })
        
    except Exception as e:
        logger.error(f"Error during finale wrapup: {e}")
        return utils.error_response(f"Failed to execute finale wrapup: {str(e)}", 500)

@bp.route('/api/dev/deployment-log', methods=['GET'])
def get_deployment_log():
    """
    Retrieve contents of the deployment.log file
    """
    try:
        log_path = '/var/www/homeserver/deployment.log'
        
        if not os.path.exists(log_path):
            logger.info(f"Deployment log not found at {log_path}")
            return jsonify({
                'status': 'success',
                'log_data': {
                    'exists': False,
                    'content': None,
                    'path': log_path,
                    'message': 'Deployment log file does not exist'
                }
            }), 200
        
        try:
            success, stdout, stderr = execute_command(['sudo', '/usr/bin/cat', log_path])
            if success:
                logger.info(f"Successfully retrieved deployment log from {log_path}")
                return jsonify({
                    'status': 'success',
                    'log_data': {
                        'exists': True,
                        'content': stdout,
                        'path': log_path,
                        'size': len(stdout.encode('utf-8')) if stdout else 0
                    }
                }), 200
            else:
                logger.error(f"Failed to read deployment log {log_path}: {stderr}")
                return jsonify({
                    'status': 'success',
                    'log_data': {
                        'exists': True,
                        'content': None,
                        'path': log_path,
                        'error': f"Failed to read file: {stderr}"
                    }
                }), 200
        except Exception as e:
            logger.error(f"Error reading deployment log {log_path}: {e}")
            return jsonify({
                'status': 'success',
                'log_data': {
                    'exists': True,
                    'content': None,
                    'path': log_path,
                    'error': f"Error reading file: {str(e)}"
                }
            }), 200
        
    except Exception as e:
        logger.error(f"Error retrieving deployment log: {e}")
        return utils.error_response(f"Failed to retrieve deployment log: {str(e)}", 500)

@bp.route('/api/dev/hard-drive-test/devices', methods=['GET'])
def get_hard_drive_test_devices():
    """
    Get list of available devices for hard drive testing with LUKS support
    """
    try:
        current_app.logger.info("=== DEV TAB HARD DRIVE TEST DEVICES REQUEST STARTED ===")
        current_app.logger.info("Retrieving hard drive test devices for dev tab")
        
        devices = []
        luks_devices = {}  # Track LUKS devices and their mappers
        
        # Get list of all block devices - use lsblk without /dev/* pattern
        success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'NAME'])
        if not success:
            logger.error(f"Failed to list block devices: {stderr}")
            return utils.error_response(f"Failed to get block devices: {stderr}", 500)
            
        # Filter to only include actual disk devices and build full paths
        device_names = []
        for name in stdout.splitlines():
            name = name.strip()
            if name and not name.startswith(('├─', '└─')):  # Skip partition tree symbols
                device_path = f"/dev/{name}"
                # Only include if it's an actual block device file
                if os.path.exists(device_path):
                    device_names.append(device_path)
        
        current_app.logger.info(f"Found potential devices: {device_names}")
        
                # First pass - identify LUKS devices and their mappers
        for device in device_names:
            try:
                # Get filesystem type
                success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'FSTYPE', device])
                current_app.logger.info(f"LUKS check for {device}: success={success}, fstype='{stdout.strip()}'")
                if success and stdout.strip() == "crypto_LUKS":
                    # Check for mapper device
                    success, stdout, stderr = execute_command(['sudo', '/usr/bin/ls', '-la', '/dev/mapper/*'])
                    if success:
                        for line in stdout.splitlines():
                            if device in line:
                                mapper_device = line.split(" -> ")[-1].strip()
                                luks_devices[device] = mapper_device
                                current_app.logger.info(f"Found LUKS device: {device} -> {mapper_device}")
                                break
            except Exception as e:
                current_app.logger.warning(f"Error checking LUKS status for {device}: {e}")
                continue
        
        current_app.logger.info(f"Found LUKS devices: {luks_devices}")
        current_app.logger.info(f"Starting second pass for devices: {device_names}")
        
        # Second pass - collect device info with LUKS awareness
        for device in device_names:
            try:
                # Get device type - check if "disk" appears in any line
                success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'TYPE', device])
                device_type = stdout if success else ''
                current_app.logger.info(f"Device {device} type: {device_type}")
                if not success or "disk" not in device_type:
                    current_app.logger.info(f"Skipping {device} - not a disk device (type: {device_type.strip()})")
                    continue  # Skip non-disk devices
                
                # Skip system drives (basic check)
                device_name = os.path.basename(device)
                if device_name.startswith(('loop', 'sr', 'rom')):
                    current_app.logger.info(f"Skipping {device} - system drive type")
                    continue
                
                # Get filesystem type
                success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'FSTYPE', device])
                fstype = stdout.strip() if success else ''
                current_app.logger.info(f"Device {device} fstype: {fstype}")
                
                # Get mount point - check the device itself, not partitions
                success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'MOUNTPOINT', device])
                mountpoint = stdout.strip() if success else ''
                current_app.logger.info(f"Device {device} mountpoint: '{mountpoint}'")
                
                # For LUKS devices, we want to allow them even if they have partitions that are mounted
                # Only skip if the device itself is directly mounted
                if mountpoint and not device in luks_devices:
                    current_app.logger.info(f"Skipping {device} - device is mounted at {mountpoint}")
                    continue
                
                # Get size
                success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'SIZE', device])
                size = stdout.strip() if success else 'Unknown'
                
                # Get label
                success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'LABEL', device])
                label = stdout.strip() if success else ''
                
                # Check if it's a USB device
                is_usb = False
                try:
                    success, stdout, stderr = execute_command(['sudo', '/usr/bin/udevadm', 'info', '--query=property', f'--name={device}'])
                    if success and 'ID_BUS=usb' in stdout:
                        is_usb = True
                except Exception:
                    pass
                
                # Build device info with LUKS support
                device_info = {
                    'device': device,
                    'name': device_name,
                    'size': size,
                    'label': label,
                    'fstype': fstype,
                    'is_usb': is_usb,
                    'is_luks': device in luks_devices,
                    'description': f"{device_name} ({size})"
                }
                
                # Add LUKS-specific information
                if device in luks_devices:
                    device_info['mapper_device'] = luks_devices[device]
                    # Get filesystem type of mapper device
                    success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'FSTYPE', luks_devices[device]])
                    if success:
                        device_info['mapper_fstype'] = stdout.strip()
                    
                    # Update description to indicate LUKS
                    device_info['description'] = f"{device_name} ({size}) [LUKS Encrypted]"
                
                devices.append(device_info)
                
            except Exception as e:
                current_app.logger.error(f"Error processing device {device}: {e}")
                continue
        
        current_app.logger.info(f"Found {len(devices)} testable devices ({len(luks_devices)} LUKS encrypted)")
        return jsonify({
            'status': 'success',
            'devices': devices
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving hard drive test devices: {e}")
        return utils.error_response(f"Failed to retrieve devices: {str(e)}", 500)

@bp.route('/api/dev/hard-drive-test/start', methods=['POST'])
def start_hard_drive_test():
    """
    Start a hard drive test
    """
    try:
        data = request.get_json()
        if not data:
            return utils.error_response("No JSON data received", 400)
        
        device = data.get('device')
        test_type = data.get('test_type', 'full')
        
        if not device:
            return utils.error_response("Device parameter is required", 400)
        
        # Validate test type
        valid_test_types = ['quick', 'full', 'ultimate']
        if test_type not in valid_test_types:
            return utils.error_response(f"Invalid test_type. Must be one of: {', '.join(valid_test_types)}", 400)
        
        # Check if device exists
        if not os.path.exists(device):
            return utils.error_response(f"Device {device} does not exist", 404)
        
        # Check if device is mounted
        success, stdout, stderr = execute_command(['sudo', '/usr/bin/lsblk', '-n', '-o', 'MOUNTPOINT', device])
        if success and stdout.strip():
            return utils.error_response(f"Device {device} is mounted and cannot be tested", 400)
        
        # Check if script exists
        script_path = '/usr/local/sbin/harddrive_test.sh'
        if not os.path.exists(script_path):
            return utils.error_response("Hard drive test script not found", 404)
        
        current_app.logger.info(f"Starting hard drive test: device={device}, type={test_type}")
        
        # Start the test in background
        test_id = f"dev_hdtest_{int(time.time())}"
        
        # Execute the test script
        success, stdout, stderr = execute_command([
            'sudo', script_path, device, test_type
        ], timeout=None)  # No timeout for long-running tests
        
        if success:
            current_app.logger.info(f"Hard drive test completed successfully for {device}")
            return utils.success_response(f"Hard drive test completed for {device}", {
                'test_id': test_id,
                'device': device,
                'test_type': test_type,
                'output': stdout,
                'timestamp': time.time()
            })
        else:
            current_app.logger.error(f"Hard drive test failed for {device}: {stderr}")
            return utils.error_response(f"Hard drive test failed: {stderr}", 500)
        
    except Exception as e:
        current_app.logger.error(f"Error starting hard drive test: {e}")
        return utils.error_response(f"Failed to start hard drive test: {str(e)}", 500)

@bp.route('/api/dev/hard-drive-test/results', methods=['GET'])
def get_hard_drive_test_results():
    """
    Get hard drive test results
    """
    try:
        results_file = '/var/harddriveTest.txt'
        
        if not os.path.exists(results_file):
            current_app.logger.info("Hard drive test results file does not exist")
            return jsonify({
                'status': 'success',
                'results': {
                    'exists': False,
                    'content': None,
                    'path': results_file,
                    'message': 'No test results available'
                }
            }), 200
        
        try:
            success, stdout, stderr = execute_command(['sudo', '/usr/bin/cat', results_file])
            if success:
                current_app.logger.info("Successfully retrieved hard drive test results")
                return jsonify({
                    'status': 'success',
                    'results': {
                        'exists': True,
                        'content': stdout,
                        'path': results_file,
                        'size': len(stdout.encode('utf-8')) if stdout else 0
                    }
                }), 200
            else:
                current_app.logger.error(f"Failed to read test results: {stderr}")
                return jsonify({
                    'status': 'success',
                    'results': {
                        'exists': True,
                        'content': None,
                        'path': results_file,
                        'error': f"Failed to read file: {stderr}"
                    }
                }), 200
        except Exception as e:
            current_app.logger.error(f"Error reading test results: {e}")
            return jsonify({
                'status': 'success',
                'results': {
                    'exists': True,
                    'content': None,
                    'path': results_file,
                    'error': f"Error reading file: {str(e)}"
                }
            }), 200
        
    except Exception as e:
        logger.error(f"Error retrieving hard drive test results: {e}")
        return utils.error_response(f"Failed to retrieve test results: {str(e)}", 500)

@bp.route('/api/dev/thermal-test/start', methods=['POST'])
def start_thermal_test():
    """
    Start the thermal abuse test
    """
    try:
        script_path = '/usr/local/sbin/thermalTest.sh'
        
        # Check if script exists
        if not os.path.exists(script_path):
            logger.error(f"Thermal test script not found at {script_path}")
            return utils.error_response("Thermal test script not found", 404)
        
        logger.info("Starting thermal abuse test")
        
        # Execute the thermal test script
        test_id = f"thermal_test_{int(time.time())}"
        
        success, stdout, stderr = execute_command([
            'sudo', script_path
        ], timeout=None)  # No timeout for long-running test (10 minutes)
        
        if success:
            logger.info("Thermal test completed successfully")
            return utils.success_response("Thermal test completed successfully", {
                'test_id': test_id,
                'output': stdout,
                'timestamp': time.time()
            })
        else:
            logger.error(f"Thermal test failed: {stderr}")
            return utils.error_response(f"Thermal test failed: {stderr}", 500)
        
    except Exception as e:
        logger.error(f"Error starting thermal test: {e}")
        return utils.error_response(f"Failed to start thermal test: {str(e)}", 500)

@bp.route('/api/dev/thermal-test/results', methods=['GET'])
def get_thermal_test_results():
    """
    Get thermal test failure results if they exist
    """
    try:
        results_file = '/var/www/homeserver/thermalFail.txt'
        
        if not os.path.exists(results_file):
            current_app.logger.info("Thermal test failure file does not exist")
            return jsonify({
                'status': 'success',
                'results': {
                    'exists': False,
                    'content': None,
                    'path': results_file,
                    'message': 'No thermal test failure results'
                }
            }), 200
        
        try:
            success, stdout, stderr = execute_command(['sudo', '/bin/cat', results_file])
            if success:
                current_app.logger.info("Successfully retrieved thermal test failure results")
                return jsonify({
                    'status': 'success',
                    'results': {
                        'exists': True,
                        'content': stdout,
                        'path': results_file,
                        'size': len(stdout.encode('utf-8')) if stdout else 0
                    }
                }), 200
            else:
                current_app.logger.error(f"Failed to read thermal test results: {stderr}")
                return jsonify({
                    'status': 'success',
                    'results': {
                        'exists': True,
                        'content': None,
                        'path': results_file,
                        'error': f"Failed to read file: {stderr}"
                    }
                }), 200
        except Exception as e:
            current_app.logger.error(f"Error reading thermal test results: {e}")
            return jsonify({
                'status': 'success',
                'results': {
                    'exists': True,
                    'content': None,
                    'path': results_file,
                    'error': f"Error reading file: {str(e)}"
                }
            }), 200
        
    except Exception as e:
        logger.error(f"Error retrieving thermal test results: {e}")
        return utils.error_response(f"Failed to retrieve test results: {str(e)}", 500)

@bp.route('/api/admin/dev/thermal-test/clear-results', methods=['POST'])
def clear_thermal_test_results():
    """
    Clear the thermal test failure results file
    """
    try:
        results_file = '/var/www/homeserver/thermalFail.txt'
        
        if not os.path.exists(results_file):
            logger.info("Thermal test failure file does not exist")
            return utils.success_response("No thermal test results to clear")
        
        # Remove the failure file
        success, stdout, stderr = execute_command(['sudo', '/bin/rm', results_file])
        
        if success:
            logger.info("Successfully cleared thermal test failure results")
            return utils.success_response("Thermal test results cleared successfully")
        else:
            logger.error(f"Failed to clear thermal test results: {stderr}")
            return utils.error_response(f"Failed to clear thermal test results: {stderr}", 500)
        
    except Exception as e:
        logger.error(f"Error clearing thermal test results: {e}")
        return utils.error_response(f"Failed to clear thermal test results: {str(e)}", 500)



@bp.route('/api/dev/unlock-deploy', methods=['POST'])
def unlock_deploy_partition():
    """
    Unlock and mount the LUKS encrypted /deploy partition using the ephemeral key.
    This is for DevOps use when a device gets rebooted during deployment stage.
    """
    try:
        logger.info("[DEV] Starting unlock deploy partition operation")
        
        # Hardcoded ephemeral key from config.json
        ephemeral_key = "HOMESERVER_DEPLOY_EPHEMERAL_KEY_2024"
        deploy_mount = "/deploy"
        deploy_mapper = "deploy"
        
        # Check if deploy is already mounted
        success, stdout, stderr = execute_command(['sudo', '/usr/bin/mountpoint', '-q', deploy_mount])
        if success:
            logger.info("[DEV] Deploy partition is already mounted")
            return utils.success_response("Deploy partition is already mounted", {
                'mount_point': deploy_mount,
                'mapper': f'/dev/mapper/{deploy_mapper}',
                'status': 'already_mounted'
            })
        
        # Check if mapper already exists and is active
        if os.path.exists(f'/dev/mapper/{deploy_mapper}'):
            logger.info("[DEV] Deploy mapper already exists, creating mount point and mounting")
            
            # Create mount point and mount - simple and direct
            execute_command(['/usr/bin/sudo', '/usr/bin/mkdir', '-p', deploy_mount])
            success, stdout, stderr = execute_command(['/usr/bin/sudo', '/usr/bin/mount', f'/dev/mapper/{deploy_mapper}', deploy_mount])
            
            if success:
                logger.info("[DEV] Successfully mounted existing deploy mapper")
                return utils.success_response("Deploy partition mounted successfully (was already unlocked)", {
                    'mount_point': deploy_mount,
                    'mapper': f'/dev/mapper/{deploy_mapper}',
                    'status': 'mounted_existing_mapper'
                })
            else:
                logger.error(f"[DEV] Failed to mount existing mapper: {stderr}")
                return utils.error_response(f"Failed to mount existing mapper: {stderr}", 500)
        
        # Get deploy partition from homeserver.json configuration
        logger.info("[DEV] Reading deploy partition from homeserver.json")
        config_path = '/var/www/homeserver/src/config/homeserver.json'
        
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            
            # Get deploy mount configuration
            deploy_config = config.get('global', {}).get('mounts', {}).get('deploy')
            if not deploy_config:
                logger.error("[DEV] Deploy mount configuration not found in homeserver.json")
                return utils.error_response("Deploy mount configuration not found", 404)
            
            deploy_device_name = deploy_config.get('device')
            if not deploy_device_name:
                logger.error("[DEV] Deploy device name not found in configuration")
                return utils.error_response("Deploy device name not found in configuration", 404)
            
            deploy_device = f"/dev/{deploy_device_name}"
            logger.info(f"[DEV] Using deploy device from config: {deploy_device}")
            
        except FileNotFoundError:
            logger.error(f"[DEV] Config file not found: {config_path}")
            return utils.error_response("Configuration file not found", 404)
        except json.JSONDecodeError as e:
            logger.error(f"[DEV] Invalid JSON in config file: {e}")
            return utils.error_response("Invalid configuration file format", 500)
        except Exception as e:
            logger.error(f"[DEV] Error reading config: {e}")
            return utils.error_response(f"Failed to read configuration: {str(e)}", 500)
        
        # Verify the device exists
        if not os.path.exists(deploy_device):
            logger.error(f"[DEV] Deploy device {deploy_device} does not exist")
            return utils.error_response(f"Deploy device {deploy_device} does not exist", 404)
        
        # Check if the device is LUKS encrypted
        success, stdout, stderr = execute_command(['/usr/bin/sudo', '/usr/sbin/cryptsetup', 'isLuks', deploy_device])
        if not success:
            logger.error(f"[DEV] Device {deploy_device} is not LUKS encrypted")
            return utils.error_response(f"Device {deploy_device} is not LUKS encrypted", 400)
        
        logger.info(f"[DEV] Confirmed {deploy_device} is LUKS encrypted")
        
        # Open the LUKS partition with ephemeral key
        logger.info(f"[DEV] Opening LUKS partition {deploy_device} as {deploy_mapper}")
        process = subprocess.Popen(
            ['/usr/bin/sudo', '/usr/sbin/cryptsetup', 'luksOpen', deploy_device, deploy_mapper],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate(input=ephemeral_key)
        
        if process.returncode != 0:
            logger.error(f"[DEV] Failed to open LUKS partition: {stderr}")
            return utils.error_response(f"Failed to open LUKS partition: {stderr}", 500)
        
        logger.info(f"[DEV] Successfully opened LUKS partition as /dev/mapper/{deploy_mapper}")
        
        # Create mount point if it doesn't exist
        success, stdout, stderr = execute_command(['/usr/bin/sudo', '/usr/bin/mkdir', '-p', deploy_mount])
        if not success:
            logger.error(f"[DEV] Failed to create mount point: {stderr}")
            # Close the LUKS device on failure
            execute_command(['/usr/bin/sudo', '/usr/sbin/cryptsetup', 'close', deploy_mapper])
            return utils.error_response(f"Failed to create mount point: {stderr}", 500)
        
        # Mount the decrypted partition
        logger.info(f"[DEV] Mounting /dev/mapper/{deploy_mapper} to {deploy_mount}")
        success, stdout, stderr = execute_command(['/usr/bin/sudo', '/usr/bin/mount', f'/dev/mapper/{deploy_mapper}', deploy_mount])
        
        if not success:
            logger.error(f"[DEV] Failed to mount deploy partition: {stderr}")
            # Close the LUKS device on failure
            execute_command(['/usr/bin/sudo', '/usr/sbin/cryptsetup', 'close', deploy_mapper])
            return utils.error_response(f"Failed to mount deploy partition: {stderr}", 500)
        
        # Verify the mount
        success, stdout, stderr = execute_command(['/usr/bin/sudo', '/usr/bin/mountpoint', '-q', deploy_mount])
        if not success:
            logger.error("[DEV] Mount verification failed")
            return utils.error_response("Mount verification failed", 500)
        
        logger.info("[DEV] Deploy partition unlocked and mounted successfully")
        write_to_log('admin', 'Deploy partition unlocked and mounted via dev tab', 'info')
        
        return utils.success_response("Deploy partition unlocked and mounted successfully", {
            'device': deploy_device,
            'mount_point': deploy_mount,
            'mapper': f'/dev/mapper/{deploy_mapper}',
            'status': 'unlocked_and_mounted'
        })
        
    except Exception as e:
        logger.error(f"[DEV] Error unlocking deploy partition: {e}")
        return utils.error_response(f"Failed to unlock deploy partition: {str(e)}", 500)
