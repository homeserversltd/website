import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faKey, faInfoCircle, faExclamationTriangle, faLock } from '@fortawesome/free-solid-svg-icons';
import { useKeyManager } from '../../hooks/useKeyManager';
import { 
  KEY_TARGETS,
  KEY_OPERATIONS,
  FLEXIBLE_ADDITION_OPTIONS,
  getPasswordRequirementsMessage, 
  isPasswordStrong 
} from '../../utils/keyUtils';
import { 
  KeyOperation, 
  KeyTarget, 
  BlockDevice, 
  AdminDiskInfo,
  CreateKeyRequest,
  CreateKeyResponse,
  KeyStatusResponse,
  VaultDeviceResponse
} from '../../types';
import { useBroadcastData } from '../../../../store';
import { isDeviceEncrypted, hasUnlockedEncryptedPartition, getUnderlyingDeviceForMapper } from '../../utils/diskUtils';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { useToast } from '../../../../hooks/useToast';
import { useApi } from '../../../../hooks/useApi';
import { useRef } from 'react';

/**
 * Modal for creating new encryption keys
 * 
 * Note: Key creation operations can be resource-intensive and may take several minutes,
 * especially for devices with many encrypted partitions. The timeout for these operations
 * has been increased to 5 minutes (300000ms) in the useKeyManager hook to accommodate this.
 */

// Custom debounce function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} {
  let timeout: number | undefined;
  
  const debounced = function(...args: Parameters<T>): void {
    const later = () => {
      timeout = undefined;
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = window.setTimeout(later, wait);
  } as {
    (...args: Parameters<T>): void;
    cancel: () => void;
  };
  
  debounced.cancel = () => {
    clearTimeout(timeout);
  };
  
  return debounced;
}

// Extend KeySlots type to include is_luks field
interface ExtendedKeySlots {
  total: number;
  used: number;
  available: number;
  is_luks?: boolean;
}

// Create a custom interface for key status response instead of extending KeyStatusResponse
interface KeyStatusResponseWithLuks {
  status: string;
  message: string;
  details?: {
    device?: string;
    keySlots?: ExtendedKeySlots;
    isLuksDevice?: boolean;
    lastUpdated?: number;
  };
}

interface CreateKeyModalProps {
  onClose: () => void;
}

