import os
from flask import request, jsonify, current_app
from backend.auth.decorators import admin_required
from backend.utils.utils import execute_command, get_config, error_response, success_response, check_services_running, check_services_stopped, start_service, stop_service, start_all_enabled_services, stop_all_services, get_service_status, decrypt_data, write_to_log, resolve_device_identifier, get_partlabel
from .. import bp
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

@bp.route('/api/admin/diskman/create-key', methods=['POST'])
@admin_required
def create_key():
    """
    Create and apply a new key using specified strategy.
    Can target vault, external devices, or both.
    
    Expected JSON payload:
    {
        "target": "str",         # 'vault', 'external', or 'both'
        "strategy": "str",       # 'replace_primary', 'safe_rotation', or 'flexible_addition'
        "password": "str",       # New password to set
        "vaultPassword": "str",  # Current vault password (required for vault operations)
        "devices": ["str"],      # List of device paths (required for external/both)
        "devicePasswords": {},   # Map of device -> current password (required for initialized devices)
        "flexibleOption": "str", # Optional - for flexible_addition strategy
        "keySlot": int          # Optional - for manual slot selection
    }
    """
    try:
        data = request.get_json()
        logger.info(f"[KEYMAN-DEBUG] Raw request data: {json.dumps(data, indent=2)}")
        
        if not data:
            logger.error("[KEYMAN-DEBUG] No data provided in request")
            return error_response("No data provided")

        # Enhanced logging for devices field
        if 'devices' in data:
            logger.info(f"[KEYMAN-DEBUG] Devices field type: {type(data.get('devices'))}")
            logger.info(f"[KEYMAN-DEBUG] Devices field value: {data.get('devices')}")
            if isinstance(data.get('devices'), list):
                for i, device in enumerate(data.get('devices')):
                    logger.info(f"[KEYMAN-DEBUG] Device[{i}] = '{device}' (type: {type(device)})")
            else:
                logger.info(f"[KEYMAN-DEBUG] Devices is not a list! Value: {data.get('devices')}")
        else:
            logger.info("[KEYMAN-DEBUG] No 'devices' field in request!")

        # Log all fields
        logger.info("[KEYMAN-DEBUG] Request fields:")
        for field in ['target', 'strategy', 'devices', 'password', 'vaultPassword', 'devicePasswords']:
            logger.info(f"[KEYMAN-DEBUG] {field}: {data.get(field)}")
            if field == 'devices':
                logger.info(f"[KEYMAN-DEBUG] devices type: {type(data.get(field))}")
                if data.get(field):
                    for i, device in enumerate(data.get(field)):
                        logger.info(f"[KEYMAN-DEBUG] device[{i}]: {device} (type: {type(device)})")

        # Validate required fields
        required_fields = ['target', 'strategy', 'password']
        for field in required_fields:
            if field not in data:
                logger.error(f"[KEYMAN-DEBUG] Missing required field: {field}")
                return error_response(f"Missing required field: {field}")

        # Decrypt password
        password = decrypt_data(data['password'])
        if password is None:
            logger.error("[KEYMAN-DEBUG] Failed to decrypt new password")
            return error_response("Failed to decrypt new password")

        # Decrypt vault password if present
        vault_password = None
        if 'vaultPassword' in data and data['vaultPassword']:
            vault_password = decrypt_data(data['vaultPassword'])
            if vault_password is None:
                logger.error("[KEYMAN-DEBUG] Failed to decrypt vault password")
                return error_response("Failed to decrypt vault password")

        # Decrypt device passwords if present
        device_passwords = {}
        if 'devicePasswords' in data and data['devicePasswords']:
            for device, encrypted_pwd in data['devicePasswords'].items():
                decrypted_pwd = decrypt_data(encrypted_pwd)
                if decrypted_pwd is None:
                    logger.error(f"[KEYMAN-DEBUG] Failed to decrypt password for device {device}")
                    return error_response(f"Failed to decrypt password for device {device}")
                device_passwords[device] = decrypted_pwd

        # Validate target
        if data['target'] not in ['vault', 'external', 'both']:
            return error_response(f"Invalid target: {data['target']}")

        # Validate strategy
        if data['strategy'] not in ['replace_primary', 'safe_rotation', 'flexible_addition']:
            return error_response(f"Invalid strategy: {data['strategy']}")

        # Enhanced validation for devices array
        if 'devices' not in data:
            logger.error("[KEYMAN-DEBUG] No devices field in request")
            return error_response("Devices must be provided as a list")
            
        if not isinstance(data['devices'], list):
            logger.error(f"[KEYMAN-DEBUG] Devices is not a list: {data['devices']} (type: {type(data['devices'])})")
            return error_response("Devices must be provided as a list")
            
        if len(data['devices']) == 0:
            logger.error("[KEYMAN-DEBUG] Devices list is empty")
            return error_response("At least one device must be provided")
        
        # Validate each device in the list
        for i, device in enumerate(data['devices']):
            if not isinstance(device, str):
                logger.error(f"[KEYMAN-DEBUG] Device[{i}] is not a string: {device} (type: {type(device)})")
                return error_response(f"Device at index {i} must be a string")
                
            if not device.startswith('/dev/'):
                logger.error(f"[KEYMAN-DEBUG] Device[{i}] does not start with /dev/: {device}")
                return error_response(f"Device path must start with /dev/: {device}")
            
        # Validate devices based on target
        if data['target'] in ['external', 'both'] and not any(device.startswith('/dev/') for device in data['devices']):
            return error_response("No valid device paths provided for external target")
            
        if data['target'] in ['vault', 'both'] and not any(device.startswith('/dev/') for device in data['devices']):
            return error_response("No valid vault device path provided")

        # Initialize result details
        result_details = {
            "target": data['target'],
            "strategy": data['strategy'],
            "created": True,
            "timestamp": int(time.time())
        }

        # Get vault physical path for device identification
        config = get_config()
        mounts = config.get('global', {}).get('mounts', {})
        vault_label = mounts.get('vault', {}).get('device', 'homeserver-vault')
        vault_physical = resolve_device_identifier(vault_label)

        # Handle vault operations if target is vault or both
        if data['target'] in ['vault', 'both']:
            logger.info("[KEYMAN] Processing vault operations")
            
            # Validate vault password provided
            if not vault_password:
                return error_response("Vault password required and could not be decrypted")

            # Enhanced logging for the 'device' error
            if 'devices' not in data or not data['devices']:
                logger.error("[KEYMAN-DEBUG] Devices list empty or missing for vault operation")
                return error_response("Devices list required for vault operations")
                
            # Find the vault device in the devices list
            vault_device = None
            for device in data['devices']:
                resolved = resolve_device_identifier(device)
                if resolved == vault_physical:
                    vault_device = device
                    logger.info(f"[KEYMAN-DEBUG] Found vault device: {vault_device} (resolved: {resolved})")
                    break
                    
            if not vault_device:
                logger.error("[KEYMAN-DEBUG] No vault device found in devices list")
                return error_response("No vault device found in devices list")

            # Resolve vault device to physical path for keyman utils
            vault_device = resolve_device_identifier(vault_device)

            # Add variable to track data['device'] vs data['devices']
            logger.info(f"[KEYMAN-DEBUG] data['device'] exists: {'device' in data}")
            if 'device' in data:
                logger.info(f"[KEYMAN-DEBUG] data['device'] value: {data['device']}")
            
            # Map strategy to operation
            if data['strategy'] == 'replace_primary':
                # Execute the primary key replacement using the safe pattern
                success, message = utils.replace_device_key(
                    device=vault_device,
                    slot=0,  # Primary key slot
                    new_password=password,
                    existing_password=vault_password
                )
                if not success:
                    return error_response(f"Failed to update vault: {message}")
            elif data['strategy'] == 'safe_rotation':
                # Get current key slots info to determine if slot 1 exists
                slots_success, slots_message, slots_info = utils.get_key_slots(vault_device)
                if not slots_success:
                    logger.error(f"[KEYMAN] Failed to get key slots: {slots_message}")
                    return error_response(slots_message)

                # Check if slot 1 is in use
                slot1_in_use = False
                for line in slots_info.get('slot_status', []):
                    if line.get('slot') == 1 and line.get('status') == 'ENABLED':
                        slot1_in_use = True
                        break

                logger.info(f"[KEYMAN] Slot 1 status - in use: {slot1_in_use}")
                if slot1_in_use:
                    # Replace existing key in slot 1
                    success, message = utils.replace_device_key(
                        device=vault_device,
                        slot=1,
                        new_password=password,
                        existing_password=vault_password
                    )
                else:
                    # Add new key to slot 1
                    success, message = utils.add_key_to_device(
                        device=vault_device,
                        new_password=password,
                        existing_password=vault_password,
                        slot=1
                    )
                
                if not success:
                    return error_response(f"Failed to update vault: {message}")
            else:  # flexible_addition
                # Get vault slots info
                slots_success, slots_message, slots_info = utils.get_key_slots(vault_device)
                if not slots_success:
                    return error_response(f"Failed to get vault slots: {slots_message}")
                
                if slots_info['available'] == 0:
                    if 'flexibleOption' not in data:
                        return error_response("No slots available and no flexible option provided")
                    # Handle full device case
                    success, message = utils.add_key_to_full_device(
                        device=vault_device,
                        new_password=password,
                        existing_password=vault_password,
                        flexible_option=data['flexibleOption'],
                        slot=data.get('keySlot')
                    )
                else:
                    # Add to next available slot
                    success, message = utils.add_key_to_device(
                        device=vault_device,
                        new_password=password,
                        existing_password=vault_password
                    )
                
                if not success:
                    return error_response(f"Failed to update vault: {message}")

            result_details["vault_updated"] = True
            logger.info("[KEYMAN] Vault update completed successfully")

        # Handle external device operations if target is external or both
        if data['target'] in ['external', 'both']:
            logger.info("[KEYMAN] Processing external device operations")
            
            # Validate devices provided
            if 'devices' not in data or not data['devices']:
                return error_response("No devices specified for external operations")

            # First update the NAS key in vault using the *new* decrypted password
            logger.info("[KEYMAN] Updating NAS key in vault with the new password")
            success, message = utils.update_vault_nas_key(password)
            if not success:
                return error_response(f"Failed to update NAS key: {message}")

            # Export the key to use for device operations (this is now the new password)
            success, message, nas_password = utils.export_nas_key()
            if not success:
                return error_response(f"Failed to export NAS key: {message}")

            # Process each device
            devices_results = []
            overall_success = False  # Track if at least one device succeeds
            logger.info(f"[KEYMAN-DEBUG] Processing devices: {data['devices']}")
            start_time = time.time()

            for device in data['devices']:
                device_start_time = time.time()
                logger.info(f"[KEYMAN-DEBUG] Starting operations for device: {device} at {time.strftime('%H:%M:%S')}")
                
                # Skip vault device in 'both' mode if we can identify it
                resolved_device = resolve_device_identifier(device)
                if data['target'] == 'both' and resolved_device == vault_physical:
                    logger.info(f"[KEYMAN-DEBUG] Skipping vault device {device} in external device processing (resolved: {resolved_device})")
                    continue

                # Check if this is secondary device (not vault or primary)
                is_secondary = (data['target'] == 'both' or data['target'] == 'external') and resolved_device != vault_physical
                if is_secondary:
                    logger.info(f"[KEYMAN-DEBUG] Processing secondary device: {device} (resolved: {resolved_device})")

                if not device or not device.startswith('/dev/'):
                    devices_results.append({
                        "device": device,
                        "success": False,
                        "message": "Invalid device path"
                    })
                    continue

                # Get device's current password if provided (already decrypted)
                device_password = device_passwords.get(device)
                logger.info(f"[KEYMAN-DEBUG] Decrypted password found for device {device}: {device_password is not None}")
                
                # Check if device is initialized and needs password
                if data['strategy'] in ['replace_primary', 'safe_rotation']:
                    if not device_password:
                        logger.error(f"[KEYMAN-DEBUG] Missing device password for {device} in strategy {data['strategy']}")
                        devices_results.append({
                            "device": device,
                            "success": False,
                            "message": "Device password required for key replacement"
                        })
                        continue
                elif data['strategy'] == 'flexible_addition':
                    slots_success, slots_message, slots_info = utils.get_key_slots(resolved_device)
                    if slots_success and slots_info.get('used', 0) > 0 and not device_password:
                        logger.error(f"[KEYMAN-DEBUG] Missing device password for initialized device {device}")
                        devices_results.append({
                            "device": device,
                            "success": False,
                            "message": "Device password required for initialized devices"
                        })
                        continue

                # Apply the strategy to the device
                logger.info(f"[KEYMAN-DEBUG] Applying strategy {data['strategy']} to device {device}")
                
                try:
                    success = False
                    message = "Unknown error"
                    
                    if data['strategy'] == 'replace_primary':
                        success, message = utils.replace_device_key(
                            device=resolved_device,
                            slot=0,
                            new_password=nas_password,
                            existing_password=device_password
                        )
                    elif data['strategy'] == 'safe_rotation':
                        success, message = utils.replace_device_key(
                            device=resolved_device,
                            slot=1,
                            new_password=nas_password,
                            existing_password=device_password
                        )
                    else:  # flexible_addition
                        slots_success, slots_message, slots_info = utils.get_key_slots(resolved_device)
                        if not slots_success:
                            devices_results.append({
                                "device": device,
                                "success": False,
                                "message": slots_message
                            })
                            continue

                        if slots_info['available'] == 0:
                            if 'flexibleOption' not in data:
                                devices_results.append({
                                    "device": device,
                                    "success": False,
                                    "message": "No slots available and no flexible option provided"
                                })
                                continue

                            success, message = utils.add_key_to_full_device(
                                device=resolved_device,
                                new_password=nas_password,
                                existing_password=device_password,
                                flexible_option=data['flexibleOption'],
                                slot=data.get('keySlot')
                            )
                        else:
                            success, message = utils.add_key_to_device(
                                device=resolved_device,
                                new_password=nas_password,
                                existing_password=device_password
                            )
                            
                    # Set overall_success to True if at least one device succeeds
                    if success:
                        overall_success = True
                except Exception as e:
                    logger.error(f"[KEYMAN-DEBUG] Exception processing device {device}: {str(e)}")
                    success = False
                    message = f"Error: {str(e)}"

                # Record operation time
                operation_time = time.time() - device_start_time
                logger.info(f"[KEYMAN-DEBUG] Completed operations for device {device} in {operation_time:.2f} seconds - Success: {success}")

                # Record the result
                devices_results.append({
                    "device": device,
                    "label": get_partlabel(resolved_device),
                    "success": success,
                    "message": message,
                    "operation_time": f"{operation_time:.2f} seconds"
                })

            # Add devices results to response
            result_details["devices"] = devices_results
            total_time = time.time() - start_time
            logger.info(f"[KEYMAN-DEBUG] Total key operation time: {total_time:.2f} seconds")
            
            # Check if any device operations succeeded - changed to use the overall_success flag
            if not overall_success:
                return error_response("Failed to apply key to any device", details={"devices": devices_results})

            # Return partial success if some devices failed
            if any(not result.get("success", False) for result in devices_results):
                result_details["partial_success"] = True
                result_details["failed_devices"] = [result for result in devices_results if not result.get("success", False)]
                logger.info("[KEYMAN] Partial success - some devices failed")
                write_to_log('admin', f'Key creation partially successful - some devices failed: {", ".join(d["device"] for d in result_details["failed_devices"])}', 'info')
                return success_response(
                    message="Key operations completed with some failures",
                    details=result_details
                )

            logger.info("[KEYMAN] External device operations completed with full success")
            write_to_log('admin', f'Key creation successful for all devices: {", ".join(data["devices"])}', 'info')

        return success_response(
            message="Key operations completed successfully",
            details=result_details
        )

    except Exception as e:
        logger.error(f"[KEYMAN] Error in create_key: {str(e)}")
        return error_response(f"Failed to create key: {str(e)}")

