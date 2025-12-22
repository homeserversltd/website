import React, { useEffect } from 'react';
import { useTooltip } from '../../../hooks/useTooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHdd, 
  faServer, 
  faExclamationTriangle, 
  faLock, 
  faEraser, 
  faPlug, 
  faUnlink,
  faSpinner,
  faShieldAlt,
  faUnlock,
  faCogs,
  faSync,
  faClock
} from '@fortawesome/free-solid-svg-icons';
import { useDiskMan } from '../hooks/useDiskMan';
import { 
  isDeviceMounted, 
  isDeviceMountedToNonStandardLocation,
  getDeviceMountPoint,
  isDeviceAvailableForDestination,
  isDestinationAvailableForDevice,
  isDeviceEncrypted,
  isDeviceNasCompatible,
  getDeviceFilesystemType,
  hasLockedEncryptedPartition,
  hasUnlockedEncryptedPartition,
  isDeviceUnlockedButNotMounted,
  getEncryptedPartitionMapper,
  MOUNT_DESTINATIONS,
  getDeviceForMountPoint,
  parseSizeToBytes,
  formatSpaceUsage,
  getDeviceSpaceUsage,
  isDeviceLowOnSpace,
  canSyncNasToBackup
} from '../utils/diskUtils';
import './DiskManager.css';

// Helper function to get a description of non-standard mount points
const getNonStandardMountDescription = (): string => {
  const standardPaths = MOUNT_DESTINATIONS.map(dest => dest.path).join(' or ');
  return `This device is mounted to a location that is not one of the standard mount destinations (${standardPaths})`;
};

// Function to check if a mount point is non-standard
const isNonStandardMountPoint = (mountPoint: string | null): boolean => {
  if (!mountPoint) return false;
  const isStandard = MOUNT_DESTINATIONS.some(dest => dest.path === mountPoint);
  return !isStandard;
};

