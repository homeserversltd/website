import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSpinner, 
  faSync, 
  faInfoCircle, 
  faExclamationTriangle,
  faKey
} from '@fortawesome/free-solid-svg-icons';
import { useKeyManager } from '../../hooks/useKeyManager';
import { useDiskMan } from '../../hooks/useDiskMan';
import { 
  KEY_STRATEGIES,
  FLEXIBLE_ADDITION_OPTIONS
} from '../../utils/keyUtils';
import {
  isDeviceEncrypted,
  hasLockedEncryptedPartition,
  hasUnlockedEncryptedPartition,
  getUnderlyingDeviceForMapper
} from '../../utils/diskUtils';
import { 
  BlockDevice, 
  AdminDiskInfo, 
  UpdateKeyRequest,
  UpdateKeyResponse,
  KeyStatusResponse 
} from '../../types';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { useToast } from '../../../../hooks/useToast';
import { useApi } from '../../../../hooks/useApi';
import { encryptData } from '../../../../utils/secureTransmission';

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

// Create a custom interface for key status response
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

interface UpdateKeyModalProps {
  initialDevice?: string | null;
  onClose: () => void;
}

export const UpdateKeyModal: React.FC<UpdateKeyModalProps> = ({ 
  initialDevice,
  onClose
}) => {
  // Get disk information directly from hooks
  const [{ blockDevices, diskInfo }] = useDiskMan();
  const [, keyManagerActions] = useKeyManager(blockDevices, diskInfo);
  
  // Add API hooks
  const { post } = useApi();
  const toast = useToast();
  
  // Add ref to track mounted state
  const isMounted = useRef(true);
  
  // Add ref to track logged devices to avoid log spam
  const loggedDevicesRef = useRef<Record<string, boolean>>({});
  
  // Local state for the form
  const [selectedDevice, setSelectedDevice] = useState<string | null>(initialDevice || null);
  const [selectedStrategy, setSelectedStrategy] = useState('safe_rotation');
  const [selectedFlexibleOption, setSelectedFlexibleOption] = useState('random');
  const [selectedKeySlot, setSelectedKeySlot] = useState<number | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);
  const [showStrategyDetails, setShowStrategyDetails] = useState(false);
  const [keySlotsAreFull, setKeySlotsAreFull] = useState(false);
  const [keySlotInfo, setKeySlotInfo] = useState<ExtendedKeySlots | null>(null);
  
  // Add constants for cache timeouts
  const CACHE_TIMEOUT_MS = 30000; // 30 seconds
  const FETCH_THROTTLE_MS = 2000; // 2 seconds minimum between fetch attempts
  
  // Add refs for tracking mount state, pending requests, and fetch timestamps
  const pendingRequests = useRef<Record<string, boolean>>({});
  const lastFetchTimestamps = useRef<Record<string, number>>({});
  const [keyStatusCache, setKeyStatusCache] = useState<Record<string, {
    info: ExtendedKeySlots,
    timestamp: number
  }>>({});
  
  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      pendingRequests.current = {};
      lastFetchTimestamps.current = {};
    };
  }, []);
  
  // Ensure device path has /dev/ prefix
  const formatDevicePath = useCallback((device: string): string => {
    return device.startsWith('/dev/') ? device : `/dev/${device}`;
  }, []);
  
  // Update the fetchKeyStatus function to be more resilient
  const fetchKeyStatus = useCallback(async (devicePath: string, cacheKey: string): Promise<void> => {
    // Skip if component unmounted
    if (!isMounted.current) return;
    
    // Skip if already fetching this device
    if (pendingRequests.current[cacheKey]) {
      return;
    }
    
    // Check throttling
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
    
    // Check cache first
    const cached = keyStatusCache[cacheKey];
    if (cached && (now - cached.timestamp < CACHE_TIMEOUT_MS)) {
      // Remove excessive cache hit logging
      
      if (isMounted.current) {
        setKeySlotInfo(cached.info);
        setKeySlotsAreFull(cached.info.available === 0);
      }
      return;
    }
    
    try {
      // Mark request as pending and update timestamp
      pendingRequests.current[cacheKey] = true;
      lastFetchTimestamps.current[cacheKey] = now;
      
      const response = await post<KeyStatusResponseWithLuks>(API_ENDPOINTS.diskman.keyStatus, {
        device: devicePath
      });
      
      // Skip further processing if component unmounted during request
      if (!isMounted.current) {
        delete pendingRequests.current[cacheKey];
        return;
      }
      
      // Remove pending flag
      delete pendingRequests.current[cacheKey];
      
      if (response.details?.keySlots) {
        const slots = response.details.keySlots;
        const isLuks = response.status === 'success' && slots.total > 0;
        
        if (!isLuks) {
          const defaultSlots = { total: 0, used: 0, available: 0, is_luks: false } as ExtendedKeySlots;
          
          if (isMounted.current) {
            setKeySlotInfo(defaultSlots);
            setKeySlotsAreFull(false);
          }
          
          // Update cache
          setKeyStatusCache(prev => ({
            ...prev,
            [cacheKey]: { info: defaultSlots, timestamp: now }
          }));
        } else {
          if (isMounted.current) {
            setKeySlotInfo(slots);
            setKeySlotsAreFull(slots.available === 0);
          }
          
          // Update cache
          setKeyStatusCache(prev => ({
            ...prev,
            [cacheKey]: { info: slots, timestamp: now }
          }));
        }
      }
    } catch (error: any) {
      // Skip further processing if component unmounted during request
      if (!isMounted.current) {
        delete pendingRequests.current[cacheKey];
        return;
      }
      
      // Remove pending flag on error
      delete pendingRequests.current[cacheKey];
      
      // Don't show toast for non-LUKS devices, as this is expected in testing
      if (error.message && !error.message.includes('not a valid LUKS device')) {
        toast.error('Failed to fetch key slot information');
      }
      
      // Set default values for non-LUKS devices
      const defaultSlots = { total: 0, used: 0, available: 0, is_luks: false } as ExtendedKeySlots;
      
      if (isMounted.current) {
        setKeySlotInfo(defaultSlots);
        setKeySlotsAreFull(false);
      }
      
      // Update cache with default values to prevent repeated failures
      setKeyStatusCache(prev => ({
        ...prev,
        [cacheKey]: { info: defaultSlots, timestamp: now }
      }));
    }
  }, [post, toast]);
  
  // Fetch key status when device changes - consolidated into a single effect
  useEffect(() => {
    // Skip if no device is selected or component is unmounted
    if (!selectedDevice || !isMounted.current) return;
    
    const fetchDeviceKeyStatus = async () => {
      // For encrypted devices, we need to use the underlying partition path not the mapper path
      // Determine the correct device path to use
      let devicePath;
      const cacheKey = `device:${selectedDevice}`;
      
      // Get encryption info from diskInfo
      const encryptedDevices = diskInfo?.encryptionInfo?.encrypted_devices || [];
      
      // Find the encrypted partition for this device
      const encryptedPartition = encryptedDevices.find(ed => {
        // Extract device name without /dev/ prefix
        const deviceName = selectedDevice.replace(/^\/dev\//, '');
        // Check if this is the partition of our device
        return ed.device.includes(deviceName) && ed.is_open === true;
      });
      
      // Create a unique key for this device to avoid log spam
      const logKey = `path:${selectedDevice}`;
      
      if (encryptedPartition) {
        // Use the underlying partition for LUKS operations
        devicePath = encryptedPartition.device;
        
        // Only log once per device
        if (!loggedDevicesRef.current[logKey]) {
          loggedDevicesRef.current[logKey] = true;
        }
      } else {
        // Fallback to device path
        devicePath = formatDevicePath(selectedDevice);
        
        // Only log once per device
        if (!loggedDevicesRef.current[logKey]) {
          loggedDevicesRef.current[logKey] = true;
        }
      }
      
      await fetchKeyStatus(devicePath, cacheKey);
    };

    // Use a timeout to prevent rapid re-renders from triggering multiple API calls
    const timeoutId = window.setTimeout(() => {
      fetchDeviceKeyStatus();
    }, 100);
    
    // Clean up timeout
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedDevice, diskInfo, fetchKeyStatus, formatDevicePath]);
  
  // Check if the selected device is locked
  const isSelectedDeviceLocked = useMemo(() => {
    if (!selectedDevice || !diskInfo) return false;
    return hasLockedEncryptedPartition(selectedDevice, blockDevices, diskInfo);
  }, [selectedDevice, blockDevices, diskInfo]);
  
  // Compute eligible devices for update - encrypted devices, either locked or unlocked
  const eligibleDevices = useMemo(() => {
    if (!diskInfo) return [];
    
    return blockDevices.filter(device => 
      isDeviceEncrypted(device.name, blockDevices, diskInfo) && 
      (hasLockedEncryptedPartition(device.name, blockDevices, diskInfo) || 
       hasUnlockedEncryptedPartition(device.name, blockDevices, diskInfo))
    );
  }, [blockDevices, diskInfo]);
  
  // Get the current strategy details
  const currentStrategy = useMemo(() => {
    return KEY_STRATEGIES.find(s => s.id === selectedStrategy);
  }, [selectedStrategy]);
  
  // Derived state
  const shouldShowFlexibleOptions = selectedStrategy === 'flexible_addition' && keySlotsAreFull;
  
  const canUpdateKey = !!selectedDevice && 
    !!currentPassword &&
    (selectedStrategy !== 'flexible_addition' || !keySlotsAreFull || !!selectedFlexibleOption) &&
    (selectedFlexibleOption !== 'manual' || (!!selectedKeySlot && selectedKeySlot > 0 && selectedKeySlot <= 31));
  
  // Handlers
  const handleDeviceSelect = useCallback((device: string | null) => {
    setSelectedDevice(device);
    
    // Clear key slot info if no device is selected
    if (!device) {
      setKeySlotInfo(null);
    }
  }, []);
  
  const handleStrategySelect = useCallback((strategy: string) => {
    setSelectedStrategy(strategy);
  }, []);
  
  const handleFlexibleOptionSelect = useCallback((option: string) => {
    setSelectedFlexibleOption(option);
  }, []);
  
  const handleKeySlotSelect = useCallback((slot: number | null) => {
    setSelectedKeySlot(slot);
  }, []);
  
  // Toggle strategy details visibility
  const toggleStrategyDetails = useCallback(() => {
    setShowStrategyDetails(prev => !prev);
  }, []);
  
  // Handle update key
  const handleUpdate = useCallback(async () => {
    if (!canUpdateKey || !selectedDevice) return;
    


    setIsUpdatingKey(true);
    try {
      // For key operations, we use the underlying partition for LUKS operations
      let devicePath;
      
      // Get encryption info from diskInfo
      const encryptedDevices = diskInfo?.encryptionInfo?.encrypted_devices || [];
      
      // Find the encrypted partition for this device
      const encryptedPartition = encryptedDevices.find(ed => {
        // Extract device name without /dev/ prefix
        const deviceName = selectedDevice.replace(/^\/dev\//, '');
        // Check if this is the partition of our device
        return ed.device.includes(deviceName) && ed.is_open === true;
      });
      
      // Create a unique key for this device update operation
      const logKey = `update:${selectedDevice}`;
      
      if (encryptedPartition) {
        // Use the underlying partition for LUKS operations
        devicePath = encryptedPartition.device;
        
        // Only log once per update operation
        if (!loggedDevicesRef.current[logKey]) {
          loggedDevicesRef.current[logKey] = true;
        }
      } else {
        // Fallback to device path
        devicePath = selectedDevice.startsWith('/dev/') ? selectedDevice : `/dev/${selectedDevice}`;
        
        // Only log once per update operation
        if (!loggedDevicesRef.current[logKey]) {
          loggedDevicesRef.current[logKey] = true;
        }
      }
      
      // Encrypt the current password
      const encryptedCurrentPassword = encryptData(currentPassword);
      if (!encryptedCurrentPassword) {
        console.error('[KEYMAN] Failed to encrypt password');
        toast.error('Failed to encrypt password');
        setIsUpdatingKey(false);
        return;
      }
      
      const request: UpdateKeyRequest = {
        device: devicePath,
        strategy: selectedStrategy as 'replace_primary' | 'safe_rotation' | 'flexible_addition',
        current_password: encryptedCurrentPassword
      };

      // Add flexible options if needed
      if (selectedStrategy === 'flexible_addition' && keySlotsAreFull) {
        request.flexibleOption = selectedFlexibleOption as 'random' | 'manual';
        if (selectedFlexibleOption === 'manual' && selectedKeySlot) {
          request.keySlot = selectedKeySlot;
        }
      }


      const response = await post<UpdateKeyResponse>(API_ENDPOINTS.diskman.updateKey, request);

      if (response.status === 'success') {
        toast.success('Key updated successfully');
        onClose();
      } else {
        console.error('[KEYMAN] Key update failed:', response);
        toast.error(response.message || 'Failed to update key');
      }
    } catch (error) {
      console.error('[KEYMAN] Error updating key:', error);
      toast.error('Failed to update key');
    } finally {
      setIsUpdatingKey(false);
    }
  }, [
    canUpdateKey,
    selectedDevice,
    selectedStrategy,
    selectedFlexibleOption,
    selectedKeySlot,
    keySlotsAreFull,
    diskInfo,
    post,
    toast,
    onClose,
    currentPassword
  ]);
  
  // Handle form cancel
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);
  
  return (
    <div className="modal-form">
      <div className="key-info-banner">
        <div className="key-info-text">
          <p>This operation will apply the existing NAS key from the system vault to the selected drive. The NAS key is securely stored in the vault and will be automatically retrieved during the update process.</p>
        </div>
      </div>

      <div className="device-selection">
        <label htmlFor="device">Select Device to Update:</label>
        <select
          id="device"
          className="device-select"
          value={selectedDevice || ''}
          onChange={(e) => handleDeviceSelect(e.target.value || null)}
          disabled={isUpdatingKey}
        >
          <option value="">Select a device</option>
          {eligibleDevices.map(device => {
            const isLocked = hasLockedEncryptedPartition(device.name, blockDevices, diskInfo);
            const isUnlocked = hasUnlockedEncryptedPartition(device.name, blockDevices, diskInfo);
            return (
              <option key={device.name} value={device.name}>
                {device.name} {device.model ? `(${device.model})` : ''} 
                {isLocked ? ' - 🔒 Locked' : isUnlocked ? ' - 🔓 Unlocked' : ''}
              </option>
            );
          })}
        </select>

        {selectedDevice && (
          <div className="password-input">
            <label htmlFor="currentPassword">Current Device Password:</label>
            <input
              type="password"
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current device password"
              className="password-field"
              disabled={isUpdatingKey}
            />
          </div>
        )}

        {eligibleDevices.length === 0 && (
          <div className="error-text">
            No eligible devices found. Devices must be encrypted and either locked or unlocked.
          </div>
        )}
        
        {/* Always render the key slot info container to prevent layout shift */}
        <div className="key-slot-info" style={{ minHeight: '20px' }}>
          {selectedDevice && keySlotInfo ? (
            <small>
              Key slots: {keySlotInfo.used} used, {keySlotInfo.available} available (total: {keySlotInfo.total})
            </small>
          ) : selectedDevice && (
            <small>Loading key slot information...</small>
          )}
        </div>
      </div>
      
      <div className="strategy-selection">
        <h4>Key Management Strategy:</h4>
        
        {/* Convert radio buttons to dropdown */}
        <div className="strategy-dropdown">
          <select
            id="strategy"
            className="strategy-select"
            value={selectedStrategy}
            onChange={(e) => handleStrategySelect(e.target.value)}
            disabled={isUpdatingKey}
          >
            {KEY_STRATEGIES.map(strategy => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.label}
              </option>
            ))}
          </select>
          
          {/* Description and details of the selected strategy */}
          {currentStrategy && (
            <div className="selected-strategy-info">
              <div className="strategy-description">{currentStrategy.description}</div>
              
              <div className={`strategy-details warning-${currentStrategy.warningLevel}`}>
                <FontAwesomeIcon 
                  icon={currentStrategy.warningLevel === 'high' ? faExclamationTriangle : faInfoCircle} 
                /> {' '}
                {currentStrategy.details}
              </div>
              
              {/* Flexible addition options - only show when key slots are full and strategy is flexible_addition */}
              {shouldShowFlexibleOptions && (
                <div className="flexible-options">
                  <label htmlFor="flexibleOption">Addition Options:</label>
                  <select
                    id="flexibleOption"
                    className="flexible-option-select"
                    value={selectedFlexibleOption}
                    onChange={(e) => handleFlexibleOptionSelect(e.target.value)}
                    disabled={isUpdatingKey}
                  >
                    {FLEXIBLE_ADDITION_OPTIONS.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  
                  {/* Selected option description */}
                  <div className="option-description">
                    {FLEXIBLE_ADDITION_OPTIONS.find(o => o.id === selectedFlexibleOption)?.description}
                  </div>
                  
                  {/* Manual slot selection */}
                  {selectedFlexibleOption === 'manual' && (
                    <div className="slot-input">
                      <label htmlFor="keySlot">Key Slot (1-31):</label>
                      <input
                        type="number"
                        id="keySlot"
                        min="1"
                        max="31"
                        value={selectedKeySlot || ''}
                        onChange={(e) => handleKeySlotSelect(parseInt(e.target.value) || null)}
                        disabled={isUpdatingKey}
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Show message when slots are not full but flexible_addition is selected */}
              {selectedStrategy === 'flexible_addition' && !keySlotsAreFull && keySlotInfo && (
                <div className="slots-available-info">
                  <small>
                    <FontAwesomeIcon icon={faInfoCircle} /> {' '}
                    This device has {keySlotInfo.available} available key slots. 
                    A new key will be added to the next available slot.
                  </small>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="modal-actions">
        <button
          className="modal-button modal-button-secondary"
          onClick={handleCancel}
          disabled={isUpdatingKey}
        >
          Cancel
        </button>
        <button
          className="modal-button modal-button-primary"
          disabled={!canUpdateKey || isUpdatingKey}
          onClick={handleUpdate}
        >
          {isUpdatingKey ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> Updating...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faSync} /> Update Key
            </>
          )}
        </button>
      </div>
    </div>
  );
}; 