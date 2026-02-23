import React from 'react';
import { useLoading } from '../../../hooks/useLoading';
import { useToast } from '../../../hooks/useToast';
import { useConfirmModal, useModal } from '../../../hooks/useModal';
import { useBroadcastData } from '../../../store';
import { debug, createComponentLogger } from '../../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('useDeviceOperations');
import { 
  MountResponse, 
  UnmountResponse, 
  PermissionsResponse, 
  UnlockResponse,
  BlockDevice,
  AdminDiskInfo,
  SyncResponse,
  SyncScheduleConfig,
  GetSyncScheduleResponse,
  SetSyncScheduleResponse,
  FormatResponse,
  EncryptResponse,
  PinVerificationResponse
} from '../types';
import {
  isDeviceMounted,
  hasLockedEncryptedPartition,
  hasUnlockedEncryptedPartition,
  isDeviceEncrypted,
  getDeviceMountPoint,
  TOAST_DURATION,
  MOUNT_DESTINATIONS,
  getDeviceDisplayName
} from '../utils/diskUtils';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { api } from '../../../api/client';
import { socketClient, disableInactivityTimeout, enableInactivityTimeout } from '../../../components/WebSocket';
import { useState, useRef, useEffect } from 'react';
import SyncResultsModal from '../components/modals/SyncResultsModal';
import { PasswordInputModal } from '../components/modals/PasswordInputModal';
import { encryptData, encryptDataAsync } from '../../../utils/secureTransmission';
import { KeepaliveManager } from '../../../utils/keepalive';
import { useSyncState, SYNC_SESSION_KEY } from './useSyncState';

export interface DeviceOperationsState {
  isMounting: boolean;
  isUnmounting: boolean;
  isFormatting: boolean;
  isEncrypting: boolean;
  isChangingPermissions: boolean;
  isUnlocking: boolean;
  isSyncing: boolean;
  isLoadingSchedule: boolean;
  isUpdatingSchedule: boolean;
  isPendingConfirmation: boolean;
}

export interface DeviceOperationsActions {
  mountDevice: (device: string, destination: string, diskInfo?: AdminDiskInfo) => Promise<boolean>;
  unmountDevice: (device: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo) => Promise<boolean>;
  formatDevice: (device: string, pin: string) => Promise<boolean>;
  encryptDevice: (device: string, pin: string) => Promise<boolean>;
  applyPermissions: () => Promise<boolean>;
  unlockDevice: (device: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo) => Promise<boolean>;
  performUnmount: (device: BlockDevice, mountPoint: string) => Promise<boolean>;
  syncDevices: () => Promise<boolean>;
  getSyncSchedule: () => Promise<SyncScheduleConfig | null>;
  setSyncSchedule: (schedule: SyncScheduleConfig) => Promise<boolean>;
  setPendingConfirmation: () => void;
}

