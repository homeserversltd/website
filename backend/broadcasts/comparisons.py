"""
Comparison functions for determining if broadcast data has meaningfully changed.
Add new comparison functions here for different broadcast types.
"""
from typing import Any, Dict, List

def compare_internet_status(old_data: Dict, new_data: Dict) -> bool:
    """Compare internet status data, ignoring volatile fields like timestamps."""
    # Always broadcast if connection status changes
    if old_data.get('status') != new_data.get('status'):
        return True
        
    # Always broadcast if public IP changes
    if old_data.get('publicIp') != new_data.get('publicIp'):
        return True
        
    # For IP details, only compare if both have valid details (not error objects)
    old_ip_details = old_data.get('ipDetails', {})
    new_ip_details = new_data.get('ipDetails', {})
    
    # If either has an error, don't trigger a broadcast just for error changes
    if 'error' in old_ip_details or 'error' in new_ip_details:
        # But still broadcast if we're going from error to valid data or vice versa
        old_has_error = 'error' in old_ip_details
        new_has_error = 'error' in new_ip_details
        if old_has_error != new_has_error:
            return True
        # Otherwise, don't broadcast just for different error messages
        return False
    
    # For DNS servers, only broadcast if they actually changed
    if old_data.get('dnsServers') != new_data.get('dnsServers'):
        return True
        
    return False

def compare_tailscale_status(old_data: Dict, new_data: Dict) -> bool:
    """Compare tailscale status data, ignoring volatile fields like timestamps."""
    # Compare basic fields that are always present
    if (old_data.get('status') != new_data.get('status') or
        old_data.get('interface') != new_data.get('interface')):
        return True
        
    # Compare admin-only fields if they exist in both datasets
    if 'ip' in old_data and 'ip' in new_data and old_data.get('ip') != new_data.get('ip'):
        return True
        
    if 'tailnet' in old_data and 'tailnet' in new_data and old_data.get('tailnet') != new_data.get('tailnet'):
        return True
        
    # Compare isEnabled status (admin-only field)
    if 'isEnabled' in old_data and 'isEnabled' in new_data and old_data.get('isEnabled') != new_data.get('isEnabled'):
        return True
        
    # Compare loginUrl changes (admin-only field) - this is critical for showing/hiding login prompts
    if 'loginUrl' in old_data or 'loginUrl' in new_data:
        if old_data.get('loginUrl') != new_data.get('loginUrl'):
            return True
        
    return False

def compare_power_status(old_data: Dict, new_data: Dict) -> bool:
    """Compare power status data - always return True for real-time data."""
    return True

def compare_system_stats(old_data: Dict, new_data: Dict) -> bool:
    """Compare system stats data - always return True for real-time data."""
    return True

def compare_vpn_status(old_data: Dict, new_data: Dict) -> bool:
    """
    Compare VPN status data.
    Broadcasts if 'vpnStatus', 'transmissionStatus', or 'isEnabled' change.
    Ignores volatile fields like 'timestamp'.
    Note: Changes solely in the 'error' field's message content (if present)
    do not currently trigger a broadcast if other statuses remain unchanged.
    """
    return (
        old_data.get('vpnStatus') != new_data.get('vpnStatus') or
        old_data.get('transmissionStatus') != new_data.get('transmissionStatus') or
        old_data.get('isEnabled') != new_data.get('isEnabled')
    )

