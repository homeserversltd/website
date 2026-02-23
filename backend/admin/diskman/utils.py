import os
import subprocess
import json
from flask import current_app, jsonify
from backend.utils.utils import execute_command, error_response, success_response, get_config, write_to_log, resolve_device_identifier, get_partlabel
from backend.monitors.disk import DiskMonitor

def is_partition_of_disk(partition_path: str, disk_path: str) -> bool:
    """
    Return True if partition_path is a partition on the disk disk_path
    (e.g. /dev/sdc1 on /dev/sdc, /dev/nvme0n1p1 on /dev/nvme0n1).
    """
    if not partition_path or not disk_path:
        return False
    disk_base = os.path.basename(disk_path.rstrip("/"))
    part_base = os.path.basename(partition_path.rstrip("/"))
    if part_base == disk_base:
        return False
    return part_base.startswith(disk_base)


def format_device_path(device):
    """
    Ensure device name is properly formatted by adding /dev/ prefix if needed.

    Args:
        device (str): Device name or path

    Returns:
        tuple: (formatted_device_path, device_name)
    """
    resolved = resolve_device_identifier(device)
    device_path = resolved
    device_name = os.path.basename(resolved)

    return device_path, device_name

def format_partition_path(partition):
    """
    Ensure partition name is properly formatted by adding /dev/ prefix if needed.
    
    Args:
        partition (str): Partition name or path
        
    Returns:
        tuple: (formatted_partition_path, partition_name)
    """
    if not partition.startswith('/dev/'):
        partition_path = f"/dev/{partition}"
        partition_name = partition
    else:
        partition_path = partition
        partition_name = partition.split('/')[-1]
    
    return partition_path, partition_name

def get_disk_info():
    """
    Get disk information using DiskMonitor.
    
    Returns:
        dict: Disk information
    """
    disk_monitor = DiskMonitor()
    return disk_monitor.check_disks()

def export_nas_key():
    """
    Export NAS key password from the vault using exportNAS.sh script.
    Runs via sudo with full paths; script is invoked through bash so it works
    when www-data cannot stat /vault (0700) or when the script is not +x.
    
    Returns:
        tuple: (success, password, error_message)
    """
    current_app.logger.info("[DISKMAN] Exporting NAS key")
    success, stdout, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/bin/bash", "/vault/scripts/exportNAS.sh"]
    )
    
    current_app.logger.info(f"[DISKMAN] Export key command result - success: {success}")
    
    if not success:
        # Check if this is the initialization error
        if "ERROR: Key system not initialized" in stdout or "ERROR: Key system not initialized" in stderr:
            current_app.logger.error("[DISKMAN] Key system not initialized. Administrator needs to run keystartup.sh manually.")
            return False, "", "Key system not initialized. Please contact your system administrator to initialize the key system."
        
        # Any other error
        current_app.logger.error(f"[DISKMAN] Failed to export NAS key: {stderr or stdout}")
        return False, "", f"Failed to export NAS key: {stderr or stdout}"
    
    # The script outputs the password directly
    password = stdout.strip()
    
    if not password:
        current_app.logger.error("[DISKMAN] Failed to get password from script output")
        return False, "", "Failed to get password from script output"
    
    return True, password, ""

def generate_mapper_name(partition_name_or_path):
    """
    Generate a LUKS mapper name based on partition name or path.

    Args:
        partition_name_or_path (str): Partition name or path

    Returns:
        str: Mapper name in the format <partition_name>_crypt or <partlabel>_crypt
    """
    if '/' in partition_name_or_path:
        partlabel = get_partlabel(partition_name_or_path)
        if partlabel:
            return f"{partlabel}_crypt"
        else:
            return f"{os.path.basename(partition_name_or_path)}_crypt"
    else:
        return f"{partition_name_or_path}_crypt"

def verify_mapper_exists(mapper_name):
    """
    Verify that a mapper device exists.
    
    Args:
        mapper_name (str): Mapper name
        
    Returns:
        bool: True if mapper exists, False otherwise
    """
    mapper_path = f"/dev/mapper/{mapper_name}"
    return os.path.exists(mapper_path)

def check_mount_point_usage(mount_point):
    """
    Check if a mount point is already in use.
    
    Args:
        mount_point (str): Mount point path
        
    Returns:
        bool: True if mount point is in use, False otherwise
    """
    success, _, _ = execute_command(
        ["/usr/bin/sudo", "/usr/bin/findmnt", "-n", mount_point]
    )
    return success

