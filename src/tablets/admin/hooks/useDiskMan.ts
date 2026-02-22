import { useState, useEffect, useRef } from 'react';
import { useBroadcastData } from '../../../store';
import { useConfirmModal, useModal } from '../../../hooks/useModal';
import { useLoading } from '../../../hooks/useLoading';
import { useToast } from '../../../hooks/useToast';
import { 
  AdminDiskInfo, 
  BlockDevice, 
  UnlockResponse, 
  UnmountResponse, 
  MountResponse, 
  PermissionsResponse, 
  CheckServicesResponse,
  ManageServicesResponse,
  ServiceStatus,
  ServiceActionResult,
  SyncScheduleConfig,
  ConfirmModalResult,
  ConfirmModalOptions
} from '../types';
import { 
  isDeviceMounted, 
  isDeviceMountedToNonStandardLocation,
  getDeviceMountPoint,
  getDeviceForMountPoint,
  isDeviceAvailableForDestination,
  isDestinationAvailableForDevice,
  isDeviceEncrypted,
  hasLockedEncryptedPartition,
  hasUnlockedEncryptedPartition,
  MOUNT_DESTINATIONS,
  TOAST_DURATION,
  isDeviceUnlockedButNotMounted,
  canSyncNasToBackup,
} from '../utils/diskUtils';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { api } from '../../../api/client';
import { socketClient } from '../../../components/WebSocket';
import ServiceResultsModal from '../components/modals/ServiceResultsModal';
import SyncResultsModal from '../components/modals/SyncResultsModal';
import SyncScheduleModal from '../components/modals/SyncScheduleModal';
import React from 'react';
import { useDiskSelection } from './useDiskSelection';
import { useServiceManager } from './useServiceManager';
import { useDeviceOperations } from './useDeviceOperations';
import { useSyncState, SYNC_SESSION_KEY } from './useSyncState';

export interface DiskManState {
  selectedDevice: string | null;
  selectedDestination: string | null;
  blockDevices: BlockDevice[];
  diskInfo: AdminDiskInfo | undefined;
  isMounting: boolean;
  isUnmounting: boolean;
  isFormatting: boolean;
  isEncrypting: boolean;
  isChangingPermissions: boolean;
  isUnlocking: boolean;
  isCheckingServices: boolean;
  isManagingServices: boolean;
  isSyncing: boolean;
  isLoadingSchedule: boolean;
  isUpdatingSchedule: boolean;
  canMount: boolean;
  canUnmount: boolean;
  canFormat: boolean;
  canEncrypt: boolean;
  canChangePermissions: boolean;
  canUnlock: boolean;
  canSync: boolean;
  canAutoSync: boolean;
  isPendingConfirmation: boolean;
}

export interface DiskManActions {
  handleDeviceSelect: (deviceName: string) => void;
  handleDestinationSelect: (destinationId: string) => void;
  handleMount: () => Promise<void>;
  handleUnmount: () => Promise<void>;
  handleFormat: () => Promise<void>;
  handleEncrypt: () => Promise<void>;
  handlePermissions: () => Promise<void>;
  handleUnlock: () => Promise<void>;
  handleSync: () => Promise<void>;
  handleAutoSync: () => Promise<void>;
  handleAssignNas: (role: 'primary' | 'backup') => Promise<void>;
  handleImportToNas: () => Promise<void>;
}

// Add new function to check services based on action
const checkServices = async (action: 'mount' | 'unmount', mountPoint: string): Promise<CheckServicesResponse> => {
  try {
    const response = await api.get<CheckServicesResponse>(
      `${API_ENDPOINTS.diskman.checkServices}?action=${action}&mount_point=${encodeURIComponent(mountPoint)}`
    );
    return response;
  } catch (error) {
    console.error(`[DiskManager] Error checking services for ${action}:`, error);
    throw error;
  }
};

// Add new function to manage services
const manageServices = async (action: 'start' | 'stop', serviceNames: string[]): Promise<ManageServicesResponse> => {
  try {
    const response = await api.post<ManageServicesResponse>(
      API_ENDPOINTS.diskman.manageServices,
      {
        action,
        services: serviceNames
      }
    );
    return response;
  } catch (error) {
    console.error(`[DiskManager] Error ${action}ing services:`, error);
    throw error;
  }
};