export const DiskManager: React.FC = () => {
  // Get disk management state and actions from the hook
  const [
    {
      selectedDevice,
      selectedDestination,
      blockDevices,
      diskInfo,
      isMounting,
      isUnmounting,
      isFormatting,
      isEncrypting,
      isChangingPermissions,
      isUnlocking,
      isSyncing,
      isLoadingSchedule,
      isUpdatingSchedule,
      isCheckingServices,
      isManagingServices,
      canMount,
      canUnmount,
      canFormat,
      canEncrypt,
      canChangePermissions,
      canUnlock,
      canSync,
      canAutoSync,
      isPendingConfirmation
    },
    {
      handleDeviceSelect,
      handleDestinationSelect,
      handleMount,
      handleUnmount,
      handleFormat,
      handleEncrypt,
      handlePermissions,
      handleUnlock,
      handleSync,
      handleAutoSync
    }
  ] = useDiskMan();
  
  // Calculate if any operation is in progress
  const isAnyOperationInProgress = 
    isMounting || 
    isUnmounting || 
    isFormatting || 
    isEncrypting || 
    isChangingPermissions || 
    isUnlocking || 
    isSyncing ||
    isLoadingSchedule ||
    isUpdatingSchedule ||
    isCheckingServices || 
    isManagingServices ||
    isPendingConfirmation;
  
  // Log important state changes when data updates
  useEffect(() => {
    if (diskInfo && blockDevices.length > 0) {
      // Log NAS compatible devices to debug space usage
      if (diskInfo.nasCompatibleDevices) {
        diskInfo.nasCompatibleDevices.forEach(device => {
          // Space usage logging removed for production
        });
      }
      
      // Log non-standard mount points
      const nonStandardMounts = blockDevices
        .filter(device => 
          isDeviceMounted(device.name, blockDevices, diskInfo) && 
          isDeviceMountedToNonStandardLocation(device.name, blockDevices, diskInfo))
        .map(device => ({
          device: device.name, 
          mountPoint: getDeviceMountPoint(device.name, blockDevices, diskInfo)
        }));
        
      if (nonStandardMounts.length > 0) {
        // Non-standard mounts logging removed for production
      }
    }
  }, [diskInfo, blockDevices]);
  
  // Tooltips
  const { show: showTooltip } = useTooltip();
  
  if (!diskInfo) {
    return <div className="disk-manager loading">Loading disk information...</div>;
  }
  
  // Show a message if no devices are available after filtering
  if (blockDevices.length === 0) {
    return (
      <div className="disk-manager">
        <div className="no-devices-message">
          <FontAwesomeIcon icon={faExclamationTriangle} className="warning-icon" />
          <p>No external devices available for management.</p>
          <p className="hint">System devices are not shown for safety reasons.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="disk-manager">
      
      <div className="disk-manager-container">
        {/* Left column - Block Devices */}
        <div className="disk-column">
          <h4>Available Devices</h4>
          <div className="disk-list">
            {blockDevices.map(device => {
              const isMounted = isDeviceMounted(device.name, blockDevices, diskInfo);
              const isNonStandardMount = isDeviceMountedToNonStandardLocation(device.name, blockDevices, diskInfo);
              const mountPoint = getDeviceMountPoint(device.name, blockDevices, diskInfo);
              
              // Get NAS compatible device info if applicable
              const nasCompatibleDevice = diskInfo?.nasCompatibleDevices?.find(d => d.device === device.name);
              
              // Get filesystem type from NAS compatible device if available
              const nasFilesystem = nasCompatibleDevice?.filesystem;
              
              // Use mountPoint from nasCompatibleDevice as a fallback
              const effectiveMountPoint = mountPoint || nasCompatibleDevice?.mountpoint;
              
              // Directly check if the mount point is non-standard
              const isEffectiveNonStandardMount = isNonStandardMount || 
                (effectiveMountPoint ? isNonStandardMountPoint(effectiveMountPoint) : false);
              
              // Find the destination for this device if it's mounted to a standard location
              const deviceDestination = effectiveMountPoint && !isEffectiveNonStandardMount 
                ? MOUNT_DESTINATIONS.find(dest => dest.path === effectiveMountPoint) 
                : null;
              
              // Check if this device is the selected device and is mounted
              const isSelectedMountedDevice = selectedDevice === device.name && isMounted;
              
              // Get mounted partition info if applicable
              const mountedPartition = device.children?.find(child => child.mountpoint !== null);
              
              // Determine if this device is available for the selected destination
              const isAvailableForSelectedDestination = isDeviceAvailableForDestination(
                device.name, 
                selectedDestination, 
                blockDevices, 
                diskInfo
              );
              
              // Check if this device is NAS compatible
              const isNasCompatible = isDeviceNasCompatible(device.name, diskInfo);
              
              // Check if this device is encrypted
              const hasEncryptedPartition = isDeviceEncrypted(device.name, blockDevices, diskInfo);
              
              // Check if this device has a locked encrypted partition
              const hasLocked = hasLockedEncryptedPartition(device.name, blockDevices, diskInfo);
              
              // Check if this device has an unlocked encrypted partition
              const hasUnlocked = hasUnlockedEncryptedPartition(device.name, blockDevices, diskInfo);
              
              // Get the mapper name for an unlocked encrypted partition
              const mapperName = getEncryptedPartitionMapper(device.name, blockDevices, diskInfo);
              
              // Get filesystem type
              const fsType = getDeviceFilesystemType(device.name, blockDevices, diskInfo);
              
              // Get NAS compatible device info if applicable
              const nasCompatibleDeviceInfo = diskInfo?.nasCompatibleDevices?.find(d => d.device === device.name);
              
              // Get filesystem type from NAS compatible device if available
              const nasFilesystemInfo = nasCompatibleDeviceInfo?.filesystem;
              
              // Explicitly check if this is an unlocked but not mounted device
              const isUnlockedButNotMounted = isDeviceUnlockedButNotMounted(device.name, blockDevices, diskInfo);
              
              // Get space usage information
              const spaceUsage = getDeviceSpaceUsage(device.name, diskInfo);
              const spaceUsageDisplay = spaceUsage ? formatSpaceUsage(
                spaceUsage.totalSize,
                spaceUsage.usedSpace,
                spaceUsage.availableSpace,
                spaceUsage.usePercent
              ) : '';
              const isLowOnSpace = isDeviceLowOnSpace(device.name, diskInfo);
              
              return (
                <div 
                  key={device.name}
                  className={`disk-item ${selectedDevice === device.name ? 'selected' : ''} 
                              ${isMounted ? 'mounted' : ''} 
                              ${isEffectiveNonStandardMount ? 'non-standard-mount' : ''}
                              ${selectedDestination && !isAvailableForSelectedDestination ? 'unavailable' : ''}
                              ${selectedDestination && isAvailableForSelectedDestination && !isMounted && 
                                 // Only show available highlight if we don't have a mounted device selected
                                 !(selectedDevice && isDeviceMounted(selectedDevice, blockDevices, diskInfo)) ? 'available' : ''}
                              ${isSelectedMountedDevice ? 'locked-pair' : ''}
                              ${isNasCompatible ? 'nas-compatible' : ''}
                              ${hasUnlocked ? 'unlocked-encrypted' : ''}
                              ${isUnlockedButNotMounted ? 'unlocked-ready' : ''}
                              ${isAnyOperationInProgress ? 'disabled' : ''}`}
                  onClick={() => {
                    // Prevent selection when any operation is in progress
                    if (!isAnyOperationInProgress) {
                      handleDeviceSelect(device.name);
                    }
                  }}
                >
                  {/* Only show lock icon for mounted devices that are selected */}
                  {isSelectedMountedDevice && <FontAwesomeIcon icon={faLock} className="lock-icon" />}
                  <FontAwesomeIcon icon={faHdd} className="disk-icon" />
                  <div className="disk-info">
                    <div className="disk-name">
                      {device.name}
                      {isNasCompatible && <span className="nas-badge">NAS capable</span>}
                      {hasEncryptedPartition && (
                        hasUnlocked 
                          ? <FontAwesomeIcon icon={faUnlock} className="encrypt-icon unlocked" title="Encrypted (Unlocked)" /> 
                          : <FontAwesomeIcon icon={faShieldAlt} className="encrypt-icon" title="Encrypted (Locked)" />
                      )}
                      {isEffectiveNonStandardMount && (
                        <span className="non-standard-badge">
                          <FontAwesomeIcon icon={faExclamationTriangle} /> Non-standard
                        </span>
                      )}
                    </div>
                    
                    {/* Show mount point information prominently if available */}
                    {effectiveMountPoint && (
                      <div className="disk-mount-info prominent">
                        <strong>Mounted at:</strong> {effectiveMountPoint}
                        {deviceDestination && (
                          <span className="destination-label"> ({deviceDestination.label})</span>
                        )}
                      </div>
                    )}
                    
                    <div className="disk-details">
                      {spaceUsage?.totalSize ? spaceUsage.totalSize : device.size} 
                      {device.model ? ` - ${device.model}` : ''}
                      {fsType !== 'Unknown' && ` - ${fsType}`}
                    </div>
                    {spaceUsageDisplay && (
                      <div className={`disk-space-usage ${isLowOnSpace ? 'low-space' : ''}`}>
                        <strong>Space:</strong> {spaceUsageDisplay}
                        {isLowOnSpace && <span className="low-space-warning"> ⚠️ Low space!</span>}
                      </div>
                    )}
                    {device.serial && (
                      <div className="disk-serial">
                        S/N: {device.serial}
                      </div>
                    )}
                    {mountedPartition && device.mountpoint === null && (
                      <div className="partition-info">
                        via partition: {mountedPartition.name}
                      </div>
                    )}
                    {mapperName && (
                      <div className="mapper-info">
                        Mapper: {mapperName}
                      </div>
                    )}
                    {nasCompatibleDeviceInfo?.mapper && !mapperName && (
                      <div className="mapper-info">
                        Mapper: {nasCompatibleDeviceInfo.mapper}
                      </div>
                    )}
                    {hasLocked && (
                      <div className="encryption-status locked">
                        <FontAwesomeIcon icon={faLock} /> Locked
                      </div>
                    )}
                    {hasUnlocked && (
                      <div className="encryption-status unlocked">
                        <FontAwesomeIcon icon={faUnlock} /> Unlocked
                        {nasFilesystemInfo && (
                          <span className="filesystem-label"> ({nasFilesystemInfo})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Right column - Mount Destinations */}
        <div className="disk-column">
          <h4>Mount Destinations</h4>
          <div className="disk-list">
            {MOUNT_DESTINATIONS.map(destination => {
              // Check if any device is mounted to this destination
              const mountedDevice = blockDevices.find(device => {
                const deviceMountPoint = getDeviceMountPoint(device.name, blockDevices, diskInfo);
                const nasDevice = diskInfo?.nasCompatibleDevices?.find(d => d.device === device.name);
                const effectiveMountPoint = deviceMountPoint || nasDevice?.mountpoint;
                return effectiveMountPoint === destination.path;
              });
              
              const isMounted = !!mountedDevice;
              const isMountedBySelectedDevice = mountedDevice && mountedDevice.name === selectedDevice;
              const isMountedByOtherDevice = isMounted && !isMountedBySelectedDevice;
              
              // If a device is selected and it's mounted to a non-standard location, disable all destinations
              const isSelectedDeviceMountedToNonStandard = selectedDevice && 
                isDeviceMountedToNonStandardLocation(selectedDevice, blockDevices, diskInfo);
              
              // If a device is selected and it's mounted, disable all other destinations
              const selectedDeviceMountPoint = selectedDevice ? 
                getDeviceMountPoint(selectedDevice, blockDevices, diskInfo) : null;
              const selectedDeviceNasInfo = selectedDevice ? 
                diskInfo?.nasCompatibleDevices?.find(d => d.device === selectedDevice) : null;
              const effectiveSelectedMountPoint = selectedDeviceMountPoint || selectedDeviceNasInfo?.mountpoint;
              
              const isSelectedDeviceMounted = selectedDevice && effectiveSelectedMountPoint !== null;
              const isCurrentDestination = effectiveSelectedMountPoint === destination.path;
              const isDisabledDueToMountedDevice = isSelectedDeviceMounted && !isCurrentDestination;
              
              // Check if this device is explicitly an unlocked but not mounted encrypted device
              const isSelectedDeviceUnlockedButNotMounted = selectedDevice && 
                selectedDeviceNasInfo && hasUnlockedEncryptedPartition(selectedDevice, blockDevices, diskInfo) && 
                !selectedDeviceNasInfo.is_mounted;
              
              // A destination is locked if it's mounted (by any device)
              const isLocked = isMounted;
              
              // Don't disable the destination if the selected device has an unlocked encrypted partition
              const hasUnlockedDevice = selectedDevice && isDeviceUnlockedButNotMounted(selectedDevice, blockDevices, diskInfo);
              
              // If an unlocked device is selected, all destinations should be available
              const isDisabled = (isSelectedDeviceUnlockedButNotMounted || hasUnlockedDevice) ? false : 
                                (isMountedByOtherDevice || isDisabledDueToMountedDevice || isSelectedDeviceMountedToNonStandard);
              
              // For unlocked encrypted devices, all destinations are available
              let isAvailableForSelectedDevice = (isSelectedDeviceUnlockedButNotMounted || hasUnlockedDevice) ? true : isDestinationAvailableForDevice(
                destination.id, 
                selectedDevice, 
                blockDevices, 
                diskInfo
              );
              
              // Special case: if the device is unlocked but not mounted, all destinations are available
              if (hasUnlockedDevice || isSelectedDeviceUnlockedButNotMounted) {
                isAvailableForSelectedDevice = true;
              }
              
              // Check if this destination corresponds to the selected mounted device
              const isDestinationOfSelectedMountedDevice = selectedDevice && 
                isDeviceMounted(selectedDevice, blockDevices, diskInfo) && 
                getDeviceMountPoint(selectedDevice, blockDevices, diskInfo) === destination.path;
                
              // For NAS Backup destination, check if it's unavailable due to size restrictions
              let tooltipContent = '';
              if (destination.id === 'nas_backup' && selectedDevice && !isAvailableForSelectedDevice) {
                // Check if NAS is mounted
                const nasDestination = MOUNT_DESTINATIONS.find(dest => dest.id === 'nas');
                const nasMountedDeviceName = nasDestination ? getDeviceForMountPoint(nasDestination.path, blockDevices) : null;
                
                if (!nasMountedDeviceName) {
                  tooltipContent = 'NAS Backup requires that the NAS drive is mounted first';
                } else {
                  // Check if size is the issue
                  const currentNasDeviceInfo = diskInfo?.nasCompatibleDevices?.find(d => d.device === nasMountedDeviceName);
                  const selectedDeviceInfo = diskInfo?.nasCompatibleDevices?.find(d => d.device === selectedDevice);
                  
                  if (currentNasDeviceInfo && selectedDeviceInfo) {
                    const currentNasDeviceSize = parseSizeToBytes(currentNasDeviceInfo.size);
                    const selectedDeviceSize = parseSizeToBytes(selectedDeviceInfo.size);
                    
                    if (selectedDeviceSize < currentNasDeviceSize) {
                      tooltipContent = `NAS Backup device must be at least as large as the NAS device (${currentNasDeviceInfo.size})`;
                    }
                  }
                }
              }
              
              const destinationElement = (
                <div 
                  key={destination.id}
                  className={`disk-item ${selectedDestination === destination.id ? 'selected' : ''} 
                              ${isMounted ? 'mounted' : ''} 
                              ${isDisabled ? 'disabled' : ''} 
                              ${isLocked ? 'locked' : ''}
                              ${isDestinationOfSelectedMountedDevice ? 'selected locked-pair' : ''}
                              ${hasUnlockedDevice ? 'available' : ''}
                              ${selectedDevice && !hasUnlockedDevice && !isAvailableForSelectedDevice ? 'unavailable' : ''}
                              ${selectedDevice && !hasUnlockedDevice && isAvailableForSelectedDevice && !isMounted ? 'available' : ''}
                              ${isAnyOperationInProgress ? 'disabled' : ''}`}
                  onClick={() => {
                    // Prevent selection when any operation is in progress
                    if (!isAnyOperationInProgress && (hasUnlockedDevice || !isDisabled)) {
                      handleDestinationSelect(destination.id);
                    }
                  }}
                >
                  {isDestinationOfSelectedMountedDevice && <FontAwesomeIcon icon={faLock} className="lock-icon" />}
                  <FontAwesomeIcon icon={faServer} className="disk-icon" />
                  <div className="disk-info">
                    <div className="disk-name">{destination.label}</div>
                    <div className="disk-details">
                      {destination.path}
                    </div>
                    {isMounted && mountedDevice && (
                      <div className="disk-mount-info">
                        Device: <span className="device-label">{mountedDevice.name}</span>
                        {(() => {
                          const mountedSpaceUsage = getDeviceSpaceUsage(mountedDevice.name, diskInfo);
                          const mountedSpaceUsageDisplay = mountedSpaceUsage ? formatSpaceUsage(
                            mountedSpaceUsage.totalSize,
                            mountedSpaceUsage.usedSpace,
                            mountedSpaceUsage.availableSpace,
                            mountedSpaceUsage.usePercent
                          ) : '';
                          const mountedIsLowOnSpace = isDeviceLowOnSpace(mountedDevice.name, diskInfo);
                          
                          return mountedSpaceUsageDisplay ? (
                            <div className={`disk-space-usage ${mountedIsLowOnSpace ? 'low-space' : ''}`} style={{ marginTop: '8px' }}>
                              <strong>Space:</strong> {mountedSpaceUsageDisplay}
                              {mountedIsLowOnSpace && <span className="low-space-warning"> ⚠️ Low space!</span>}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
              
              return tooltipContent ? showTooltip(tooltipContent, destinationElement) : destinationElement;
            })}
          </div>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="disk-actions">
        {showTooltip(
          "Device preparation: Format with XFS filesystem. The drive will be recognized as a valid NAS drive but will remain unencrypted throughout its lifecycle. This is the simpler approach with potentially better performance, but data is stored in plaintext.",
          <button 
            className={`action-button format ${!canFormat ? 'disabled' : ''} ${isFormatting ? 'loading' : ''}`}
            onClick={canFormat && !isFormatting ? handleFormat : undefined}
            disabled={!canFormat || isFormatting}
          >
            {isFormatting ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faEraser} />
            )}
            {isFormatting ? 'Formatting...' : 'Format'}
          </button>
        )}
        
        {showTooltip(
          "Device preparation: Encrypt with LUKS and format with XFS. The drive will be encrypted with the keyman nas.key and will require decryption on boot of the home server. This provides data security through encryption with a slight performance impact.",
          <button 
            className={`action-button encrypt ${!canEncrypt ? 'disabled' : ''} ${isEncrypting ? 'loading' : ''}`}
            onClick={canEncrypt && !isEncrypting ? handleEncrypt : undefined}
            disabled={!canEncrypt || isEncrypting}
          >
            {isEncrypting ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faShieldAlt} />
            )}
            {isEncrypting ? 'Encrypting...' : 'Encrypt'}
          </button>
        )}

        {showTooltip(
          "Apply standard directory structure and permissions to the NAS (/mnt/nas) directory based on the server configuration. This creates application directories and sets correct ownership for all configured applications. Only available when a device is mounted to the NAS destination.",
          <button 
            className={`action-button permissions ${!canChangePermissions ? 'disabled' : ''} ${isChangingPermissions ? 'loading' : ''}`}
            onClick={canChangePermissions && !isChangingPermissions ? handlePermissions : undefined}
            disabled={!canChangePermissions || isChangingPermissions}
          >
            {isChangingPermissions ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faLock} />
            )}
            {isChangingPermissions ? 'Applying...' : 'Setup NAS'}
          </button>
        )}
        
        {showTooltip(
          "Unlock an encrypted LUKS partition on the selected device",
          <button 
            className={`action-button unlock ${!canUnlock ? 'disabled' : ''} ${isUnlocking ? 'loading' : ''}`}
            onClick={canUnlock && !isUnlocking ? handleUnlock : undefined}
            disabled={!canUnlock || isUnlocking}
          >
            {isUnlocking ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faUnlock} />
            )}
            {isUnlocking ? 'Unlocking...' : 'Unlock'}
          </button>
        )}
        
        {showTooltip(
          "Mount the selected device to the selected destination. When mounting to NAS, the system will check for stopped services and offer to start them.",
          <button 
            className={`action-button mount ${!canMount ? 'disabled' : ''} ${isMounting || isCheckingServices || isManagingServices ? 'loading' : ''}`}
            onClick={canMount && !isMounting && !isCheckingServices && !isManagingServices ? handleMount : undefined}
            disabled={!canMount || isMounting || isCheckingServices || isManagingServices}
          >
            {isMounting ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : isCheckingServices ? (
              <FontAwesomeIcon icon={faCogs} spin />
            ) : isManagingServices ? (
              <FontAwesomeIcon icon={faCogs} spin />
            ) : (
              <FontAwesomeIcon icon={faPlug} />
            )}
            {isMounting ? 'Mounting...' : 
             isCheckingServices ? 'Checking services...' : 
             isManagingServices ? 'Managing services...' : 'Mount'}
          </button>
        )}
        
        {showTooltip(
          "Unmount the selected device. When unmounting from NAS, the system will check for running services and help you stop them safely.",
          <button 
            className={`action-button unmount ${!canUnmount ? 'disabled' : ''} ${isUnmounting || isCheckingServices || isManagingServices ? 'loading' : ''}`}
            onClick={canUnmount && !isUnmounting && !isCheckingServices && !isManagingServices ? handleUnmount : undefined}
            disabled={!canUnmount || isUnmounting || isCheckingServices || isManagingServices}
          >
            {isUnmounting ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : isCheckingServices ? (
              <FontAwesomeIcon icon={faCogs} spin />
            ) : isManagingServices ? (
              <FontAwesomeIcon icon={faCogs} spin />
            ) : (
              <FontAwesomeIcon icon={faUnlink} />
            )}
            {isUnmounting ? 'Unmounting...' : 
             isCheckingServices ? 'Checking services...' : 
             isManagingServices ? 'Managing services...' : 'Unmount'}
          </button>
        )}
        
        {(() => {
          // Get sync validation to show appropriate tooltip
          const syncValidation = canSyncNasToBackup(diskInfo);
          let syncTooltip = "Synchronize data from NAS to NAS Backup. This performs a one-way sync from /mnt/nas to /mnt/nas_backup, excluding the 'lost+found' directory. The inactivity timeout will be disabled during this operation to prevent disconnection.";
          
          if (!syncValidation.canSync) {
            syncTooltip = `Sync is not available: ${syncValidation.reason}`;
          }
          
          return showTooltip(
            syncTooltip,
            <button 
              className={`action-button sync ${!canSync ? 'disabled' : ''} ${isSyncing ? 'loading' : ''}`}
              onClick={canSync && !isSyncing ? handleSync : undefined}
              disabled={!canSync || isSyncing}
            >
              {isSyncing ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <FontAwesomeIcon icon={faSync} />
              )}
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          );
        })()}
        
        {(() => {
          // Get sync validation to show appropriate tooltip for auto sync too
          const syncValidation = canSyncNasToBackup(diskInfo);
          let autoSyncTooltip = "Configure automatic sync scheduling between NAS and NAS Backup. Create scheduled tasks to automatically sync data at regular intervals.";
          
          if (!syncValidation.canSync) {
            autoSyncTooltip = `Auto sync is not available: ${syncValidation.reason}`;
          }
          
          return showTooltip(
            autoSyncTooltip,
            <button 
              className={`action-button auto-sync ${!canAutoSync ? 'disabled' : ''} ${isLoadingSchedule || isUpdatingSchedule ? 'loading' : ''}`}
              onClick={canAutoSync && !isLoadingSchedule && !isUpdatingSchedule ? handleAutoSync : undefined}
              disabled={!canAutoSync || isLoadingSchedule || isUpdatingSchedule}
            >
              {isLoadingSchedule || isUpdatingSchedule ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <FontAwesomeIcon icon={faClock} />
              )}
              {isLoadingSchedule ? 'Loading Schedule...' : 
               isUpdatingSchedule ? 'Updating Schedule...' : 'Auto Sync'}
            </button>
          );
        })()}
      </div>
      

    </div>
  );
};