def ensure_mount_point_exists(mount_point):
    """
    Ensure that a mount point directory exists, creating it if necessary.
    
    Args:
        mount_point (str): Mount point path
        
    Returns:
        tuple: (success, error_message)
    """
    if not os.path.exists(mount_point):
        try:
            current_app.logger.info(f"[DISKMAN] Creating mount point directory: {mount_point}")
            # Use sudo to create mount point directories
            success, stdout, stderr = execute_command(["/usr/bin/sudo", "/usr/bin/mkdir", "-p", mount_point])
            if not success:
                current_app.logger.error(f"[DISKMAN] Failed to create mount point directory: {stderr}")
                return False, stderr
            return True, ""
        except Exception as e:
            current_app.logger.error(f"[DISKMAN] Failed to create mount point directory: {str(e)}")
            return False, str(e)
    elif os.path.ismount(mount_point):
        # Directory exists and is already a mount point - this is fine
        current_app.logger.info(f"[DISKMAN] Mount point {mount_point} already exists and is mounted")
        return True, ""
    else:
        # Directory exists but is not mounted - this is also fine
        current_app.logger.info(f"[DISKMAN] Mount point directory {mount_point} already exists")
        return True, ""

def unlock_luks_device(partition_path, mapper_name, password):
    """
    Unlock a LUKS encrypted device.
    
    Args:
        partition_path (str): Path to the encrypted partition
        mapper_name (str): Mapper name to use
        password (str): Password for the LUKS device
        
    Returns:
        tuple: (success, error_message)
    """
    current_app.logger.info(f"[DISKMAN] Opening LUKS container {partition_path} as {mapper_name}")
    success, stdout, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "open", partition_path, mapper_name],
        input_data=f"{password}\n"
    )
    
    current_app.logger.info(f"[DISKMAN] Open LUKS container result - success: {success}")
    
    if not success:
        current_app.logger.error(f"[DISKMAN] Failed to unlock encrypted partition: {stderr}")
        return False, stderr
    
    # Check if the mapper device exists
    mapper_path = f"/dev/mapper/{mapper_name}"
    if not os.path.exists(mapper_path):
        current_app.logger.error(f"[DISKMAN] Failed to create mapper device {mapper_path}")
        return False, f"Failed to create mapper device {mapper_path}"
    
    return True, ""

def encrypt_luks_device(device_path, passphrase):
    """
    Encrypt a device with LUKS.
    
    Args:
        device_path (str): Path to the device to encrypt
        passphrase (str): Passphrase to use for encryption
        
    Returns:
        tuple: (success, error_message)
    """
    current_app.logger.info(f"[DISKMAN] Encrypting device {device_path} with LUKS2")
    success, _, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksFormat", "--type", "luks2", device_path, "-q", "--batch-mode"],
        input_data=passphrase
    )
    
    if not success:
        current_app.logger.error(f"[DISKMAN] Failed to encrypt device: {stderr}")
        return False, f"Failed to encrypt device: {stderr}"
    
    current_app.logger.info(f"[DISKMAN] Successfully encrypted device {device_path}")
    return True, ""

def open_luks_device(device_path, mapper_name, passphrase):
    """
    Open a LUKS encrypted device.
    
    Args:
        device_path (str): Path to the encrypted device
        mapper_name (str): Mapper name to use
        passphrase (str): Passphrase for the LUKS device
        
    Returns:
        tuple: (success, error_message)
    """
    success, _, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "open", device_path, mapper_name],
        input_data=f"{passphrase}\n"
    )
    
    if not success:
        return False, f"Failed to open encrypted device: {stderr}"
    
    return True, ""