export const useDiskMan = (): [DiskManState, DiskManActions] => {
  // Get disk info from the store
  const { getBroadcastData } = useBroadcastData();
  const diskInfo = getBroadcastData('admin_disk_info', true) as AdminDiskInfo | undefined;
  
  // Get block devices from disk info
  const blockDevices = diskInfo?.blockDevices?.blockdevices || [];
  
  // Use the service manager hook
  const [serviceState, serviceActions] = useServiceManager();
  
  // Use the device operations hook
  const [deviceState, deviceActions] = useDeviceOperations();
  
  // Auto sync state
  const [currentSyncSchedule, setCurrentSyncSchedule] = useState<SyncScheduleConfig | null>(null);
  
  // Calculate if any operation is in progress
  const isAnyOperationInProgress = !!(
    deviceState.isMounting ||
    deviceState.isUnmounting ||
    deviceState.isFormatting ||
    deviceState.isEncrypting ||
    deviceState.isChangingPermissions ||
    deviceState.isUnlocking ||
    deviceState.isSyncing ||
    deviceState.isLoadingSchedule ||
    deviceState.isUpdatingSchedule ||
    deviceState.isPendingConfirmation ||
    serviceState.isCheckingServices ||
    serviceState.isManagingServices
  );
  
  // Use the disk selection hook, passing the operation status
  const [diskSelection, diskSelectionActions] = useDiskSelection(diskInfo, isAnyOperationInProgress);

  // Calculate all states in one place to avoid duplicate declarations
  const states = {
    // Device states
    deviceMounted: diskSelection.selectedDevice ? 
      isDeviceMounted(diskSelection.selectedDevice, blockDevices, diskInfo) : false,
    isDeviceLocked: diskSelection.selectedDevice ? 
      hasLockedEncryptedPartition(diskSelection.selectedDevice, blockDevices, diskInfo) : false,
    mountPoint: diskSelection.selectedDevice ?
      getDeviceMountPoint(diskSelection.selectedDevice, blockDevices, diskInfo) : null,
    
    // Mount states
    nasIsMounted: diskInfo?.diskUsage?.disk_usage?.some(du => du.mounted === '/mnt/nas'),
    nasBackupIsMounted: diskInfo?.diskUsage?.disk_usage?.some(du => du.mounted === '/mnt/nas_backup'),
    
    // Capability flags
    canSync: false,
    canAutoSync: false,
    canMount: false,
    canUnmount: false,
    canFormat: false,
    canEncrypt: false,
    canChangePermissions: false,
    canUnlock: false
  };

  // Update capability flags based on operation status and device states
  if (!isAnyOperationInProgress) {
    states.canSync = !!(states.nasIsMounted && states.nasBackupIsMounted);
    states.canAutoSync = states.canSync;
    
    states.canMount = !!(
      diskSelection.selectedDevice && 
      diskSelection.selectedDestination && 
      !states.deviceMounted && 
      isDeviceAvailableForDestination(diskSelection.selectedDevice, diskSelection.selectedDestination, blockDevices, diskInfo)
    );
    
    states.canUnmount = !!(
      diskSelection.selectedDevice && 
      states.deviceMounted &&
      states.mountPoint !== null &&
      !states.isDeviceLocked
    );
    
    states.canFormat = !!(
      diskSelection.selectedDevice && 
      !states.deviceMounted
    );
    
    states.canEncrypt = states.canFormat;
    
    states.canChangePermissions = !!(
      blockDevices.some(device => {
        const mountPoint = getDeviceMountPoint(device.name, blockDevices, diskInfo);
        return mountPoint && mountPoint === '/mnt/nas';
      }) || 
      diskInfo?.nasCompatibleDevices?.some(device => 
        device.mountpoint === '/mnt/nas' && device.is_mounted
      ) ||
      diskInfo?.diskUsage?.disk_usage?.some(disk => 
        disk.mounted === '/mnt/nas'
      )
    );
    
    states.canUnlock = !!(
      diskSelection.selectedDevice && 
      hasLockedEncryptedPartition(diskSelection.selectedDevice, blockDevices, diskInfo)
    );
  }

  // Toast notifications
  const toast = useToast();
  
  // Confirmation modal
  const { confirm } = useConfirmModal({ title: 'Confirm Action' });
  
  // Results modal
  const { open: openModal, close: closeModal } = useModal();

  // Debug logging for state changes
  const prevDebugStateRef = useRef<any>(null);
  const prevDeviceStateRef = useRef<any>(null);
  const prevSdaStateRef = useRef<any>(null);
  const prevSyncStateRef = useRef<any>(null);

  // A device can be synced if both NAS and NAS Backup are mounted and backup is large enough
  // Updated to use diskUsage data directly and size validation
  const nasIsMounted = diskInfo?.diskUsage?.disk_usage?.some(du => du.mounted === '/mnt/nas');
  const nasBackupIsMounted = diskInfo?.diskUsage?.disk_usage?.some(du => du.mounted === '/mnt/nas_backup');
  
  // Check if sync is possible based on device sizes
  const syncValidation = canSyncNasToBackup(diskInfo);
  const canSync = !isAnyOperationInProgress && !!(nasIsMounted && nasBackupIsMounted) && syncValidation.canSync;

  // Debug logging for state changes
  useEffect(() => {
    if (diskInfo) {
      // Only log if we have meaningful changes
      const debugState = {
        timestamp: diskInfo.timestamp,
        blockDevices: diskInfo.blockDevices?.blockdevices || [],
        nasCompatibleDevices: diskInfo.nasCompatibleDevices || [],
        mountStatus: {
          nasIsMounted: states.nasIsMounted,
          nasBackupIsMounted: states.nasBackupIsMounted,
          diskUsage: diskInfo?.diskUsage?.disk_usage || []
        },
        deviceState: {
          selectedDevice: diskSelection.selectedDevice,
          deviceMounted: states.deviceMounted,
          isLocked: states.isDeviceLocked,
          mountPoint: states.mountPoint
        },
        operationStatus: {
          isAnyOperationInProgress,
          canSync: states.canSync,
          canMount: states.canMount,
          canUnmount: states.canUnmount
        }
      };

    }
  }, [
    diskInfo,
    diskSelection.selectedDevice,
    states.deviceMounted,
    states.isDeviceLocked,
    states.mountPoint,
    isAnyOperationInProgress,
    blockDevices,
    states.nasIsMounted,
    states.nasBackupIsMounted,
    states.canSync,
    states.canMount,
    states.canUnmount
  ]);

  // Debug logging for device state changes - only when device changes
  useEffect(() => {
    if (diskSelection.selectedDevice) {
      const deviceState = {
        device: diskSelection.selectedDevice,
        mounted: states.deviceMounted,
        locked: states.isDeviceLocked,
        mountPoint: states.mountPoint
      };


    }
  }, [diskSelection.selectedDevice, states.deviceMounted, states.isDeviceLocked, states.mountPoint]);

  // Sync condition logging - only when mount status changes
  useEffect(() => {
    const syncState = {
      nasIsMounted,
      nasBackupIsMounted,
      diskUsage: diskInfo?.diskUsage?.disk_usage
        ?.filter(du => du.mounted === '/mnt/nas' || du.mounted === '/mnt/nas_backup')
        .map(du => ({filesystem: du.filesystem, mounted: du.mounted})),
      canSync,
      isAnyOperationInProgress
    };

    
  }, [nasIsMounted, nasBackupIsMounted, canSync, isAnyOperationInProgress, diskInfo?.diskUsage?.disk_usage]);

  // Reset selections when disk info changes
  useEffect(() => {
    if (!diskInfo) return;
    
    const selectionState = {
      timestamp: diskInfo.timestamp,
      selectedDevice: diskSelection.selectedDevice,
      selectedDestination: diskSelection.selectedDestination,
      deviceExists: diskSelection.selectedDevice ? 
        diskInfo.blockDevices.blockdevices.some(device => device.name === diskSelection.selectedDevice) : 
        false
    };
    
    
    // If we already have a selected device, check if it still exists in the new data
    if (diskSelection.selectedDevice) {
      const deviceStillExists = diskInfo.blockDevices.blockdevices.some(
        device => device.name === diskSelection.selectedDevice
      );
      
    }
    
    // If we have a selected destination, check if it's still valid
    if (diskSelection.selectedDestination) {
      const destination = MOUNT_DESTINATIONS.find(dest => dest.id === diskSelection.selectedDestination);
      
      // If the destination exists, check if it's still valid for the selected device
      if (destination && diskSelection.selectedDevice) {
        const deviceMountPoint = getDeviceMountPoint(diskSelection.selectedDevice, blockDevices, diskInfo);
        
        // If the device is mounted to a different destination, reset the destination selection
        if (deviceMountPoint && deviceMountPoint !== destination.path) {
          
          // Try to find the correct destination matching the current mount point
          const correctDestination = MOUNT_DESTINATIONS.find(dest => dest.path === deviceMountPoint);
          
        }
      }
    }
  }, [diskInfo?.timestamp, diskSelection.selectedDevice, diskSelection.selectedDestination]);
  
  // Add useSyncState hook with isActiveSyncInProgress function
  const { syncState, isActiveSyncInProgress } = useSyncState();
  
  // Handle mount action
  const handleMount = async (): Promise<void> => {
    if (!diskSelection.selectedDevice || !diskSelection.selectedDestination) {
      toast.error("Please select both a device and a destination to mount.", { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    // Mount the device
    const mountResult = await deviceActions.mountDevice(
      diskSelection.selectedDevice, 
      diskSelection.selectedDestination,
      diskInfo
    );
    
    // If mount was successful and it's the NAS mount point, check services
    if (mountResult) {
      const destination = diskSelection.selectedDestination;
      const mountPoint = destination === 'nas' ? '/mnt/nas' : '/mnt/nas_backup';
      
      await serviceActions.handleServiceManagement('mount', mountPoint);
    }
  };
  
  // Handle unmount action
  const handleUnmount = async (): Promise<void> => {
    console.log('[DiskMan] handleUnmount called');
    
    if (!diskSelection.selectedDevice) {
      console.log('[DiskMan] No device selected for unmount');
      toast.error("Please select a device to unmount.", { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    console.log(`[DiskMan] Attempting to unmount device: ${diskSelection.selectedDevice}`);
    
    // Get mount point
    const device = blockDevices.find(d => d.name === diskSelection.selectedDevice);
    if (!device) {
      console.log(`[DiskMan] Device not found in blockDevices: ${diskSelection.selectedDevice}`);
      return;
    }
    
    // First try getDeviceMountPoint function
    let mountPoint = getDeviceMountPoint(diskSelection.selectedDevice, blockDevices, diskInfo);
    console.log(`[DiskMan] Mount point from getDeviceMountPoint: ${mountPoint}`);
    
    // If mount point is not found, check NasCompatibleDevices directly
    if (!mountPoint && diskInfo?.nasCompatibleDevices) {
      const nasDevice = diskInfo.nasCompatibleDevices.find(d => d.device === diskSelection.selectedDevice);
      if (nasDevice && nasDevice.mountpoint && nasDevice.is_mounted) {
        mountPoint = nasDevice.mountpoint;
        console.log(`[DiskMan] Mount point found in nasCompatibleDevices: ${mountPoint}`);
      }
    }
    
    // Also check disk usage data
    if (!mountPoint && diskInfo?.diskUsage?.disk_usage) {
      // For encrypted devices, check if any mapper device is related to this device
      const encryptedPartition = device.children?.find(child => {
        const childPath = `/dev/${child.name}`;
        return diskInfo.encryptionInfo?.encrypted_devices?.some(ed => 
          ed.device === childPath && ed.is_open === true
        );
      });
      
      if (encryptedPartition) {
        const encryptedDevice = diskInfo.encryptionInfo?.encrypted_devices?.find(ed => 
          ed.device === `/dev/${encryptedPartition.name}` && ed.is_open === true
        );
        
        if (encryptedDevice && encryptedDevice.mapper_name) {
          // Look for this mapper in disk usage
          const mountInfo = diskInfo.diskUsage.disk_usage.find(du => 
            du.filesystem === `/dev/mapper/${encryptedDevice.mapper_name}`
          );
          
          if (mountInfo && mountInfo.mounted) {
            mountPoint = mountInfo.mounted;
            console.log(`[DiskMan] Mount point found in disk usage for mapper ${encryptedDevice.mapper_name}: ${mountPoint}`);
          }
        }
      }
    }
    
    if (!mountPoint) {
      console.log(`[DiskMan] No mount point found for device: ${diskSelection.selectedDevice}`);
      toast.error(`Could not determine mount point for device ${diskSelection.selectedDevice}. Please check if it's actually mounted.`, { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    // First check if it's the NAS mount point
    if (mountPoint === '/mnt/nas') {
      console.log(`[DiskMan] Device is mounted to NAS, using service management flow`);
      // For NAS mount point, check services first, then unmount
      await serviceActions.handleServiceManagement(
        'unmount', 
        mountPoint, 
        async (result) => {
          console.log(`[DiskMan] Service management result: ${result}`);
          if (result) {
            // Services are handled or no services to handle, proceed with unmount
            console.log(`[DiskMan] Services handled, proceeding with performUnmount`);
            if (mountPoint) {
              await deviceActions.performUnmount(device, mountPoint);
            } else {
              console.log(`[DiskMan] Mount point is null, cannot proceed with unmount`);
              toast.error("Cannot unmount: mount point is undefined", { duration: TOAST_DURATION.NORMAL });
            }
          } else {
            console.log(`[DiskMan] Service management cancelled or failed`);
          }
        }
      );
    } else {
      console.log(`[DiskMan] Using standard unmount flow for non-NAS mount point: ${mountPoint}`);
      // For other mount points, check if the device's unmount method returned true (confirmation)
      const shouldProceedWithUnmount = await deviceActions.unmountDevice(diskSelection.selectedDevice, blockDevices, diskInfo);
      console.log(`[DiskMan] unmountDevice result: ${shouldProceedWithUnmount}`);
      
      // The unmountDevice function will handle the actual unmount for non-NAS mount points
      // so we don't need to do anything here if it returned true
    }
  };
  
  // Handle format action
  const handleFormat = async (): Promise<void> => {
    if (!diskSelection.selectedDevice) {
      toast.error("Please select a device to format.", { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    const device = blockDevices.find(d => d.name === diskSelection.selectedDevice);
    if (!device) return;
    
    if (isDeviceMounted(diskSelection.selectedDevice, blockDevices, diskInfo)) {
      toast.error(`Cannot format device ${diskSelection.selectedDevice}. Please unmount it first.`, { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    const confirmed = await confirm(
      `WARNING: Are you sure you want to format ${device.name}? This will PERMANENTLY DELETE ALL DATA on this device!

This will create a direct XFS filesystem on the device. The drive will be recognized as a valid NAS drive but will remain unencrypted throughout its lifecycle.`
    );
    
    if (confirmed) {
      // Double confirmation with PIN
      const doubleConfirmed = await confirm(
        `FINAL WARNING: Formatting ${device.name} will DESTROY ALL DATA. This action CANNOT be undone.

Please enter your admin PIN to proceed.`,
        { promptForInput: true, inputType: 'password', inputLabel: 'Admin PIN' }
      );
      
      if (doubleConfirmed.confirmed && doubleConfirmed.input) {
        await deviceActions.formatDevice(diskSelection.selectedDevice, doubleConfirmed.input);
      }
    }
  };
  
  // Handle encrypt action
  const handleEncrypt = async (): Promise<void> => {
    if (!diskSelection.selectedDevice) {
      toast.error("Please select a device to encrypt.", { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    const device = blockDevices.find(d => d.name === diskSelection.selectedDevice);
    if (!device) return;
    
    if (isDeviceMounted(diskSelection.selectedDevice, blockDevices, diskInfo)) {
      toast.error(`Cannot encrypt device ${diskSelection.selectedDevice}. Please unmount it first.`, { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    const confirmed = await confirm(
      `WARNING: Are you sure you want to encrypt ${device.name}? This will PERMANENTLY DELETE ALL DATA on this device!

This will create a LUKS encrypted container with an XFS filesystem inside. The drive will be encrypted with the keyman nas.key and will require decryption on boot of the home server.

This is a different approach than direct formatting. Direct XFS simply formats with XFS, then mounts for use. The LUKS+XFS method encrypts with LUKS first, then formats the resulting mapper device with XFS before mounting for use.`
    );
    
    if (confirmed) {
      // Double confirmation with PIN
      const doubleConfirmed = await confirm(
        `FINAL WARNING: Encrypting ${device.name} will DESTROY ALL DATA. This action CANNOT be undone.

Please enter your admin PIN to proceed.`,
        { promptForInput: true, inputType: 'password', inputLabel: 'Admin PIN' }
      );
      
      if (doubleConfirmed.confirmed && doubleConfirmed.input) {
        await deviceActions.encryptDevice(diskSelection.selectedDevice, doubleConfirmed.input);
      }
    }
  };
  
  // Handle permissions action
  const handlePermissions = async (): Promise<void> => {
    const confirmed = await confirm(
      `Are you sure you want to apply standard permissions to the NAS?

This will create application directories and set correct ownership for all configured applications in /mnt/nas.`
    );
    
    if (confirmed) {
      await deviceActions.applyPermissions();
    }
  };
  
  // Handle unlock action
  const handleUnlock = async (): Promise<void> => {
    console.log('[DISKMAN] handleUnlock: Starting unlock handler');
    
    if (!diskSelection.selectedDevice) {
      console.error('[DISKMAN] handleUnlock: No device selected');
      toast.error("Please select a device to unlock.", { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    console.log('[DISKMAN] handleUnlock: Attempting to unlock device:', {
      device: diskSelection.selectedDevice,
      blockDeviceCount: blockDevices.length,
      hasDiskInfo: !!diskInfo,
      encryptionInfo: diskInfo?.encryptionInfo
    });
    
    try {
      await deviceActions.unlockDevice(diskSelection.selectedDevice, blockDevices, diskInfo);
    } catch (error) {
      console.error('[DISKMAN] handleUnlock: Error during unlock operation:', error);
    }
  };
  
  // Handle sync action
  const handleSync = async (): Promise<void> => {
    if (!states.nasIsMounted || !states.nasBackupIsMounted) {
      toast.error("Both NAS and NAS Backup must be mounted to perform sync.", { duration: TOAST_DURATION.NORMAL });
      return;
    }

    // Check for active sync using the new function
    if (isActiveSyncInProgress()) {
      console.log(`[DiskManager] Active sync detected, reopening sync modal`);
      await deviceActions.syncDevices(); // This will detect the existing job and reopen the modal
      return;
    }

    // Otherwise, confirm and start a new sync
    const confirmed = await confirm(
      `Are you sure you want to sync data from NAS to NAS Backup?
      
This will copy all files from /mnt/nas to /mnt/nas_backup, excluding the 'lost+found' directory.
Any existing files in NAS Backup may be overwritten if they have the same name but different content.

Note: During sync, your session will not time out due to inactivity.`
    );
    
    if (confirmed) {
      await deviceActions.syncDevices();
    }
  };
  
  // Handle auto sync action
  const handleAutoSync = async (): Promise<void> => {

    if (!states.nasIsMounted || !states.nasBackupIsMounted) {
      toast.error("Both NAS and NAS Backup must be mounted to configure auto sync.", { duration: TOAST_DURATION.NORMAL });
      return;
    }
    
    // Get current schedule
    const schedule = await deviceActions.getSyncSchedule();
    setCurrentSyncSchedule(schedule);
    
    // Open modal to configure schedule
    const syncScheduleContent = React.createElement(SyncScheduleModal, {
      currentSchedule: schedule,
      onSave: async (newSchedule) => {
        const success = await deviceActions.setSyncSchedule(newSchedule);
        if (success) {
          setCurrentSyncSchedule(newSchedule);
          closeModal();
        }
      },
      onCancel: () => {
        closeModal();
      }
    });
    
    await openModal(syncScheduleContent, { hideActions: true, title: 'Configure Automatic Sync' });
  };

  // Handle NAS assignment
  const handleAssignNas = async (role: 'primary' | 'backup'): Promise<void> => {
    if (!diskSelection.selectedDevice) {
      toast.error("Please select a device to assign.", { duration: TOAST_DURATION.NORMAL });
      return;
    }

    const confirmed = await confirm(
      `Are you sure you want to assign this device as ${role} NAS? This will set the PARTLABEL for the device.`
    );

    if (confirmed) {
      try {
        const response = await api.post(API_ENDPOINTS.diskman.assignNas, {
          device: diskSelection.selectedDevice,
          role: role
        });

        if (response.status === 'success') {
          toast.success(`Device successfully assigned as ${role} NAS.`, { duration: TOAST_DURATION.NORMAL });
          // Trigger disk info update
          setPendingConfirmation();
        } else {
          toast.error(response.message || `Failed to assign device as ${role} NAS.`, { duration: TOAST_DURATION.NORMAL });
        }
      } catch (error) {
        toast.error(`Failed to assign device as ${role} NAS: ${error}`, { duration: TOAST_DURATION.NORMAL });
      }
    }
  };

  // Handle import to NAS
  const handleImportToNas = async (): Promise<void> => {
    if (!diskSelection.selectedDevice) {
      toast.error("Please select a device to import from.", { duration: TOAST_DURATION.NORMAL });
      return;
    }

    const confirmed = await confirm(
      `Are you sure you want to import data from this device to NAS? This will copy all data to a new directory in /mnt/nas.`
    );

    if (confirmed) {
      try {
        const response = await api.post(API_ENDPOINTS.diskman.importToNas, {
          sourceDevice: diskSelection.selectedDevice
        });

        if (response.status === 'success') {
          toast.success(`Data successfully imported to NAS.`, { duration: TOAST_DURATION.NORMAL });
          // Trigger disk info update
          setPendingConfirmation();
        } else {
          toast.error(response.message || `Failed to import data to NAS.`, { duration: TOAST_DURATION.NORMAL });
        }
      } catch (error) {
        toast.error(`Failed to import data to NAS: ${error}`, { duration: TOAST_DURATION.NORMAL });
      }
    }
  };

  const canFormat = !isAnyOperationInProgress && !!(diskSelection.selectedDevice && !isDeviceMounted(diskSelection.selectedDevice, blockDevices, diskInfo));
  const canEncrypt = !isAnyOperationInProgress && !!(diskSelection.selectedDevice && !isDeviceMounted(diskSelection.selectedDevice, blockDevices, diskInfo));
  
  // Permissions can be applied as long as the NAS is mounted
  const canChangePermissions = !isAnyOperationInProgress && !!(
    blockDevices.some(device => {
      const mountPoint = getDeviceMountPoint(device.name, blockDevices, diskInfo);
      return mountPoint && mountPoint === '/mnt/nas';
    }) || 
    diskInfo?.nasCompatibleDevices?.some(device => 
      device.mountpoint === '/mnt/nas' && device.is_mounted
    ) ||
    diskInfo?.diskUsage?.disk_usage?.some(disk => 
      disk.mounted === '/mnt/nas'
    )
  );
  
  const canUnlock = !isAnyOperationInProgress && !!(diskSelection.selectedDevice && hasLockedEncryptedPartition(diskSelection.selectedDevice, blockDevices, diskInfo));
  
  // A device can be synced if both NAS and NAS Backup are mounted
  // Updated to use diskUsage data directly instead of getDeviceMountPoint
  const canAutoSync = canSync; // Same conditions as manual sync
  

  // Return state and actions
  return [
    {
      selectedDevice: diskSelection.selectedDevice,
      selectedDestination: diskSelection.selectedDestination,
      blockDevices: diskSelection.blockDevices,
      diskInfo: diskSelection.diskInfo,
      
      // Operation states
      isMounting: deviceState.isMounting,
      isUnmounting: deviceState.isUnmounting,
      isFormatting: deviceState.isFormatting,
      isEncrypting: deviceState.isEncrypting,
      isChangingPermissions: deviceState.isChangingPermissions,
      isUnlocking: deviceState.isUnlocking,
      isSyncing: deviceState.isSyncing,
      isLoadingSchedule: deviceState.isLoadingSchedule,
      isUpdatingSchedule: deviceState.isUpdatingSchedule,
      isCheckingServices: serviceState.isCheckingServices,
      isManagingServices: serviceState.isManagingServices,
      isPendingConfirmation: deviceState.isPendingConfirmation,
      
      // Computed capabilities
      ...states
    },
    {
      handleDeviceSelect: diskSelectionActions.handleDeviceSelect,
      handleDestinationSelect: diskSelectionActions.handleDestinationSelect,
      handleMount,
      handleUnmount,
      handleFormat,
      handleEncrypt,
      handlePermissions,
      handleUnlock,
  handleSync,
  handleAutoSync,
  handleAssignNas,
  handleImportToNas
}
  ];
};
