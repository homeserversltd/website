import { BlockDevice, AdminDiskInfo, MountDestination } from '../types';

// Constants
export const TOAST_DURATION = {
  SHORT: 3000,
  NORMAL: 5000,
  LONG: 8000
};

// System-critical paths that should be filtered out
export const SYSTEM_CRITICAL_PATHS = [
  '/', '/boot', '/boot/efi', '/home', '/var', '/usr', '/etc', 
  '/bin', '/sbin', '/lib', '/lib64', '/opt', '/srv', '/tmp', '/swap', '[SWAP]'
];

// Mount destination options
export const MOUNT_DESTINATIONS: MountDestination[] = [
  { id: 'nas', label: 'NAS', path: '/mnt/nas' },
  { id: 'nas_backup', label: 'NAS Backup', path: '/mnt/nas_backup' }
];

/**
 * Parse a size string like "28.7G" into bytes
 */
export const parseSizeToBytes = (sizeString: string): number => {
  // Extract numeric value and unit
  const match = sizeString.match(/^([\d.]+)([KMGTP]?B?)$/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  // Convert to bytes based on unit
  switch (unit) {
    case 'KB':
    case 'K':
      return value * 1024;
    case 'MB':
    case 'M':
      return value * 1024 * 1024;
    case 'GB':
    case 'G':
      return value * 1024 * 1024 * 1024;
    case 'TB':
    case 'T':
      return value * 1024 * 1024 * 1024 * 1024;
    case 'PB':
    case 'P':
      return value * 1024 * 1024 * 1024 * 1024 * 1024;
    default:
      return value; // Assume bytes if no unit specified
  }
};

/**
 * Check if a device is mounted
 */
export const isDeviceMounted = (
  deviceName: string, 
  blockDevices: BlockDevice[], 
  diskInfo?: AdminDiskInfo
): boolean => {
  // First, check if we have NAS compatible device info
  if (diskInfo?.nasCompatibleDevices) {
    const nasDevice = diskInfo.nasCompatibleDevices.find(d => d.device === deviceName || d.label === deviceName);
    if (nasDevice) {
      if (nasDevice.is_mounted !== undefined) {
        const isTrulyMounted = nasDevice.is_mounted === true && !!nasDevice.mountpoint;
        return isTrulyMounted;
      }
    }
  }

  const device = blockDevices.find(d => d.name === deviceName);
  if (!device) {
    return false;
  }
  
  // Check if the device itself is mounted - fixed to handle undefined correctly
  if (device.mountpoint && device.mountpoint !== null && device.mountpoint !== "") {
    return true;
  }
  
  // Check if the device has mountpoints array with valid entries
  if (device.mountpoints && Array.isArray(device.mountpoints)) {
    const validMountPoint = device.mountpoints.find(mp => mp !== null && mp !== undefined && mp !== "");
    if (validMountPoint) {
      return true;
    }
  }
  
  // Check if any of its children (partitions) are mounted
  if (device.children && device.children.length > 0) {
    
    // Check direct mounts of partitions
    for (const child of device.children) {
      // Check mountpoint property - fixed to handle undefined correctly
      if (child.mountpoint && child.mountpoint !== null && child.mountpoint !== "") {
        return true;
      }
      
      // Check mountpoints array
      if (child.mountpoints && Array.isArray(child.mountpoints)) {
        const validChildMountPoint = child.mountpoints.find(mp => mp !== null && mp !== undefined && mp !== "");
        if (validChildMountPoint) {
          return true;
        }
      }
      
      // For LUKS containers, having mapper devices doesn't mean they're mounted
      // We need to specifically check if the mapper devices are mounted
      if (child.children && child.children.length > 0) {
        for (const mapper of child.children) {
          // Only check if the mapper type is 'crypt' and has actual mount points
          if (mapper.type === 'crypt') {
            // Having a crypt mapper that's not mounted doesn't mean the device is mounted
            // Check mountpoint property - fixed to handle undefined correctly
            if (mapper.mountpoint && mapper.mountpoint !== null && mapper.mountpoint !== "") {
              return true;
            }
            
            // Check mountpoints array
            if (mapper.mountpoints && Array.isArray(mapper.mountpoints)) {
              const validMapperMountPoint = mapper.mountpoints.find(mp => mp !== null && mp !== undefined && mp !== "");
              if (validMapperMountPoint) {
                return true;
              }
            }
          }
        }
      }
    }
    
    // Also check disk usage data for mounted mapper devices
    const diskUsageItems = diskInfo?.diskUsage?.disk_usage || [];
    
    for (const item of diskUsageItems) {
      // Check if this is a mapper device for one of the partitions
      if (item.filesystem.includes('/dev/mapper/')) {
        const mapperName = item.filesystem.split('/').pop() || '';
        
        // Check if this mapper belongs to any partition of this device
        const encryptedPartition = device.children.find(child => {
          const partitionName = child.name.split('/').pop() || '';
          return mapperName.includes(partitionName);
        });
        
        if (encryptedPartition) {
          return true;
        }
      }
    }
  }
  
  // If we got here and haven't found a mount point, check again with NAS devices
  // for a clearer result in the logs
  if (diskInfo?.nasCompatibleDevices) {
    const nasDevice = diskInfo.nasCompatibleDevices.find(d => d.device === deviceName || d.label === deviceName);
    if (nasDevice) {
      // A device is only considered mounted if it has both is_mounted=true AND a valid mountpoint
      const isTrulyMounted = nasDevice.is_mounted === true && !!nasDevice.mountpoint;
      if (isTrulyMounted) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Check if a device is mounted to a non-standard location
 */
export const isDeviceMountedToNonStandardLocation = (
  deviceName: string, 
  blockDevices: BlockDevice[], 
  diskInfo?: AdminDiskInfo
): boolean => {
  const device = blockDevices.find(d => d.name === deviceName);
  if (!device) return false;
  
  // First check if the device is mounted at all
  if (!isDeviceMounted(deviceName, blockDevices, diskInfo)) return false;
  
  // Get the mount point for this device
  const mountPoint = getDeviceMountPoint(deviceName, blockDevices, diskInfo);
  if (!mountPoint) return false;
  
  // Check if the mount point is in the standard destinations
  const isStandard = MOUNT_DESTINATIONS.some(dest => dest.path === mountPoint);
  
  return !isStandard;
};

/**
 * Get the mount point for a device
 */
export const getDeviceMountPoint = (
  deviceName: string, 
  blockDevices: BlockDevice[], 
  diskInfo?: AdminDiskInfo
): string | null => {
  const device = blockDevices.find(d => d.name === deviceName);
  if (!device) return null;
  
  // First check if this is a locked encrypted device - these should never have a mount point
  const isLocked = hasLockedEncryptedPartition(deviceName, blockDevices, diskInfo);
  if (isLocked) {
    return null;
  }
  
  // If the device itself is mounted, return its mount point
  // Handle mountpoint as an array
  if (device.mountpoint !== null && device.mountpoint !== "") {
    return device.mountpoint;
  } 
  
  // Check if the device has mountpoints array with valid entries
  if (device.mountpoints && Array.isArray(device.mountpoints)) {
    // Find the first non-null mount point
    const validMountPoint = device.mountpoints.find(mp => mp !== null);
    if (validMountPoint) return validMountPoint;
  }
  
  // If any of its children (partitions) are mounted, return the first one's mount point
  if (device.children && device.children.length > 0) {
    // First check direct mounts of partitions - handle both mountpoint and mountpoints
    for (const child of device.children) {
      // Check mountpoint property
      if (child.mountpoint !== null && child.mountpoint !== "") {
        return child.mountpoint;
      }
      
      // Check mountpoints array
      if (child.mountpoints && Array.isArray(child.mountpoints)) {
        // Find the first non-null mount point
        const validChildMountPoint = child.mountpoints.find(mp => mp !== null);
        if (validChildMountPoint) return validChildMountPoint;
      }
      
      // Check if this partition has mapper devices (for LUKS)
      if (child.children && child.children.length > 0) {
        for (const mapper of child.children) {
          // Check mountpoint property
          if (mapper.mountpoint !== null && mapper.mountpoint !== "") {
            return mapper.mountpoint;
          }
          
          // Check mountpoints array
          if (mapper.mountpoints && Array.isArray(mapper.mountpoints)) {
            // Find the first non-null mount point
            const validMapperMountPoint = mapper.mountpoints.find(mp => mp !== null);
            if (validMapperMountPoint) return validMapperMountPoint;
          }
        }
      }
    }
  }
  
  // Check if this device has an entry in nasCompatibleDevices
  if (diskInfo?.nasCompatibleDevices) {
    const nasDevice = diskInfo.nasCompatibleDevices.find(d =>
      (d.device === deviceName || d.label === deviceName) && d.is_mounted === true && d.mountpoint !== null
    );

    if (nasDevice && nasDevice.mountpoint) {
      return nasDevice.mountpoint;
    }
  }
  
  // Check disk usage data
  if (diskInfo?.diskUsage?.disk_usage) {
    // Check for direct device match (non-encrypted)
    for (const usage of diskInfo.diskUsage.disk_usage) {
      if (usage.filesystem === `/dev/${deviceName}` && usage.mounted) {
        return usage.mounted;
      }
    }
    
    // Check for mapper devices (encrypted)
    if (device.children) {
      for (const child of device.children) {
        // Check if this child is in the encrypted devices list
        const childPath = `/dev/${child.name}`;
        const encryptedDevice = diskInfo.encryptionInfo?.encrypted_devices?.find(ed => 
          ed.device === childPath && ed.is_open === true && ed.mapper_name
        );
        
        if (encryptedDevice && encryptedDevice.mapper_name) {
          // Check for this mapper in disk usage
          for (const usage of diskInfo.diskUsage.disk_usage) {
            if (usage.filesystem === `/dev/mapper/${encryptedDevice.mapper_name}` && usage.mounted) {
              return usage.mounted;
            }
          }
        }
      }
    }
  }
  
  // If we got here, the device is not mounted
  return null;
};

/**
 * Get device for a mount point
 */
export const getDeviceForMountPoint = (
  mountPoint: string, 
  blockDevices: BlockDevice[]
): string | null => {
  // Check if any device is directly mounted to this mount point
  const device = blockDevices.find(d => 
    d.mountpoint === mountPoint || 
    (d.mountpoints && Array.isArray(d.mountpoints) && d.mountpoints.includes(mountPoint))
  );
  if (device) return device.name;
  
  // Check for devices with mounted children (partitions)
  for (const device of blockDevices) {
    if (device.children && device.children.length > 0) {
      const mountedChild = device.children.find(child => 
        child.mountpoint === mountPoint || 
        (child.mountpoints && Array.isArray(child.mountpoints) && child.mountpoints.includes(mountPoint))
      );
      if (mountedChild) return device.name;
      
      // Check for mapper devices
      for (const child of device.children) {
        if (child.children && child.children.length > 0) {
          const mountedMapper = child.children.find(mapper => 
            mapper.mountpoint === mountPoint || 
            (mapper.mountpoints && Array.isArray(mapper.mountpoints) && mapper.mountpoints.includes(mountPoint))
          );
          if (mountedMapper) return device.name;
        }
      }
    }
  }
  
  return null;
};

/**
 * Check if a device has an unlocked encrypted partition but is not mounted
 */
export const isDeviceUnlockedButNotMounted = (
  deviceName: string,
  blockDevices: BlockDevice[],
  diskInfo?: AdminDiskInfo
): boolean => {
  // If the device is mounted, it's not unmounted
  const isMounted = isDeviceMounted(deviceName, blockDevices, diskInfo);
  if (isMounted) {
    return false;
  }
  
  // Check if the device has an unlocked encrypted partition
  const hasUnlocked = hasUnlockedEncryptedPartition(deviceName, blockDevices, diskInfo);
  return hasUnlocked;
};

/**
 * Check if a device is available for mounting to a specific destination
 */
export const isDeviceAvailableForDestination = (
  deviceName: string, 
  destinationId: string | null, 
  blockDevices: BlockDevice[], 
  diskInfo?: AdminDiskInfo
): boolean => {
  // If no destination is selected, all unmounted devices are available
  if (!destinationId) {
    const isNotMounted = !isDeviceMounted(deviceName, blockDevices, diskInfo);
    return isNotMounted;
  }
  
  // If device is already mounted, it's not available for mounting
  const isMounted = isDeviceMounted(deviceName, blockDevices, diskInfo);
  if (isMounted) {
    return false;
  }
  
  // Check if the device is formatted and ready to be mounted
  // Devices with unlocked LUKS partitions are considered ready
  const isUnlockedAndReady = isDeviceUnlockedButNotMounted(deviceName, blockDevices, diskInfo);
  
  // Check for NAS compatibility
  const isNasCompatible = diskInfo?.nasCompatibleDevices?.some(d =>
    (d.device === deviceName || d.label === deviceName) && d.filesystem !== null
  );
  
  // All unmounted, formatted devices are available for the selected destination
  return isUnlockedAndReady || !!isNasCompatible;
};

/**
 * Check if a destination is available for a specific device
 */
export const isDestinationAvailableForDevice = (
  destinationId: string, 
  deviceName: string | null, 
  blockDevices: BlockDevice[], 
  diskInfo?: AdminDiskInfo
): boolean => {
  const destination = MOUNT_DESTINATIONS.find(dest => dest.id === destinationId);
  if (!destination) return false;
  
  // Check if this destination is already mounted by any device
  const mountedDeviceName = destination.path ? getDeviceForMountPoint(destination.path, blockDevices) : null;
  
  // If destination is already mounted by another device, it's not available
  if (mountedDeviceName && mountedDeviceName !== deviceName) return false;
  
  // If no device is selected, all unmounted destinations are available
  if (!deviceName) return !mountedDeviceName;
  
  // If device is already mounted to another destination, this destination is not available
  if (isDeviceMounted(deviceName, blockDevices, diskInfo)) {
    const currentMountPoint = getDeviceMountPoint(deviceName, blockDevices, diskInfo);
    if (currentMountPoint && currentMountPoint !== destination.path) {
      return false;
    }
  }
  
  // Special rule for nas_backup: Only allow mounting if /mnt/nas is already mounted
  // and the device size is >= the current NAS device size
  if (destinationId === 'nas_backup') {
    // Check if /mnt/nas is mounted
    const nasDestination = MOUNT_DESTINATIONS.find(dest => dest.id === 'nas');
    if (!nasDestination) return false;
    
    const nasMountedDeviceName = getDeviceForMountPoint(nasDestination.path, blockDevices);
    if (!nasMountedDeviceName) {
      // If NAS is not mounted, nas_backup is not available
      return false;
    }
    
    // Compare device sizes
    const currentNasDeviceInfo = diskInfo?.nasCompatibleDevices?.find(d => d.device === nasMountedDeviceName || d.label === nasMountedDeviceName);
    const targetDeviceInfo = diskInfo?.nasCompatibleDevices?.find(d => d.device === deviceName || d.label === deviceName);
    
    if (currentNasDeviceInfo && targetDeviceInfo) {
      // Get size values in bytes for accurate comparison
      const currentNasDeviceSize = parseSizeToBytes(currentNasDeviceInfo.size);
      const targetDeviceSize = parseSizeToBytes(targetDeviceInfo.size);
      
      // Device must be at least as large as the NAS device
      if (targetDeviceSize < currentNasDeviceSize) {
        return false;
      }
    }
  }
  
  // All tests passed, this destination is available for the device
  return true;
};

/**
 * Check if a device is encrypted
 */
export const isDeviceEncrypted = (deviceName: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo): boolean => {
    if (!diskInfo?.encryptionInfo?.encrypted_devices) return false;

    // Check if any partition of this device is encrypted
    const devicePath = `/dev/${deviceName}`;
    return diskInfo.encryptionInfo.encrypted_devices.some(ed => 
        // Check direct device match
        ed.device === devicePath ||
        // Check if any partition of this device is encrypted
        (blockDevices.find(d => d.name === deviceName)?.children || [])
            .some(child => ed.device === `/dev/${child.name}`)
    );
};

/**
 * Check if a device has an encrypted partition that is not unlocked
 */
export const hasLockedEncryptedPartition = (deviceName: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo): boolean => {
    if (!diskInfo?.encryptionInfo?.encrypted_devices) return false;

    // Check if any partition of this device is encrypted and locked (not open)
    const devicePath = `/dev/${deviceName}`;
    return diskInfo.encryptionInfo.encrypted_devices.some(ed => 
        // Check direct device match
        (ed.device === devicePath && !ed.is_open) ||
        // Check if any partition of this device is encrypted and locked
        (blockDevices.find(d => d.name === deviceName)?.children || [])
            .some(child => ed.device === `/dev/${child.name}` && !ed.is_open)
    );
};

/**
 * Check if a device has an unlocked encrypted partition
 */
export const hasUnlockedEncryptedPartition = (deviceName: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo): boolean => {
    if (!diskInfo?.encryptionInfo?.encrypted_devices) return false;

    // Check if any partition of this device is encrypted and unlocked (open)
    const devicePath = `/dev/${deviceName}`;
    return diskInfo.encryptionInfo.encrypted_devices.some(ed => 
        // Check direct device match
        (ed.device === devicePath && ed.is_open) ||
        // Check if any partition of this device is encrypted and unlocked
        (blockDevices.find(d => d.name === deviceName)?.children || [])
            .some(child => ed.device === `/dev/${child.name}` && ed.is_open)
    );
};

/**
 * Get the mapper name for an unlocked encrypted partition
 */
export const getEncryptedPartitionMapper = (
  deviceName: string,
  blockDevices: BlockDevice[],
  diskInfo?: AdminDiskInfo
): string | null => {
  if (!diskInfo || !diskInfo.encryptionInfo || !diskInfo.encryptionInfo.encrypted_devices) {
    return null;
  }
  
  const device = blockDevices.find(d => d.name === deviceName);
  if (!device || !device.children) {
    return null;
  }
  
  // Find the first unlocked encrypted partition and return its mapper name
  for (const child of device.children) {
    const childPath = `/dev/${child.name}`;
    const encryptedDevice = diskInfo.encryptionInfo.encrypted_devices.find(ed => 
      ed.device === childPath
    );
    
    if (!encryptedDevice) {
      continue;
    }
    
    // Check if the device is actually unlocked
    // A device is considered unlocked if:
    // 1. is_open is explicitly true, AND
    // 2. mapper_name is valid (not "No" or null/undefined/empty), AND
    // 3. We can find a corresponding mapper device in the block devices
    
    if (encryptedDevice.is_open !== true) {
      continue;
    }
    
    // Check if mapper_name is valid
    if (!encryptedDevice.mapper_name || 
        encryptedDevice.mapper_name === "No" || 
        encryptedDevice.mapper_name === "") {
      continue;
    }
    
    // Check if we can find the mapper device in the block devices
    const mapperExists = child.children?.some(mapper => 
      mapper.name === encryptedDevice.mapper_name
    );
    
    // Only return the mapper name if it exists
    if (mapperExists) {
      return encryptedDevice.mapper_name;
    }
  }
  
  return null;
};

/**
 * Check if a device is NAS compatible
 */
export const isDeviceNasCompatible = (
  deviceName: string,
  diskInfo?: AdminDiskInfo
): boolean => {
  return !!diskInfo?.nasCompatibleDevices?.some(d => d.device === deviceName || d.label === deviceName);
};

/**
 * Get filesystem type for a device
 */
export const getDeviceFilesystemType = (
  deviceName: string, 
  blockDevices: BlockDevice[], 
  diskInfo?: AdminDiskInfo
): string => {
  const device = blockDevices.find(d => d.name === deviceName);
  if (!device) return 'Unknown';
  
  // Check device's own filesystem
  if (device.fstype) return device.fstype;
  
  // Check mounted partition's filesystem
  const mountedPartition = device.children?.find(child => child.mountpoint !== null);
  if (mountedPartition?.fstype) return mountedPartition.fstype;
  
  // Check if it's a NAS compatible device
  const nasCompatibleDevice = diskInfo?.nasCompatibleDevices?.find(d => d.device === deviceName || d.label === deviceName);
  if (nasCompatibleDevice) {
    // Use the actual filesystem type from nasCompatibleDevice if available
    if (nasCompatibleDevice.filesystem) {
      const fsType = nasCompatibleDevice.filesystem.toUpperCase();
      return nasCompatibleDevice.mapper ? `${fsType} (encrypted)` : fsType;
    }
    // Fallback to generic description if filesystem type is not available
    return nasCompatibleDevice.mapper ? 'Encrypted' : 'Unknown';
  }
  
  return 'Unknown';
};

/**
 * Get the underlying device path for a mapper device
 * This is useful for operations that need to be performed on the raw device (like luksDump)
 */
export const getUnderlyingDeviceForMapper = (
  mapperName: string,
  blockDevices: BlockDevice[],
  diskInfo?: AdminDiskInfo
): string | null => {
  if (!diskInfo?.encryptionInfo?.encrypted_devices) {
    return null;
  }
  
  // Find the encrypted device entry for this mapper
  const encryptedDevice = diskInfo.encryptionInfo.encrypted_devices.find(
    ed => ed.mapper_name === mapperName
  );
  
  if (encryptedDevice) {
    return encryptedDevice.device;
  }
  
  // If not found in the encrypted_devices list, try to find it in the block devices
  // by searching for a mapper with this name
  for (const device of blockDevices) {
    if (!device.children) continue;
    
    for (const partition of device.children) {
      if (!partition.children) continue;
      
      const mapper = partition.children.find(m => m.name === mapperName);
      if (mapper) {
        return `/dev/${partition.name}`;
      }
    }
  }
  
  return null;
};

/**
 * Format space usage information for display
 */
export const formatSpaceUsage = (
  totalSize?: string,
  usedSpace?: string,
  availableSpace?: string,
  usePercent?: string
): string => {
  if (!totalSize || !usedSpace || !availableSpace || !usePercent) {
    return '';
  }
  
  if (totalSize === 'Unknown' || usedSpace === 'Unknown' || availableSpace === 'Unknown' || usePercent === 'Unknown') {
    return '';
  }
  
  return `${usedSpace}/${totalSize} (${usePercent}) - ${availableSpace} free`;
};

/**
 * Get space usage information for a device
 */
export const getDeviceSpaceUsage = (
  deviceName: string,
  diskInfo?: AdminDiskInfo
): { totalSize?: string; usedSpace?: string; availableSpace?: string; usePercent?: string } | null => {
  if (!diskInfo?.nasCompatibleDevices) return null;

  const nasDevice = diskInfo.nasCompatibleDevices.find(d => d.device === deviceName || d.label === deviceName);
  if (!nasDevice || !nasDevice.is_mounted) return null;
  
  return {
    totalSize: nasDevice.total_size,
    usedSpace: nasDevice.used_space,
    availableSpace: nasDevice.available_space,
    usePercent: nasDevice.use_percent
  };
};

/**
 * Check if a device has low available space (less than 10% free)
 */
export const isDeviceLowOnSpace = (
  deviceName: string,
  diskInfo?: AdminDiskInfo
): boolean => {
  const spaceUsage = getDeviceSpaceUsage(deviceName, diskInfo);
  if (!spaceUsage?.usePercent) return false;
  
  // Extract percentage number from string like "85%"
  const percentMatch = spaceUsage.usePercent.match(/(\d+)%/);
  if (!percentMatch) return false;
  
  const usedPercent = parseInt(percentMatch[1], 10);
  return usedPercent >= 90; // Consider low space if 90% or more is used
};

/**
 * Check if NAS backup device is large enough to handle sync from NAS
 */
export const canSyncNasToBackup = (diskInfo?: AdminDiskInfo): {
  canSync: boolean;
  reason: string;
  nasDevice?: string;
  backupDevice?: string;
  nasSize?: string;
  backupSize?: string;
} => {
  if (!diskInfo?.nasCompatibleDevices) {
    return { canSync: false, reason: 'No device information available' };
  }

  // Find devices mounted to NAS and NAS Backup
  const nasDevice = diskInfo.nasCompatibleDevices.find(d => d.mountpoint === '/mnt/nas' && d.is_mounted);
  const backupDevice = diskInfo.nasCompatibleDevices.find(d => d.mountpoint === '/mnt/nas_backup' && d.is_mounted);

  if (!nasDevice || !backupDevice) {
    return { 
      canSync: false, 
      reason: !nasDevice ? 'NAS not mounted' : 'NAS Backup not mounted' 
    };
  }

  // Compare device sizes - backup must be at least as large as NAS
  const nasSize = parseSizeToBytes(nasDevice.size);
  const backupSize = parseSizeToBytes(backupDevice.size);

  if (backupSize < nasSize) {
    return {
      canSync: false,
      reason: `NAS Backup device (${backupDevice.size}) is smaller than NAS device (${nasDevice.size})`,
      nasDevice: nasDevice.device,
      backupDevice: backupDevice.device,
      nasSize: nasDevice.size,
      backupSize: backupDevice.size
    };
  }

  return {
    canSync: true,
    reason: 'Both devices are mounted and backup is large enough',
    nasDevice: nasDevice.device,
    backupDevice: backupDevice.device,
    nasSize: nasDevice.size,
    backupSize: backupDevice.size
  };
};

/**
 * Compare space usage between NAS and NAS Backup to determine if sync is needed
 */
export const shouldSyncNasToBackup = (diskInfo?: AdminDiskInfo): {
  shouldSync: boolean;
  reason: string;
  nasUsage?: { totalSize?: string; usedSpace?: string; availableSpace?: string; usePercent?: string };
  backupUsage?: { totalSize?: string; usedSpace?: string; availableSpace?: string; usePercent?: string };
} => {
  if (!diskInfo?.nasCompatibleDevices) {
    return { shouldSync: false, reason: 'No device information available' };
  }

  // Find devices mounted to NAS and NAS Backup
  const nasDevice = diskInfo.nasCompatibleDevices.find(d => d.mountpoint === '/mnt/nas' && d.is_mounted);
  const backupDevice = diskInfo.nasCompatibleDevices.find(d => d.mountpoint === '/mnt/nas_backup' && d.is_mounted);

  if (!nasDevice || !backupDevice) {
    return { 
      shouldSync: false, 
      reason: !nasDevice ? 'NAS not mounted' : 'NAS Backup not mounted' 
    };
  }

  const nasUsage = getDeviceSpaceUsage(nasDevice.device, diskInfo);
  const backupUsage = getDeviceSpaceUsage(backupDevice.device, diskInfo);

  if (!nasUsage || !backupUsage) {
    return { 
      shouldSync: false, 
      reason: 'Unable to determine space usage for both devices' 
    };
  }

  // Parse usage percentages
  const nasPercentMatch = nasUsage.usePercent?.match(/(\d+)%/);
  const backupPercentMatch = backupUsage.usePercent?.match(/(\d+)%/);

  if (!nasPercentMatch || !backupPercentMatch) {
    return { 
      shouldSync: false, 
      reason: 'Unable to parse usage percentages',
      nasUsage,
      backupUsage
    };
  }

  const nasUsedPercent = parseInt(nasPercentMatch[1], 10);
  const backupUsedPercent = parseInt(backupPercentMatch[1], 10);

  // Calculate the difference in usage
  const usageDifference = nasUsedPercent - backupUsedPercent;

  // Suggest sync if NAS is significantly more full than backup (>10% difference)
  // or if NAS is getting full (>80%) and backup has space
  const shouldSync = usageDifference > 10 || (nasUsedPercent > 80 && backupUsedPercent < 90);
  
  let reason = '';
  if (shouldSync) {
    if (usageDifference > 10) {
      reason = `NAS is ${usageDifference}% more full than backup`;
    } else if (nasUsedPercent > 80) {
      reason = `NAS is getting full (${nasUsedPercent}% used)`;
    }
  } else {
    reason = `Usage difference is minimal (NAS: ${nasUsedPercent}%, Backup: ${backupUsedPercent}%)`;
  }

  return {
    shouldSync,
    reason,
    nasUsage,
    backupUsage
  };
};

/**
 * Get the display name for a device, preferring label when available
 */
export const getDeviceDisplayName = (
  deviceName: string,
  diskInfo?: AdminDiskInfo
): string => {
  if (!diskInfo) return deviceName;

  // Check encrypted devices first
  const encryptedDevice = diskInfo.encryptionInfo?.encrypted_devices?.find(ed =>
    ed.device === `/dev/${deviceName}` || ed.label === deviceName
  );
  if (encryptedDevice?.label) {
    return encryptedDevice.label;
  }

  // Check NAS compatible devices
  const nasDevice = diskInfo.nasCompatibleDevices?.find(d =>
    d.device === deviceName || d.label === deviceName
  );
  if (nasDevice?.label) {
    return nasDevice.label;
  }

  // Fallback to device name
  return deviceName;
};