def close_luks_device(mapper_name, device_path=None):
    """
    Close a LUKS encrypted device using unmountDrive.sh for proper systemd service handling.
    
    Args:
        mapper_name (str): Mapper name to close
        device_path (str, optional): Path to the encrypted device. If not provided,
                                   will attempt to find it from the mapper name.
        
    Returns:
        tuple: (success, error_message)
            - success (bool): True if closure was successful, False otherwise
            - error_message (str): Error message if closure failed, empty string if successful
    """
    current_app.logger.info(f"[DISKMAN] Starting LUKS container closure for {mapper_name}")
    
    try:
        # If device_path not provided, try to resolve it from the symlink
        if not device_path:
            mapper_path = f"/dev/mapper/{mapper_name}"
            if os.path.exists(mapper_path):
                # Try to resolve the symlink to the underlying device
                real_path = os.path.realpath(mapper_path)
                if real_path.startswith("/dev/"):
                    device_path = real_path
                    current_app.logger.info(f"[DISKMAN] Resolved device path {device_path} from mapper {mapper_name}")
            if not device_path:
                error_msg = "Cannot derive device path from mapper name. Please provide device_path."
                current_app.logger.error(f"[DISKMAN] {error_msg}")
                return False, error_msg

        # Discover actual mount point for the mapper so closeNAS.sh unmounts the right path (avoids "mapper still exists" when /dummy was used)
        mapper_path = f"/dev/mapper/{mapper_name}"
        mount_point = "/dummy"
        if os.path.exists(mapper_path):
            mnt_ok, mnt_out, _ = execute_command(
                ["/usr/bin/sudo", "/usr/bin/findmnt", "-n", "-o", "TARGET", mapper_path]
            )
            if mnt_ok and mnt_out and mnt_out.strip():
                mount_point = mnt_out.strip()
                current_app.logger.info(f"[DISKMAN] Resolved mount point for {mapper_name}: {mount_point}")

        # Call unmountDrive.sh via bash (full path) so it works when www-data cannot access /vault
        success, stdout, stderr = execute_command(
            ["/usr/bin/sudo", "/usr/bin/bash", "/vault/scripts/unmountDrive.sh", device_path, mount_point, mapper_name]
        )
        mapper_path = f"/dev/mapper/{mapper_name}"

        # If script failed or mapper still exists (timing/race), unmount then cryptsetup close as fallback
        if not success or os.path.exists(mapper_path):
            if os.path.exists(mapper_path):
                current_app.logger.info(f"[DISKMAN] Mapper still exists after unmountDrive.sh; unmounting and closing for {mapper_name}")
                # Try to unmount wherever the mapper is mounted so cryptsetup close can succeed
                mnt_ok, mnt_out, _ = execute_command(
                    ["/usr/bin/sudo", "/usr/bin/findmnt", "-n", "-o", "TARGET", mapper_path]
                )
                if mnt_ok and mnt_out and mnt_out.strip():
                    umount_pt = mnt_out.strip()
                    execute_command(["/usr/bin/sudo", "/usr/bin/umount", "-f", umount_pt])
                    execute_command(["/usr/bin/sudo", "/usr/bin/umount", "-l", umount_pt])
                close_ok, _, close_stderr = execute_command(
                    ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "close", mapper_name]
                )
            else:
                close_ok = True
            if close_ok and not os.path.exists(mapper_path):
                current_app.logger.info(f"[DISKMAN] Successfully closed {mapper_name} via fallback")
                return True, ""
            if os.path.exists(mapper_path):
                close_ok, _, _ = execute_command(
                    ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "close", mapper_name]
                )
                if close_ok and not os.path.exists(mapper_path):
                    current_app.logger.info(f"[DISKMAN] Successfully closed {mapper_name} via second close attempt")
                    return True, ""
            if not success and not close_ok:
                error_msg = f"Failed to close LUKS container: {stderr or stdout}"
                current_app.logger.error(f"[DISKMAN] {error_msg}")
                return False, error_msg
            if os.path.exists(mapper_path):
                error_msg = f"LUKS container closure failed: Mapper {mapper_name} still exists after unmountDrive.sh and cryptsetup close"
                current_app.logger.error(f"[DISKMAN] {error_msg}")
                return False, error_msg

        current_app.logger.info(f"[DISKMAN] Successfully closed {mapper_name}")
        return True, ""
            
    except Exception as e:
        error_msg = f"Error during LUKS container closure: {str(e)}"
        current_app.logger.error(f"[DISKMAN] {error_msg}")
        return False, error_msg

def format_xfs(mapper_path):
    """
    Format a device with XFS.
    
    Args:
        mapper_path (str): Path to the device to format
        
    Returns:
        tuple: (success, error_message)
    """
    success, _, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/mkfs.xfs", mapper_path]
    )
    
    if not success:
        return False, f"Failed to format device: {stderr}"
    
    return True, ""

def mount_device(device_path, mount_point):
    """
    Mount a device to a mount point.
    
    Args:
        device_path (str): Path to the device to mount
        mount_point (str): Mount point to use
        
    Returns:
        tuple: (success, error_message)
    """
    success, _, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/bin/mount", device_path, mount_point]
    )
    
    if not success:
        return False, f"Failed to mount device: {stderr}"
    
    return True, ""

def execute_mount_script(mount_device, mountpoint, mapper=None, operation="mount"):
    """
    Execute the mountDrive.sh script for mounting or unmounting a device.
    
    Args:
        mount_device (str): Device to mount
        mountpoint (str): Mount point to use
        mapper (str, optional): Mapper name for encrypted devices
        operation (str): "mount" or "unmount"
        
    Returns:
        tuple: (success, output, error_message)
    """
    cmd = ["/usr/bin/sudo", "/usr/bin/bash", "/vault/scripts/mountDrive.sh", operation, mount_device, mountpoint]
    if mapper:
        cmd.append(mapper)
        
    command_str = ' '.join(cmd)
    current_app.logger.info(f"[DISKMAN] Executing command: {command_str}")
    write_to_log('admin', f'mountDrive {operation} started: {command_str}', 'info')
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False  # Don't raise exception on non-zero return code
        )
        
        # Capture and log output
        all_output = []
        
        # Process stdout
        for line in result.stdout.splitlines():
            if line.strip():
                all_output.append(line.strip())
                current_app.logger.info(line.strip())
                
        # Process stderr
        for line in result.stderr.splitlines():
            if line.strip():
                all_output.append(line.strip())
                current_app.logger.error(line.strip())
                
        if result.returncode == 0:
            write_to_log('admin', f'mountDrive {operation} success for {mount_device} -> {mountpoint}', 'info')
            return True, all_output, ""
        else:
            # Join all output lines for the error message
            error_msg = "\n".join(all_output) if all_output else "Unknown error occurred"
            current_app.logger.error(f"[DISKMAN] {operation.capitalize()} operation failed: {error_msg}")
            # Limit the amount of log noise to last 20 lines
            summary_lines = all_output[-20:] if len(all_output) > 20 else all_output
            write_to_log('admin', f'mountDrive {operation} failed for {mount_device} -> {mountpoint}: {error_msg}', 'error')
            if summary_lines:
                write_to_log('admin', f'mountDrive {operation} output tail ({len(summary_lines)} lines): {" | ".join(summary_lines)}', 'error')
            return False, all_output, error_msg
            
    except Exception as script_error:
        current_app.logger.error(f"[DISKMAN] Error executing mountDrive.sh: {str(script_error)}")
        write_to_log('admin', f'mountDrive {operation} raised exception for {mount_device} -> {mountpoint}: {script_error}', 'error')
        return False, [], str(script_error)