@bp.route('/api/admin/diskman/update-key', methods=['POST'])
@admin_required
def update_key():
    """
    Update an existing key using the NAS key from the vault.
    
    Expected JSON payload:
    {
        "device": "str",          # Device to update
        "strategy": "str",        # Strategy to use (replace_primary, safe_rotation, flexible_addition)
        "current_password": "str", # Current password on the device
        "flexibleOption": "str",  # Optional - for flexible_addition strategy
        "keySlot": int           # Optional - for manual slot selection
    }
    """
    try:
        data = request.get_json()
        logger.info(f"[KEYMAN] Update key request received with data: {json.dumps(data, indent=2)}")
        start_time = time.time()
        
        if not data:
            logger.error("[KEYMAN] No data provided in request")
            return error_response("No data provided")

        # Decrypt current_password
        current_password = decrypt_data(data['current_password'])
        if current_password is None:
            logger.error("[KEYMAN] Failed to decrypt current_password")
            return error_response("Failed to decrypt current password")

        # Validate required fields
        required_fields = ['device', 'strategy'] # current_password was already checked via decryption
        for field in required_fields:
            if field not in data:
                logger.error(f"[KEYMAN] Missing required field: {field}")
                return error_response(f"Missing required field: {field}")

        # Ensure device path has /dev/ prefix
        if not data['device'].startswith('/dev/'):
            logger.info(f"[KEYMAN] Adding /dev/ prefix to device: {data['device']}")
            data['device'] = f"/dev/{data['device']}"
        
        # First verify the current password works (use decrypted password)
        logger.info(f"[KEYMAN] Verifying current device password for {data['device']}")
        success, message = utils.is_key_available(data['device'], current_password)
        if not success:
            logger.error(f"[KEYMAN] Current password verification failed: {message}")
            return error_response("Current device password is invalid", status_code=401)

        # Then export the NAS key (which will be the new password)
        logger.info("[KEYMAN] Attempting to export NAS key")
        success, message, nas_password = utils.export_nas_key()
        if not success:
            logger.error(f"[KEYMAN] Failed to export NAS key: {message}")
            return error_response(message)
        logger.info("[KEYMAN] Successfully exported NAS key")

        # Get current key slots info
        logger.info(f"[KEYMAN] Getting key slots info for device: {data['device']}")
        slots_success, slots_message, slots_info = utils.get_key_slots(data['device'])
        if not slots_success:
            logger.error(f"[KEYMAN] Failed to get key slots: {slots_message}")
            return error_response(slots_message)
        logger.info(f"[KEYMAN] Key slots info retrieved: {json.dumps(slots_info, indent=2)}")

        # Map strategy to operation
        strategy = data['strategy']
        logger.info(f"[KEYMAN] Processing strategy: {strategy}")
        
        operation_start_time = time.time()
        logger.info(f"[KEYMAN] Starting key operation at {time.strftime('%H:%M:%S')}")
        
        if strategy == 'replace_primary':
            operation = 'replace_key0'
            logger.info("[KEYMAN] Strategy mapped to replace_key0 operation")
            # Execute the primary key replacement using current password to authenticate
            success, message = utils.replace_device_key(
                device=data['device'],
                slot=0,  # Primary key slot
                new_password=nas_password,  # NAS key becomes the new password
                existing_password=current_password  # Use decrypted current device password
            )
        elif strategy == 'safe_rotation':
            operation = 'replace_key1'
            logger.info("[KEYMAN] Strategy mapped to replace_key1 operation")
            # Get current key slots info to determine if slot 1 exists
            slots_success, slots_message, slots_info = utils.get_key_slots(data['device'])
            if not slots_success:
                logger.error(f"[KEYMAN] Failed to get key slots: {slots_message}")
                return error_response(slots_message)

            # Check if slot 1 is in use
            slot1_in_use = False
            for line in slots_info.get('slot_status', []):
                if line.get('slot') == 1 and line.get('status') == 'ENABLED':
                    slot1_in_use = True
                    break

            logger.info(f"[KEYMAN] Slot 1 status - in use: {slot1_in_use}")
            if slot1_in_use:
                # Replace existing key in slot 1
                logger.info("[KEYMAN] Replacing existing key in slot 1")
                success, message = utils.replace_device_key(
                    device=data['device'],
                    slot=1,
                    new_password=nas_password,  # NAS key becomes the new password
                    existing_password=current_password  # Use decrypted current device password
                )
            else:
                # Add new key to slot 1
                logger.info("[KEYMAN] Adding new key to slot 1")
                success, message = utils.add_key_to_device(
                    device=data['device'],
                    new_password=nas_password,  # NAS key becomes the new password
                    existing_password=current_password,  # Use decrypted current device password
                    slot=1  # Explicitly request slot 1
                )
        elif strategy == 'flexible_addition':
            operation = 'add_key'
            logger.info("[KEYMAN] Strategy mapped to add_key operation")
            if slots_info['available'] == 0:
                if 'flexibleOption' not in data:
                    logger.error("[KEYMAN] No slots available and no flexible option provided")
                    return error_response("No slots available and no flexible option provided")
                
                logger.info(f"[KEYMAN] Using flexible option: {data['flexibleOption']}")
                success, message = utils.add_key_to_full_device(
                    device=data['device'],
                    new_password=nas_password,  # NAS key becomes the new password
                    existing_password=current_password,  # Use decrypted current device password
                    flexible_option=data['flexibleOption'],
                    slot=data.get('keySlot')
                )
            else:
                logger.info("[KEYMAN] Adding key to available slot")
                success, message = utils.add_key_to_device(
                    device=data['device'],
                    new_password=nas_password,  # NAS key becomes the new password
                    existing_password=current_password,  # Use decrypted current device password
                )
        else:
            logger.error(f"[KEYMAN] Invalid strategy: {strategy}")
            return error_response(f"Invalid strategy: {strategy}")

        # Handle operation result
        if not success:
            logger.error(f"[KEYMAN] Operation failed: {message}")
            return error_response(message)

        operation_time = time.time() - operation_start_time
        total_time = time.time() - start_time
        logger.info(f"[KEYMAN] Key operation completed in {operation_time:.2f} seconds")
        logger.info(f"[KEYMAN] Total request time: {total_time:.2f} seconds")
        
        logger.info("[KEYMAN] Operation completed successfully")
        write_to_log('admin', f'Key updated successfully for device {data["device"]} using {strategy} strategy', 'info')
        return success_response(
            message="Key updated successfully",
            details={
                "device": data['device'],
                "strategy": strategy,
                "updated": True,
                "timestamp": int(time.time()),
                "operation_time": f"{operation_time:.2f} seconds",
                "total_time": f"{total_time:.2f} seconds"
            }
        )

    except Exception as e:
        logger.error(f"[KEYMAN] Unexpected error: {str(e)}")
        return error_response(f"Failed to update key: {str(e)}")

