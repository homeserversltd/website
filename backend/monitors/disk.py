"""Disk monitoring functionality for admin users."""
import time
import subprocess
import json
from typing import Dict, Any, List
from flask import current_app
from backend.utils.utils import get_cached_global_mounts, should_filter_mount

class DiskMonitor:
    """
    Monitor disk information using lsblk and df commands.
    Admin-only monitor that provides detailed disk information.
    """
    
    def __init__(self, check_interval: int = 30):
        self.check_interval = check_interval
        
    def _execute_command(self, command: str) -> str:
        """
        Execute a shell command and return its output.
        
        Args:
            command: Command to execute
            
        Returns:
            str: Command output
        """
        try:
            process = subprocess.Popen(
                command, 
                shell=True, 
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            stdout, stderr = process.communicate()
            
            if process.returncode != 0:
                current_app.logger.error(f"Command '{command}' failed: {stderr}")
                return f"Error executing '{command}': {stderr}"
                
            return stdout.strip()
            
        except Exception as e:
            current_app.logger.error(f"Error executing command '{command}': {str(e)}")
            return f"Error: {str(e)}"
    
    def get_lsblk_output(self) -> str:
        """
        Get formatted output from lsblk showing block devices.
        
        Returns:
            str: Formatted lsblk output
        """
        # Get the standard lsblk JSON output
        output = self._execute_command("/usr/bin/sudo /usr/bin/lsblk -a -J")
        
        # Log the raw output for debugging
        # current_app.logger.debug(f"[DISK] Raw lsblk output: {output[:200]}...")  # Truncate to avoid huge logs
        
        try:
            lsblk_data = json.loads(output)
            
            # Enhance the data with mount point information for each device
            for device in lsblk_data.get('blockdevices', []):
                self._add_mount_info_to_device(device)
            
            # Add UUID information directly using blkid for each device
            self._add_uuid_info(lsblk_data)
            
            return json.dumps(lsblk_data, indent=2)
        except json.JSONDecodeError as e:
            current_app.logger.error(f"[DISK] Failed to parse lsblk JSON: {e}")
            return output
        except Exception as e:
            current_app.logger.error(f"[DISK] Error processing lsblk output: {e}")
            return output
    
    def _add_mount_info_to_device(self, device: Dict):
        """
        Add mount point information to a device dictionary.
        
        Args:
            device: The device dictionary from lsblk
        """
        device_path = f"/dev/{device['name']}"
        mount_output = self._execute_command(f"/usr/bin/sudo /usr/bin/lsblk -n -o MOUNTPOINT {device_path}")
        
        if not mount_output.startswith("Error"):
            mount_point = mount_output.strip()
            device['mountpoint'] = mount_point if mount_point else None
        else:
            device['mountpoint'] = None
        
        # Process children recursively
        if 'children' in device:
            for child in device['children']:
                self._add_mount_info_to_device(child)
    
    def _add_uuid_info(self, lsblk_data: Dict):
        """
        Add UUID information to devices using blkid.
        
        Args:
            lsblk_data: The full lsblk JSON data
        """
        if 'blockdevices' in lsblk_data:
            for device in lsblk_data['blockdevices']:
                # Add UUID for the device
                device_path = f"/dev/{device['name']}"
                uuid_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s UUID {device_path}")
                if not uuid_output.startswith("Error") and uuid_output.strip():
                    device['uuid'] = uuid_output.strip()
                else:
                    device['uuid'] = None
                
                # Process children recursively
                if 'children' in device:
                    self._add_uuid_to_children(device['children'])
    
    def _add_uuid_to_children(self, children):
        """
        Recursively add UUID information to child devices using blkid.
        
        Args:
            children: List of child devices
        """
        for child in children:
            # Add UUID for the child device
            device_path = f"/dev/{child['name']}"
            uuid_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s UUID {device_path}")
            if not uuid_output.startswith("Error") and uuid_output.strip():
                child['uuid'] = uuid_output.strip()
            else:
                child['uuid'] = None
            
            # Recursively handle grandchildren
            if 'children' in child:
                self._add_uuid_to_children(child['children'])
    
    def get_disk_usage(self) -> Dict[str, Any]:
        """
        Get formatted output from df showing disk usage.
        
        Returns:
            Dict: Parsed disk usage information
        """
        # Use individual df commands that are allowed in sudoers
        raw_output = self._execute_command(
            "/usr/bin/sudo /usr/bin/df -h"
        )
        
        if raw_output.startswith("Error"):
            return {"error": raw_output}
            
        lines = raw_output.splitlines()
        headers = [h.lower() for h in lines[0].split()]
        results = []
        
        for line in lines[1:]:
            if line.strip():
                values = line.split()
                results.append(dict(zip(headers, values)))
                
        return {"disk_usage": results}
    
    def get_encryption_info(self) -> Dict[str, Any]:
        """
        Get information about encrypted devices (LUKS).
        
        Returns:
            Dict: Information about encrypted devices
        """
        try:
            # Get LUKS devices
            luks_devices_output = self._execute_command("/usr/bin/sudo /usr/sbin/blkid -t TYPE=crypto_LUKS -o device")
            
            if not luks_devices_output or luks_devices_output.startswith("Error"):
                # current_app.logger.debug("[DISK] No LUKS devices found")
                return {"encrypted_devices": []}
                
            luks_devices = luks_devices_output.splitlines()
            # current_app.logger.debug(f"[DISK] Found LUKS devices: {luks_devices}")
            
            # Get active crypto mappings
            crypto_mappings_output = self._execute_command("/usr/bin/sudo /usr/sbin/dmsetup ls --target crypt")
            
            if crypto_mappings_output.startswith("Error"):
                crypto_mappings = []
            else:
                crypto_mappings = [line.split()[0] for line in crypto_mappings_output.splitlines() if line.strip()]
                
            # current_app.logger.debug(f"[DISK] Active crypto mappings: {crypto_mappings}")
            
            # Get mapper to device mapping from df (without using pipes)
            df_output = self._execute_command("/usr/bin/sudo /usr/bin/df -h")
            mapper_devices = []
            if not df_output.startswith("Error"):
                for line in df_output.splitlines():
                    if "/dev/mapper/" in line:
                        parts = line.split()
                        if parts:
                            mapper_devices.append(parts[0])
                
            # current_app.logger.debug(f"[DISK] Mounted mapper devices: {mapper_devices}")
            
            # Get list of all files in /dev/mapper to check for existing mappers
            mapper_dir_output = self._execute_command("/usr/bin/sudo /usr/bin/ls -la /dev/mapper/")
            existing_mappers = []
            if not mapper_dir_output.startswith("Error"):
                for line in mapper_dir_output.splitlines():
                    if line.startswith("l") and "control" not in line:  # Skip the control file
                        parts = line.split()
                        if len(parts) >= 9:
                            mapper_name = parts[8]
                            existing_mappers.append(mapper_name)
            
                # current_app.logger.debug(f"[DISK] Existing mapper devices in /dev/mapper/: {existing_mappers}")
            
            # Collect detailed information for each LUKS device
            encrypted_devices = []
            
            for device in luks_devices:
                device_info = {
                    "device": device,
                    "is_open": False,
                    "mapper_name": None,
                    "uuid": None,
                    "type": "LUKS"
                }
                
                # Get UUID
                uuid_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s UUID {device}")
                if not uuid_output.startswith("Error"):
                    device_info["uuid"] = uuid_output
                
                # Get device basename for matching
                device_basename = device.split("/")[-1]
                
                # DIRECT CHECK: If there's a crypto mapping with a name that includes the device basename,
                # consider the device open
                for mapping in crypto_mappings:
                    expected_mapper = f"encrypted_{device_basename}"
                    if mapping == expected_mapper:
                        # Verify the mapper exists in /dev/mapper/
                        if mapping in existing_mappers:
                            device_info["is_open"] = True
                            device_info["mapper_name"] = mapping
                            current_app.logger.info(f"[DISK] Found open LUKS device (direct match): {device} -> {mapping}")
                            break
                    
                    # Remove partial match check as it's too permissive
                
                # If still not found, check if any mapper device contains the device basename
                if not device_info["is_open"]:
                    # Get the actual device-mapper relationship using cryptsetup status
                    for mapping in crypto_mappings:
                        if mapping in existing_mappers:
                            status_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/cryptsetup status {mapping}")
                            if not status_output.startswith("Error"):
                                # Look for the device in the status output
                                for line in status_output.splitlines():
                                    if "device:" in line.lower() and device in line:
                                        device_info["is_open"] = True
                                        device_info["mapper_name"] = mapping
                                        current_app.logger.info(f"[DISK] Found open LUKS device (via cryptsetup): {device} -> {mapping}")
                                        break
                        if device_info["is_open"]:
                            break
                
                # VERIFICATION: If we think the device is open, verify with cryptsetup status
                if device_info["is_open"] and device_info["mapper_name"]:
                    mapper_name = device_info["mapper_name"]
                    
                    # If mapper_name is "No", the device is not actually open
                    if mapper_name == "No":
                        current_app.logger.info(f"[DISK] Mapper name is 'No', marking device as closed: {device}")
                        device_info["is_open"] = False
                        device_info["mapper_name"] = None
                        continue
                    
                    # Check if the mapper device actually exists in /dev/mapper/
                    if mapper_name not in existing_mappers:
                        current_app.logger.info(f"[DISK] Mapper {mapper_name} not found in /dev/mapper/, marking as closed")
                        device_info["is_open"] = False
                        device_info["mapper_name"] = None
                        continue
                    
                    # Verify with cryptsetup status
                    status_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/cryptsetup status {mapper_name}")
                    
                    if "is inactive" in status_output or "not found" in status_output:
                        current_app.logger.info(f"[DISK] Verification failed: Mapper {mapper_name} is not active, marking as closed")
                        device_info["is_open"] = False
                        device_info["mapper_name"] = None
                    else:
                        current_app.logger.info(f"[DISK] Verification succeeded: Mapper {mapper_name} is active")
                
                encrypted_devices.append(device_info)
            
            return {"encrypted_devices": encrypted_devices}
            
        except Exception as e:
            current_app.logger.error(f"[DISK] Error getting encryption info: {str(e)}")
            return {"error": str(e), "encrypted_devices": []}
    
    def _identify_nas_compatible_devices(self, block_devices: Dict, encryption_info: Dict, disk_usage_data: Dict) -> List[Dict[str, Any]]:
        """
        Identify NAS-compatible devices (XFS/EXT4 formatted and LUKS encrypted).
        
        Args:
            block_devices: Block devices data from lsblk
            encryption_info: Encryption information from get_encryption_info
            disk_usage_data: Disk usage data from get_disk_usage()
            
        Returns:
            List of NAS-compatible devices with their details
        """
        try:
            nas_compatible_devices = []
            
            # Define NAS-compatible filesystems
            nas_compatible_filesystems = ["xfs", "ext4"]
            
            # Define virtual/pseudo filesystems to skip
            virtual_filesystems = {
                "tmpfs", "devtmpfs", "sysfs", "proc", "devpts", "securityfs", 
                "cgroup", "cgroup2", "pstore", "bpf", "configfs", "debugfs",
                "tracefs", "fusectl", "fuse.gvfsd-fuse", "udev"
            }
            
            # Get list of encrypted devices and their mappers
            encrypted_devices = encryption_info.get("encrypted_devices", [])
            encrypted_device_paths = [dev.get("device") for dev in encrypted_devices]
            encrypted_to_mapper = {dev.get("device"): f"/dev/mapper/{dev.get('mapper_name')}" 
                                 for dev in encrypted_devices 
                                 if dev.get("is_open") and dev.get("mapper_name")}
            
            current_app.logger.info(f"[DISK] Found encrypted devices: {encrypted_device_paths}")
            current_app.logger.info(f"[DISK] Mapper mapping: {encrypted_to_mapper}")
            
            # Get list of all devices with NAS-compatible filesystems from disk usage
            disk_usage = disk_usage_data.get("disk_usage", [])
            mounted_fs_devices = []
            
            # First check disk usage for mounted devices and their filesystems
            for entry in disk_usage:
                filesystem = entry.get("filesystem")
                if not filesystem:
                    continue
                
                # Skip virtual/pseudo filesystems that don't have real block devices
                if any(vfs in filesystem for vfs in virtual_filesystems):
                    continue
                
                # Skip non-block device paths (like tmpfs, udev, etc.)
                if not filesystem.startswith("/dev/"):
                    continue
                    
                # Get filesystem type using blkid
                fstype_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s TYPE {filesystem}")
                if not fstype_output.startswith("Error") and fstype_output.strip():
                    fstype = fstype_output.strip().lower()
                    if fstype in nas_compatible_filesystems:
                        mounted_fs_devices.append({
                            "device": filesystem,
                            "fstype": fstype,
                            "mountpoint": entry.get("mounted")
                        })
            
            current_app.logger.info(f"[DISK] Found mounted NAS-compatible filesystems: {mounted_fs_devices}")
            
            # Identify system drives
            system_drives = set()
            system_mount_points = ['/', '/boot', '/boot/efi', '/home', '/var', '/usr', '/etc', '/bin', '/sbin', '/lib', '/lib64', '/opt', '/srv', '/tmp', '/swap', '[SWAP]']
            
            for device in block_devices.get("blockdevices", []):
                device_name = device.get("name")
                if device_name.startswith("loop"):
                    continue
                    
                if "children" in device:
                    for partition in device.get("children", []):
                        mountpoints = partition.get("mountpoints", [])
                        if not isinstance(mountpoints, list):
                            mountpoints = [mountpoints]
                            
                        for mountpoint in mountpoints:
                            if mountpoint in system_mount_points:
                                system_drives.add(device_name)
                                current_app.logger.info(f"[DISK] Excluding system drive {device_name} (contains {mountpoint})")
                                break
            
            current_app.logger.info(f"[DISK] System drives to exclude: {system_drives}")
            
            # Process each device
            for device in block_devices.get("blockdevices", []):
                device_name = device.get("name")
                
                # Skip loop devices and system drives
                if device_name.startswith("loop") or device_name in system_drives:
                    continue
                
                device_path = f"/dev/{device_name}"
                
                # Check if device is directly formatted (no encryption)
                device_info = next((dev for dev in mounted_fs_devices if dev["device"] == device_path), None)
                
                # If device is not mounted, check its filesystem type directly
                if not device_info:
                    fstype_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s TYPE {device_path}")
                    if not fstype_output.startswith("Error") and fstype_output.strip():
                        fstype = fstype_output.strip().lower()
                        if fstype in nas_compatible_filesystems:
                            device_info = {
                                "device": device_path,
                                "fstype": fstype,
                                "mountpoint": None
                            }
                
                if device_info:
                    # Get space usage information if device is mounted
                    space_usage = {}
                    if device_info["mountpoint"]:
                        space_usage = self._get_device_space_usage(device_path, disk_usage)
                    
                    nas_compatible = {
                        "device": device_name,
                        "partition": None,
                        "mapper": None,
                        "size": device.get("size"),
                        "uuid": device.get("uuid"),
                        "mountpoint": device_info["mountpoint"],
                        "is_mounted": bool(device_info["mountpoint"]),
                        "is_nas_ready": True,
                        "filesystem": device_info["fstype"],
                        **space_usage  # Include space usage information
                    }
                    nas_compatible_devices.append(nas_compatible)
                    current_app.logger.info(f"[DISK] Added direct-formatted device: {device_name}")
                    continue
                
                # Check if device is encrypted
                if device_path in encrypted_device_paths:
                    mapper_path = encrypted_to_mapper.get(device_path)
                    filesystem = None
                    mountpoint = None
                    
                    # First check if it's mounted
                    if mapper_path:
                        mapper_info = next((dev for dev in mounted_fs_devices if dev["device"] == mapper_path), None)
                        if mapper_info:
                            filesystem = mapper_info["fstype"]
                            mountpoint = mapper_info["mountpoint"]
                    
                    # If not mounted or no filesystem found, check the mapper device directly
                    if mapper_path and not filesystem:
                        fstype_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s TYPE {mapper_path}")
                        if not fstype_output.startswith("Error") and fstype_output.strip():
                            filesystem = fstype_output.strip().lower()
                    
                    # If still no filesystem found and the mapper exists, try lsblk
                    if mapper_path and not filesystem:
                        fstype_output = self._execute_command(f"/usr/bin/sudo /usr/bin/lsblk -n -o FSTYPE {mapper_path}")
                        if not fstype_output.startswith("Error") and fstype_output.strip():
                            filesystem = fstype_output.strip().lower()
                    
                    if filesystem in nas_compatible_filesystems:
                        # Get space usage information if device is mounted
                        space_usage = {}
                        if mountpoint and mapper_path:
                            space_usage = self._get_device_space_usage(mapper_path, disk_usage)
                        
                        encrypted_dev = next((dev for dev in encrypted_devices if dev.get("device") == device_path), None)
                        nas_compatible = {
                            "device": device_name,
                            "partition": None,
                            "mapper": mapper_path.split("/")[-1] if mapper_path else None,
                            "size": device.get("size"),
                            "uuid": encrypted_dev.get("uuid") if encrypted_dev else device.get("uuid"),
                            "mountpoint": mountpoint,
                            "is_mounted": mountpoint is not None,
                            "is_nas_ready": True,
                            "filesystem": filesystem,
                            **space_usage  # Include space usage information
                        }
                        nas_compatible_devices.append(nas_compatible)
                        current_app.logger.info(f"[DISK] Added encrypted device: {device_name} with filesystem {filesystem}")
                
                # Check children (partitions and mappers)
                if "children" in device:
                    for child in device.get("children", []):
                        child_name = child.get("name")
                        child_path = f"/dev/{child_name}"
                        
                        # Skip if this is a mapper we already processed
                        if child_name.startswith("encrypted_"):
                            # Check mapper device directly for filesystem
                            mapper_path = f"/dev/mapper/{child_name}"
                            filesystem = None
                            mountpoint = None
                            
                            # First check if it's mounted
                            mapper_info = next((dev for dev in mounted_fs_devices if dev["device"] == mapper_path), None)
                            if mapper_info:
                                filesystem = mapper_info["fstype"]
                                mountpoint = mapper_info["mountpoint"]
                            
                            # If not mounted, check filesystem directly
                            if not filesystem:
                                fstype_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s TYPE {mapper_path}")
                                if not fstype_output.startswith("Error") and fstype_output.strip():
                                    filesystem = fstype_output.strip().lower()
                            
                            # If still no filesystem found, try lsblk
                            if not filesystem:
                                fstype_output = self._execute_command(f"/usr/bin/sudo /usr/bin/lsblk -n -o FSTYPE {mapper_path}")
                                if not fstype_output.startswith("Error") and fstype_output.strip():
                                    filesystem = fstype_output.strip().lower()
                            
                            if filesystem in nas_compatible_filesystems:
                                # Get space usage information if device is mounted
                                space_usage = {}
                                if mountpoint:
                                    space_usage = self._get_device_space_usage(mapper_path, disk_usage)
                                
                                # Find the corresponding encrypted device info
                                encrypted_dev = next((dev for dev in encrypted_devices 
                                                   if dev.get("mapper_name") == child_name), None)
                                
                                # Get the partition name from the encrypted device path
                                partition = None
                                if encrypted_dev:
                                    partition = encrypted_dev.get("device", "").split("/")[-1]
                                
                                nas_compatible = {
                                    "device": device_name,
                                    "partition": partition,
                                    "mapper": child_name,
                                    "size": device.get("size"),
                                    "uuid": encrypted_dev.get("uuid") if encrypted_dev else None,
                                    "mountpoint": mountpoint,
                                    "is_mounted": mountpoint is not None,
                                    "is_nas_ready": True,
                                    "filesystem": filesystem,
                                    **space_usage  # Include space usage information
                                }
                                nas_compatible_devices.append(nas_compatible)
                                current_app.logger.info(f"[DISK] Added encrypted device from mapper: {child_name} with filesystem {filesystem}")
                            continue
                        
                        # Check if partition is encrypted
                        if child_path in encrypted_device_paths:
                            mapper_path = encrypted_to_mapper.get(child_path)
                            filesystem = None
                            mountpoint = None
                            
                            if mapper_path:
                                # First check if it's mounted
                                mapper_info = next((dev for dev in mounted_fs_devices if dev["device"] == mapper_path), None)
                                if mapper_info:
                                    filesystem = mapper_info["fstype"]
                                    mountpoint = mapper_info["mountpoint"]
                                
                                # If not mounted, check filesystem directly
                                if not filesystem:
                                    fstype_output = self._execute_command(f"/usr/bin/sudo /usr/sbin/blkid -o value -s TYPE {mapper_path}")
                                    if not fstype_output.startswith("Error") and fstype_output.strip():
                                        filesystem = fstype_output.strip().lower()
                                
                                # If still no filesystem found, try lsblk
                                if not filesystem:
                                    fstype_output = self._execute_command(f"/usr/bin/sudo /usr/bin/lsblk -n -o FSTYPE {mapper_path}")
                                    if not fstype_output.startswith("Error") and fstype_output.strip():
                                        filesystem = fstype_output.strip().lower()
                                
                                if filesystem in nas_compatible_filesystems:
                                    # Get space usage information if device is mounted
                                    space_usage = {}
                                    if mountpoint and mapper_path:
                                        space_usage = self._get_device_space_usage(mapper_path, disk_usage)
                                    
                                    nas_compatible = {
                                        "device": device_name,
                                        "partition": child_name,
                                        "mapper": mapper_path.split("/")[-1],
                                        "size": device.get("size"),
                                        "uuid": child.get("uuid"),
                                        "mountpoint": mountpoint,
                                        "is_mounted": mountpoint is not None,
                                        "is_nas_ready": True,
                                        "filesystem": filesystem,
                                        **space_usage  # Include space usage information
                                    }
                                    nas_compatible_devices.append(nas_compatible)
                                    current_app.logger.info(f"[DISK] Added encrypted partition: {child_name} with filesystem {filesystem}")
        
            return nas_compatible_devices
            
        except Exception as e:
            current_app.logger.error(f"[DISK] Error identifying NAS-compatible devices: {str(e)}")
            import traceback
            current_app.logger.error(f"[DISK] Traceback: {traceback.format_exc()}")
            return []
    
    def _filter_disk_usage(self, disk_usage: List[Dict[str, str]], ignored_mounts: List[str]) -> List[Dict[str, str]]:
        """
        Filter disk usage data to remove ignored mounts and tmpfs entries.
        
        Args:
            disk_usage: List of disk usage entries
            ignored_mounts: List of mount points to ignore
            
        Returns:
            Filtered list of disk usage entries
        """
        filtered_usage = []
        
        for entry in disk_usage:
            # Skip tmpfs filesystems
            if entry.get("filesystem", "").startswith("tmpfs") or entry.get("fstype") == "tmpfs":
                continue
                
            should_filter, _ = should_filter_mount(entry, ignored_mounts)
            
            if not should_filter:
                filtered_usage.append(entry)
            
        return filtered_usage
    
    def _filter_block_devices(self, block_devices: Dict, ignored_mounts: List[str]) -> Dict:
        """
        Filter block devices data to remove devices mounted at ignored mount points.
        
        Args:
            block_devices: Block devices data from lsblk
            ignored_mounts: List of mount points to ignore
            
        Returns:
            Filtered block devices data
        """
        if 'blockdevices' not in block_devices:
            return block_devices
            
        filtered_devices = []
        
        # System-critical paths that should be filtered out
        system_critical_paths = ['/', '/boot', '/boot/efi', '/home', '/usr', '/var', '/etc', '/bin', '/sbin', '/lib', '/lib64', '/opt', '/srv', '/tmp', '/swap', '[SWAP]']
        
        # First pass: identify devices with system-critical partitions
        devices_with_system_partitions = set()
        for device in block_devices.get('blockdevices', []):
            # Skip loop devices
            if device.get('name', '').startswith('loop'):
                continue
                
            # Skip tmpfs filesystems
            if device.get('fstype') == 'tmpfs':
                continue
                
            # Check if this device has children (partitions) mounted to system-critical paths
            if 'children' in device:
                for child in device.get('children', []):
                    mountpoints = child.get('mountpoints', [])
                    if not isinstance(mountpoints, list):
                        mountpoints = [mountpoints]
                        
                    for mountpoint in mountpoints:
                        if mountpoint in system_critical_paths:
                            # This parent device has a partition mounted to a system-critical path
                            devices_with_system_partitions.add(device.get('name', ''))
                            current_app.logger.info(f"[DISK] Filtering system drive: {device.get('name', '')} (contains {mountpoint})")
                            break
        
        # Second pass: filter devices
        for device in block_devices['blockdevices']:
            # Skip loop devices
            if device.get('name', '').startswith('loop'):
                continue
                
            # Skip tmpfs filesystems
            if device.get('fstype') == 'tmpfs':
                continue
                
            # Filter out devices that have partitions mounted to system-critical paths
            if device.get('name', '') in devices_with_system_partitions:
                continue
                
            # Check if device should be filtered
            should_filter, _ = should_filter_mount(device, ignored_mounts)
            
            if should_filter:
                continue
                
            # Check children (partitions)
            if 'children' in device:
                filtered_children = []
                for child in device['children']:
                    # Skip tmpfs filesystems
                    if child.get('fstype') == 'tmpfs':
                        continue
                        
                    # Check if child should be filtered
                    should_filter, _ = should_filter_mount(child, ignored_mounts)
                    
                    if not should_filter:
                        # Check if child has children (mapper devices)
                        if 'children' in child:
                            filtered_grandchildren = []
                            for grandchild in child['children']:
                                # Skip tmpfs filesystems
                                if grandchild.get('fstype') == 'tmpfs':
                                    continue
                                    
                                # Check if grandchild should be filtered
                                should_filter, _ = should_filter_mount(grandchild, ignored_mounts)
                                
                                if not should_filter:
                                    filtered_grandchildren.append(grandchild)
                                    
                            # Update grandchildren with filtered list
                            if filtered_grandchildren:
                                child['children'] = filtered_grandchildren
                            else:
                                # If all grandchildren were filtered out, remove the children key
                                child.pop('children', None)
                                
                        filtered_children.append(child)
                
                # Update children with filtered list
                if filtered_children:
                    device['children'] = filtered_children
                else:
                    # If all children were filtered out, remove the children key
                    device.pop('children', None)
                    
            filtered_devices.append(device)
        
        # Create a new dict with filtered devices
        return {'blockdevices': filtered_devices}
    
    def check_disks(self) -> Dict[str, Any]:
        """
        Check disk information from both lsblk and df.
        
        Returns:
            Dict with disk information
        """
        try:
            # Get ignored mounts from configuration
            _, ignored_mounts = get_cached_global_mounts()
            
            lsblk_data = self.get_lsblk_output()
            disk_usage = self.get_disk_usage()
            
            # Parse JSON if possible, otherwise return as text
            try:
                lsblk_parsed = json.loads(lsblk_data)
                
                # Filter block devices data
                lsblk_parsed = self._filter_block_devices(lsblk_parsed, ignored_mounts)
                
                # Filter disk usage data
                if 'disk_usage' in disk_usage:
                    disk_usage['disk_usage'] = self._filter_disk_usage(
                        disk_usage['disk_usage'], 
                        ignored_mounts
                    )
                
                result = {
                    "blockDevices": lsblk_parsed,
                    "diskUsage": disk_usage,
                    "rawFormat": False,
                    "timestamp": int(time.time())
                }
                
                # Get encryption information
                encryption_info = self.get_encryption_info()
                result["encryptionInfo"] = encryption_info
                
                # Identify NAS-compatible devices (XFS + LUKS)
                nas_compatible_devices = self._identify_nas_compatible_devices(
                    lsblk_parsed, 
                    encryption_info,
                    disk_usage
                )
                
                # Add NAS compatibility information to the result
                result["nasCompatibleDevices"] = nas_compatible_devices
                
            except json.JSONDecodeError:
                # If JSON parsing fails, return raw text output
                result = {
                    "blockDevices": lsblk_data,
                    "diskUsage": disk_usage,
                    "rawFormat": True,
                    "timestamp": int(time.time())
                }
            
            # ADDED: Log final result from check_disks
            current_app.logger.info(f"[DISK] Final result from check_disks: Type={type(result)}, Keys={list(result.keys()) if isinstance(result, dict) else 'N/A'}, ErrorKeyPresent={'error' in result if isinstance(result, dict) else 'N/A'}")
            return result
            
        except Exception as e:
            current_app.logger.error(f"[DISK] Error checking disk information: {str(e)}")
            # Construct error result for consistent return type
            error_result = {
                "error": str(e),
                "timestamp": int(time.time())
            }
            current_app.logger.info(f"[DISK] Error result from check_disks: Type={type(error_result)}, Keys={list(error_result.keys())}, ErrorKeyPresent={'error' in error_result}")
            return error_result
            
    def broadcast_disk_info(self) -> Dict[str, Any]:
        """Get current disk information for broadcasting."""
        result = self.check_disks()
        
        # Ensure timestamp is set
        if 'timestamp' not in result:
            result['timestamp'] = int(time.time())
            
        return result

    def _get_device_space_usage(self, device_path: str, disk_usage_items: List[Dict[str, str]]) -> Dict[str, str]:
        """
        Get space usage information for a specific device path.
        
        Args:
            device_path: The device path (e.g., /dev/sda1 or /dev/mapper/encrypted_sda1)
            disk_usage_items: List of disk usage items from df command
            
        Returns:
            Dict with space usage information (size, used, available, use_percent)
        """
        current_app.logger.info(f"[DISK] _get_device_space_usage called for device_path: {device_path}")
        current_app.logger.info(f"[DISK] Available disk_usage_items: {[item.get('filesystem') for item in disk_usage_items]}")
        
        # Find the disk usage entry for this device
        for item in disk_usage_items:
            if item.get("filesystem") == device_path:
                space_info = {
                    "total_size": item.get("size", "Unknown"),
                    "used_space": item.get("used", "Unknown"), 
                    "available_space": item.get("avail", "Unknown"),
                    "use_percent": item.get("use%", "Unknown")
                }
                current_app.logger.info(f"[DISK] Found space usage for {device_path}: {space_info}")
                return space_info
        
        current_app.logger.info(f"[DISK] No space usage found for {device_path}, returning Unknown values")
        return {
            "total_size": "Unknown",
            "used_space": "Unknown",
            "available_space": "Unknown", 
            "use_percent": "Unknown"
        } 