def find_target_device_in_block_devices(device_name, block_devices):
    """
    Find a target device in block devices list, checking if it's a top-level device or a partition.
    
    Args:
        device_name (str): Device name to find
        block_devices (list): List of block devices
        
    Returns:
        tuple: (target_device, is_partition, partition_device)
    """
    target_device = next((d for d in block_devices if d.get("name") == device_name), None)
    is_partition = False
    partition_device = None
    
    # If device not found as top-level, check if it's a partition
    if not target_device:
        current_app.logger.info(f"[DISKMAN] Device {device_name} not found as top-level device, checking if it's a partition")
        
        # Search for the device as a partition of any top-level device
        for parent_device in block_devices:
            if parent_device.get("children"):
                partition = next((p for p in parent_device.get("children") if p.get("name") == device_name), None)
                if partition:
                    current_app.logger.info(f"[DISKMAN] Found {device_name} as a partition of {parent_device.get('name')}")
                    target_device = parent_device
                    is_partition = True
                    partition_device = partition
                    break
    
    return target_device, is_partition, partition_device

def get_filesystem_type(mount_point):
    """
    Get the filesystem type of a mounted device.
    
    Args:
        mount_point (str): Mount point to check
        
    Returns:
        str: Filesystem type or "unknown"
    """
    success, stdout, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/bin/findmnt", "-n", "-o", "FSTYPE", mount_point]
    )
    
    return stdout.strip() if success else "unknown"

def get_service_type(service_name):
    """
    Determine if a service is script-managed or systemd-managed.
    
    Args:
        service_name (str): Name of the service to check
        
    Returns:
        tuple: (service_type, systemd_name)
            - service_type: 'script' or 'systemd'
            - systemd_name: The systemd service name if applicable
    """
    try:
        # Import here to avoid circular imports
        from backend.portals.utils import get_service_mappings
        
        # Get service mappings
        service_map = get_service_mappings()
        
        # Get the portals configuration
        config = get_config()
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        
        # Find if this service is defined in any portal
        service_config = None
        for portal in portals:
            if service_name in portal.get('services', []):
                service_config = portal
                break
        
        # If service is found in a portal definition, check its type
        if service_config:
            service_type = service_config.get('type', 'systemd')
            
            # If it's a script-managed service, return that
            if service_type.lower() == 'script':
                return 'script', None
        
        # For systemd services, get the normalized name
        normalized_service = service_name.lower().replace(' ', '').replace('-', '')
        systemd_service = service_map.get(normalized_service, normalized_service)
        if not systemd_service.endswith('.service'):
            systemd_service = f"{systemd_service}.service"
        
        return 'systemd', systemd_service
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error determining service type for {service_name}: {str(e)}")
        # Default to systemd if we can't determine
        return 'systemd', f"{service_name}.service"

def verify_mount(mount_point):
    """
    Verify if a mount point is mounted.
    
    Args:
        mount_point (str): Mount point to check
        
    Returns:
        bool: True if mounted, False otherwise
    """
    success, _, _ = execute_command(
        ["/usr/bin/sudo", "/usr/bin/findmnt", "-n", mount_point]
    )
    
    return success


def get_mount_point_for_device(device_path):
    """
    Return the current mount point for a block device or any of its partitions, if mounted.

    Args:
        device_path (str): Block device path (e.g. /dev/sdc, /dev/nvme0n1)

    Returns:
        str or None: Mount point path if the device (or a partition of it) is mounted, else None
    """
    if not device_path or not device_path.startswith("/dev/"):
        return None
    # Exact source first
    success, stdout, _ = execute_command(
        ["/usr/bin/sudo", "/usr/bin/findmnt", "-S", device_path, "-n", "-o", "TARGET"]
    )
    if success and stdout and stdout.strip():
        return stdout.strip()
    # Enumerate all mounts and find device or partition of same disk
    success, stdout, _ = execute_command(
        ["/usr/bin/sudo", "/usr/bin/findmnt", "-n", "-o", "SOURCE,TARGET"]
    )
    if not success or not stdout:
        return None
    base = device_path.rstrip("/")
    disk_base = os.path.basename(base)
    for line in stdout.strip().splitlines():
        parts = line.split(None, 1)
        if len(parts) < 2:
            continue
        source, target = parts[0], parts[1]
        if source == device_path or source == base:
            return target
        # Partition of same disk: /dev/sdc1 for /dev/sdc, /dev/nvme0n1p1 for /dev/nvme0n1
        if source.startswith(base) and len(source) > len(base):
            suffix = source[len(base):]
            if suffix.isdigit() or (suffix.startswith("p") and suffix[1:].isdigit()):
                return target
        # LUKS mapper: /dev/mapper/sdc1_crypt belongs to /dev/sdc; mapper name is <disk><part>_crypt
        if source.startswith("/dev/mapper/"):
            mapper_name = os.path.basename(source)
            if mapper_name.endswith("_crypt"):
                rest = mapper_name[:-6]
                if rest.startswith(disk_base) and len(rest) > len(disk_base):
                    suffix = rest[len(disk_base):]
                    if suffix.isdigit() or (suffix.startswith("p") and suffix[1:].isdigit()):
                        return target
    return None


