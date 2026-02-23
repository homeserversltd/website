import { useState, useEffect } from 'react';
import { useToast } from '../../../hooks/useToast';
import { AdminDiskInfo, BlockDevice } from '../types';
import { 
  isDeviceMounted, 
  isDeviceMountedToNonStandardLocation,
  getDeviceMountPoint,
  getDeviceForMountPoint,
  getDeviceNasRole,
  MOUNT_DESTINATIONS,
  TOAST_DURATION,
  hasLockedEncryptedPartition,
  hasUnlockedEncryptedPartition,
  isDeviceEncrypted
} from '../utils/diskUtils';

export interface DiskSelectionState {
  selectedDevice: string | null;
  selectedDestination: string | null;
  blockDevices: BlockDevice[];
  diskInfo: AdminDiskInfo | undefined;
}

export interface DiskSelectionActions {
  handleDeviceSelect: (deviceName: string) => void;
  handleDestinationSelect: (destinationId: string) => void;
}

export const useDiskSelection = (
  diskInfo: AdminDiskInfo | undefined,
  isOperationInProgress = false
): [DiskSelectionState, DiskSelectionActions] => {
  // State for selections
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  
  // Toast notifications
  const toast = useToast();
  
  // Get block devices from disk info
  const blockDevices = diskInfo?.blockDevices?.blockdevices || [];
  
  // Reset selections when disk info changes
  useEffect(() => {
    // Only reset selections if this is the first time loading data
    if (!diskInfo) return;
    
    // console.log('[DiskSelection] Disk info updated:', { 
    //   timestamp: diskInfo.timestamp,
    //   deviceCount: diskInfo.blockDevices?.blockdevices?.length || 0,
    //   currentSelections: { device: selectedDevice, destination: selectedDestination }
    // });
    
    // If we already have a selected device, check if it still exists in the new data
    if (selectedDevice) {
      const deviceStillExists = diskInfo.blockDevices.blockdevices.some(
        device => device.name === selectedDevice
      );
      
      // Only reset device selection if the device no longer exists
      if (!deviceStillExists) {
        //  console.log('[DiskSelection] Selected device no longer exists, resetting selection');
        setSelectedDevice(null);
      }
    }
    
    // If we have a selected destination, check if it's still valid
    if (selectedDestination) {
      const destination = MOUNT_DESTINATIONS.find(dest => dest.id === selectedDestination);
      
      // If the destination exists, check if it's still valid for the selected device
      if (destination && selectedDevice) {
        const deviceMountPoint = getDeviceMountPoint(selectedDevice, blockDevices, diskInfo);
        
        // If the device is mounted to a different destination, reset the destination selection
        if (deviceMountPoint && deviceMountPoint !== destination.path) {
          // Find the correct destination for this device
          const correctDestination = MOUNT_DESTINATIONS.find(dest => dest.path === deviceMountPoint);
          if (correctDestination) {
            // console.log('[DiskSelection] Updating destination to match device mount point:', correctDestination.id);
            setSelectedDestination(correctDestination.id);
          } else {
            // console.log('[DiskSelection] Device mount point does not match any known destination, resetting selection');
            setSelectedDestination(null);
          }
        }
      }
    }
    
    // When disk info updates (e.g. after assign NAS), sync selected destination to the device's role
    // so the UI doesn't stay in limbo (e.g. "NAS" highlighted when device was just assigned as backup)
    if (selectedDevice) {
      const nasRole = getDeviceNasRole(selectedDevice, diskInfo);
      if (nasRole === 'primary' && selectedDestination !== 'nas') {
        setSelectedDestination('nas');
      } else if (nasRole === 'backup' && selectedDestination !== 'nas_backup') {
        setSelectedDestination('nas_backup');
      }
    }
  }, [diskInfo?.timestamp, selectedDevice, selectedDestination, blockDevices]);
  
  // Handle device selection
  const handleDeviceSelect = (deviceName: string) => {
    // Empty string is treated as null for deselection
    if (deviceName === '') {
      // console.log('[DiskSelection] Clearing device selection');
      setSelectedDevice(null);
      setSelectedDestination(null);
      return;
    }

    // Simply toggle selection of the device without any restrictions
    if (selectedDevice === deviceName) {
      // If this device is mounted, allow deselecting it and its destination
      const deviceMountPoint = getDeviceMountPoint(deviceName, blockDevices, diskInfo);
      if (deviceMountPoint) {
        // This device is mounted, but we'll allow deselecting it
        // console.log('[DiskSelection] Deselecting mounted device:', deviceName);
        setSelectedDevice(null);
        
        // Also deselect its destination
        const destination = MOUNT_DESTINATIONS.find(dest => dest.path === deviceMountPoint);
        if (destination && selectedDestination === destination.id) {
          setSelectedDestination(null);
        }
        return;
      }
      
      // Device is not mounted, so we can safely deselect it
      // console.log('[DiskSelection] Deselecting device:', deviceName);
      setSelectedDevice(null);
      
      // Always deselect the destination when deselecting a device
      setSelectedDestination(null);
    } else {
      // This is a new selection, different from the previous one
      // console.log('[DiskSelection] Selecting device:', deviceName);
      setSelectedDevice(deviceName);
      
      // Get device encryption status
      const isEncrypted = isDeviceEncrypted(deviceName, blockDevices, diskInfo);
      const isLocked = hasLockedEncryptedPartition(deviceName, blockDevices, diskInfo);
      const isUnlocked = hasUnlockedEncryptedPartition(deviceName, blockDevices, diskInfo);
      
        // console.log(`[DISKMAN] handleDeviceSelect: Device encryption status:`, {
        //   device: deviceName,
        //   isEncrypted,
        //   isLocked,
        //   isUnlocked,
        //   encryptionInfo: diskInfo?.encryptionInfo,
        //   deviceChildren: diskInfo?.blockDevices?.blockdevices?.find(d => d.name === deviceName)?.children?.map(c => ({
        //     name: c.name,
        //     type: c.type,
        //     children: c.children?.map(cc => ({
        //       name: cc.name,
        //       type: cc.type
        //     }))
        //   }))
        // });
      
      // If device is mounted, auto-select its destination if it's a standard one
      const mountPoint = getDeviceMountPoint(deviceName, blockDevices, diskInfo);
      
      if (mountPoint) {
        const destination = MOUNT_DESTINATIONS.find(dest => dest.path === mountPoint);
        setSelectedDestination(destination?.id || null);
        
        // Show toast notification for mounted device - only on first selection
        if (isDeviceMountedToNonStandardLocation(deviceName, blockDevices, diskInfo)) {
          toast.warning(`Device ${deviceName} is mounted. Unmount it first to select a different destination or remove the device.`, { duration: TOAST_DURATION.NORMAL });
        } else {
          toast.info(`Device ${deviceName} is mounted. Unmount it first to select a different destination or remove the device.`, { duration: TOAST_DURATION.NORMAL });
        }
      } else if (isLocked) {
        // Show toast for locked encrypted device
        toast.info(`Device ${deviceName} has a locked encrypted partition. You need to unlock it before mounting.`, { duration: TOAST_DURATION.NORMAL });
        
        // Clear any selected destination since we can't mount a locked device
        setSelectedDestination(null);
      } else if (isUnlocked) {
        // Device is unlocked but not mounted - all destinations are available
        // console.log(`[DiskSelection] Device ${deviceName} is unlocked and ready to mount`);
        
        // Clear destination to allow user to choose where to mount
        setSelectedDestination(null);
      } else {
        // Only clear destination if it's for a different mounted device
        if (selectedDestination) {
          const destination = MOUNT_DESTINATIONS.find(dest => dest.id === selectedDestination);
          if (destination && destination.path) {
            const mountedDeviceName = getDeviceForMountPoint(destination.path, blockDevices);
            if (mountedDeviceName && mountedDeviceName !== deviceName) {
              setSelectedDestination(null);
            }
          }
        }
      }
    }
  };
  
  // Handle destination selection
  const handleDestinationSelect = (destinationId: string) => {

    // Empty string is treated as null for deselection
    if (destinationId === '') {
      // console.log('[DiskSelection] Clearing destination selection');
      setSelectedDestination(null);
      return;
    }

    // Find the destination
    const destination = MOUNT_DESTINATIONS.find(dest => dest.id === destinationId);
    if (!destination) return;
    
    // Check if this destination is already mounted by a different device
    const mountedDeviceName = destination.path ? getDeviceForMountPoint(destination.path, blockDevices) : null;
    const isMountedByOtherDevice = mountedDeviceName && (!selectedDevice || mountedDeviceName !== selectedDevice);
    
    // Don't allow selecting destinations that are already taken by other devices
    if (isMountedByOtherDevice) {
      toast.warning(`This destination is already in use by device ${mountedDeviceName}.`, { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    // If we have a selected device that's mounted, and this is its destination,
    // allow deselecting it
    if (selectedDevice) {
      const deviceMountPoint = getDeviceMountPoint(selectedDevice, blockDevices, diskInfo);
      if (deviceMountPoint && destination.path === deviceMountPoint) {
        // This is the destination for the mounted device
        // If it's already selected, deselect both the destination and the device
        if (selectedDestination === destinationId) {
          // console.log('[DiskSelection] Deselecting destination and its mounted device:', destinationId);
          setSelectedDestination(null);
          setSelectedDevice(null);
          return;
        }
      }
    }
    
    // If this destination is mounted by any device, allow deselecting it
    if (mountedDeviceName && selectedDestination === destinationId) {
      // This destination is mounted and already selected - deselect it and its device
      // console.log('[DiskSelection] Deselecting mounted destination and its device:', destinationId);
      setSelectedDestination(null);
      setSelectedDevice(null);
      return;
    }
    
    // Toggle selection for available destinations
    if (selectedDestination === destinationId) {
      // Destination is already selected, so deselect it
      // console.log('[DiskSelection] Deselecting destination:', destinationId);
      setSelectedDestination(null);
    } else {
      // Select the new destination
      // console.log('[DiskSelection] Selecting destination:', destinationId);
      setSelectedDestination(destinationId);
      
      // If destination is mounted, auto-select its device
      if (destination && destination.path) {
        const deviceName = getDeviceForMountPoint(destination.path, blockDevices);
        if (deviceName && deviceName !== selectedDevice) {
          setSelectedDevice(deviceName);
          toast.info(`Selected device ${deviceName} that is mounted to this destination.`, { duration: TOAST_DURATION.NORMAL });
        }
      }
    }
  };

  return [
    {
      selectedDevice,
      selectedDestination,
      blockDevices,
      diskInfo
    },
    {
      handleDeviceSelect,
      handleDestinationSelect
    }
  ];
}; 