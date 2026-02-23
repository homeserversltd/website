import os
import subprocess
import json
import random
import re
from flask import current_app
from backend.utils.utils import execute_command, error_response, success_response, get_config
from backend.monitors.disk import DiskMonitor
import logging

logger = logging.getLogger(__name__)

def update_vault_nas_key(password: str) -> tuple[bool, str]:
    """
    Update the NAS key stored in the vault using newkey.sh.
    This updates the long-term storage only, does not affect any devices.
    Simply overwrites/creates the key file with the new password.
    
    Args:
        password: The new password to set
        
    Returns:
        tuple[bool, str]: (success, message)
    """
    try:
        success, stdout, stderr = execute_command(["/usr/bin/sudo", "/vault/keyman/newkey.sh", "nas", "admin", password])
        if not success:
            return False, f"Failed to update vault NAS key: {stderr}"
        return True, "Vault NAS key updated successfully"
    except Exception as e:
        return False, f"Error updating vault NAS key: {str(e)}"

def export_nas_key() -> tuple[bool, str, str | None]:
    """
    Export the NAS key using the specialized exportNAS.sh script.
    This script safely exports only the password needed for NAS operations.
    Returns (success, message, password)
    """
    try:
        cmd = ["/usr/bin/sudo", "/usr/bin/bash", "/vault/scripts/exportNAS.sh"]
        success, stdout, stderr = execute_command(cmd)
        if not success:
            if "Key system not initialized" in stderr:
                return False, "Key system not initialized", None
            return False, f"Failed to export NAS key: {stderr}", None
        return True, "NAS key exported successfully", stdout.strip()
    except Exception as e:
        return False, f"Error exporting NAS key: {str(e)}", None

def add_key_to_device(device: str, new_password: str, existing_password: str | None = None, slot: int | None = None) -> tuple[bool, str]:
    """
    Add a new key to a LUKS device.
    If existing_password is not provided, assumes this is the first key.
    If slot is provided, uses that specific slot.
    If slot is not provided, finds the next available slot.
    Returns (success, message)
    """
    try:
        logger.info(f"[KEYMAN] ====== Starting key addition process ======")
        logger.info(f"[KEYMAN] Target device: {device}")
        logger.info(f"[KEYMAN] Has existing password: {existing_password is not None}")
        logger.info(f"[KEYMAN] Target slot specified: {slot is not None}")
        
        # If no slot specified, find next available slot
        if slot is None:
            logger.info("[KEYMAN] Finding next available slot...")
            slots_success, slots_message, slots_info = get_key_slots(device)
            if not slots_success:
                logger.error(f"[KEYMAN] Failed to get key slots: {slots_message}")
                return False, f"Failed to get key slots: {slots_message}"
                
            # Find first available slot
            used_slots = set(line['slot'] for line in slots_info.get('slot_status', []))
            for potential_slot in range(32):  # LUKS2 default max slots
                if potential_slot not in used_slots:
                    slot = potential_slot
                    logger.info(f"[KEYMAN] Found available slot: {slot}")
                    break
            else:
                logger.error("[KEYMAN] No available slots found")
                return False, "No available slots found"
        
        # Build command
        cmd = ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksAddKey", device, "--key-slot", str(slot)]
        logger.info(f"[KEYMAN] Final command: {' '.join(cmd)}")
        
        # Format input data - cryptsetup expects:
        # 1. Existing key (if device is already initialized)
        # 2. New key
        # 3. New key verification
        input_data = f"{existing_password}\n{new_password}\n{new_password}\n" if existing_password else f"{new_password}\n{new_password}\n"
        input_lines = len(input_data.split('\n'))
        logger.info(f"[KEYMAN] Input data prepared: {input_lines} lines")
        logger.info(f"[KEYMAN] Input format: {'existing+new+verify' if existing_password else 'new+verify'}")
        
        # Execute command
        logger.info("[KEYMAN] Executing cryptsetup command...")
        success, stdout, stderr = execute_command(cmd, input_data=input_data)
        
        if not success:
            logger.error(f"[KEYMAN] Command failed with error: {stderr}")
            logger.error(f"[KEYMAN] Command output: {stdout}")
            logger.error("[KEYMAN] ====== Key addition failed ======")
            return False, f"Failed to add key: {stderr}"
            
        logger.info("[KEYMAN] Command executed successfully")
        if stdout:
            logger.info(f"[KEYMAN] Command output: {stdout}")
            
        logger.info("[KEYMAN] ====== Key addition completed successfully ======")
        return True, "Key added successfully"
    except Exception as e:
        logger.error(f"[KEYMAN] ====== Key addition failed with exception ======")
        logger.error(f"[KEYMAN] Exception: {str(e)}")
        return False, f"Error adding key: {str(e)}"