def wipe_device(device_path):
    """
    Wipe a device using wipefs.
    
    Args:
        device_path (str): Path to the device to wipe
        
    Returns:
        tuple: (success, error_message)
    """
    success, stdout, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/wipefs", "-a", device_path]
    )
    
    if not success:
        error_msg = stderr if stderr else stdout
        return False, f"Failed to wipe device: {error_msg}"
    
    return True, ""


def create_gpt_one_partition(disk_path):
    """
    Create a new GPT on the disk and add one partition (type Linux filesystem, rest of disk).
    Call udevadm trigger so the new partition node appears.
    
    Args:
        disk_path (str): Whole-disk path, e.g. /dev/sdb or /dev/nvme0n1
        
    Returns:
        tuple: (success, error_message)
    """
    success, _, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/sgdisk", "-o", disk_path]
    )
    if not success:
        return False, f"Failed to create GPT: {stderr or 'Unknown error'}"
    success, _, stderr = execute_command(
        ["/usr/bin/sudo", "/usr/sbin/sgdisk", "-n", "1:0:0", "-t", "1:8300", disk_path]
    )
    if not success:
        return False, f"Failed to create partition: {stderr or 'Unknown error'}"
    execute_command(
        ["/usr/bin/sudo", "/usr/bin/udevadm", "trigger", "--subsystem-match=block", "--action=change"]
    )
    return True, ""

def get_nas_config(section=None):
    """
    Get NAS-related configuration from the global config.
    
    Args:
        section (str, optional): Specific section of NAS config to retrieve
                                 (e.g., 'permissions', 'mounts')
    
    Returns:
        dict: NAS configuration or specific section if requested
    """
    try:
        config = get_config()
        if not config:
            current_app.logger.error("[DISKMAN] Failed to load configuration")
            return {}
            
        # Get global section
        global_config = config.get('global', {})
        
        # Get NAS-specific sections
        nas_mounts = global_config.get('mounts', {})
        nas_permissions = global_config.get('permissions', {}).get('nas', {})
        
        # Combine relevant NAS-related config
        nas_config = {
            'mounts': nas_mounts,
            'permissions': nas_permissions
        }
        
        # Return specific section if requested
        if section and section in nas_config:
            return nas_config[section]
            
        return nas_config
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error retrieving NAS configuration: {str(e)}")
        return {}

