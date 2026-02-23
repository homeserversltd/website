import os
from flask import request, jsonify, current_app
from backend.auth.decorators import admin_required
from backend.utils.utils import execute_command, get_config, error_response, success_response, check_services_running, check_services_stopped, start_service, stop_service, start_all_enabled_services, stop_all_services, get_service_status, write_to_log, is_system_partition, get_partlabel, resolve_device_identifier
from .. import bp
from . import utils
import time
import subprocess
import shutil
import re
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import logging
from backend.monitors.sync import SyncMonitor
from backend.broadcasts.events import trigger_immediate_broadcast

# Get logger
logger = logging.getLogger('homeserver')

def _is_external_mount(path: str) -> bool:
    """Check if path is on an external mount (not root filesystem)."""
    try:
        # Get mount info for the path
        result = subprocess.run(['/usr/bin/findmnt', '-n', '-o', 'SOURCE,TARGET', path],
                              capture_output=True, text=True, timeout=10)

        if result.returncode != 0:
            logger.warning(f"Could not determine mount for {path}: {result.stderr}")
            return False

        lines = [line for line in result.stdout.strip().split('\n') if line.strip()]
        if not lines:
            return False
        
        found_target = False
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                mount_source, mount_target = parts[0], parts[1]
                
                # Only evaluate entries that correspond to the requested path
                if mount_target != path:
                    continue
                
                found_target = True
                
                # Treat root filesystem as non-external
                if mount_target == '/':
                    logger.warning(f"Path {path} resolves to root filesystem mount: {mount_source} -> {mount_target}")
                    return False
                
                # Treat system partitions as non-external
                if is_system_partition(mount_source):
                    logger.warning(f"Path {path} is on system partition mount: {mount_source} -> {mount_target}")
                    return False
                
                # Found the mount and it passes safety checks
                logger.info(f"Path {path} verified on external mount: {mount_source}")
                return True
        
        if not found_target:
            logger.warning(f"Could not locate mount entry for path {path} in findmnt output: {lines}")
            return False
        
        return False

    except Exception as e:
        logger.error(f"Error checking mount for {path}: {e}")
        return False