def replace_device_key(device: str, slot: int, new_password: str, existing_password: str) -> tuple[bool, str]:
    """
    Replace a key in a specific slot on a LUKS device.
    If slot is 0 (primary key), uses keyslot 1 as temporary slot to ensure we don't lock ourselves out.
    The existing_password should be the NAS key (old password) and new_password is the user's desired password.
    Returns (success, message)
    """
    try:
        logger.info(f"[KEYMAN] Replacing key in slot {slot} for device: {device}")
        
        # Special handling for slot 0 (primary key)
        if slot == 0:
            logger.info("[KEYMAN] Primary key replacement requested - using keyslot 1 as temporary")
            
            # Get current slot information
            slots_success, slots_message, slots_info = get_key_slots(device)
            if not slots_success:
                logger.error(f"[KEYMAN] Failed to get key slots: {slots_message}")
                return False, f"Failed to get key slots: {slots_message}"
            
            # Check if slot 1 is available
            slot_1_in_use = any(line['slot'] == 1 and line['status'] == 'ENABLED' for line in slots_info.get('slot_status', []))
            if slot_1_in_use:
                logger.info("[KEYMAN] Killing slot 1 to use as temporary")
                kill_cmd = ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksKillSlot", device, "1"]
                success, stdout, stderr = execute_command(kill_cmd, input_data=existing_password)  # Use old password (NAS key)
                if not success:
                    logger.error(f"[KEYMAN] Failed to clear slot 1: {stderr}")
                    return False, f"Failed to clear slot 1: {stderr}"
                logger.info("[KEYMAN] Successfully cleared slot 1")
            
            # First add the new key to slot 1
            logger.info("[KEYMAN] Adding new key to slot 1")
            success, message = add_key_to_device(device, new_password, existing_password, 1)  # existing_password is NAS key
            if not success:
                logger.error(f"[KEYMAN] Failed to add key to slot 1: {message}")
                return False, f"Failed to add key to slot 1: {message}"
            
            # Now kill all slots except slot 1
            logger.info("[KEYMAN] Killing all other slots")
            for slot_info in slots_info.get('slot_status', []):
                current_slot = slot_info['slot']
                if current_slot != 1 and slot_info['status'] == 'ENABLED':
                    logger.info(f"[KEYMAN] Killing slot {current_slot}")
                    kill_cmd = ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksKillSlot", device, str(current_slot)]
                    success, stdout, stderr = execute_command(kill_cmd, input_data=new_password)  # Use new password since it's in slot 1
                    if not success:
                        logger.error(f"[KEYMAN] Failed to remove key from slot {current_slot}: {stderr}")
                        return False, f"Failed to remove key from slot {current_slot}: {stderr}"
                    logger.info(f"[KEYMAN] Successfully killed slot {current_slot}")
            
            # Finally, add the new key to slot 0
            logger.info("[KEYMAN] Adding new key to slot 0")
            success, message = add_key_to_device(device, new_password, new_password, 0)  # Use new password since it's the only one left
            if not success:
                logger.error(f"[KEYMAN] Failed to add key to slot 0: {message}")
                return False, f"Failed to add key to slot 0: {message}"
            
            # Kill slot 1
            logger.info("[KEYMAN] Removing temporary slot 1")
            kill_cmd = ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksKillSlot", device, "1"]
            success, stdout, stderr = execute_command(kill_cmd, input_data=new_password)
            if not success:
                logger.error(f"[KEYMAN] Failed to remove slot 1: {stderr}")
                return False, f"Failed to remove slot 1: {stderr}"
            
            logger.info("[KEYMAN] Successfully completed primary key replacement")
            return True, "Primary key replaced successfully"
            
        else:
            # For non-primary slots, check if the slot exists first
            logger.info(f"[KEYMAN] Checking if slot {slot} is active")
            slots_success, slots_message, slots_info = get_key_slots(device)
            if not slots_success:
                logger.error(f"[KEYMAN] Failed to get key slots: {slots_message}")
                return False, f"Failed to get key slots: {slots_message}"
                
            # Check if the target slot is active
            slot_active = any(line['slot'] == slot and line['status'] == 'ENABLED' for line in slots_info.get('slot_status', []))
            
            if slot_active:
                # Kill the existing slot if it's active
                logger.info(f"[KEYMAN] Executing kill command for slot {slot}")
                kill_cmd = ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksKillSlot", device, str(slot)]
                success, stdout, stderr = execute_command(kill_cmd, input_data=existing_password)  # Use old password (NAS key)
                if not success:
                    logger.error(f"[KEYMAN] Failed to remove old key: {stderr}")
                    return False, f"Failed to remove old key: {stderr}"
                logger.info("[KEYMAN] Successfully killed target slot")
            else:
                logger.info(f"[KEYMAN] Slot {slot} is not active, proceeding with key addition")
            
            # Add the new key to the specified slot
            logger.info(f"[KEYMAN] Adding new key to slot {slot}")
            return add_key_to_device(device, new_password, existing_password, slot)  # existing_password is NAS key
            
    except Exception as e:
        logger.error(f"[KEYMAN] Error in replace_device_key: {str(e)}")
        return False, f"Error replacing key: {str(e)}"