def apply_path_permissions(path, user, group, permissions_mode, recursive=False, 
                          included_users=None, included_groups=None, include_included_permissions=False):
    """
    Apply permissions to a path.
    
    Args:
        path (str): Path to apply permissions to
        user (str): Owner user
        group (str): Owner group
        permissions_mode (str): Permission mode (e.g., "755")
        recursive (bool): Whether to apply recursively
        included_users (list): Not used - kept for backward compatibility
        included_groups (list): Not used - kept for backward compatibility
        include_included_permissions (bool): Not used - kept for backward compatibility
        
    Returns:
        dict: Results of the operations
    """
    path_result = {
        "path": path,
        "operations": [],
        "status": "pending"  # Initialize status
    }
    
    try:
        # Ensure path exists (mkdir -p)
        current_app.logger.info(f"[PERM] Ensuring directory exists: {path}")
        success, stdout, stderr = execute_command(
            ["/usr/bin/sudo", "/usr/bin/mkdir", "-p", path]
        )
        
        if not success:
            path_result["status"] = "error"
            path_result["message"] = f"Failed to create directory: {stderr}"
            current_app.logger.error(f"[PERM] Failed to create directory {path}: {stderr}")
            return path_result
            
        path_result["operations"].append({
            "operation": "mkdir",
            "status": "success"
        })
        
        # Apply ownership (chown)
        chown_cmd = ["/usr/bin/sudo", "/usr/bin/chown"]
        if recursive:
            chown_cmd.append("-R")
            
        # Set owner and group
        chown_cmd.append(f"{user}:{group}")
        chown_cmd.append(path)
        
        current_app.logger.info(f"[PERM] Applying ownership: {' '.join(chown_cmd)}")
        success, stdout, stderr = execute_command(chown_cmd)
        
        if not success:
            path_result["status"] = "error"
            path_result["message"] = f"Failed to set ownership: {stderr}"
            current_app.logger.error(f"[PERM] Failed to set ownership for {path}: {stderr}")
            return path_result
            
        path_result["operations"].append({
            "operation": "chown",
            "user": user,
            "group": group,
            "status": "success"
        })
        
        # Apply permissions (chmod)
        chmod_cmd = ["/usr/bin/sudo", "/usr/bin/chmod"]
        if recursive:
            chmod_cmd.append("-R")
            
        chmod_cmd.append(permissions_mode)
        chmod_cmd.append(path)
        
        current_app.logger.info(f"[PERM] Applying permissions: {' '.join(chmod_cmd)}")
        success, stdout, stderr = execute_command(chmod_cmd)
        
        if not success:
            path_result["status"] = "error"
            path_result["message"] = f"Failed to set permissions: {stderr}"
            current_app.logger.error(f"[PERM] Failed to set permissions for {path}: {stderr}")
            return path_result
            
        path_result["operations"].append({
            "operation": "chmod",
            "mode": permissions_mode,
            "status": "success"
        })
        
        # Explicitly ensure group write permissions are set
        # This is crucial for services like Piwigo where the admin user needs write access
        current_app.logger.info(f"[PERM] Explicitly ensuring group write permissions: chmod g+w {path}")
        success, stdout, stderr = execute_command(
            ["/usr/bin/sudo", "/usr/bin/chmod", "g+w", path]
        )
        
        if not success:
            path_result["status"] = "error"
            path_result["message"] = f"Failed to set group write permissions: {stderr}"
            current_app.logger.error(f"[PERM] Failed to set group write permissions for {path}: {stderr}")
            return path_result
            
        path_result["operations"].append({
            "operation": "chmod_group_write",
            "status": "success"
        })
        
        # Verify the permissions were actually set
        current_app.logger.info(f"[PERM] Verifying permissions for {path}")
        verify_cmd = ["/usr/bin/sudo", "/usr/bin/stat", "-c", "%U:%G %a", path]
        success, stdout, stderr = execute_command(verify_cmd)
        
        if not success:
            path_result["status"] = "error"
            path_result["message"] = "Failed to verify permissions"
            current_app.logger.error(f"[PERM] Failed to verify permissions for {path}: {stderr}")
            return path_result
            
        actual_owner, actual_perms = stdout.strip().split()
        expected_owner = f"{user}:{group}"
        current_app.logger.info(f"[PERM] Verification result for {path}: {actual_owner} {actual_perms}")
        
        if actual_owner != expected_owner:
            path_result["status"] = "error"
            path_result["message"] = f"Ownership verification failed. Expected {expected_owner}, got {actual_owner}"
            current_app.logger.error(f"[PERM] Ownership verification failed for {path}: Expected {expected_owner}, got {actual_owner}")
            return path_result
        
        # Check if group write permission is set (second digit should be >= 6 for group write)
        group_perms = int(actual_perms[1]) if len(actual_perms) >= 2 else 0
        if group_perms < 6:
            current_app.logger.warning(f"[PERM] Group write permission may not be set for {path}: permissions {actual_perms}")
        
        # If we get here, all operations succeeded
        path_result["status"] = "success"
        current_app.logger.info(f"[PERM] Successfully applied all permissions to {path}")
        return path_result
        
    except Exception as e:
        current_app.logger.error(f"[PERM] Error processing path {path}: {str(e)}")
        path_result["status"] = "error"
        path_result["message"] = str(e)
        return path_result

def create_new_nas_key(password):
    """
    Create a new NAS encryption key using the keyman suite.
    
    Args:
        password (str): New password for NAS encryption
        
    Returns:
        tuple: (success, all_output, error_message)
    """
    current_app.logger.info("[DISKMAN] Creating new NAS key")
    
    # Use the keyman newkey.sh script with 'nas' type and the provided password
    cmd = ["/usr/bin/sudo", "/vault/keyman/newkey.sh", "nas", password]
    
    current_app.logger.info(f"[DISKMAN] Executing command: {' '.join(cmd)}")
    
    try:
        # Execute the command
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False  # Don't raise exception on non-zero return code
        )
        
        # Capture and log output
        all_output = []
        
        # Process stdout
        for line in result.stdout.splitlines():
            if line.strip():
                all_output.append(line.strip())
                current_app.logger.info(f"[DISKMAN] {line.strip()}")
                
        # Process stderr
        for line in result.stderr.splitlines():
            if line.strip():
                all_output.append(line.strip())
                current_app.logger.error(f"[DISKMAN] {line.strip()}")
                
        if result.returncode == 0:
            return True, all_output, ""
        else:
            # Join all output lines for the error message
            error_msg = "\n".join(all_output) if all_output else "Unknown error occurred"
            current_app.logger.error(f"[DISKMAN] Key creation failed: {error_msg}")
            return False, all_output, error_msg
            
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error executing key creation: {str(e)}")
        return False, [], str(e)