def compare_admin_disk_info(old_data: Dict, new_data: Dict) -> bool:
    """
    Compare admin disk info data with focus on:
    1. New disks appearing
    2. Significant usage changes (>0.1%)
    3. Error status changes
    4. Mount status changes (device mounted or unmounted)
    5. Encryption status changes (device encrypted or decrypted)
    6. NAS compatibility changes (device becomes XFS+LUKS compatible)
    7. Filesystem UUID changes (detects reformatting of devices)
    8. Periodic updates every 5 minutes
    """
    # Always broadcast if there's an error change
    if ('error' in old_data) != ('error' in new_data):
        return True
        
    # If both have errors, check if error message changed
    if 'error' in old_data and 'error' in new_data:
        return old_data['error'] != new_data['error']
        
    # Broadcast every 5 minutes regardless (300 seconds)
    if abs(old_data.get('timestamp', 0) - new_data.get('timestamp', 0)) > 300:
        return True
    
    # Check for changes in encryption status
    try:
        old_encryption_info = old_data.get('encryptionInfo', {}).get('encrypted_devices', [])
        new_encryption_info = new_data.get('encryptionInfo', {}).get('encrypted_devices', [])
        
        # Check if number of encrypted devices changed
        if len(old_encryption_info) != len(new_encryption_info):
            return True
            
        # Check if encrypted device paths changed
        old_encrypted_paths = {device.get('device') for device in old_encryption_info if device.get('device')}
        new_encrypted_paths = {device.get('device') for device in new_encryption_info if device.get('device')}
        
        if old_encrypted_paths != new_encrypted_paths:
            return True
            
        # Check if any encrypted device's open status changed
        for old_device in old_encryption_info:
            device_path = old_device.get('device')
            if device_path:
                # Find corresponding device in new data
                new_device = next((dev for dev in new_encryption_info if dev.get('device') == device_path), None)
                if new_device and old_device.get('is_open') != new_device.get('is_open'):
                    return True
                    
        # Check if any encrypted device's mapper name changed
        for old_device in old_encryption_info:
            device_path = old_device.get('device')
            if device_path:
                # Find corresponding device in new data
                new_device = next((dev for dev in new_encryption_info if dev.get('device') == device_path), None)
                if new_device and old_device.get('mapper_name') != new_device.get('mapper_name'):
                    return True
    except (AttributeError, KeyError, TypeError) as e:
        # If there's an error comparing encryption info, broadcast anyway
        return True
    
    # Check for changes in NAS compatibility
    try:
        old_nas_compatible = old_data.get('nasCompatibleDevices', [])
        new_nas_compatible = new_data.get('nasCompatibleDevices', [])
        
        # Check if number of NAS-compatible devices changed
        if len(old_nas_compatible) != len(new_nas_compatible):
            return True
            
        # Check if NAS-compatible device names changed
        old_nas_devices = {device.get('device') for device in old_nas_compatible if device.get('device')}
        new_nas_devices = {device.get('device') for device in new_nas_compatible if device.get('device')}
        
        if old_nas_devices != new_nas_devices:
            return True
            
        # Check if any NAS-compatible device's mount status changed
        for old_device in old_nas_compatible:
            device_name = old_device.get('device')
            if device_name:
                # Find corresponding device in new data
                new_device = next((dev for dev in new_nas_compatible if dev.get('device') == device_name), None)
                if new_device and old_device.get('is_mounted') != new_device.get('is_mounted'):
                    return True
    except (AttributeError, KeyError, TypeError) as e:
        # If there's an error comparing NAS compatibility, broadcast anyway
        return True
        
    # Check for changes in block devices
    try:
        old_block_devices = old_data.get('blockDevices', {}).get('blockdevices', [])
        new_block_devices = new_data.get('blockDevices', {}).get('blockdevices', [])
        
        # Check if the number of devices changed
        if len(old_block_devices) != len(new_block_devices):
            return True
            
        # Check if device names changed
        old_device_names = {device.get('name') for device in old_block_devices if device.get('name')}
        new_device_names = {device.get('name') for device in new_block_devices if device.get('name')}
        
        if old_device_names != new_device_names:
            return True
            
        # Check if any device's mount status has changed
        old_mount_status = {device.get('name'): device.get('mountpoint') 
                           for device in old_block_devices if device.get('name')}
        new_mount_status = {device.get('name'): device.get('mountpoint') 
                           for device in new_block_devices if device.get('name')}
                           
        # Compare mount statuses
        for device_name in old_device_names:
            if device_name in new_mount_status:
                # Check if mount status changed (mounted or unmounted)
                if old_mount_status.get(device_name) != new_mount_status.get(device_name):
                    return True
                    
        # Check if any device's filesystem type has changed
        old_fs_types = {}
        new_fs_types = {}
        
        # Build filesystem type maps for all devices and partitions
        for device in old_block_devices:
            old_fs_types[device.get('name')] = device.get('fstype')
            if 'children' in device:
                for child in device.get('children', []):
                    old_fs_types[child.get('name')] = child.get('fstype')
                    
        for device in new_block_devices:
            new_fs_types[device.get('name')] = device.get('fstype')
            if 'children' in device:
                for child in device.get('children', []):
                    new_fs_types[child.get('name')] = child.get('fstype')
        
        # Compare filesystem types
        for device_name, fs_type in old_fs_types.items():
            if device_name in new_fs_types and fs_type != new_fs_types.get(device_name):
                    return True
                    
        # NEW: Check if any filesystem UUID has changed (detects reformatting)
        old_uuid_map = {}
        new_uuid_map = {}
        
        # Extract UUIDs for devices and partitions from old data
        for device in old_block_devices:
            if 'uuid' in device:
                old_uuid_map[device.get('name')] = device.get('uuid')
            if 'children' in device:
                for child in device.get('children', []):
                    if 'uuid' in child:
                        old_uuid_map[child.get('name')] = child.get('uuid')
                        
        # Extract UUIDs for devices and partitions from new data
        for device in new_block_devices:
            if 'uuid' in device:
                new_uuid_map[device.get('name')] = device.get('uuid')
            if 'children' in device:
                for child in device.get('children', []):
                    if 'uuid' in child:
                        new_uuid_map[child.get('name')] = child.get('uuid')
        
        # Compare UUIDs - if any UUID changed, it indicates a reformatting
        for device_name, uuid in new_uuid_map.items():
            if device_name in old_uuid_map and old_uuid_map[device_name] != uuid:
                return True
                    
        # Check if any device's children have changed (added, removed, or modified)
        for old_device in old_block_devices:
            device_name = old_device.get('name')
            if device_name:
                # Find corresponding device in new data
                new_device = next((dev for dev in new_block_devices if dev.get('name') == device_name), None)
                if new_device:
                    # Check if children count changed
                    old_children = old_device.get('children', [])
                    new_children = new_device.get('children', [])
                    
                    if len(old_children) != len(new_children):
                        return True
                        
                    # Check if children names changed
                    old_child_names = {child.get('name') for child in old_children if child.get('name')}
                    new_child_names = {child.get('name') for child in new_children if child.get('name')}
                    
                    if old_child_names != new_child_names:
                        return True
                        
                    # Check if any child's children (mapper devices) have changed
                    for old_child in old_children:
                        child_name = old_child.get('name')
                        if child_name:
                            # Find corresponding child in new data
                            new_child = next((child for child in new_children if child.get('name') == child_name), None)
                            if new_child:
                                # Check if grandchildren count changed
                                old_grandchildren = old_child.get('children', [])
                                new_grandchildren = new_child.get('children', [])
                                
                                if len(old_grandchildren) != len(new_grandchildren):
                                    return True
                                    
                                # Check if grandchildren names changed
                                old_grandchild_names = {gc.get('name') for gc in old_grandchildren if gc.get('name')}
                                new_grandchild_names = {gc.get('name') for gc in new_grandchildren if gc.get('name')}
                                
                                if old_grandchild_names != new_grandchild_names:
                                    return True
    except (AttributeError, KeyError, TypeError) as e:
        # If there's an error comparing block devices, broadcast anyway
        return True
        
    # Get disk usage data
    try:
        old_usage = old_data.get('diskUsage', {}).get('disk_usage', [])
        new_usage = new_data.get('diskUsage', {}).get('disk_usage', [])
        
        # Check for new disks by comparing filesystem paths
        old_filesystems = {entry['filesystem'] for entry in old_usage}
        new_filesystems = {entry['filesystem'] for entry in new_usage}
        
        if new_filesystems != old_filesystems:
            return True
            
        # Create mapping of filesystem to usage percentage
        old_usage_map = {entry['filesystem']: float(entry['pcent'].rstrip('%')) 
                        for entry in old_usage if 'pcent' in entry}
        new_usage_map = {entry['filesystem']: float(entry['pcent'].rstrip('%')) 
                        for entry in new_usage if 'pcent' in entry}
        
        # Check for significant usage changes (>0.1%)
        for filesystem, new_pcent in new_usage_map.items():
            if filesystem in old_usage_map:
                old_pcent = old_usage_map[filesystem]
                if abs(new_pcent - old_pcent) > 0.1:
                    return True
                    
    except (AttributeError, KeyError, TypeError, ValueError) as e:
        return True
            
    return False