def get_key_slots(device: str) -> tuple[bool, str, dict | None]:
    """
    Get information about LUKS key slots for a device.
    Returns (success, message, slots_info)
    """
    try:
        logger.info(f"[KEYMAN] Getting key slots for device: {device}")
        
        # Check if this is a mapper device
        if device.startswith('/dev/mapper/'):
            # We need to find the actual underlying device
            mapper_name = device.split('/')[-1]
            logger.info(f"[KEYMAN] Detected mapper device: {mapper_name}")
            success, stdout, stderr = execute_command(["/usr/bin/sudo", "/usr/bin/dmsetup", "info", "-c", "--noheadings", "-o", "devname", mapper_name])
            if success and stdout.strip():
                # Got the device name, but we need to convert it to a path
                # Output format is like "sda1"
                dev_name = stdout.strip()
                device = f"/dev/{dev_name}"
                logger.info(f"[KEYMAN] Converted mapper {mapper_name} to underlying device {device}")
            else:
                # If we can't get the underlying device, we fall back to using the provided path
                # but it will likely fail
                logger.warning(f"[KEYMAN] Failed to get underlying device for mapper {mapper_name}, using provided path. Error: {stderr}")
                
        # Use sudo to run cryptsetup to handle permission issues
        logger.info(f"[KEYMAN] Running luksDump on device: {device}")
        success, stdout, stderr = execute_command(["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksDump", device])
        logger.info(f"[KEYMAN] luksDump success: {success}")
        if stderr:
            logger.warning(f"[KEYMAN] luksDump stderr: {stderr}")
        
        # Check if this is a valid LUKS device by looking for LUKS header indicators
        is_luks_device = False
        if success:
            logger.info("[KEYMAN] Parsing luksDump output")
            for line in stdout.splitlines():
                if "LUKS header information" in line or "Version:" in line:
                    is_luks_device = True
                    logger.info("[KEYMAN] LUKS header detected")
                    break
                    
            if is_luks_device:
                # Parse the luksDump output to get slot information
                slots_info = {
                    "total": 32,  # LUKS2 default
                    "used": 0,
                    "available": 0,
                    "is_luks": True,
                    "slot_status": []  # Add array to track individual slot status
                }
                
                # Parse slot information
                current_slot = None
                logger.info("[KEYMAN] Parsing slot information")
                for line in stdout.splitlines():
                    if "luks2" in line:  # LUKS2 format detection
                        try:
                            # Line format is like "  0: luks2" or "  1: luks2"
                            slot_str = line.strip().split(':')[0]
                            current_slot = int(slot_str)
                            logger.debug(f"[KEYMAN] Found slot: {current_slot}")
                        except (IndexError, ValueError):
                            continue
                    elif current_slot is not None and any(state in line.lower() for state in ["key:", "priority:", "cipher:"]):
                        # In LUKS2, if we see these fields after a slot number, the slot is enabled
                        slots_info["slot_status"].append({
                            "slot": current_slot,
                            "status": "ENABLED"
                        })
                        slots_info["used"] += 1
                        logger.debug(f"[KEYMAN] Slot {current_slot} is enabled")
                        current_slot = None
                
                # If it's a valid LUKS device but we detected 0 slots, something is wrong with parsing
                # An accessible LUKS device must have at least one used key slot
                if slots_info["used"] == 0:
                    logger.warning(f"[KEYMAN] Detected 0 used slots for {device} but it's a LUKS device. Setting to at least 1.")
                    slots_info["used"] = 1
                    slots_info["slot_status"].append({
                        "slot": 0,
                        "status": "ENABLED"
                    })
                        
                slots_info["available"] = slots_info["total"] - slots_info["used"]
                logger.info(f"[KEYMAN] Slot information parsed - used: {slots_info['used']}, available: {slots_info['available']}")
                return True, "Successfully retrieved key slots", slots_info
            else:
                logger.warning(f"[KEYMAN] No LUKS header detected in luksDump output for device: {device}")
        
        # If we reach here, it's not a LUKS device or there was an error
        if "is not a valid LUKS device" in stderr:
            # Return a specific response for non-LUKS devices
            logger.info(f"[KEYMAN] Device {device} is not a LUKS device")
            return True, "Device is not a LUKS device", {
                "total": 0,
                "used": 0,
                "available": 0,
                "is_luks": False
            }
        
        logger.error(f"[KEYMAN] Failed to get key slots for device {device}: {stderr}")
        return False, f"Failed to get key slots: {stderr}", None
    except Exception as e:
        logger.error(f"[KEYMAN] Error getting key slots for device {device}: {str(e)}")
        return False, f"Error getting key slots: {str(e)}", None