def get_block_devices():
    """
    Get information about block devices on the system using lsblk command.
    Leverages the existing DiskMonitor functionality with proper sudo permissions.
    
    Returns:
        dict: Block devices information
    """
    try:
        current_app.logger.info("[DISKMAN] Getting block devices information")
        
        # Use the existing DiskMonitor class which already handles permissions correctly
        disk_monitor = DiskMonitor()
        disk_info = disk_monitor.check_disks()
        
        # Extract just the block devices portion from the complete disk info
        if "blockDevices" in disk_info and "blockdevices" in disk_info["blockDevices"]:
            return disk_info["blockDevices"]
        
        # Return empty result if we couldn't get block devices
        current_app.logger.warning("[DISKMAN] No block devices found in disk info")
        return {"blockdevices": []}
            
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error getting block devices: {str(e)}")
        return {"blockdevices": []}


def read_crontab(user='www-data'):
    """
    Read the crontab for a specific user.
    
    Args:
        user (str): The user whose crontab to read
        
    Returns:
        list: A list of crontab entries (strings)
    """
    try:
        # Use sudo if we're reading root's crontab
        if user == 'root':
            result = subprocess.run(
                ['/usr/bin/sudo', '/usr/bin/crontab', '-l', '-u', 'root'],
                capture_output=True,
                text=True,
                check=False
            )
        else:
            result = subprocess.run(
                ['/usr/bin/crontab', '-l'],
                capture_output=True,
                text=True,
                check=False
            )
        
        # If the command returned no errors and there is output
        if result.returncode == 0 and result.stdout:
            entries = result.stdout.strip().split('\n')
            # Filter out empty lines and comments
            return [entry for entry in entries if entry and not entry.startswith('#')]
        
        # If no crontab found or empty, return empty list
        if result.stderr and "no crontab for" in result.stderr:
            return []
        
        # If there's an error, log it and return empty list
        if result.returncode != 0:
            current_app.logger.error(f"Error reading crontab for {user}: {result.stderr}")
            return []
        
        return []
    
    except Exception as e:
        current_app.logger.error(f"Exception reading crontab for {user}: {str(e)}")
        return []