@bp.route('/api/admin/diskman/nas-compatible', methods=['GET'])
@admin_required
def get_nas_compatible_devices():
    """
    Get information about NAS-compatible devices (XFS formatted and LUKS encrypted).
    
    Returns:
        JSON response with NAS-compatible devices
    """
    try:
        # Use the utility function to get disk information
        disk_info = utils.get_disk_info()
        
        # Extract NAS-compatible devices
        nas_compatible_devices = disk_info.get("nasCompatibleDevices", [])
        
        return utils.success_response(
            "Successfully retrieved NAS-compatible devices",
            {
                "devices": nas_compatible_devices,
                "count": len(nas_compatible_devices)
            }
        )
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error getting NAS-compatible devices: {str(e)}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/format', methods=['POST'])
@admin_required
def format_disk():
    """
    Format a disk with XFS filesystem.
    Will automatically close any active LUKS containers.
    
    Expected JSON payload:
    {
        "device": "sda"  # Device name to format
    }
    
    Returns:
        JSON response with status and details
    """
    try:
        current_app.logger.info("[DISKMAN] Starting format_disk operation")
        data = request.get_json()
        
        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")
            
        device = data.get('device')
        current_app.logger.info(f"[DISKMAN] Received format request for device: {device}")
        
        if not device:
            current_app.logger.error("[DISKMAN] Missing required parameter: device")
            return utils.error_response("Missing required parameter: device")
            
        # Ensure device name is properly formatted
        device_path, device_name = utils.format_device_path(device)
        current_app.logger.info(f"[DISKMAN] Formatted device path: {device_path}, device name: {device_name}")

        # Check if this is a system partition
        if is_system_partition(device_path):
            current_app.logger.error(f"[DISKMAN] Cannot format system partition: {device_path}")
            return error_response("System partition cannot be modified", 403)

        # Check if device exists
        if not os.path.exists(device_path):
            current_app.logger.error(f"[DISKMAN] Device {device_path} does not exist")
            return utils.error_response(f"Device {device_path} does not exist")
            
        # Check if device is mounted
        current_app.logger.info(f"[DISKMAN] Checking if {device_path} is mounted")
        if utils.check_mount_point_usage(device_path):
            current_app.logger.error(f"[DISKMAN] Device {device_path} is currently mounted")
            return utils.error_response(f"Device {device_path} is currently mounted. Please unmount first.")
            
        # Get disk info for LUKS checks
        current_app.logger.info("[DISKMAN] Getting disk info for LUKS checks")
        disk_info = utils.get_disk_info()
        encrypted_devices = disk_info.get("encryptionInfo", {}).get("encrypted_devices", [])
        current_app.logger.debug(f"[DISKMAN] Found encrypted devices: {[ed.get('device') for ed in encrypted_devices if ed.get('device')]}")
        
        # Track any active LUKS containers
        active_luks = []
        
        # First check if the device itself is encrypted
        device_encrypted = next((ed for ed in encrypted_devices if ed.get("device") == device_path), None)
        if device_encrypted and device_encrypted.get("is_open"):
            current_app.logger.info(f"[DISKMAN] Found active LUKS container on device {device_path} -> {device_encrypted.get('mapper_name')}")
            active_luks.append({
                'partition': device_path,
                'mapper': device_encrypted.get('mapper_name')
            })
        
        # Then check each partition of the device
        current_app.logger.info(f"[DISKMAN] Checking partitions of {device_name} for active LUKS containers")
        for partition in disk_info.get("blockDevices", {}).get("blockdevices", []):
            if partition.get("name") == device_name and partition.get("children"):
                current_app.logger.debug(f"[DISKMAN] Found partitions for {device_name}: {[child.get('name') for child in partition.get('children', [])]}")
                for child in partition.get("children", []):
                    child_path = f"/dev/{child.get('name')}"
                    current_app.logger.debug(f"[DISKMAN] Checking partition: {child_path}")
                    # Check if this partition is encrypted and open
                    encrypted_device = next((ed for ed in encrypted_devices if ed.get("device") == child_path), None)
                    if encrypted_device and encrypted_device.get("is_open"):
                        current_app.logger.info(f"[DISKMAN] Found active LUKS container on {child_path} -> {encrypted_device.get('mapper_name')}")
                        active_luks.append({
                            'partition': child_path,
                            'mapper': encrypted_device.get('mapper_name')
                        })
        
        # If we have active LUKS containers, close them
        if active_luks:
            current_app.logger.info(f"[DISKMAN] Found {len(active_luks)} active LUKS container(s) on {device_path}")
            current_app.logger.debug(f"[DISKMAN] Active LUKS containers: {active_luks}")
            
            # Try to close each LUKS container
            for container in active_luks:
                mapper = container.get('mapper')
                partition = container.get('partition')
                if mapper:
                    current_app.logger.info(f"[DISKMAN] Attempting to close LUKS container: {mapper} (partition: {partition})")
                    success, error_message = utils.close_luks_device(mapper, partition)
                    if not success:
                        error_msg = f"Failed to close LUKS container {mapper}. Cannot proceed with format. Error: {error_message}"
                        current_app.logger.error(f"[DISKMAN] {error_msg}")
                        return utils.error_response(error_msg, details={'failed_mapper': mapper})
                    current_app.logger.info(f"[DISKMAN] Successfully closed LUKS container: {mapper}")
            
            current_app.logger.info(f"[DISKMAN] Successfully closed all {len(active_luks)} LUKS container(s) for {device_path}")
        else:
            current_app.logger.info(f"[DISKMAN] No active LUKS containers found on {device_path}")
        
        # Wipe the device
        current_app.logger.info(f"[DISKMAN] Wiping device {device_path}")
        success, error_message = utils.wipe_device(device_path)
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to wipe device: {error_message}")
            return utils.error_response(error_message, 500)
        current_app.logger.info(f"[DISKMAN] Successfully wiped device {device_path}")

        # Whole-disk format: create GPT with one partition so Assign (PARTLABEL) can be used later
        format_target = device_path
        is_whole_disk = (
            re.match(r"^sd[a-z]+$", device_name) is not None or
            re.match(r"^nvme\d+n\d+$", device_name) is not None
        )
        if is_whole_disk:
            current_app.logger.info(f"[DISKMAN] Whole-disk target: creating GPT with one partition")
            success, error_message = utils.create_gpt_one_partition(device_path)
            if not success:
                current_app.logger.error(f"[DISKMAN] Failed to create GPT/partition: {error_message}")
                return utils.error_response(error_message, 500)
            part_suffix = "p1" if "nvme" in device_name else "1"
            format_target = f"/dev/{device_name}{part_suffix}"
            for _ in range(10):
                if os.path.exists(format_target):
                    break
                time.sleep(0.5)
            if not os.path.exists(format_target):
                return utils.error_response("Partition did not appear after creating GPT; try again.", 500)

        # Format with XFS
        current_app.logger.info(f"[DISKMAN] Formatting device {format_target} with XFS")
        success, error_message = utils.format_xfs(format_target)
        
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to format device with XFS: {error_message}")
            write_to_log('admin', f'Failed to format device {device_name}: {error_message}', 'error')
            return utils.error_response(error_message, 500)
            
        result = {
            "device": format_target,
            "label": get_partlabel(format_target),
            "filesystem": "xfs",
            "closed_luks": [container.get('mapper') for container in active_luks] if active_luks else []
        }
        
        current_app.logger.info(f"[DISKMAN] Successfully formatted device {format_target} with XFS")
        write_to_log('admin', f'Device {device_name} formatted successfully', 'info')
        if active_luks:
            current_app.logger.info(f"[DISKMAN] Operation summary: Closed {len(active_luks)} LUKS container(s), wiped and formatted device")
        return utils.success_response(f"Device {device_path} formatted successfully", result)
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Unexpected error formatting disk: {str(e)}")
        import traceback
        current_app.logger.error(f"[DISKMAN] Traceback: {traceback.format_exc()}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/unlock', methods=['POST'])
@admin_required
def unlock_encrypted_partition():
    """
    Unlock an encrypted LUKS device or partition.
    
    Expected JSON payload:
    {
        "device": "sdb",           # Device name to unlock
        "manual_password": "..."    # Optional manual password if NAS key fails
    }
    
    Returns:
        JSON response with status and details including whether manual password is needed
    """
    try:
        current_app.logger.info("[DISKMAN] Starting unlock_encrypted_partition function")
        data = request.get_json()
        
        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")
            
        device = data.get('device')
        manual_password = data.get('manual_password')
        encrypted_password = data.get('encryptedPassword')
        
        current_app.logger.info(f"[DISKMAN] Received request to unlock device: {device}")
        
        if not device:
            current_app.logger.error("[DISKMAN] Missing required parameter: device")
            return utils.error_response("Missing required parameter: device")
        
        # If encrypted password is provided, daisy chain to the admin unlock-with-password route
        if encrypted_password:
            current_app.logger.info("[DISKMAN] Encrypted password provided, daisy chaining to admin unlock-with-password route")
            from backend.admin.routes import unlock_device_with_manual_password
            return unlock_device_with_manual_password()
        
        # Ensure device name is properly formatted
        device_path, device_name = utils.format_device_path(device)

        current_app.logger.info(f"[DISKMAN] Formatted device path: {device_path}")

        # Check if this is a system partition
        if is_system_partition(device_path):
            current_app.logger.error(f"[DISKMAN] Cannot unlock system partition: {device_path}")
            return error_response("System partition cannot be modified", 403)

        # Check if device exists
        if not os.path.exists(device_path):
            current_app.logger.error(f"[DISKMAN] Device {device_path} does not exist")
            return utils.error_response(f"Device {device_path} does not exist")
            
        # Check if the device is already open using disk information
        current_app.logger.info("[DISKMAN] Checking disk encryption status")
        disk_info = utils.get_disk_info()
        
        # Find the encrypted device in the encryption info
        encrypted_devices = disk_info.get("encryptionInfo", {}).get("encrypted_devices", [])
        encrypted_device = next((ed for ed in encrypted_devices if ed.get("device") == device_path), None)
        
        if not encrypted_device:
            current_app.logger.error(f"[DISKMAN] Device {device_path} is not an encrypted LUKS device")
            return utils.error_response(f"Device {device_path} is not an encrypted LUKS device")
            
        if encrypted_device.get("is_open", False):
            current_app.logger.error(f"[DISKMAN] Device {device_path} is already unlocked")
            return utils.error_response(f"Device {device_path} is already unlocked")
            
        # Generate a mapper name based on device path
        mapper_name = utils.generate_mapper_name(device_path)
        current_app.logger.info(f"[DISKMAN] Using mapper name: {mapper_name}")
        
        # Get LUKS key slot information to determine which slots have keys
        current_app.logger.info(f"[DISKMAN] Inspecting LUKS key slots for {device_path}")
        success, key_slots_info, error_message = utils.get_luks_key_slots(device_path)
        
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to get key slot information: {error_message}")
            return utils.error_response(f"Failed to inspect key slots: {error_message}", 500)
        
        slots_with_keys = key_slots_info.get('slots_with_keys', [])
        current_app.logger.info(f"[DISKMAN] Found {len(slots_with_keys)} slots with keys: {slots_with_keys}")
        
        if not slots_with_keys:
            current_app.logger.error(f"[DISKMAN] No key slots found for {device_path}")
            return utils.error_response("No key slots found on this LUKS device", 400)
        
        # Get the password to use
        if not manual_password:
            current_app.logger.info(f"[DISKMAN] Attempting unlock with NAS key for {device_path}")
            success, password, error_message = utils.export_nas_key()
            
            if not success:
                current_app.logger.error(f"[DISKMAN] Failed to export NAS key: {error_message}")
                # When NAS key export fails, indicate that manual password is needed
                return utils.error_response(
                    "Failed to export NAS key. Please provide manual password.",
                    needs_manual_password=True,
                    status_code=422
                )
            
            unlock_method = "nas_key"
        else:
            # Use provided manual password
            current_app.logger.info(f"[DISKMAN] Using provided manual password for {device_path}")
            password = manual_password
            unlock_method = "manual_password"
        
        # Try to unlock using only slots that have keys
        current_app.logger.info(f"[DISKMAN] Attempting smart unlock with password, trying {len(slots_with_keys)} slots: {slots_with_keys}")
        success, used_slot, error_message = utils.unlock_luks_device_smart(device_path, mapper_name, password, slots_with_keys)
        
        if not success:
            current_app.logger.error(f"[DISKMAN] Smart unlock failed: {error_message}")
            return utils.error_response(
                "Failed to unlock device with available key slots. Please try again.",
                needs_manual_password=True,
                status_code=422
            )
        
        current_app.logger.info(f"[DISKMAN] Successfully unlocked with {unlock_method} using key slot {used_slot}")
            
        # Create the success response
        mapper_path = f"/dev/mapper/{mapper_name}"
        result = {
            "device": device_path,
            "label": get_partlabel(device_path),
            "mapper": mapper_path,
            "is_open": True,
            "unlocked_with": unlock_method,
            "used_key_slot": used_slot,
            "key_slots": {
                "slots_with_keys": slots_with_keys,
                "key_count": len(slots_with_keys),
                "total_possible_slots": key_slots_info.get('total_possible_slots', 8)
            }
        }
        
        current_app.logger.info(f"[DISKMAN] Successfully unlocked device {device_path}")
        return utils.success_response(f"Device {device_path} unlocked successfully", result)
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error unlocking encrypted device: {str(e)}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/encrypt', methods=['POST'])
@admin_required
def encrypt_disk():
    """
    Encrypt a device with LUKS using the NAS key.
    
    Expected JSON payload:
    {
        "device": "sdX1" or "/dev/sdX1"  # Device to encrypt (with or without /dev/ prefix)
    }
    
    Returns:
        JSON response with status and details of the encrypted device
    """
    try:
        current_app.logger.info("[DISKMAN] Starting encrypt_disk operation")
        data = request.get_json()
        
        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")
            
        device = data.get('device')
        current_app.logger.info(f"[DISKMAN] Received request to encrypt device: {device}")
        
        if not device:
            current_app.logger.error("[DISKMAN] Missing required parameter: device")
            return utils.error_response("Missing required parameter: device")
            
        # Ensure device name is properly formatted
        device_path, device_name = utils.format_device_path(device)
        current_app.logger.info(f"[DISKMAN] Formatted device path: {device_path}")

        # Check if this is a system partition
        if is_system_partition(device_path):
            current_app.logger.error(f"[DISKMAN] Cannot encrypt system partition: {device_path}")
            return error_response("System partition cannot be modified", 403)

        # Check if device exists (use resolved path, not raw request value)
        if not os.path.exists(device_path):
            current_app.logger.error(f"[DISKMAN] Device {device_path} does not exist")
            return utils.error_response(f"Device {device} does not exist")
            
        # Get disk information to check encryption status
        disk_info = utils.get_disk_info()
        encrypted_devices = disk_info.get("encryptionInfo", {}).get("encrypted_devices", [])
        
        # Track any active LUKS containers
        active_luks = []
        
        # First check if the device itself is encrypted (compare using resolved path)
        device_encrypted = next((ed for ed in encrypted_devices if ed.get("device") == device_path), None)
        if device_encrypted and device_encrypted.get("is_open"):
            current_app.logger.info(f"[DISKMAN] Found active LUKS container on device {device_path} -> {device_encrypted.get('mapper_name')}")
            active_luks.append({
                'partition': device_path,
                'mapper': device_encrypted.get('mapper_name')
            })
        
        # Then check if any partitions are encrypted
        device_name = os.path.basename(device_path)
        for partition in disk_info.get("blockDevices", {}).get("blockdevices", []):
            if partition.get("name") == device_name and partition.get("children"):
                current_app.logger.debug(f"[DISKMAN] Found partitions for {device_name}: {[child.get('name') for child in partition.get('children', [])]}")
                for child in partition.get("children", []):
                    child_path = f"/dev/{child.get('name')}"
                    current_app.logger.debug(f"[DISKMAN] Checking partition: {child_path}")
                    # Check if this partition is encrypted and open
                    encrypted_device = next((ed for ed in encrypted_devices if ed.get("device") == child_path), None)
                    if encrypted_device and encrypted_device.get("is_open"):
                        current_app.logger.info(f"[DISKMAN] Found active LUKS container on {child_path} -> {encrypted_device.get('mapper_name')}")
                        active_luks.append({
                            'partition': child_path,
                            'mapper': encrypted_device.get('mapper_name')
                        })
        
        # If we have active LUKS containers, close them
        if active_luks:
            current_app.logger.info(f"[DISKMAN] Found {len(active_luks)} active LUKS container(s) on {device}")
            current_app.logger.debug(f"[DISKMAN] Active LUKS containers: {active_luks}")
            
            # Try to close each LUKS container
            for container in active_luks:
                mapper = container.get('mapper')
                partition = container.get('partition')
                if mapper:
                    current_app.logger.info(f"[DISKMAN] Attempting to close LUKS container: {mapper} (partition: {partition})")
                    success, error_message = utils.close_luks_device(mapper, partition)
                    if not success:
                        error_msg = f"Failed to close LUKS container {mapper}. Cannot proceed with encryption. Error: {error_message}"
                        current_app.logger.error(f"[DISKMAN] {error_msg}")
                        return utils.error_response(error_msg, details={'failed_mapper': mapper})
                    current_app.logger.info(f"[DISKMAN] Successfully closed LUKS container: {mapper}")
            
            current_app.logger.info(f"[DISKMAN] Successfully closed all {len(active_luks)} LUKS container(s) for {device}")
            
        # Check if device is mounted
        if utils.check_mount_point_usage(device_path):
            current_app.logger.error(f"[DISKMAN] Device {device_path} is currently mounted")
            return utils.error_response(f"Device {device_path} is currently mounted. Please unmount first.")

        # Wipe the partition
        current_app.logger.info(f"[DISKMAN] Wiping device {device_path}")
        success, error_message = utils.wipe_device(device_path)
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to wipe device: {error_message}")
            return utils.error_response(error_message, 500)
            
        # Get the NAS key password
        current_app.logger.info(f"[DISKMAN] Exporting NAS key for encrypting {device_path}")
        success, passphrase, error_message = utils.export_nas_key()

        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to export NAS key: {error_message}")
            return utils.error_response(error_message, 500)

        # Encrypt with LUKS
        current_app.logger.info(f"[DISKMAN] Encrypting device {device_path} with LUKS")
        success, error_message = utils.encrypt_luks_device(device_path, passphrase)
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to encrypt device with LUKS: {error_message}")
            return utils.error_response(error_message, 500)
            
        # Generate a mapper name based on device path
        mapper_name = utils.generate_mapper_name(device_path)
        current_app.logger.info(f"[DISKMAN] Generated mapper name: {mapper_name}")
        
        # Open the LUKS container
        current_app.logger.info(f"[DISKMAN] Opening LUKS container with mapper: {mapper_name}")
        success, error_message = utils.open_luks_device(device_path, mapper_name, passphrase)
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to open LUKS container: {error_message}")
            return utils.error_response(error_message, 500)
            
        # Format with XFS
        mapper_path = f"/dev/mapper/{mapper_name}"
        current_app.logger.info(f"[DISKMAN] Formatting {mapper_path} with XFS")
        success, error_message = utils.format_xfs(mapper_path)
        
        if not success:
            # Close the LUKS container if formatting fails
            current_app.logger.error(f"[DISKMAN] Failed to format with XFS: {error_message}")
            utils.close_luks_device(mapper_name)
            return utils.error_response(error_message, 500)
            
        # Leave the LUKS container open for convenience
        current_app.logger.info(f"[DISKMAN] Leaving LUKS container {mapper_name} open for mounting")
        write_to_log('admin', f'Device {device_name} encrypted successfully', 'info')

        result = {
            "device": device_path,
            "label": get_partlabel(device_path),
            "mapper": mapper_path,
            "filesystem": "xfs",
            "is_open": True
        }

        current_app.logger.info(f"[DISKMAN] Successfully encrypted device {device_path}")
        return utils.success_response(f"Device {device_path} encrypted successfully", result)
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error encrypting disk: {str(e)}")
        import traceback
        current_app.logger.error(f"[DISKMAN] Traceback: {traceback.format_exc()}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/mount', methods=['POST'])
@admin_required
def mount_device():
    """
    Mount a device to a specified mount point using the mountDrive.sh script.
    
    Expected JSON payload:
    {
        "device": "sdb",           # Device name
        "mountpoint": "/mnt/nas",  # Mount point path
        "mapper": "encrypted_sdb1" # Optional mapper name for encrypted devices
    }
    
    Returns:
        JSON response with status and details
    """
    try:
        data = request.get_json()
        
        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")
            
        device = data.get('device')
        mountpoint = data.get('mountpoint')
        mapper = data.get('mapper')
        start_services = data.get('start_services', False)  # Optional parameter to auto-start services
        
        current_app.logger.info(f"[DISKMAN] Received request to mount device: {device}, mountpoint: {mountpoint}, mapper: {mapper}")
        
        if not device or not mountpoint:
            current_app.logger.error("[DISKMAN] Missing required parameters: device and mountpoint")
            return utils.error_response("Missing required parameters: device and mountpoint")
        
        # Ensure device name is properly formatted
        device_path, device_name = utils.format_device_path(device)

        # Check if this is a system partition
        if is_system_partition(device_path):
            current_app.logger.error(f"[DISKMAN] Cannot mount system partition: {device_path}")
            return error_response("System partition cannot be modified", 403)

        # Check if the mount point exists
        success, error_message = utils.ensure_mount_point_exists(mountpoint)
        if not success:
            return utils.error_response(f"Failed to create mount point directory: {error_message}", 500)
            
        # Get disk information to check device status
        disk_info = utils.get_disk_info()
        
        # Find the device in the block devices
        block_devices = disk_info.get("blockDevices", {}).get("blockdevices", [])
        target_device, is_partition, partition_device = utils.find_target_device_in_block_devices(device_name, block_devices)
        
        if not target_device:
            current_app.logger.error(f"[DISKMAN] Device {device_name} not found")
            return utils.error_response(f"Device {device_name} not found", 404)
            
        # Check if the device is already mounted
        if target_device.get("mountpoints") and any(mp for mp in target_device.get("mountpoints", []) if mp):
            current_app.logger.error(f"[DISKMAN] Device {device_name} is already mounted")
            return utils.error_response(f"Device {device_name} is already mounted")
            
        # Check if any partition is already mounted
        if target_device.get("children"):
            for partition in target_device.get("children", []):
                if partition.get("mountpoints") and any(mp for mp in partition.get("mountpoints", []) if mp):
                    current_app.logger.error(f"[DISKMAN] Partition {partition.get('name')} of device {device_name} is already mounted")
                    return utils.error_response(f"Partition {partition.get('name')} of device {device_name} is already mounted")
                    
        # Check if the mount point is already in use
        if utils.check_mount_point_usage(mountpoint):
            current_app.logger.error(f"[DISKMAN] Mount point {mountpoint} is already in use")
            return utils.error_response(f"Mount point {mountpoint} is already in use")
            
        # Determine what to mount
        if mapper:
            mount_device = f"/dev/mapper/{mapper}"
            current_app.logger.info(f"[DISKMAN] Using provided mapper for mount: {mount_device}")
        else:
            mount_device = device_path
            # If this is a partition we found, use it directly
            if is_partition:
                mount_device = f"/dev/{device_name}"
                current_app.logger.info(f"[DISKMAN] Using partition {mount_device} as specified")
            # If the device has partitions and no partition was explicitly requested, use the first partition
            elif target_device.get("children"):
                partition = target_device.get("children")[0]
                partition_name = partition.get('name')
                if partition_name.startswith('encrypted_'):
                    mount_device = f"/dev/mapper/{partition_name}"
                else:
                    mount_device = f"/dev/{partition_name}"
                current_app.logger.info(f"[DISKMAN] Using first partition {mount_device} for mounting")
        
        # Log whether we're using an encrypted drive with mapper
        if mapper:
            current_app.logger.info(f"[DISKMAN] Using encrypted drive with mapper: {mapper}")
            
            # Verify the mapper exists
            if not utils.verify_mapper_exists(mapper):
                current_app.logger.error(f"[DISKMAN] Mapper device /dev/mapper/{mapper} does not exist")
                return utils.error_response(f"Mapper device /dev/mapper/{mapper} does not exist")
                
            # If we have a mapper, check the device's encryption status
            encryption_info = disk_info.get("encryptionInfo", {})
            encrypted_devices = encryption_info.get("encrypted_devices", [])
            
            # Log available encrypted devices for debugging
            current_app.logger.info(f"[DISKMAN] Available encrypted devices: {[ed.get('device') for ed in encrypted_devices if ed.get('device')]}")
            
            # Check if any partition of this device is encrypted and has this mapper
            is_encrypted_with_mapper = False
            for partition in target_device.get("children", []):
                partition_path = f"/dev/{partition.get('name')}"
                ed = next((ed for ed in encrypted_devices if ed.get("device") == partition_path), None)
                if ed and ed.get("is_open") and ed.get("mapper_name") == mapper:
                    is_encrypted_with_mapper = True
                    current_app.logger.info(f"[DISKMAN] Confirmed partition {partition_path} is encrypted with mapper {mapper}")
                    break
                    
            if not is_encrypted_with_mapper:
                current_app.logger.warning(f"[DISKMAN] Cannot confirm that {mount_device} is encrypted with mapper {mapper}. Proceeding anyway.")
        
        # Execute the mountDrive.sh script
        success, all_output, error_message = utils.execute_mount_script(mount_device, mountpoint, mapper, "mount")
            
        if success:
            # Verify the mount
            if not utils.verify_mount(mountpoint):
                current_app.logger.error(f"[DISKMAN] Mount verification failed for {mountpoint}")
                write_to_log('admin', f'Failed to mount device {device_name}: Mount verification failed', 'error')
                return utils.error_response(f"Mount verification failed for {mountpoint}", 500)
                
            # Get filesystem type of the mounted device
            filesystem_type = utils.get_filesystem_type(mountpoint)
            
            response_data = {
                "device": device_path,
                "label": get_partlabel(device_path),
                "mount_device": mount_device,
                "mount_point": mountpoint,
                "filesystem": filesystem_type,
                "log": all_output
            }
            
            # Check if this is the NAS mount point (/mnt/nas) and handle services
            if mountpoint == "/mnt/nas":
                current_app.logger.info("[DISKMAN] NAS drive mounted - checking for services that need to be started")
                
                # Check for stopped services
                has_stopped, stopped_services = check_services_stopped(enabled_only=True)
                response_data["hasStoppedServices"] = has_stopped
                response_data["stoppedServices"] = stopped_services
                
                # If auto-start is requested and there are stopped services, start them
                if start_services and has_stopped:
                    current_app.logger.info("[DISKMAN] Auto-starting services after NAS mount")
                    
                    # Start all enabled services
                    service_results = start_all_enabled_services()
                    response_data["serviceStartResults"] = service_results
                    
                    # Add a note about script-managed services
                    script_managed_count = service_results['metadata']['scriptManagedCount']
                    if script_managed_count > 0:
                        response_data["scriptManagedServicesNote"] = "Some script-managed services require a reboot to start properly."
            
            write_to_log('admin', f'Device {device_name} mounted successfully at {mountpoint}', 'info')
            return utils.success_response(
                f"Device {device_path} mounted successfully to {mountpoint}",
                response_data
            )
        else:
            return utils.error_response(
                f"Failed to mount device: {error_message}",
                500,
                {
                    "device": device_name,
                    "mount_point": mountpoint,
                    "log": all_output
                }
            )
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error mounting device: {str(e)}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/unmount', methods=['POST'])
@admin_required
def unmount_device():
    """
    Unmount a device and close its LUKS container if encrypted using the unmountDrive.sh script.
    
    Expected JSON payload:
    {
        "device": "sdb",            # Device name
        "mapper": "encrypted_sdb1", # Optional mapper name for encrypted devices
        "mount_point": "/mnt/path", # Mount point to unmount
        "stop_services": false      # Optional parameter to auto-stop services (for /mnt/nas)
    }
    
    Returns:
        JSON response with status and details
    """
    try:
        current_app.logger.info("[DISKMAN] Starting unmount operation")
        data = request.get_json()
        
        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")
            
        device = data.get('device')
        mapper = data.get('mapper')
        mount_point = data.get('mount_point')
        stop_services = data.get('stop_services', False)  # Optional parameter to auto-stop services
        
        current_app.logger.info(f"[DISKMAN] Unmounting device: {device}, mapper: {mapper}, mount_point: {mount_point}")
        
        if not device:
            current_app.logger.error("[DISKMAN] Missing required parameter: device")
            return utils.error_response("Missing required parameter: device")
            
        if not mount_point:
            current_app.logger.error("[DISKMAN] Missing required parameter: mount_point")
            return utils.error_response("Missing required parameter: mount_point")
        
        # Will be updated with device_path and label after formatting
        response_data = {
            "mount_point": mount_point
        }
        
        # Check if this is the NAS mount point (/mnt/nas) and handle services
        if mount_point == "/mnt/nas":
            current_app.logger.info("[DISKMAN] NAS drive unmount requested - checking for running services")
            
            # Check for running services
            has_running, running_services = check_services_running(enabled_only=False)
            response_data["hasRunningServices"] = has_running
            response_data["runningServices"] = running_services
            
            # If auto-stop is requested and there are running services, stop them
            if stop_services and has_running:
                current_app.logger.info("[DISKMAN] Stopping services before NAS unmount")
                
                # Stop all services regardless of enabled status
                service_results = stop_all_services(enabled_only=False)
                response_data["serviceStopResults"] = service_results
                
                # Add a note about script-managed services
                script_managed_count = service_results['metadata']['scriptManagedCount']
                if script_managed_count > 0:
                    response_data["scriptManagedServicesNote"] = "Some script-managed services may require a system reboot for complete cleanup."
            elif has_running and not stop_services:
                # If there are running services but we're not auto-stopping, return an error
                current_app.logger.warning("[DISKMAN] Cannot unmount NAS drive with running services unless stop_services=true")
                return utils.error_response(
                    "Cannot unmount NAS drive with running services. Set stop_services=true to automatically stop them.",
                    400,
                    {
                        "device": device,
                        "mount_point": mount_point,
                        "runningServices": running_services
                    }
                )
            
        # Ensure device name is properly formatted
        device_path, device_name = utils.format_device_path(device)

        # Check if this is a system partition
        if is_system_partition(device_path):
            current_app.logger.error(f"[DISKMAN] Cannot unmount system partition: {device_path}")
            return error_response("System partition cannot be modified", 403)

        # Update response data with device info
        response_data["device"] = device_path
        response_data["label"] = get_partlabel(device_path)

        # Execute unmountDrive.sh script
        cmd = ["/usr/bin/sudo", "/vault/scripts/unmountDrive.sh", device_path, mount_point]
        if mapper:
            cmd.append(mapper)
            
        current_app.logger.info(f"[DISKMAN] Executing command: {' '.join(cmd)}")
        success, stdout, stderr = utils.execute_command(cmd)
        
        # Add command output to response data
        response_data["log"] = stdout.splitlines() if stdout else []
        if stderr:
            response_data["log"].extend(stderr.splitlines())
            
        # Verify the unmount
        mount_still_exists = utils.verify_mount(mount_point)
        
        # Check if mapper still exists (for encrypted devices)
        mapper_exists = False
        if mapper:
            mapper_exists = utils.verify_mapper_exists(mapper)
        
        response_data["mount_point_still_mounted"] = mount_still_exists
        if mapper:
            response_data["mapper_still_exists"] = mapper_exists
            
        if success and not mount_still_exists and (not mapper or not mapper_exists):
            # Success if the script returned 0, the mount point is no longer mounted,
            # and the mapper no longer exists (if applicable)
            current_app.logger.info(f"[DISKMAN] Unmount successful - mount point {mount_point} is no longer mounted")
            write_to_log('admin', f'Device {device_name} unmounted successfully from {mount_point}', 'info')
            return utils.success_response(
                f"Device {device_path} unmounted successfully",
                response_data
            )
        else:
            error_msg = stderr if stderr else "Unknown error occurred"
            current_app.logger.error(f"[DISKMAN] Unmount operation failed: {error_msg}")
            return utils.error_response(
                f"Failed to unmount device: {error_msg}",
                500,
                response_data
            )
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Exception occurred: {str(e)}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/apply-permissions', methods=['POST'])
@admin_required
def apply_permissions():
    """
    Apply permissions to NAS directories based on configuration.
    
    Expected JSON payload (optional):
    {
        "applications": ["Jellyfin", "Transmission"]  # Optional list to limit which applications to process
    }
    
    Returns:
        JSON response with status and details of operations performed
    """
    try:
        current_app.logger.info("[DISKMAN] Applying NAS permissions via setupNAS.sh (single source of truth)")
        data = request.get_json() or {}

        # Optional application filter
        requested_apps = data.get('applications', [])
        if requested_apps and not isinstance(requested_apps, list):
            return error_response("'applications' must be an array of application names")

        # Build command
        cmd = ["/usr/bin/sudo", "/usr/local/sbin/setupNAS.sh"]
        if requested_apps:
            # Only include string app names
            app_args = [str(a) for a in requested_apps if isinstance(a, str) and a]
            cmd.extend(app_args)

        current_app.logger.info(f"[DISKMAN] Executing: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)

        # Collate logs from stdout and stderr
        all_lines = []
        if result.stdout:
            all_lines.extend([l for l in result.stdout.splitlines() if l.strip()])
        if result.stderr:
            all_lines.extend([l for l in result.stderr.splitlines() if l.strip()])

        details = {"log": all_lines}

        if result.returncode == 0:
            write_to_log('admin', 'Permissions applied successfully to NAS directories (setupNAS.sh)', 'info')
            return success_response("Permissions applied successfully", details)
        else:
            current_app.logger.error(f"[DISKMAN] setupNAS.sh failed with code {result.returncode}")
            write_to_log('admin', 'Failed to apply some permissions to NAS directories (setupNAS.sh)', 'error')
            return error_response("Failed to apply permissions via setupNAS.sh", status_code=500, details=details)

    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error applying permissions via setupNAS.sh: {str(e)}")
        return error_response(str(e), 500)

@bp.route('/api/admin/diskman/check-services', methods=['GET'])
@admin_required
def check_services_status():
    """
    Check the status of services for mount/unmount operations.
    Specifically checks for any running services when unmounting NAS
    or any stopped services when mounting NAS.
    
    Query parameters:
    - action: 'mount' or 'unmount' - determines which check to perform
    
    Returns:
        JSON response with services status information
    """
    try:
        action = request.args.get('action')
        
        if not action or action not in ['mount', 'unmount']:
            return error_response("Missing or invalid 'action' parameter. Must be 'mount' or 'unmount'.")
        
        current_app.logger.info(f"[DISKMAN] Checking services status for {action} operation")
        
        if action == 'unmount':
            # For unmounting, check for running services
            has_running, running_services = check_services_running(enabled_only=False)
            
            return success_response(
                "Service status check completed",
                {
                    "hasRunningServices": has_running,
                    "runningServices": running_services,
                    "action": action
                }
            )
        else:  # action == 'mount'
            # For mounting, check for stopped services
            has_stopped, stopped_services = check_services_stopped(enabled_only=True)  # Keep only enabled services for starting
            
            return success_response(
                "Service status check completed",
                {
                    "hasStoppedServices": has_stopped,
                    "stoppedServices": stopped_services,
                    "action": action
                }
            )
            
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error checking services status: {str(e)}")
        return error_response(str(e), 500)

@bp.route('/api/admin/diskman/manage-services', methods=['POST'])
@admin_required
def manage_services():
    """
    Start or stop services based on the action requested.
    
    Expected JSON payload:
    {
        "action": "start" or "stop",
        "services": ["service1", "service2"] # Optional list to specify services to manage
                                            # If not provided, all enabled services will be managed
    }
    
    Returns:
        JSON response with status and details of operations performed
    """
    try:
        data = request.get_json()
        
        if not data:
            return error_response("No JSON data provided")
            
        action = data.get('action')
        
        if not action or action not in ['start', 'stop']:
            return error_response("Missing or invalid 'action' parameter. Must be 'start' or 'stop'.")
        
        current_app.logger.info(f"[DISKMAN] Managing services: {action}")
        
        # Get specific services if provided
        specified_services = data.get('services', [])
        
        # Handle service management based on action
        if action == 'start':
            if specified_services:
                # Start only specified services
                service_results = []
                script_managed_count = 0
                
                for service_name in specified_services:
                    # Get service status to check if it's script-managed
                    service_status = get_service_status(service_name)
                    
                    if service_status.get('isScriptManaged', False):
                        script_managed_count += 1
                        service_results.append({
                            'name': service_name,
                            'success': False,
                            'message': "Script-managed service requires a system reboot to start properly",
                            'isScriptManaged': True,
                            'needsReboot': True
                        })
                    else:
                        success, message = start_service(service_name)
                        service_results.append({
                            'name': service_name,
                            'success': success,
                            'message': message,
                            'isScriptManaged': False
                        })
                
                # Create metadata
                metadata = {
                    'scriptManagedCount': script_managed_count,
                    'standardServicesCount': len(specified_services) - script_managed_count,
                    'totalCount': len(specified_services),
                    'rebootRequiredForScriptServices': script_managed_count > 0,
                    'rebootNote': "Some services are script-managed and will require a system reboot to start properly" if script_managed_count > 0 else ""
                }
                
                results = {
                    'results': service_results,
                    'metadata': metadata
                }
            else:
                # Start all enabled services
                results = start_all_enabled_services()
                
            return success_response(
                "Service start operation completed", 
                {
                    "action": action,
                    "serviceResults": results
                }
            )
            
        else:  # action == 'stop'
            if specified_services:
                # Stop only specified services
                service_results = []
                script_managed_count = 0
                
                for service_name in specified_services:
                    # Get service status to check if it's script-managed
                    service_status = get_service_status(service_name)
                    is_script_managed = service_status.get('isScriptManaged', False)
                    
                    if is_script_managed:
                        script_managed_count += 1
                        
                    # All services use systemctl stop
                    success, message = stop_service(service_name)
                    service_results.append({
                        'name': service_name,
                        'success': success,
                        'message': message,
                        'isScriptManaged': is_script_managed,
                        'needsReboot': is_script_managed
                    })
                
                # Create metadata
                metadata = {
                    'scriptManagedCount': script_managed_count,
                    'standardServicesCount': len(specified_services) - script_managed_count,
                    'totalCount': len(specified_services),
                    'rebootRecommended': script_managed_count > 0,
                    'rebootNote': "Some script-managed services may require a system reboot for complete cleanup" if script_managed_count > 0 else ""
                }
                
                results = {
                    'results': service_results,
                    'metadata': metadata
                }
            else:
                # Stop all services (regardless of enabled status)
                results = stop_all_services()
                
            return success_response(
                "Service stop operation completed", 
                {
                    "action": action,
                    "serviceResults": results
                }
            )
            
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error managing services: {str(e)}")
        return error_response(str(e), 500)

@bp.route('/api/admin/diskman/sync', methods=['POST'])
@admin_required
def sync_nas_to_backup():
    """
    Start a background NAS-to-backup sync job using SyncMonitor.
    """
    try:
        current_app.logger.info("[SYNC] Starting sync_nas_to_backup operation")
        data = request.get_json()
        current_app.logger.debug(f"[SYNC] Received data: {data}")
        # Validate request data
        if not data:
            current_app.logger.error("[SYNC] No data provided in request")
            return jsonify({"status": "error", "message": "No data provided"}), 400
        source = data.get('source')
        destination = data.get('destination')
        current_app.logger.info(f"[SYNC] Requested sync from {source} to {destination}")
        if not source or not destination:
            current_app.logger.error("[SYNC] Source or destination missing in request")
            return jsonify({"status": "error", "message": "Source and destination must be provided"}), 400
        # Validate that source and destination are the expected paths
        if source != '/mnt/nas':
            current_app.logger.error(f"[SYNC] Invalid source path: {source}")
            return jsonify({"status": "error", "message": "Source must be /mnt/nas"}), 400
        if destination != '/mnt/nas_backup':
            current_app.logger.error(f"[SYNC] Invalid destination path: {destination}")
            return jsonify({"status": "error", "message": "Destination must be /mnt/nas_backup"}), 400
        # Check if source and destination exist and are mount points
        if not os.path.exists(source) or not os.path.ismount(source):
            return jsonify({"status": "error", "message": "NAS drive is not mounted"}), 400
        if not os.path.exists(destination) or not os.path.ismount(destination):
            return jsonify({"status": "error", "message": "NAS Backup drive is not mounted"}), 400

        # CRITICAL SAFETY CHECK: Ensure nas_backup is on external mount, not root filesystem
        if not _is_external_mount('/mnt/nas_backup'):
            return jsonify({
                "status": "error",
                "message": "CRITICAL SAFETY VIOLATION: /mnt/nas_backup must be on an external drive, not the root filesystem. Refusing to start sync job."
            }), 400
        # Start the sync job using SyncMonitor
        monitor = SyncMonitor()
        result = monitor.start_sync(source, destination)
        return jsonify(result)
    except Exception as e:
        import traceback
        current_app.logger.error(f"[SYNC] Exception during sync operation: {str(e)}")
        current_app.logger.error(f"[SYNC] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Error during sync operation: {str(e)}"
        }), 500

@bp.route('/api/admin/diskman/sync-schedule', methods=['GET'])
@admin_required
def get_sync_schedule():
    """Get the current NAS to NAS Backup sync schedule."""
    logger.info("[SYNC] Getting NAS sync schedule")
    
    try:
        # Read crontab for root (since we need root privileges for rsync)
        crontab_entries = utils.read_crontab(user='root')
        
        # Define pattern for our sync entry (matches both old rsync commands and new safe-nas-sync.sh)
        pattern = re.compile(r'^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+.*(?:rsync.*\/mnt\/nas\/.*\/mnt\/nas_backup\/|safe-nas-sync\.sh)')
        
        # Look for our sync entry
        schedule = None
        crontab_entry = None
        
        for entry in crontab_entries:
            match = pattern.match(entry)
            if match:
                minute, hour, day_of_month, month, day_of_week = match.groups()
                
                # Determine frequency type
                if day_of_month == '*' and month == '*' and day_of_week == '*':
                    # Daily
                    schedule = {
                        'enabled': True,
                        'frequency': 'daily',
                        'hour': int(hour),
                        'minute': int(minute)
                    }
                elif day_of_month == '*' and month == '*' and day_of_week != '*':
                    # Weekly
                    schedule = {
                        'enabled': True,
                        'frequency': 'weekly',
                        'day': int(day_of_week),
                        'hour': int(hour),
                        'minute': int(minute)
                    }
                
                crontab_entry = entry
                break
        
        return jsonify({
            'status': 'success',
            'message': 'NAS sync schedule retrieved successfully',
            'details': {
                'schedule': schedule,
                'crontabEntry': crontab_entry
            }
        })
    
    except Exception as e:
        logger.error(f"[SYNC] Error getting NAS sync schedule: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to get NAS sync schedule: {str(e)}'
        }), 500

@bp.route('/api/admin/diskman/sync-schedule-update', methods=['POST'])
@admin_required
def update_sync_schedule():
    """Set or update the NAS to NAS Backup sync schedule."""
    logger.info("[SYNC] Updating NAS sync schedule")
    
    try:
        # Get the schedule from the request
        data = request.get_json()
        if not data or 'schedule' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Schedule configuration is required'
            }), 400
        
        schedule = data['schedule']
        
        # Validate schedule
        if not isinstance(schedule, dict) or 'enabled' not in schedule:
            return jsonify({
                'status': 'error',
                'message': 'Invalid schedule format'
            }), 400
        
        # Read current crontab
        crontab_entries = utils.read_crontab(user='root')
        
        # Define pattern for our sync entry to find and remove existing entry (matches both old rsync and new safe-nas-sync.sh)
        pattern = re.compile(r'.*(rsync.*\/mnt\/nas\/.*\/mnt\/nas_backup\/|safe-nas-sync\.sh)')
        new_entries = [entry for entry in crontab_entries if not pattern.match(entry)]
        
        # Create new entry if enabled
        crontab_entry = None
        if schedule['enabled']:
            if 'frequency' not in schedule or 'hour' not in schedule or 'minute' not in schedule:
                return jsonify({
                    'status': 'error',
                    'message': 'Schedule must include frequency, hour, and minute'
                }), 400
            
            # Validate time values
            if not 0 <= int(schedule['hour']) <= 23 or not 0 <= int(schedule['minute']) <= 59:
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid time values: hour must be 0-23, minute must be 0-59'
                }), 400

            # CRITICAL SAFETY CHECK: Ensure nas_backup is on external mount, not root filesystem
            if not _is_external_mount('/mnt/nas_backup'):
                return jsonify({
                    'status': 'error',
                    'message': 'CRITICAL SAFETY VIOLATION: /mnt/nas_backup must be on an external drive, not the root filesystem. Refusing to create sync job.'
                }), 400

            # Build crontab entry
            minute = schedule['minute']
            hour = schedule['hour']
            
            if schedule['frequency'] == 'daily':
                day_of_month = '*'
                month = '*'
                day_of_week = '*'
            elif schedule['frequency'] == 'weekly':
                if 'day' not in schedule or not 0 <= int(schedule['day']) <= 6:
                    return jsonify({
                        'status': 'error',
                        'message': 'Weekly schedule must include valid day (0-6)'
                    }), 400
                
                day_of_month = '*'
                month = '*'
                day_of_week = schedule['day']
            else:
                return jsonify({
                    'status': 'error',
                    'message': f'Unsupported frequency: {schedule["frequency"]}'
                }), 400
            
            # Command to run (safe wrapper script that validates mounts before rsync)
            command = '/usr/local/sbin/safe-nas-sync.sh'
            
            # Create entry
            crontab_entry = f"{minute} {hour} {day_of_month} {month} {day_of_week} {command}"
            new_entries.append(crontab_entry)
        
        # Write updated crontab
        utils.write_crontab(new_entries, user='root')
        
        message = 'Automatic sync schedule updated successfully'
        if not schedule['enabled']:
            message = 'Automatic sync has been disabled'
            write_to_log('admin', 'NAS automatic sync schedule disabled', 'info')
        else:
            freq = schedule['frequency']
            write_to_log('admin', f'NAS automatic sync schedule updated: {freq}', 'info')
        
        return jsonify({
            'status': 'success',
            'message': message,
            'details': {
                'schedule': schedule,
                'crontabEntry': crontab_entry
            }
        })
    
    except Exception as e:
        logger.error(f"[SYNC] Error updating NAS sync schedule: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to update NAS sync schedule: {str(e)}'
        }), 500