def compare_services_status(old_data: List[Dict], new_data: List[Dict]) -> bool:
    """
    Compare services status data, checking for:
    1. Changes in service running status
    2. Changes in enabled/disabled status (admin-only field)
    3. New services added or removed
    """
    # Handle None or empty data
    if not old_data or not new_data:
        return old_data != new_data
        
    # Check if number of services changed
    if len(old_data) != len(new_data):
        return True
        
    # Create maps for easier comparison
    old_services = {service.get('name'): service for service in old_data if service.get('name')}
    new_services = {service.get('name'): service for service in new_data if service.get('name')}
    
    # Check if service names changed
    if set(old_services.keys()) != set(new_services.keys()):
        return True
        
    # Check each service for status changes
    for name, new_service in new_services.items():
        old_service = old_services.get(name, {})
        
        # Check if running status changed
        if old_service.get('status') != new_service.get('status'):
            return True
            
        # Check if enabled status changed (admin-only field)
        if 'isEnabled' in old_service and 'isEnabled' in new_service:
            if old_service.get('isEnabled') != new_service.get('isEnabled'):
                return True
                
    return False

def compare_hard_drive_test_status(old_data: Dict, new_data: Dict) -> bool:
    """
    Compare hard drive test status data for broadcast eligibility under the simplified event model.
    Only broadcast if:
    1. The status is 'starting' or 'done' (always broadcast these events)
    2. The status is 'working' and at least 60 seconds have passed since the last 'working' broadcast (keepalive)
    All granular progress and message content changes are ignored in this model.
    """
    # Always broadcast starting/done
    if new_data.get('status') in ("starting", "done"):
        return True
    # For working, broadcast if 60s have passed
    if new_data.get('status') == "working":
        return True
    return False