def write_crontab(entries, user='www-data'):
    """
    Write entries to a user's crontab.
    
    Args:
        entries (list): List of crontab entries (strings)
        user (str): The user whose crontab to write
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Create a temporary file with the crontab entries
        temp_file = '/tmp/homeserver_crontab'
        with open(temp_file, 'w') as f:
            for entry in entries:
                f.write(f"{entry}\n")
        
        # Use sudo if we're writing to root's crontab
        if user == 'root':
            result = subprocess.run(
                ['/usr/bin/sudo', '/usr/bin/crontab', '-u', 'root', temp_file],
                capture_output=True,
                text=True,
                check=False
            )
        else:
            result = subprocess.run(
                ['/usr/bin/crontab', temp_file],
                capture_output=True,
                text=True,
                check=False
            )
        
        # Clean up temporary file
        if os.path.exists(temp_file):
            os.remove(temp_file)
        
        # Check if the command was successful
        if result.returncode == 0:
            current_app.logger.info(f"Successfully updated crontab for {user}")
            return True
        else:
            current_app.logger.error(f"Error updating crontab for {user}: {result.stderr}")
            return False
    
    except Exception as e:
        current_app.logger.error(f"Exception updating crontab for {user}: {str(e)}")
        return False

def get_luks_key_slots(device_path):
    """
    Get information about LUKS key slots for a device.
    Only returns slots that actually have keys (ENABLED status).
    
    Args:
        device_path (str): Path to the LUKS device
        
    Returns:
        tuple: (success, key_slots_info, error_message)
            - success (bool): True if successful, False otherwise
            - key_slots_info (dict): Information about key slots with keys
            - error_message (str): Error message if failed
    """
    try:
        current_app.logger.info(f"[DISKMAN] Getting LUKS key slots for {device_path}")
        
        # Use cryptsetup luksDump to get key slot information
        success, stdout, stderr = execute_command(
            ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "luksDump", device_path]
        )
        
        if not success:
            current_app.logger.error(f"[DISKMAN] Failed to get LUKS key slots: {stderr}")
            return False, {}, f"Failed to get LUKS key slots: {stderr}"
        
        # Parse the output to extract only slots that have keys
        slots_with_keys = []
        lines = stdout.split('\n')
        
        # Look for the Keyslots section
        in_keyslots_section = False
        
        for line in lines:
            line = line.strip()
            
            # Check if we're entering the Keyslots section
            if line == 'Keyslots:':
                in_keyslots_section = True
                continue
            
            # If we're in the keyslots section, look for slot entries
            if in_keyslots_section:
                # Check if this line starts a new section (no leading whitespace and contains colon)
                # But only break if it's not a slot line (which would start with a digit)
                if ':' in line and not line.startswith(' ') and not line.startswith('\t') and not line[0].isdigit():
                    # This might be a new section, stop processing keyslots
                    break
                    
                # Look for lines like "  0: luks2" or "  1: luks2"
                if line and ':' in line and line.strip()[0].isdigit():
                    parts = line.split(':')
                    if len(parts) >= 2:
                        slot_part = parts[0].strip()
                        status_part = parts[1].strip()
                        
                        try:
                            slot_num = int(slot_part)
                            
                            # For LUKS2: if status contains "luks2", it has a key
                            # For LUKS1: if status is "ENABLED", it has a key
                            if status_part == 'luks2' or status_part == 'ENABLED':
                                slots_with_keys.append(slot_num)
                        except ValueError:
                            continue
        
        # Sort the slots for consistent ordering
        slots_with_keys.sort()
        
        result = {
            'slots_with_keys': slots_with_keys,
            'key_count': len(slots_with_keys),
            'total_possible_slots': 32  # LUKS2 supports up to 32 key slots (0-31)
        }
        
        current_app.logger.info(f"[DISKMAN] Found {len(slots_with_keys)} slots with keys: {slots_with_keys}")
        return True, result, ""
        
    except Exception as e:
        current_app.logger.error(f"[DISKMAN] Error getting LUKS key slots: {str(e)}")
        return False, {}, str(e)

def unlock_luks_device_with_slot(partition_path, mapper_name, password, key_slot=None):
    """
    Unlock a LUKS encrypted device with a specific key slot.
    
    Args:
        partition_path (str): Path to the encrypted partition
        mapper_name (str): Mapper name to use
        password (str): Password for the LUKS device
        key_slot (int, optional): Specific key slot to try (0-7). If None, tries all slots.
        
    Returns:
        tuple: (success, used_slot, error_message)
            - success (bool): True if unlock was successful
            - used_slot (int): The key slot that successfully unlocked the device
            - error_message (str): Error message if unlock failed
    """
    current_app.logger.info(f"[DISKMAN] Unlocking {partition_path} with mapper {mapper_name}, key slot: {key_slot}")
    
    # Use cryptsetup open with specific key slot if provided
    if key_slot is not None:
        success, stdout, stderr = execute_command(
            ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "open", "--key-slot", str(key_slot), partition_path, mapper_name],
            input_data=f"{password}\n"
        )
    else:
        # Try without specifying key slot (default behavior)
        success, stdout, stderr = execute_command(
            ["/usr/bin/sudo", "/usr/sbin/cryptsetup", "open", partition_path, mapper_name],
            input_data=f"{password}\n"
        )
    
    current_app.logger.info(f"[DISKMAN] Open LUKS container result - success: {success}, slot: {key_slot}")
    
    if not success:
        current_app.logger.error(f"[DISKMAN] Failed to unlock encrypted partition with slot {key_slot}: {stderr}")
        return False, key_slot, stderr
    
    # Check if the mapper device exists
    mapper_path = f"/dev/mapper/{mapper_name}"
    if not os.path.exists(mapper_path):
        current_app.logger.error(f"[DISKMAN] Failed to create mapper device {mapper_path}")
        return False, key_slot, f"Failed to create mapper device {mapper_path}"
    
    return True, key_slot, ""

def unlock_luks_device_smart(partition_path, mapper_name, password, slots_with_keys):
    """
    Smart unlock of a LUKS encrypted device by trying only slots that have keys.
    
    Args:
        partition_path (str): Path to the encrypted partition
        mapper_name (str): Mapper name to use
        password (str): Password to try
        slots_with_keys (list): List of key slots that actually have keys (e.g., [0, 2, 5])
        
    Returns:
        tuple: (success, used_slot, error_message)
            - success (bool): True if unlock was successful
            - used_slot (int): The key slot that successfully unlocked the device
            - error_message (str): Error message if all slots failed
    """
    current_app.logger.info(f"[DISKMAN] Smart unlock for {partition_path} with password, trying {len(slots_with_keys)} slots: {slots_with_keys}")
    
    last_error = ""
    
    for slot in slots_with_keys:
        current_app.logger.info(f"[DISKMAN] Trying key slot {slot} for {partition_path}")
        
        success, used_slot, error_message = unlock_luks_device_with_slot(partition_path, mapper_name, password, slot)
        
        if success:
            current_app.logger.info(f"[DISKMAN] Successfully unlocked with key slot {used_slot}")
            return True, used_slot, ""
        else:
            current_app.logger.warning(f"[DISKMAN] Key slot {slot} failed: {error_message}")
            last_error = error_message
    
    # All slots failed
    current_app.logger.error(f"[DISKMAN] All {len(slots_with_keys)} key slots failed to unlock {partition_path}")
    return False, -1, f"All key slots failed. Last error: {last_error}"

def error_response(message, status_code=400, details=None, needs_manual_password=False):
    """
    Generate an error response with consistent format.
    
    Args:
        message (str): Error message
        status_code (int): HTTP status code
        details (dict): Optional details about the error
        needs_manual_password (bool): Whether manual password entry is needed
        
    Returns:
        flask.Response: JSON response with error details
    """
    response = {
        "status": "error",
        "message": message
    }
    
    if details:
        response["details"] = details
        
    if needs_manual_password:
        response["needs_manual_password"] = True
        
    return jsonify(response), status_code 