@bp.route('/api/admin/diskman/assign-nas', methods=['POST'])
@admin_required
def assign_nas():
    """
    Assign a device as primary or backup NAS by setting PARTLABEL.

    Expected JSON payload:
    {
        "device": "string (label or path)",
        "role": "primary" | "backup"
    }

    Returns:
        JSON response with success and label set
    """
    try:
        current_app.logger.info("[DISKMAN] Starting assign_nas operation")
        data = request.get_json()

        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")

        device = data.get('device')
        role = data.get('role')

        current_app.logger.info(f"[DISKMAN] Received assign request for device: {device}, role: {role}")

        if not device or not role:
            current_app.logger.error("[DISKMAN] Missing required parameters: device and role")
            return utils.error_response("Missing required parameters: device and role")

        if role not in ['primary', 'backup']:
            current_app.logger.error(f"[DISKMAN] Invalid role: {role}")
            return utils.error_response("Role must be 'primary' or 'backup'")

        # Resolve device identifier
        device_path = resolve_device_identifier(device)
        current_app.logger.info(f"[DISKMAN] Resolved device path: {device_path}")

        # Check if this is a system partition
        if is_system_partition(device_path):
            current_app.logger.error(f"[DISKMAN] Cannot assign system partition: {device_path}")
            return error_response("System partition cannot be assigned", 403)

        # Get disk information and resolve disk + partition number (supports selecting disk or partition)
        disk_info = utils.get_disk_info()
        block_devices = disk_info.get("blockDevices", {}).get("blockdevices", [])
        device_name = os.path.basename(device_path).replace("/dev/", "")

        target_disk, is_partition, partition_device = utils.find_target_device_in_block_devices(device_name, block_devices)

        if not target_disk:
            current_app.logger.error(f"[DISKMAN] Device not found in block devices: {device_path}")
            return utils.error_response(f"Device not found: {device_path}", 404)

        # Require at least one partition (unformatted / no-partition-table drives cannot be assigned)
        if is_partition and partition_device:
            part_num = partition_device.get("name", "").replace(target_disk["name"], "")
        elif target_disk.get("children"):
            part_num = target_disk["children"][0].get("name", "").replace(target_disk["name"], "")
        else:
            current_app.logger.error(f"[DISKMAN] Device has no partition: {device_path}")
            return utils.error_response(
                "Device has no partition. Create a partition first (e.g. use Format, or create a GPT partition with one partition), then assign.",
                400
            )

        if not part_num or not part_num.isdigit():
            current_app.logger.error(f"[DISKMAN] No partition number for device: {device_path}")
            return utils.error_response("Could not determine partition number; create a partition first, then assign.", 400)

        label = "homeserver-primary-nas" if role == "primary" else "homeserver-backup-nas"
        disk_path = f"/dev/{target_disk['name']}"

        # Use sgdisk to set PARTLABEL (-c takes one argument: partnum:label)
        cmd = ["/usr/bin/sudo", "/usr/sbin/sgdisk", "-c", f"{part_num}:{label}", disk_path]
        current_app.logger.info(f"[DISKMAN] Executing: {' '.join(cmd)}")
        success, stdout, stderr = utils.execute_command(cmd)

        if not success:
            error_msg = stderr if stderr else "Unknown error"
            current_app.logger.error(f"[DISKMAN] Failed to set PARTLABEL: {error_msg}")
            return utils.error_response(f"Failed to assign NAS role: {error_msg}", 500)

        utils.execute_command(["/usr/bin/sudo", "/usr/bin/udevadm", "trigger", "--subsystem-match=block", "--action=change"])

        current_app.logger.info(f"[DISKMAN] Successfully assigned {device_path} as {role} NAS with label {label}")
        write_to_log('admin', f'Device {device_path} assigned as {role} NAS', 'info')

        trigger_immediate_broadcast('admin_disk_info')

        return utils.success_response(
            f"Device {device_path} successfully assigned as {role} NAS",
            {
                "device": device_path,
                "label": label,
                "role": role
            }
        )

    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error assigning NAS: {str(e)}")
        import traceback
        current_app.logger.error(f"[DISKMAN] Traceback: {traceback.format_exc()}")
        return utils.error_response(str(e), 500)