def add_key_to_full_device(device: str, new_password: str, existing_password: str, flexible_option: str, slot: int | None = None) -> tuple[bool, str]:
    """
    Add a key to a device that has all its slots full.
    Uses the specified strategy for slot selection.
    Returns (success, message)
    """
    try:
        logger.info(f"[KEYMAN] Attempting to add key to full device {device} with strategy: {flexible_option}, manual slot: {slot}")
        target_slot: int | None = None

        if flexible_option == 'manual' and slot is not None:
            logger.info(f"[KEYMAN] Manual slot selection: Slot {slot} for device {device}")
            target_slot = slot
        elif flexible_option == 'random':
            logger.info(f"[KEYMAN] Random slot selection for device {device}")
            slots_success, slots_message, slots_info = get_key_slots(device)

            if not slots_success or slots_info is None:
                logger.error(f"[KEYMAN] Failed to get key slots for {device} during random selection: {slots_message}")
                return False, f"Failed to get key slots info: {slots_message}"

            if not slots_info.get('is_luks', False):
                logger.error(f"[KEYMAN] Device {device} is not a LUKS device according to get_key_slots.")
                return False, "Device is not a LUKS device, cannot select random slot."

            enabled_non_zero_slots = [
                s['slot'] for s in slots_info.get('slot_status', [])
                if s.get('status') == 'ENABLED' and s.get('slot') != 0
            ]

            if not enabled_non_zero_slots:
                logger.error(f"[KEYMAN] No non-zero ENABLED slots found to replace for device {device} with random strategy. Slot status: {slots_info.get('slot_status')}")
                return False, "No available slots (1-31) to replace for random selection. All eligible slots might be disabled or only slot 0 is active."
            
            target_slot = random.choice(enabled_non_zero_slots)
            logger.info(f"[KEYMAN] Randomly selected slot {target_slot} for replacement on {device}")
        else:
            logger.error(f"[KEYMAN] Invalid flexible_option '{flexible_option}' for device {device}")
            return False, f"Invalid flexible option: {flexible_option}"

        if target_slot is None: # Should not happen if logic above is correct, but as a safeguard
            logger.error(f"[KEYMAN] Target slot could not be determined for device {device} with option {flexible_option}")
            return False, "Could not determine target slot for key replacement."
            
        logger.info(f"[KEYMAN] Proceeding to replace key in target_slot: {target_slot} for device: {device}")
        return replace_device_key(device, target_slot, new_password, existing_password)
    except Exception as e:
        logger.error(f"[KEYMAN] Exception in add_key_to_full_device for {device}: {str(e)}", exc_info=True)
        return False, f"Error adding key to full device: {str(e)}"

def is_key_available(device: str, password: str) -> tuple[bool, str]:
    """
    Verify if a key is available for a LUKS device.
    Returns (success, message)
    """
    try:
        # First, make sure this is a LUKS device by trying to dump header
        cmd_success, stdout, stderr = execute_command(["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksDump", device])
        if not cmd_success:
            return False, f"Not a valid LUKS device: {stderr}"
            
        # Use cryptsetup to test the passphrase
        test_cmd = ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "open", "--test-passphrase", device]
        success, stdout, stderr = execute_command(test_cmd, input_data=password)
        
        if success:
            return True, "Key verified successfully"
        else:
            return False, "Invalid key for this device"
    except Exception as e:
        return False, f"Error verifying key: {str(e)}"