def compare_sync_status(old_data: dict, new_data: dict) -> bool:
    """
    Compare sync status data for broadcast eligibility.
    Broadcast if:
    1. Status changes (starting, working, done)
    2. Job ID changes
    3. Progress changes by at least 10%
    4. Every 60s if still 'working' (keepalive)
    """
    if old_data.get('status') != new_data.get('status'):
        return True
    if old_data.get('id') != new_data.get('id'):
        return True
    if old_data.get('progress') != new_data.get('progress'):
        # Only broadcast if progress changes by at least 10%
        try:
            if abs(int(old_data.get('progress', 0)) - int(new_data.get('progress', 0))) >= 10:
                return True
        except Exception:
            return True
    # Keepalive: broadcast every 60s if still working
    if new_data.get('status') == 'working' and abs(old_data.get('timestamp', 0) - new_data.get('timestamp', 0)) > 60:
        return True
    return False

# Map broadcast types to their comparison functions
COMPARISON_FUNCTIONS = {
    'internet_status': compare_internet_status,
    'tailscale_status': compare_tailscale_status,
    'power_status': compare_power_status,
    'system_stats': compare_system_stats,
    'vpn_status': compare_vpn_status,
    'admin_disk_info': compare_admin_disk_info,
    'services_status': compare_services_status,
    'hard_drive_test_status': compare_hard_drive_test_status,
    'sync_status': compare_sync_status
}

def should_broadcast(old_data: Any, new_data: Any, broadcast_type: str) -> bool:
    """
    Determine if new data should be broadcast based on meaningful changes.
    
    Args:
        old_data: Previous broadcast data
        new_data: New data to potentially broadcast
        broadcast_type: Type of broadcast (e.g. 'internet_status')
        
    Returns:
        bool: True if data should be broadcast, False otherwise
    """
    if old_data is None or new_data is None:
        return old_data != new_data
        
    # Use specific comparison function if available
    if broadcast_type in COMPARISON_FUNCTIONS:
        return COMPARISON_FUNCTIONS[broadcast_type](old_data, new_data)
        
    # Default to direct comparison
    return old_data != new_data 