export const useDeviceOperations = (): [DeviceOperationsState, DeviceOperationsActions] => {
  // Toast notifications
  const toast = useToast();
  
  // Confirmation modal
  const { confirm } = useConfirmModal({ title: 'Confirm Action' });
  
  // Broadcast data
  const { getBroadcastData, getLastUpdated } = useBroadcastData();
  
  // Loading states for actions
  const { isLoading: isMounting, startLoading: startMounting, stopLoading: stopMounting } = useLoading();
  const { isLoading: isUnmounting, startLoading: startUnmounting, stopLoading: stopUnmounting } = useLoading();
  const { isLoading: isFormatting, startLoading: startFormatting, stopLoading: stopFormatting } = useLoading();
  const { isLoading: isEncrypting, startLoading: startEncrypting, stopLoading: stopEncrypting } = useLoading();
  const { isLoading: isChangingPermissions, startLoading: startChangingPermissions, stopLoading: stopChangingPermissions } = useLoading();
  const { isLoading: isUnlocking, startLoading: startUnlocking, stopLoading: stopUnlocking } = useLoading();
  const { isLoading: isSyncing, startLoading: startSyncing, stopLoading: stopSyncing } = useLoading();
  const { isLoading: isLoadingSchedule, startLoading: startLoadingSchedule, stopLoading: stopLoadingSchedule } = useLoading();
  const { isLoading: isUpdatingSchedule, startLoading: startUpdatingSchedule, stopLoading: stopUpdatingSchedule } = useLoading();
  
  // Track if we're waiting for backend confirmation
  const [isPendingConfirmation, setIsPendingConfirmation] = useState(false);
  const lastKnownUpdateTimestamp = useRef<number>(0);
  
  // Track when admin_disk_info updates
  useEffect(() => {
    const currentTimestamp = getLastUpdated('admin_disk_info', 'admin');
    if (currentTimestamp && isPendingConfirmation && currentTimestamp > lastKnownUpdateTimestamp.current) {
      console.log('[DiskMan] admin_disk_info pulse received, clearing pending confirmation', { currentTimestamp, lastKnown: lastKnownUpdateTimestamp.current });
      debug('Received disk info update, clearing pending confirmation state');
      setIsPendingConfirmation(false);
      lastKnownUpdateTimestamp.current = currentTimestamp;
    } else if (currentTimestamp && !isPendingConfirmation) {
      // Keep track of the last timestamp even when not pending
      lastKnownUpdateTimestamp.current = currentTimestamp;
    }
  }, [getLastUpdated('admin_disk_info', 'admin')]);
  
  // Helper function to set pending confirmation state
  const setPendingConfirmation = () => {
    console.log('[DiskMan] setPendingConfirmation called – UI will block until next admin_disk_info pulse');
    setIsPendingConfirmation(true);
    debug('Setting pending confirmation state');
  };

  const { open: openModal, close: closeModal } = useModal();

  // Add verifyPin function after the imports
  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      // Encrypt the PIN for secure transmission
      const encryptedPin = encryptData(pin);
      if (!encryptedPin) {
        throw new Error('Failed to encrypt PIN');
      }

      const response = await api.post<PinVerificationResponse>(API_ENDPOINTS.auth.verifyPin, {
        encryptedPin
      });

      return response.verified === true;
    } catch (error) {
      logger.error('Error verifying PIN:', error);
      return false;
    }
  };

  // Update useSyncState hook to include isActiveSyncInProgress
  const { syncState, registerSyncJob, isActiveSyncInProgress } = useSyncState();

  // Handle manual password unlock with modal
  const handleManualPasswordUnlock = async (deviceName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const handlePasswordSubmit = async (password: string) => {
        try {
          debug('handleManualPasswordUnlock: Attempting unlock with manual password for:', deviceName);
          
          // Encrypt the password for secure transmission
          const encryptedPassword = await encryptDataAsync(password);
          if (!encryptedPassword) {
            toast.error("Failed to encrypt password for secure transmission.", { duration: TOAST_DURATION.NORMAL });
            resolve(false);
            return;
          }

          // Call the API with encrypted password
          const response = await api.post<UnlockResponse>(
            API_ENDPOINTS.diskman.unlockWithPassword,
            {
              device: deviceName,
              encryptedPassword
            }
          );

          if (response.status === 'success') {
            toast.success(response.message || `Successfully unlocked device ${deviceName}.`, { duration: TOAST_DURATION.NORMAL });
            setPendingConfirmation();
            closeModal(); // Close the modal on success
            resolve(true);
          } else {
            logger.error('handleManualPasswordUnlock: Failed to unlock with manual password:', response.message);
            toast.error(response.message || "Failed to unlock device with provided password.", { duration: TOAST_DURATION.NORMAL });
            resolve(false);
          }
        } catch (error) {
          logger.error('handleManualPasswordUnlock: Error during manual password unlock:', error);
          toast.error("An error occurred while unlocking the device.", { duration: TOAST_DURATION.NORMAL });
          resolve(false);
        }
      };

      const handleCancel = () => {
        debug('handleManualPasswordUnlock: User cancelled password entry');
        closeModal();
        resolve(false);
      };

      // Open the password input modal
      const modalContent = React.createElement(PasswordInputModal, {
        message: `The NAS key failed to unlock device ${deviceName}. Please enter the device's encryption password:`,
        placeholder: "Device encryption password",
        onSubmit: handlePasswordSubmit,
        onCancel: handleCancel
      });

      openModal(modalContent, { hideActions: true, title: "Enter Device Password" });
    });
  };

  // Mount device
  const mountDevice = async (deviceName: string, destinationId: string, diskInfo?: AdminDiskInfo): Promise<boolean> => {
    try {
      startMounting();
      
      // Get block devices
      const blockDevices = diskInfo?.blockDevices?.blockdevices || [];
      
      // Find device and destination
      const device = blockDevices.find(d => d.name === deviceName);
      const destination = MOUNT_DESTINATIONS.find(d => d.id === destinationId);

      if (!device || !destination) {
        toast.error("Invalid device or destination selected.", { duration: TOAST_DURATION.NORMAL });
        return false;
      }

      debug(`Mounting ${device.name} to ${destination.path}`);

      // Get device label for API call
      const encryptedDevice = diskInfo?.encryptionInfo?.encrypted_devices?.find(
        ed => ed.device === `/dev/${device.name}` || ed.label === deviceName
      );
      const nasDevice = diskInfo?.nasCompatibleDevices?.find(
        d => d.device === deviceName || d.label === deviceName
      );
      const deviceLabel = encryptedDevice?.label || nasDevice?.label;

      // Find mapper name if this is an encrypted device with an unlocked partition
      let mapperName: string | null = null;

      // 1. Check if the device itself is in encrypted_devices and is open
      if (diskInfo?.encryptionInfo?.encrypted_devices) {
        const encDevice = diskInfo.encryptionInfo.encrypted_devices.find(
          ed => (ed.device === `/dev/${device.name}` || ed.label === deviceName) && ed.is_open && ed.mapper_name
        );
        if (encDevice) {
          mapperName = encDevice.mapper_name;
          debug(`Found mapper from encryption info (top-level device): ${mapperName}`);
        }
      }

      // 2. If not, check children as before
      if (!mapperName && device.children) {
        for (const partition of device.children) {
          if (partition.children) {
            const mapper = partition.children.find(child => child.type === 'crypt');
            if (mapper) {
              mapperName = mapper.name;
              debug(`Found mapper: ${mapperName}`);
              break;
            }
          }
        }
      }

      // 3. If still not found, check for open encrypted child partitions
      if (!mapperName && diskInfo?.encryptionInfo?.encrypted_devices) {
        const encDevice = diskInfo.encryptionInfo.encrypted_devices.find(ed =>
          ed.is_open && device.children?.some(child => ed.device === `/dev/${child.name}`)
        );
        if (encDevice && encDevice.mapper_name) {
          mapperName = encDevice.mapper_name;
          debug(`Found mapper from encryption info (child): ${mapperName}`);
        }
      }

      // Call the API to mount the device
      const response = await api.post<MountResponse>(
        API_ENDPOINTS.diskman.mount,
        {
          device: deviceLabel || device.name,
          mountpoint: destination.path,
          mapper: mapperName
        }
      );
      
      if (response.status === 'success') {
        const displayName = getDeviceDisplayName(deviceName, diskInfo);
        toast.success(response.message || `Successfully mounted ${displayName} to ${destination.label}.`, { duration: TOAST_DURATION.NORMAL });
        // Set pending confirmation to wait for next admin_disk_info update
        setPendingConfirmation();
        return true;
      } else {
        toast.error(response.message || `Failed to mount device.`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } catch (error) {
      logger.error('Error mounting device:', error);
      toast.error(`Failed to mount device: ${error instanceof Error ? error.message : 'Unknown error'}`, { duration: TOAST_DURATION.NORMAL });
      return false;
    } finally {
      stopMounting();
    }
  };
  
  // Unmount device
  const unmountDevice = async (deviceName: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo): Promise<boolean> => {
    debug(`Unmounting device: ${deviceName}`);
    try {
      // Find device
      const device = blockDevices.find(d => d.name === deviceName);
      if (!device) {
        debug(`Device not found: ${deviceName}`);
        toast.error("Invalid device selected.", { duration: TOAST_DURATION.NORMAL });
        return false;
      }

      // Get device label for API call
      const encryptedDevice = diskInfo?.encryptionInfo?.encrypted_devices?.find(
        ed => ed.device === `/dev/${device.name}` || ed.label === deviceName
      );
      const nasDevice = diskInfo?.nasCompatibleDevices?.find(
        d => d.device === deviceName || d.label === deviceName
      );
      const deviceLabel = encryptedDevice?.label || nasDevice?.label;

      // Check if the device is mounted
      const isMounted = isDeviceMounted(deviceName, blockDevices, diskInfo);
      
      if (!isMounted) {
        debug(`Device ${deviceName} is not mounted`);
        toast.error(`Device ${deviceName} is not mounted.`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
      
      // Try to determine the mount point using multiple methods
      // 1. First try getDeviceMountPoint
      let effectiveMountPoint = getDeviceMountPoint(deviceName, blockDevices, diskInfo);
      debug(`Mount point: ${effectiveMountPoint}`);
      
      // 2. Check NAS compatible devices for mount points
      if (!effectiveMountPoint && diskInfo?.nasCompatibleDevices) {
        const nasDevice = diskInfo.nasCompatibleDevices.find(d => 
          d.device === deviceName && d.is_mounted === true && d.mountpoint
        );
        if (nasDevice && nasDevice.mountpoint) {
          effectiveMountPoint = nasDevice.mountpoint;
          debug(`Found mount point from NAS info: ${effectiveMountPoint}`);
        }
      }
      
      // 3. Check disk usage specifically for encrypted devices
      if (!effectiveMountPoint && diskInfo?.diskUsage?.disk_usage && diskInfo.encryptionInfo?.encrypted_devices) {
        // Find any encrypted partition on this device
        const encryptedPartition = device.children?.find(child => {
          const childPath = `/dev/${child.name}`;
          return diskInfo.encryptionInfo?.encrypted_devices?.some(ed => 
            ed.device === childPath && ed.is_open === true
          );
        });
        
        if (encryptedPartition) {
          // Find the encrypted device info
          const encryptedDevice = diskInfo.encryptionInfo.encrypted_devices.find(ed => 
            ed.device === `/dev/${encryptedPartition.name}` && ed.is_open === true
          );
          
          if (encryptedDevice && encryptedDevice.mapper_name) {
            // Look for this mapper in disk usage
            const mapperInfo = diskInfo.diskUsage.disk_usage.find(du => 
              du.filesystem === `/dev/mapper/${encryptedDevice.mapper_name}`
            );
            
            if (mapperInfo && mapperInfo.mounted) {
              effectiveMountPoint = mapperInfo.mounted;
              debug(`Found mount point from disk usage for mapper: ${effectiveMountPoint}`);
            }
          }
        }
      }
      
      // 4. Fallback to checking for mapper devices
      if (!effectiveMountPoint && device.children) {
        for (const partition of device.children) {
          if (partition.children) {
            const mapper = partition.children.find(child => child.type === 'crypt');
            if (mapper && mapper.mountpoints && mapper.mountpoints.length > 0) {
              const validMountPoint = mapper.mountpoints.find(mp => mp !== null);
              if (validMountPoint) {
                effectiveMountPoint = validMountPoint;
                debug(`Found mount point from mapper: ${effectiveMountPoint}`);
                break;
              }
            }
          }
        }
      }
      
      // 5. Check disk usage as a last resort for any related filesystem
      if (!effectiveMountPoint && diskInfo?.diskUsage?.disk_usage) {
        const diskUsage = diskInfo.diskUsage.disk_usage;
        
        // Look for any mount point related to this device or its mappers
        for (const du of diskUsage) {
          if (du.filesystem.includes(`/dev/${deviceName}`) || 
              (du.filesystem.includes('/dev/mapper/') && 
               device.children?.some(child => 
                 du.filesystem.includes(child.name) || 
                 child.children?.some(mapper => du.filesystem.includes(mapper.name))
               ))) {
            effectiveMountPoint = du.mounted;
            debug(`Found mount point from disk usage: ${effectiveMountPoint}`);
            break;
          }
        }
      }
      
      // Verify that we have an actual mount point after all our checks
      if (!effectiveMountPoint) {
        debug(`Could not determine mount point for device ${deviceName}`);
        toast.error(`Could not determine mount point for device ${deviceName}.`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
      
      // If mount point is not /mnt/nas, use the standard unmount flow
      if (effectiveMountPoint !== '/mnt/nas') {
        debug(`Standard unmount for ${deviceName} from ${effectiveMountPoint}`);
        const confirmed = await confirm(
          `Are you sure you want to unmount the ${device.name} drive from ${effectiveMountPoint}?`
        );
        
        if (confirmed) {
          return await performUnmount(device, effectiveMountPoint);
        }
        debug('User cancelled unmount');
        return false;
      }
      
      // For /mnt/nas, the service manager will handle confirmations and service checks
      debug(`NAS unmount for ${deviceName} from ${effectiveMountPoint}`);
      // Return true to signal that this device needs service handling
      return true;
    } catch (error) {
      logger.error('Error in unmount flow:', error);
      toast.error(`Error during unmount process: ${error instanceof Error ? error.message : 'Unknown error'}`, { duration: TOAST_DURATION.NORMAL });
      return false;
    }
  };
  
  // Helper function to perform actual unmount operation
  const performUnmount = async (device: BlockDevice, mountPoint: string): Promise<boolean> => {
    try {
      startUnmounting();
      
      const diskInfo = getBroadcastData('admin_disk_info', true) as AdminDiskInfo | undefined;
      
      // Find mapper name if this is an encrypted device
      let mapperName: string | null = null;
      if (device.children) {
        for (const partition of device.children) {
          if (partition.children) {
            const mapper = partition.children.find(child => 
              child.type === 'crypt' && 
              (child.mountpoints?.some(mp => mp === mountPoint) || 
               diskInfo?.diskUsage?.disk_usage?.some(du => 
                 du.filesystem.includes(child.name) && du.mounted === mountPoint
               ))
            );
            if (mapper) {
              mapperName = mapper.name;
              debug(`Found mapper for unmount: ${mapperName}`);
              break;
            }
            
            // If we didn't find a mapper with matching mount point, check for any mapper
            if (!mapperName) {
              const anyMapper = partition.children.find(child => child.type === 'crypt');
              if (anyMapper) {
                mapperName = anyMapper.name;
                debug(`Found potential mapper: ${mapperName}`);
              }
            }
          }
        }
      }
      
      // If we still don't have a mapper name, check encryption info
      if (!mapperName && diskInfo?.encryptionInfo?.encrypted_devices) {
        // First try to find an exact match for the mount point
        const encryptedDevice = diskInfo.encryptionInfo.encrypted_devices.find(ed => 
          ed.is_open && device.children?.some(child => ed.device === `/dev/${child.name}`)
        );
        
        if (encryptedDevice) {
          mapperName = encryptedDevice.mapper_name;
          debug(`Found mapper from encryption info: ${mapperName}`);
        }
      }
      
      // If we still don't have a mapper name, check NAS compatible devices
      if (!mapperName && diskInfo?.nasCompatibleDevices) {
        const nasDevice = diskInfo.nasCompatibleDevices.find(d => 
          d.device === device.name && d.mapper && d.mountpoint === mountPoint
        );
        
        if (nasDevice && nasDevice.mapper) {
          mapperName = nasDevice.mapper;
          debug(`Found mapper from NAS compatible devices: ${mapperName}`);
        }
      }
      
      // Last resort: check disk usage for any mapper related to this device
      if (!mapperName && diskInfo?.diskUsage?.disk_usage) {
        const diskUsage = diskInfo.diskUsage.disk_usage;
        for (const du of diskUsage) {
          if (du.filesystem.startsWith('/dev/mapper/') && du.mounted === mountPoint) {
            // Extract mapper name from filesystem path
            const mapperPath = du.filesystem.split('/');
            mapperName = mapperPath[mapperPath.length - 1];
            debug(`Found mapper from disk usage: ${mapperName}`);
            break;
          }
        }
      }
      
      debug(`Unmounting ${device.name} from ${mountPoint}${mapperName ? ` (mapper: ${mapperName})` : ''}`);
      
      // Call the API to unmount the device
      const response = await api.post<UnmountResponse>(
        API_ENDPOINTS.diskman.unmount,
        {
          device: deviceLabel || device.name,
          mapper: mapperName,
          mount_point: mountPoint
        }
      );
      
      if (response.status === 'success') {
        const displayName = getDeviceDisplayName(deviceName, diskInfo);
        toast.success(response.message || `Successfully unmounted ${displayName}.`, { duration: TOAST_DURATION.NORMAL });
        
        // Set pending confirmation to wait for next admin_disk_info update
        setPendingConfirmation();
        
        // Even if verification fails, mark the operation as pending confirmation
        return true;
      } else {
        toast.error(response.message || `Failed to unmount device.`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } catch (error) {
      logger.error('Error unmounting device:', error);
      toast.error(`Failed to unmount device: ${error instanceof Error ? error.message : 'Unknown error'}`, { duration: TOAST_DURATION.NORMAL });
      return false;
    } finally {
      stopUnmounting();
    }
  };

  // Modify formatDevice function
  const formatDevice = async (device: string, pin: string): Promise<boolean> => {
    try {
      // First verify the PIN
      const verified = await verifyPin(pin);
      if (!verified) {
        toast.error('Invalid PIN. Format operation cancelled.', { duration: TOAST_DURATION.NORMAL });
        return false;
      }

      startFormatting();
      
      debug(`Formatting ${device}`);
      
      // Make the API call - LUKS containers will be handled automatically
      const response = await api.post<FormatResponse>(API_ENDPOINTS.diskman.format, {
        device: device
      });
      
      if (response.status === 'success') {
        // Show success message
        const message = response.details?.closed_luks?.length
          ? `Successfully closed LUKS containers and formatted ${device} with XFS.`
          : response.message || `Successfully formatted ${device}.`;
          
        toast.success(message, { duration: TOAST_DURATION.NORMAL });
        
        // Set pending confirmation to wait for next admin_disk_info update
        setPendingConfirmation();
        
        return true;
      } else {
        // Show error message
        const errorMessage = response.details?.failed_mapper
          ? `Failed to close LUKS container ${response.details.failed_mapper}. Cannot proceed with format.`
          : response.message || `Failed to format device.`;
          
        toast.error(errorMessage, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } catch (error) {
      logger.error('Error formatting device:', error);
      toast.error(`Failed to format device: ${error instanceof Error ? error.message : 'Unknown error'}`, { duration: TOAST_DURATION.NORMAL });
      return false;
    } finally {
      stopFormatting();
    }
  };
  
  // Modify encryptDevice function
  const encryptDevice = async (device: string, pin: string): Promise<boolean> => {
    try {
      // First verify the PIN
      const verified = await verifyPin(pin);
      if (!verified) {
        toast.error('Invalid PIN. Encrypt operation cancelled.', { duration: TOAST_DURATION.NORMAL });
        return false;
      }

      startEncrypting();
      debug(`Encrypting ${device}`);

      // Make the actual API call
      const response = await api.post<EncryptResponse>(
        API_ENDPOINTS.diskman.encrypt,
        {
          device: device
        }
      );

      if (response.status === 'success') {
        // Show success message with mapper details if available
        const message = response.details?.mapper 
          ? `Successfully encrypted ${device}. Created encrypted device at ${response.details.mapper}`
          : response.message || `Successfully encrypted ${device}.`;
        
        toast.success(message, { duration: TOAST_DURATION.NORMAL });
        
        // Set pending confirmation to wait for next admin_disk_info update
        setPendingConfirmation();
        
        return true;
      } else {
        toast.error(response.message || `Failed to encrypt device.`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } catch (error) {
      logger.error('Error encrypting device:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(message, { duration: TOAST_DURATION.LONG });
      return false;
    } finally {
      stopEncrypting();
    }
  };
  
  // Apply permissions
  const applyPermissions = async (): Promise<boolean> => {
    try {
      startChangingPermissions();
      debug('Applying standard permissions to /mnt/nas');
      
      // Call the API to apply permissions
      const response = await api.post<PermissionsResponse>(
        API_ENDPOINTS.diskman.permissions,
        {} // No specific payload needed - the backend will apply all permissions from config
      );
      
      if (response.status === 'success') {
        toast.success(response.message || `Successfully applied standard permissions to NAS.`, { duration: TOAST_DURATION.NORMAL });
        // Do NOT set pending confirmation for permissions
        // This operation doesn't trigger a admin_disk_info event
        return true;
      } else {
        toast.error(response.message || `Failed to apply permissions.`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } catch (error) {
      logger.error('Error applying permissions:', error);
      toast.error(`Failed to apply permissions: ${error instanceof Error ? error.message : 'Unknown error'}`, { duration: TOAST_DURATION.NORMAL });
      return false;
    } finally {
      stopChangingPermissions();
    }
  };
  
  // Unlock device
  const unlockDevice = async (deviceName: string, blockDevices: BlockDevice[], diskInfo?: AdminDiskInfo): Promise<boolean> => {
    try {
      // Find device
      const device = blockDevices.find(d => d.name === deviceName);
      if (!device) {
        logger.error('unlockDevice: Invalid device selected:', deviceName);
        toast.error("Invalid device selected.", { duration: TOAST_DURATION.NORMAL });
        return false;
      }
      
      debug('unlockDevice: Starting unlock process for device:', {
        device: deviceName,
        blockDevices: blockDevices.map(d => d.name),
        hasEncryption: !!diskInfo?.encryptionInfo,
        encryptedDevices: diskInfo?.encryptionInfo?.encrypted_devices
      });
      
      if (!hasLockedEncryptedPartition(deviceName, blockDevices, diskInfo)) {
        // Check if the device has any encrypted partitions at all
        const hasEncrypted = isDeviceEncrypted(deviceName, blockDevices, diskInfo);
        
        debug('unlockDevice: Device encryption check:', {
          device: deviceName,
          hasEncrypted,
          hasUnlocked: hasUnlockedEncryptedPartition(deviceName, blockDevices, diskInfo)
        });
        
        if (hasEncrypted) {
          // If the device has encrypted partitions but they're not locked, it's already unlocked
          if (hasUnlockedEncryptedPartition(deviceName, blockDevices, diskInfo)) {
            debug('unlockDevice: Device is already unlocked:', deviceName);
            toast.info(`Device ${deviceName} is already unlocked.`, { duration: TOAST_DURATION.NORMAL });
          } else {
            logger.warn('unlockDevice: Device status unclear:', deviceName);
            toast.warning(`Device ${deviceName} appears to be encrypted but its status is unclear. Try refreshing the page or check the device status from the command line.`, { duration: TOAST_DURATION.NORMAL });
          }
        } else {
          logger.error('unlockDevice: No encrypted partitions found:', deviceName);
          toast.error(`Device ${deviceName} does not have any encrypted partitions to unlock.`, { duration: TOAST_DURATION.NORMAL });
        }
        return false;
      }
      
      startUnlocking();
      debug(`unlockDevice: Making API call to unlock device ${deviceName}`);
      
      // Call the API to unlock the device
      const response = await api.post<UnlockResponse>(
        API_ENDPOINTS.diskman.unlock,
        {
          device: deviceName
        }
      );
      
      debug('unlockDevice: Received API response:', {
        status: response.status,
        message: response.message,
        details: response.details,
        needsManualPassword: response.needs_manual_password
      });
      
      if (response.status === 'success') {
        toast.success(response.message || `Successfully unlocked device ${deviceName}.`, { duration: TOAST_DURATION.NORMAL });
        
        // Set pending confirmation to wait for next admin_disk_info update
        setPendingConfirmation();
        
        return true;
      } else {
        // Handle manual password requirement
        if (response.needs_manual_password) {
          debug('unlockDevice: Manual password required for:', deviceName);
          return await handleManualPasswordUnlock(deviceName);
        }
        
        // Handle "already exists" error as a success
        if (response.message && response.message.includes("already exists")) {
          debug('unlockDevice: Device already unlocked:', deviceName);
          toast.info(`Device ${deviceName} is already unlocked.`, { duration: TOAST_DURATION.NORMAL });
          return true;
        } else {
          logger.error('unlockDevice: Failed to unlock:', response.message);
          toast.error(response.message || `Failed to unlock device.`, { duration: TOAST_DURATION.NORMAL });
          return false;
        }
      }
    } catch (error) {
      // logger.error('unlockDevice: Error during unlock:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if this is an API error with response data
      if (error && typeof error === 'object' && 'response' in error) {
        const apiError = error as any;
        debug('unlockDevice: API error response:', {
          status: apiError.response?.status,
          data: apiError.response?.data,
          needsManualPassword: apiError.response?.data?.needs_manual_password
        });
        
        // Check for manual password requirement in API response
        if (apiError.response?.data?.needs_manual_password) {
          debug('unlockDevice: Manual password required (from API response):', deviceName);
          return await handleManualPasswordUnlock(deviceName);
        }
      }
      
      // Check for manual password requirement in error message (fallback)
      if (errorMessage.includes("Failed to export NAS key. Please provide manual password.") || 
          errorMessage.includes("NAS key failed to unlock device. Please provide manual password.")) {
        debug('unlockDevice: Manual password required (from error message):', deviceName);
        return await handleManualPasswordUnlock(deviceName);
      }
      
      // Check if the error message contains "already exists"
      if (errorMessage.includes("already exists")) {
        toast.info(`Device ${deviceName} is already unlocked.`, { duration: TOAST_DURATION.NORMAL });
        return true;
      } else {
        toast.error(`Failed to unlock device: ${errorMessage}`, { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } finally {
      stopUnlocking();
    }
  };

  // Sync devices (NAS to NAS Backup) - completely replaced implementation
  const syncDevices = async (): Promise<boolean> => {
    try {
      // Check if there's an active sync in progress using our new function
      if (isActiveSyncInProgress()) {
        debug('Found active sync in progress');
        // Open the modal with the existing job ID
        openModal(
          React.createElement(SyncResultsModal, {
            jobId: syncState.jobId,
            stayOpenOnFallback: true,
          }),
          { hideActions: true }
        );
        return true;
      }
      
      // Otherwise, start a new sync job
      startSyncing();
      
      // Start the sync job via API
      const response = await api.post<any>(
        API_ENDPOINTS.diskman.sync,
        {
          source: '/mnt/nas',
          destination: '/mnt/nas_backup',
        }
      );
      
      // Get the job ID from the response
      const jobId = response.job_id || response.id;
      if (jobId) {
        openModal(
          React.createElement(SyncResultsModal, {
            jobId: jobId,
            stayOpenOnFallback: true,
          }),
          { hideActions: true }
        );
      } else {
        // Fallback: show error toast if jobId is missing
        toast.error('Failed to start sync: No job ID returned from backend.', { duration: TOAST_DURATION.NORMAL });
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Error syncing devices:', error);
      toast.error('An unexpected error occurred while syncing devices.', { duration: TOAST_DURATION.NORMAL });
      return false;
    } finally {
      stopSyncing();
    }
  };

  // Get the current sync schedule
  const getSyncSchedule = async (): Promise<SyncScheduleConfig | null> => {
    startLoadingSchedule();
    
    try {
      const response = await api.get<GetSyncScheduleResponse>(API_ENDPOINTS.diskman.getSyncSchedule);
      
      debug('Get sync schedule response:', response.status);
      
      if (response.status === 'success' && response.details?.schedule) {
        return response.details.schedule;
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting sync schedule:', error);
      toast.error('Failed to get sync schedule', { duration: TOAST_DURATION.NORMAL });
      return null;
    } finally {
      stopLoadingSchedule();
    }
  };
  
  // Set a new sync schedule
  const setSyncSchedule = async (schedule: SyncScheduleConfig): Promise<boolean> => {
    startUpdatingSchedule();
    
    try {
      const response = await api.post<SetSyncScheduleResponse>(
        API_ENDPOINTS.diskman.setSyncSchedule,
        { schedule }
      );
      
      debug('Set sync schedule response:', response.status);
      
      if (response.status === 'success') {
        toast.success(response.message || 'Sync schedule updated successfully', { duration: TOAST_DURATION.NORMAL });
        return true;
      } else {
        toast.error(response.message || 'Failed to update sync schedule', { duration: TOAST_DURATION.NORMAL });
        return false;
      }
    } catch (error) {
      logger.error('Error setting sync schedule:', error);
      toast.error('Failed to update sync schedule', { duration: TOAST_DURATION.NORMAL });
      return false;
    } finally {
      stopUpdatingSchedule();
    }
  };

  return [
    {
      isMounting,
      isUnmounting,
      isFormatting,
      isEncrypting,
      isChangingPermissions,
      isUnlocking,
      isSyncing,
      isLoadingSchedule,
      isUpdatingSchedule,
      isPendingConfirmation
    },
    {
      mountDevice,
      unmountDevice,
      formatDevice,
      encryptDevice,
      applyPermissions,
      unlockDevice,
      performUnmount,
      syncDevices,
      getSyncSchedule,
      setSyncSchedule,
      setPendingConfirmation
    }
  ];
}; 