export const CreateKeyModal: React.FC<CreateKeyModalProps> = ({ onClose }) => {
  // Get disk info from the store
  const { getBroadcastData } = useBroadcastData();
  const diskInfo = getBroadcastData('admin_disk_info', true) as AdminDiskInfo | undefined;
  const blockDevices = diskInfo?.blockDevices?.blockdevices || [];
  
  // Hooks
  const { post, get } = useApi();
  const toast = useToast();
  const [keyManagerState, keyManagerActions] = useKeyManager(blockDevices, diskInfo);
  
  // Local state
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedSecondaryDevice, setSelectedSecondaryDevice] = useState<string>('');
  const [keySlotsAreFull, setKeySlotsAreFull] = useState(false);
  const [vaultDevicePath, setVaultDevicePath] = useState<string | null>(null);
  const [vaultKeySlotsAreFull, setVaultKeySlotsAreFull] = useState(false);
  const [keySlotInfo, setKeySlotInfo] = useState<ExtendedKeySlots | null>(null);
  const [vaultKeySlotInfo, setVaultKeySlotInfo] = useState<ExtendedKeySlots | null>(null);
  const [secondaryKeySlotInfo, setSecondaryKeySlotInfo] = useState<ExtendedKeySlots | null>(null);
  
  // Password validation states
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  
  // Add cache for key status
  const [keyStatusCache, setKeyStatusCache] = useState<Record<string, {
    info: ExtendedKeySlots,
    timestamp: number
  }>>({});
  
  // Add ref for tracking ongoing requests to prevent duplicate calls
  const pendingRequests = useRef<Record<string, boolean>>({});
  
  // Add timestamps to keep track of last fetch times per device
  const lastFetchTimestamps = useRef<Record<string, number>>({});
  const FETCH_THROTTLE_MS = 2000; // 2 seconds minimum between fetch attempts for the same device
  
  // Add a constant for cache timeout
  const CACHE_TIMEOUT_MS = 300000; // 5 minutes cache timeout to match operation timeouts

  // Add a flag to track component mount state
  const isMounted = useRef(true);
  
  // Correct device path formatting
  const formatDevicePath = useCallback((device: string): string => {
    // Ensure device path has /dev/ prefix
    if (!device.startsWith('/dev/')) {
      return `/dev/${device}`;
    }
    return device;
  }, []);

  // Update the triggerFetchDeviceKeyStatus function to prevent multiple calls
  const triggerFetchDeviceKeyStatus = useCallback((
    device: string | null, 
    type: 'primary' | 'secondary' | 'vault'
  ): void => {
    if (!device || !isMounted.current) {
      return;
    }

    // Ensure proper device path format
    const devicePath = formatDevicePath(device);
    const cacheKey = type === 'vault' ? `vault:${devicePath}` : `${type}:${device}`;
    
    // Check if we have a pending request for this key
    if (pendingRequests.current[cacheKey]) {
      return;
    }
    
    // Check if we've fetched this key recently (throttling)
    const now = Date.now();
    const lastFetchTime = lastFetchTimestamps.current[cacheKey] || 0;
    if (now - lastFetchTime < FETCH_THROTTLE_MS) {
      // Only log throttling once per second to reduce console spam
      const lastThrottleLogTime = lastFetchTimestamps.current[`throttle_log:${cacheKey}`] || 0;
      if (now - lastThrottleLogTime > 1000) {
        lastFetchTimestamps.current[`throttle_log:${cacheKey}`] = now;
      }
      return;
    }
    
    // Check if we have a valid cache entry
    const cached = keyStatusCache[cacheKey];
    if (cached && (now - cached.timestamp < CACHE_TIMEOUT_MS)) {
      
      
      // Update appropriate state based on type
      switch (type) {
        case 'primary':
          if (isMounted.current) {
            setKeySlotInfo(cached.info);
            setKeySlotsAreFull(cached.info.available === 0);
          }
          break;
        case 'secondary':
          if (isMounted.current) {
            setSecondaryKeySlotInfo(cached.info);
          }
          break;
        case 'vault':
          if (isMounted.current) {
            setVaultKeySlotInfo(cached.info);
            setVaultKeySlotsAreFull(cached.info.available === 0);
          }
          break;
      }
      return;
    }
    
    // Update timestamp before fetching
    lastFetchTimestamps.current[cacheKey] = now;
    
    // Mark as pending
    pendingRequests.current[cacheKey] = true;
    
    // If no cache hit, no pending request, and not throttled, do a full fetch with UI update
    
    // Define update callback for the specific type
    const updateCallback = (info: ExtendedKeySlots | null, isFull: boolean) => {
      if (!isMounted.current) return;
      
      switch (type) {
        case 'primary':
          setKeySlotInfo(info);
          setKeySlotsAreFull(isFull);
          break;
        case 'secondary':
          setSecondaryKeySlotInfo(info);
          break;
        case 'vault':
          setVaultKeySlotInfo(info);
          setVaultKeySlotsAreFull(isFull);
          break;
      }
    };
    
    // Perform the actual fetch directly rather than through fetchKeyStatus
    (async () => {
      try {
        const response = await keyManagerActions.getKeyStatus(devicePath);
        
        // Skip further processing if component unmounted during request
        if (!isMounted.current) {
          delete pendingRequests.current[cacheKey];
          return;
        }
        
        // Remove pending flag
        delete pendingRequests.current[cacheKey];
        
        if (!response) {
          const defaultSlots = { total: 0, used: 0, available: 0, is_luks: false };
          updateCallback(defaultSlots, false);
          return;
        }
        
        if (response.details?.keySlots) {
          const slots = response.details.keySlots;
          // Update how we check for LUKS device since isLuksDevice may not exist in the response
          const isLuks = response.status === 'success' && slots.total > 0;
          const slotInfo = isLuks ? slots : { total: 0, used: 0, available: 0, is_luks: false };
          const isFull = isLuks && slots.available === 0;
          
          // Update cache
          setKeyStatusCache(prev => ({
            ...prev,
            [cacheKey]: { info: slotInfo, timestamp: now }
          }));
          
          // Update state using the callback
          updateCallback(slotInfo, isFull);
        } else {
          // Handle case where keySlots are missing but response is success (e.g., non-LUKS)
          const defaultSlots = { total: 0, used: 0, available: 0, is_luks: false };
          updateCallback(defaultSlots, false);
        }
      } catch (error: unknown) {
        // Skip further processing if component unmounted during request
        if (!isMounted.current) {
          delete pendingRequests.current[cacheKey];
          return;
        }
        
        // Remove pending flag on error
        delete pendingRequests.current[cacheKey];
        
        // Don't show toast for non-LUKS devices
        if (error instanceof Error && error.message && 
            !error.message.includes('not a valid LUKS device')) {
          toast.error(`Failed to fetch key slot information for ${devicePath}`);
        }
        
        // Set default values using callback
        const defaultSlots = { total: 0, used: 0, available: 0, is_luks: false };
        updateCallback(defaultSlots, false);
      }
    })();
  }, [formatDevicePath, keyManagerActions, toast, keyStatusCache]);

  // Update component unmount cleanup
  useEffect(() => {
    // When component mounts, set flag to true
    isMounted.current = true;
    
    // Cleanup function when component unmounts
    return () => {
      // Set flag to false to prevent state updates after unmount
      isMounted.current = false;
      
      // No cancel method needed since we don't use debounce anymore
      
      // Clear pending requests and timestamps
      pendingRequests.current = {};
      lastFetchTimestamps.current = {};
    };
  }, []);

  // Get eligible devices for external targets
  const eligibleDevices = React.useMemo(() => {
    if (!diskInfo) return [];
    
    return blockDevices.filter(device => 
      isDeviceEncrypted(device.name, blockDevices, diskInfo) && 
      hasUnlockedEncryptedPartition(device.name, blockDevices, diskInfo)
    );
  }, [blockDevices, diskInfo]);
  
  // Update selectedDevice when eligibleDevices changes
  useEffect(() => {
    if (eligibleDevices.length > 0 && !selectedDevice) {
      // Auto-select first device as primary
      setSelectedDevice(eligibleDevices[0].name);
      keyManagerActions.handleDeviceSelect(eligibleDevices[0].name);
      
      // If there are exactly 2 eligible devices and no secondary device is selected,
      // auto-select the other device as secondary
      if (eligibleDevices.length === 2 && !selectedSecondaryDevice) {
        setSelectedSecondaryDevice(eligibleDevices[1].name);
      }
    }
  }, [eligibleDevices, selectedDevice, selectedSecondaryDevice, keyManagerActions]);

  // Fetch vault device path on mount
  useEffect(() => {
    const fetchVaultDevicePath = async () => {
      try {
        const response = await get<VaultDeviceResponse>(API_ENDPOINTS.diskman.vaultDevice);
        if (response.status === 'success' && response.details?.device_path) {
          setVaultDevicePath(response.details.device_path);
        }
      } catch (error) {
        // Error handling removed for production
      }
    };

    fetchVaultDevicePath();
  }, [get]);
  
  // Use a more stable method to check the key target conditions
  const getTargetCondition = useCallback((target: string): boolean => {
    return keyManagerState.selectedKeyTarget === target || keyManagerState.selectedKeyTarget === 'both';
  }, [keyManagerState.selectedKeyTarget]);

  // Consolidated effect for all key status fetches
  useEffect(() => {
    // Skip if component is not mounted
    if (!isMounted.current) return;
    
    // Create a cleanup function to prevent memory leaks
    const cleanupFunctions: (() => void)[] = [];
    
    // Helper to handle a single fetch operation
    const handleFetch = (devicePath: string | null, type: 'primary' | 'secondary' | 'vault') => {
      if (!devicePath) return;
      
      // Use setTimeout to stagger requests and avoid flooding
      const timeoutId = window.setTimeout(() => {
        triggerFetchDeviceKeyStatus(devicePath, type);
      }, type === 'primary' ? 0 : type === 'vault' ? 100 : 200); // Stagger by type
      
      // Register cleanup function
      cleanupFunctions.push(() => window.clearTimeout(timeoutId));
    };
    
    // Only trigger fetches when necessary
    if (selectedDevice) {
      handleFetch(selectedDevice, 'primary');
    }
    
    if (selectedSecondaryDevice && 
        (keyManagerState.selectedKeyTarget === 'external' || keyManagerState.selectedKeyTarget === 'both')) {
      handleFetch(selectedSecondaryDevice, 'secondary');
    }
    
    if (vaultDevicePath && 
        (keyManagerState.selectedKeyTarget === 'vault' || keyManagerState.selectedKeyTarget === 'both')) {
      handleFetch(vaultDevicePath, 'vault');
    }
    
    // Return cleanup function
    return () => {
      cleanupFunctions.forEach(cleanupFn => cleanupFn());
    };
  }, [
    selectedDevice,
    selectedSecondaryDevice,
    vaultDevicePath,
    keyManagerState.selectedKeyTarget,
    triggerFetchDeviceKeyStatus,
    isMounted
  ]);
  
  // Check secondary device if slots are full when key is about to be created
  const checkSecondaryDeviceSlots = useCallback(async (): Promise<boolean> => {
    if (!selectedSecondaryDevice) return false;
    
    try {
      // Ensure device has /dev/ prefix
      const devicePath = selectedSecondaryDevice.startsWith('/dev/') ? selectedSecondaryDevice : `/dev/${selectedSecondaryDevice}`;
      
      const response = await post<KeyStatusResponse>(API_ENDPOINTS.diskman.keyStatus, {
        device: devicePath
      });
      
      if (response.status === 'success' && response.details?.keySlots) {
        const slots = response.details.keySlots;
        return slots.available > 0;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }, [selectedSecondaryDevice, post]);
  
  // Derived states
  // Check if any selected device has full key slots for add key operation
  const anyTargetHasFullSlots = (keyManagerState.selectedKeyOperation === 'add_key') && (
    (keySlotsAreFull && (keyManagerState.selectedKeyTarget === 'external' || keyManagerState.selectedKeyTarget === 'both')) || 
    (vaultKeySlotsAreFull && (keyManagerState.selectedKeyTarget === 'vault' || keyManagerState.selectedKeyTarget === 'both'))
  );

  // Determine if we should show flexible options
  const shouldShowFlexibleOptions = keyManagerState.selectedKeyOperation === 'add_key' && anyTargetHasFullSlots;

  // Password validation
  const passwordError = passwordTouched && !keyManagerState.isPasswordValid
    ? 'Password does not meet security requirements'
    : '';
  
  const confirmError = confirmTouched && !keyManagerState.passwordsMatch
    ? 'Passwords do not match'
    : '';
  
  // Get current operation details
  const currentOperation = KEY_OPERATIONS.find((op: KeyOperation) => op.id === keyManagerState.selectedKeyOperation);
  
  // Map target to key type
  const getKeyTypeFromTarget = (target: string): string => {
    switch(target) {
      case 'vault': return 'vault';
      case 'external': return 'nas';
      case 'both': return 'combined';
      default: return 'combined';
    }
  };
  
  // Handlers
  const handleKeyTargetSelect = useCallback((target: string) => {
    keyManagerActions.handleKeyTargetSelect(target);
    // Reset device selections based on target
    if (target === 'vault') {
      setSelectedDevice('');
      setSelectedSecondaryDevice('');
      keyManagerActions.handleDeviceSelect(null);
    } else if ((target === 'external' || target === 'both') && eligibleDevices.length > 0) {
      setSelectedDevice(eligibleDevices[0].name);
      keyManagerActions.handleDeviceSelect(eligibleDevices[0].name);
      setSelectedSecondaryDevice(eligibleDevices.length > 1 ? eligibleDevices[1].name : '');
    }
  }, [eligibleDevices, keyManagerActions]);
  
  const handleKeyOperationSelect = useCallback((operation: string) => {
    keyManagerActions.handleKeyOperationSelect(operation);
  }, [keyManagerActions]);
  
  const handleDeviceSelect = useCallback((device: string, isSecondary = false) => {
    if (isSecondary) {
      setSelectedSecondaryDevice(device);
      
      // Ensure we set an empty password entry for the secondary device to make it show up
      // in the devicePaths array when handleCreateKey is called
      if (device && !keyManagerState.oldDevicePasswords[device] && 
          !keyManagerState.oldDevicePasswords[`/dev/${device}`]) {
        // We don't actually set a password, just ensuring the device is in the map
      }
    } else {
      setSelectedDevice(device);
      keyManagerActions.handleDeviceSelect(device);
    }
  }, [keyManagerActions, keyManagerState.oldDevicePasswords]);
  
  const handleFlexibleOptionSelect = useCallback((option: string) => {
    keyManagerActions.handleFlexibleOptionSelect(option);
  }, [keyManagerActions]);
  
  const handleKeySlotSelect = useCallback((slot: number | null) => {
    keyManagerActions.handleKeySlotSelect(slot || 0);
  }, [keyManagerActions]);
  
  const handleCreate = useCallback(async () => {
    if (!keyManagerState.canCreateKey) return;

    // Add validation for vault device path
    if ((keyManagerState.selectedKeyTarget === 'vault' || keyManagerState.selectedKeyTarget === 'both') && !vaultDevicePath) {
      toast.error('Vault device path not available. Please try again.');
      return;
    }

    // Validation check for device passwords
    if ((keyManagerState.selectedKeyTarget === 'external' || keyManagerState.selectedKeyTarget === 'both')) {
      const hookDevicePasswords = keyManagerState.oldDevicePasswords;
      if (selectedDevice) {
        const devicePath = selectedDevice.startsWith('/dev/') ? selectedDevice : `/dev/${selectedDevice}`;
        if (!hookDevicePasswords[devicePath] && !hookDevicePasswords[selectedDevice]) {
          toast.error(`Password required for device ${selectedDevice}`);
          return;
        }
      }
      
      if (selectedSecondaryDevice) {
        const devicePath = selectedSecondaryDevice.startsWith('/dev/') ? selectedSecondaryDevice : `/dev/${selectedSecondaryDevice}`;
        if (!hookDevicePasswords[devicePath] && !hookDevicePasswords[selectedSecondaryDevice]) {
          toast.error(`Password required for device ${selectedSecondaryDevice}`);
          return;
        }
        
        // Ensure the secondary device password is properly formatted with full path
        // This fixes the issue where the secondary device might not be included in the request
        const secondaryDevicePath = devicePath;
        const password = hookDevicePasswords[selectedSecondaryDevice] || hookDevicePasswords[devicePath] || '';
        if (password) {
          keyManagerActions.handleOldDevicePasswordChange(secondaryDevicePath, password);
        }
      }
    }

    // Get the selected key operation
    const keyOperation = KEY_OPERATIONS.find(op => op.id === keyManagerState.selectedKeyOperation);
    if (!keyOperation) return;
    
    // Create confirmation message based on operation and target
    let confirmMessage = `Are you sure you want to create a new key`;
    
    // Add target information to message
    if (keyManagerState.selectedKeyTarget === 'external') {
      confirmMessage += ' for external drives';
    } else if (keyManagerState.selectedKeyTarget === 'vault') {
      confirmMessage += ' for the system vault';
    } else if (keyManagerState.selectedKeyTarget === 'both') {
      confirmMessage += ' for both external drives and system vault';
    }
    
    // Add operation warning for high-risk operations
    if (keyOperation.warningLevel === 'high') {
      confirmMessage += `?\n\nWARNING: You are using the "${keyOperation.label}" operation which ${keyOperation.description}. This is a high-risk operation and could result in permanent data loss if not done properly.`;
    } else {
      confirmMessage += `?`;
    }
    
    confirmMessage += `\n\nThis action is permanent with no backups available.`;
    
    // Implement confirmation logic here

    await keyManagerActions.handleCreateKey();
    
    if (!keyManagerState.isCreatingKey) {
      onClose();
    }
  }, [keyManagerState, keyManagerActions, vaultDevicePath, onClose]);
  
  // Handle form cancel
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission
    await handleCreate(); // Call the existing create handler
  }, [handleCreate]);

  return (
    <form className="modal-form" onSubmit={handleSubmit}>
      {/* Target device selection - primary selection now */}
      <div className="form-group">
        <label htmlFor="keyTarget">Target Device:</label>
        <select
          id="keyTarget"
          value={keyManagerState.selectedKeyTarget}
          onChange={(e) => handleKeyTargetSelect(e.target.value)}
          className="key-target-select"
          disabled={keyManagerState.isCreatingKey}
        >
          {KEY_TARGETS.map((target: KeyTarget) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
        <div className="field-description">
          {KEY_TARGETS.find((t: KeyTarget) => t.id === keyManagerState.selectedKeyTarget)?.description}
        </div>
      </div>
      
      {/* Show vault key slots info for vault or both targets */}
      {(keyManagerState.selectedKeyTarget === 'vault' || keyManagerState.selectedKeyTarget === 'both') && (
        <div className="vault-key-info form-group">
          <div className="key-slot-info">
            {vaultKeySlotInfo ? (
              <small>
                <FontAwesomeIcon icon={faKey} /> System Vault key slots: {vaultKeySlotInfo.used} used, {vaultKeySlotInfo.available} available (total: {vaultKeySlotInfo.total})
              </small>
            ) : vaultDevicePath && (
              <small>Loading vault key slot information...</small>
            )}
          </div>
        </div>
      )}
      
      {/* Show device selection dropdowns for external or both targets */}
      {(keyManagerState.selectedKeyTarget === 'external' || keyManagerState.selectedKeyTarget === 'both') && (
        <>
          <div className="form-group">
            <label htmlFor="externalDevice">Select Primary Device (NAS):</label>
            <select
              id="externalDevice"
              value={selectedDevice}
              onChange={(e) => handleDeviceSelect(e.target.value)}
              className="device-select"
              disabled={keyManagerState.isCreatingKey}
            >
              <option value="">Select a device</option>
              {eligibleDevices.map((device: BlockDevice) => (
                <option key={device.name} value={device.name}>
                  {device.name} {device.model ? `(${device.model})` : ''}
                </option>
              ))}
            </select>
            {eligibleDevices.length === 0 && (
              <div className="error-text">
                No eligible encrypted devices found. Devices must be encrypted and unlocked.
              </div>
            )}
            
            {/* Primary device key slot info */}
            {selectedDevice && (
              <div className="key-slot-info" style={{ marginTop: '8px' }}>
                {keySlotInfo ? (
                  <small>
                    <FontAwesomeIcon icon={faKey} /> {selectedDevice} key slots: {keySlotInfo.used} used, {keySlotInfo.available} available (total: {keySlotInfo.total})
                  </small>
                ) : (
                  <small>Loading key slot information...</small>
                )}
              </div>
            )}
          </div>

          {/* Only show secondary device selection if there are 2 or more eligible devices */}
          {eligibleDevices.length > 1 && (
            <div className="form-group">
              <label htmlFor="secondaryDevice">Select Secondary Device (NAS Backup):</label>
              <select
                id="secondaryDevice"
                value={selectedSecondaryDevice}
                onChange={(e) => handleDeviceSelect(e.target.value, true)}
                className="device-select"
                disabled={keyManagerState.isCreatingKey}
              >
                <option value="">Select a device</option>
                {eligibleDevices
                  .filter(device => device.name !== selectedDevice) // Exclude primary device
                  .map((device: BlockDevice) => (
                    <option key={device.name} value={device.name}>
                      {device.name} {device.model ? `(${device.model})` : ''}
                    </option>
                  ))}
              </select>
              {selectedDevice && !selectedSecondaryDevice && (
                <div className="field-description">
                  Please select a different device for the backup NAS.
                </div>
              )}
              
              {/* Secondary device key slot info */}
              {selectedSecondaryDevice && (
                <div className="key-slot-info" style={{ marginTop: '8px' }}>
                  {secondaryKeySlotInfo ? (
                    <small>
                      <FontAwesomeIcon icon={faKey} /> {selectedSecondaryDevice} key slots: {secondaryKeySlotInfo.used} used, {secondaryKeySlotInfo.available} available (total: {secondaryKeySlotInfo.total})
                    </small>
                  ) : (
                    <small>Loading key slot information...</small>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Key operation selection */}
      <div className="form-group">
        <label htmlFor="keyOperation">Key Operation:</label>
        <select
          id="keyOperation"
          value={keyManagerState.selectedKeyOperation}
          onChange={(e) => handleKeyOperationSelect(e.target.value)}
          className="key-operation-select"
          disabled={keyManagerState.isCreatingKey}
        >
          {KEY_OPERATIONS.map((operation: KeyOperation) => (
            <option key={operation.id} value={operation.id}>
              {operation.label}
            </option>
          ))}
        </select>
        
        {/* Display information about selected operation */}
        {currentOperation && (
          <div className={`operation-details warning-${currentOperation.warningLevel}`}>
            <FontAwesomeIcon 
              icon={currentOperation.warningLevel === 'high' ? faExclamationTriangle : faInfoCircle} 
            /> {' '}
            {currentOperation.details}
          </div>
        )}
      </div>
      
      {/* Show message for add_key when slots are not full */}
      {keyManagerState.selectedKeyOperation === 'add_key' && !anyTargetHasFullSlots && (
        <div className="slots-available-info">
          <small>
            <FontAwesomeIcon icon={faInfoCircle} /> {' '}
            The selected device(s) have available key slots. A new key will be added to the next available slot.
          </small>
        </div>
      )}
      
      {/* Show flexible option selection if add_key is selected and any target has full slots */}
      {shouldShowFlexibleOptions && (
        <div className="form-group">
          <label htmlFor="flexibleOption">Key Slots Full - Replacement Strategy:</label>
          <select
            id="flexibleOption"
            value={keyManagerState.selectedFlexibleOption}
            onChange={(e) => handleFlexibleOptionSelect(e.target.value)}
            className="flexible-option-select"
            disabled={keyManagerState.isCreatingKey}
          >
            {FLEXIBLE_ADDITION_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          
          {/* Show manual slot selection if manual option is selected */}
          {keyManagerState.selectedFlexibleOption === 'manual' && (
            <div className="slot-input">
              <label htmlFor="keySlot">Key Slot (1-31):</label>
              <input
                type="number"
                id="keySlot"
                min="1"
                max="31"
                value={keyManagerState.selectedKeySlot || ''}
                onChange={(e) => handleKeySlotSelect(parseInt(e.target.value) || null)}
                disabled={keyManagerState.isCreatingKey}
              />
              <div className="field-description">
                Select a key slot to replace (key0 cannot be selected to preserve factory access).
              </div>
            </div>
          )}
          
          <div className="field-description">
            {FLEXIBLE_ADDITION_OPTIONS.find(o => o.id === keyManagerState.selectedFlexibleOption)?.details}
          </div>
        </div>
      )}
      
      {/* Add old password fields based on target */}
      {(keyManagerState.selectedKeyTarget === 'vault' || keyManagerState.selectedKeyTarget === 'both') && (
        <div className="form-group">
          <label htmlFor="oldVaultPassword">
            <FontAwesomeIcon icon={faLock} /> Current Vault Password:
          </label>
          <input
            type="password"
            id="oldVaultPassword"
            value={keyManagerState.oldVaultPassword}
            onChange={(e) => keyManagerActions.handleOldVaultPasswordChange(e.target.value)}
            placeholder="Enter current vault password"
            disabled={keyManagerState.isCreatingKey}
          />
          <div className="field-description">
            Enter the current password for the vault device
          </div>
        </div>
      )}

      {(keyManagerState.selectedKeyTarget === 'external' || keyManagerState.selectedKeyTarget === 'both') && selectedDevice && (
        <div className="form-group">
          <label htmlFor={`oldPassword-${selectedDevice}`}>
            <FontAwesomeIcon icon={faLock} /> Current Password for {selectedDevice}:
          </label>
          <input
            type="password"
            id={`oldPassword-${selectedDevice}`}
            value={keyManagerState.oldDevicePasswords[selectedDevice] || keyManagerState.oldDevicePasswords[`/dev/${selectedDevice}`] || ''}
            onChange={(e) => keyManagerActions.handleOldDevicePasswordChange(selectedDevice, e.target.value)}
            placeholder="Enter current device password"
            disabled={keyManagerState.isCreatingKey}
          />
          <div className="field-description">
            Enter the current password for this device
          </div>
        </div>
      )}

      {(keyManagerState.selectedKeyTarget === 'external' || keyManagerState.selectedKeyTarget === 'both') && selectedSecondaryDevice && (
        <div className="form-group">
          <label htmlFor={`oldPassword-${selectedSecondaryDevice}`}>
            <FontAwesomeIcon icon={faLock} /> Current Password for {selectedSecondaryDevice}:
          </label>
          <input
            type="password"
            id={`oldPassword-${selectedSecondaryDevice}`}
            value={keyManagerState.oldDevicePasswords[selectedSecondaryDevice] || keyManagerState.oldDevicePasswords[`/dev/${selectedSecondaryDevice}`] || ''}
            onChange={(e) => keyManagerActions.handleOldDevicePasswordChange(selectedSecondaryDevice, e.target.value)}
            placeholder="Enter current device password"
            disabled={keyManagerState.isCreatingKey}
          />
          <div className="field-description">
            Enter the current password for this device
          </div>
        </div>
      )}
      
      <div className="form-group">
        <label htmlFor="password">
          <FontAwesomeIcon icon={faLock} /> New Password:
        </label>
        <input
          type="password"
          id="password"
          value={keyManagerState.password}
          onChange={(e) => keyManagerActions.handlePasswordChange(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          disabled={keyManagerState.isCreatingKey}
        />
        {passwordError && <div className="error-text">{passwordError}</div>}
        <div className="password-requirements">
          {getPasswordRequirementsMessage()}
        </div>
      </div>
      
      <div className="form-group">
        <label htmlFor="confirmPassword">Confirm Password:</label>
        <input
          type="password"
          id="confirmPassword"
          value={keyManagerState.confirmPassword}
          onChange={(e) => keyManagerActions.handleConfirmPasswordChange(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          disabled={keyManagerState.isCreatingKey}
        />
        {confirmError && <div className="error-text">{confirmError}</div>}
      </div>
      
      <div className="modal-actions">
        <button
          type="button" // Explicitly set type to button
          className="modal-button modal-button-secondary"
          onClick={handleCancel}
          disabled={keyManagerState.isCreatingKey}
        >
          Cancel
        </button>
        <button
          type="submit" // Set type to submit for the primary action
          className="modal-button modal-button-primary"
          disabled={!keyManagerState.canCreateKey || keyManagerState.isCreatingKey}
        >
          {keyManagerState.isCreatingKey ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> Creating Keys...
              <div className="processing-note">
                <small>This may take up to 5 minutes for multiple devices</small>
              </div>
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faKey} /> Create Key
            </>
          )}
        </button>
      </div>
    </form>
  );
}; 