@bp.route('/api/admin/diskman/key-status', methods=['POST'])
@admin_required
def key_status():
    """Get the status of key slots for a device"""
    try:
        logger.info("[KEYMAN] Key status request received")
        data = request.get_json()
        if not data or 'device' not in data:
            logger.error("[KEYMAN] Device not specified in request")
            return error_response("Device not specified")

        logger.info(f"[KEYMAN] Checking key status for device: {data['device']}")
        success, message, slots_info = utils.get_key_slots(data['device'])
        logger.info(f"[KEYMAN] get_key_slots result - success: {success}, message: {message}, info: {json.dumps(slots_info, indent=2) if slots_info else None}")

        if not success:
            logger.error(f"[KEYMAN] Failed to get key slots: {message}")
            return error_response(message)

        # If slots_info has is_luks field and it's False, still return a success response
        # but with the appropriate info that it's not a LUKS device
        is_luks = slots_info.get('is_luks', True)
        logger.info(f"[KEYMAN] Device LUKS status: {is_luks}")

        response_data = {
            "device": data['device'],
            "keySlots": slots_info,
            "isLuksDevice": is_luks,
            "lastUpdated": int(time.time())
        }
        logger.info(f"[KEYMAN] Returning response: {json.dumps(response_data, indent=2)}")

        return success_response(
            message="Successfully retrieved key status",
            details=response_data
        )

    except Exception as e:
        logger.error(f"[KEYMAN] Error getting key status: {str(e)}")
        return error_response(f"Failed to get key status: {str(e)}")

@bp.route('/api/admin/diskman/vault-device', methods=['GET'])
@admin_required
def get_vault_device_path():
    """Get the vault device path from the homeserver.json config"""
    try:
        config = get_config()
        if not config or 'global' not in config or 'mounts' not in config['global'] or 'vault' not in config['global']['mounts']:
            return error_response("Vault configuration missing from homeserver.json")
        
        vault_config = config['global']['mounts']['vault']
        device = vault_config.get('device')
        
        if not device:
            return error_response("Invalid vault device configuration")
            
        # Format the device path properly
        device_path = f"/dev/{device}"
        
        return success_response(
            message="Successfully retrieved vault device path",
            details={
                "device_path": device_path
            }
        )

    except Exception as e:
        logger.error(f"Error getting vault device path: {str(e)}")
        return error_response(f"Failed to get vault device path: {str(e)}")