@bp.route('/api/admin/diskman/import-to-nas', methods=['POST'])
@admin_required
def import_to_nas():
    """
    Import data from an external drive to NAS root.

    Expected JSON payload:
    {
        "sourceDevice": "string (label or path)"
    }

    Returns:
        JSON response with success
    """
    try:
        current_app.logger.info("[DISKMAN] Starting import_to_nas operation")
        data = request.get_json()

        if not data:
            current_app.logger.error("[DISKMAN] No JSON data provided")
            return utils.error_response("No JSON data provided")

        source_device = data.get('sourceDevice')

        current_app.logger.info(f"[DISKMAN] Received import request from source: {source_device}")

        if not source_device:
            current_app.logger.error("[DISKMAN] Missing required parameter: sourceDevice")
            return utils.error_response("Missing required parameter: sourceDevice")

        # Resolve source device
        source_path = resolve_device_identifier(source_device)
        current_app.logger.info(f"[DISKMAN] Resolved source path: {source_path}")

        # Check if source is a system partition
        if is_system_partition(source_path):
            current_app.logger.error(f"[DISKMAN] Cannot import from system partition: {source_path}")
            return error_response("Cannot import from system partition", 403)

        # Check if /mnt/nas is mounted
        if not os.path.exists("/mnt/nas") or not os.path.ismount("/mnt/nas"):
            current_app.logger.error("[DISKMAN] NAS is not mounted at /mnt/nas")
            return utils.error_response("NAS must be mounted at /mnt/nas to import", 400)

        # Get NAS available space
        statvfs = os.statvfs("/mnt/nas")
        nas_free_space = statvfs.f_frsize * statvfs.f_bavail

        # Get source size (rough estimate)
        try:
            result = subprocess.run(["/usr/bin/du", "-sb", source_path], capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                source_size = int(result.stdout.split()[0])
            else:
                current_app.logger.warning(f"[DISKMAN] Could not determine source size, proceeding anyway")
                source_size = 0
        except Exception as e:
            current_app.logger.warning(f"[DISKMAN] Error checking source size: {e}, proceeding anyway")
            source_size = 0

        # Check space (with some buffer)
        if source_size > 0 and source_size * 1.1 > nas_free_space:
            current_app.logger.error(f"[DISKMAN] Insufficient space: source {source_size} bytes, NAS free {nas_free_space} bytes")
            return utils.error_response(
                f"Insufficient space on NAS. Source requires ~{source_size // (1024*1024*1024)}GB, NAS has ~{nas_free_space // (1024*1024*1024)}GB free",
                400
            )

        # Create import directory
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        import_dir = f"/mnt/nas/import-{timestamp}"
        os.makedirs(import_dir, exist_ok=True)

        # Mount source if needed
        source_mount_point = None
        if not os.path.ismount(source_path):
            # Try to find a mount point or mount temporarily
            # For simplicity, assume it's a block device that needs mounting
            source_mount_point = f"/tmp/import_source_{timestamp}"
            os.makedirs(source_mount_point, exist_ok=True)

            # Mount the source
            mount_cmd = ["/usr/bin/sudo", "/usr/bin/mount", source_path, source_mount_point]
            success, stdout, stderr = utils.execute_command(mount_cmd)
            if not success:
                # Cleanup and error
                os.rmdir(source_mount_point)
                return utils.error_response(f"Failed to mount source device: {stderr}", 500)
            source_path = source_mount_point

        # Copy data using rsync
        dest_dir = import_dir
        rsync_cmd = ["/usr/bin/rsync", "-av", "--progress", f"{source_path}/", dest_dir]
        current_app.logger.info(f"[DISKMAN] Executing rsync: {' '.join(rsync_cmd)}")
        success, stdout, stderr = utils.execute_command(rsync_cmd)

        # Cleanup mount if we created one
        if source_mount_point and os.path.ismount(source_mount_point):
            umount_cmd = ["/usr/bin/sudo", "/usr/bin/umount", source_mount_point]
            utils.execute_command(umount_cmd)
            os.rmdir(source_mount_point)

        if not success:
            current_app.logger.error(f"[DISKMAN] Rsync failed: {stderr}")
            return utils.error_response(f"Import failed: {stderr}", 500)

        current_app.logger.info(f"[DISKMAN] Successfully imported data to {dest_dir}")
        write_to_log('admin', f'Data imported from {source_device} to NAS import directory', 'info')

        return utils.success_response(
            "Data successfully imported to NAS",
            {
                "sourceDevice": source_device,
                "importDirectory": dest_dir,
                "log": stdout.splitlines() if stdout else []
            }
        )

    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error importing to NAS: {str(e)}")
        import traceback
        current_app.logger.error(f"[DISKMAN] Traceback: {traceback.format_exc()}")
        return utils.error_response(str(e), 500)
