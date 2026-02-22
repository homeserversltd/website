import { useState, useMemo, useCallback, useEffect } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useConfirmModal } from '../../../hooks/useModal';
import { useLoading } from '../../../hooks/useLoading';
import { useApi } from '../../../hooks/useApi';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { 
  CreateKeyResponse, 
  UpdateKeyResponse,
  KeyStatusResponse,
  BlockDevice,
  AdminDiskInfo,
  CreateKeyRequest,
  UpdateKeyRequest
} from '../types';
import { 
  isDeviceEligibleForKeyUpdate,
  KEY_STRATEGIES,
  FLEXIBLE_ADDITION_OPTIONS,
  KEY_OPERATIONS,
  isPasswordStrong
} from '../utils/keyUtils';
import { encryptData } from '../../../utils/secureTransmission';
import { debug, createComponentLogger } from '../../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('useKeyManager');

// Define API endpoints for key management (will need to be added to API_ENDPOINTS)
const KEY_MANAGEMENT_ENDPOINTS = {
  createKey: '/api/admin/key/create',
  updateKey: '/api/admin/key/update',
  keyStatus: '/api/admin/key/status'
};

// Define the interface for the vault device response
interface VaultDeviceResponse {
  status: string;
  message: string;
  details?: {
    device_path: string;
  };
}

export interface KeyManagerState {
  selectedKeyType: string;
  selectedKeyTarget: string;
  selectedKeyOperation: string;
  selectedDevice: string | null;
  selectedStrategy: string;
  selectedFlexibleOption: string;
  selectedKeySlot: number | null;
  password: string;
  confirmPassword: string;
  oldVaultPassword: string;
  oldDevicePasswords: Record<string, string>;
  isCreatingKey: boolean;
  isUpdatingKey: boolean;
  canCreateKey: boolean;
  canUpdateKey: boolean;
  isPasswordValid: boolean;
  passwordsMatch: boolean;
  vaultDevicePath: string | null;
}

export interface KeyManagerActions {
  handleKeyTypeSelect: (keyType: string) => void;
  handleKeyTargetSelect: (target: string) => void;
  handleKeyOperationSelect: (operation: string) => void;
  handleDeviceSelect: (deviceName: string | null) => void;
  handleStrategySelect: (strategy: string) => void;
  handleFlexibleOptionSelect: (option: string) => void;
  handleKeySlotSelect: (slot: number) => void;
  handlePasswordChange: (password: string) => void;
  handleConfirmPasswordChange: (confirmPassword: string) => void;
  handleOldVaultPasswordChange: (password: string) => void;
  handleOldDevicePasswordChange: (devicePath: string, password: string) => void;
  handleCreateKey: () => Promise<void>;
  handleUpdateKey: () => Promise<void>;
  resetForm: () => void;
  getKeyStatus: (devicePath: string) => Promise<KeyStatusResponse | null>;
}

// Helper function to format device paths
function formatDevicePath(devicePath: string): string {
  return devicePath.startsWith('/dev/') ? devicePath : `/dev/${devicePath}`;
}

export const useKeyManager = (
  blockDevices: BlockDevice[],
  diskInfo?: AdminDiskInfo
): [KeyManagerState, KeyManagerActions] => {
  // State
  const [selectedKeyType, setSelectedKeyType] = useState<string>('nas');
  const [selectedKeyTarget, setSelectedKeyTarget] = useState<string>('both');
  const [selectedKeyOperation, setSelectedKeyOperation] = useState<string>('safe_rotation');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('safe_rotation');
  const [selectedFlexibleOption, setSelectedFlexibleOption] = useState<string>('random');
  const [selectedKeySlot, setSelectedKeySlot] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [oldVaultPassword, setOldVaultPassword] = useState<string>('');
  const [oldDevicePasswords, setOldDevicePasswords] = useState<Record<string, string>>({});
  const [vaultDevicePath, setVaultDevicePath] = useState<string | null>(null);

  // Hooks
  const { success, error: showError } = useToast();
  const { confirm } = useConfirmModal();
  const { get, post } = useApi();
  const { 
    isLoading: isCreatingKey, 
    startLoading: startCreatingKey, 
    stopLoading: stopCreatingKey, 
    withLoading: withCreatingKey 
  } = useLoading({
    timeout: 300000 // 5 minutes timeout for key creation operations
  });
  const { 
    isLoading: isUpdatingKey, 
    startLoading: startUpdatingKey, 
    stopLoading: stopUpdatingKey, 
    withLoading: withUpdatingKey 
  } = useLoading({
    timeout: 300000 // 5 minutes timeout for key update operations
  });

  // Fetch vault device path on mount
  useEffect(() => {
    const fetchVaultDevicePath = async () => {
      try {
        debug('Fetching vault device path from API');
        const response = await get<VaultDeviceResponse>(API_ENDPOINTS.diskman.vaultDevice);
        if (response.status === 'success' && response.details?.device_path) {
          debug('Successfully fetched vault device path:', response.details.device_path);
          setVaultDevicePath(response.details.device_path);
        } else {
          logger.error('Failed to get vault device path:', response.message);
        }
      } catch (error) {
        logger.error('Error fetching vault device path:', error);
      }
    };

    fetchVaultDevicePath();
  }, [get]);

  // Computed properties
  const isPasswordValid = useMemo(() => isPasswordStrong(password), [password]);
  const passwordsMatch = useMemo(() => password === confirmPassword && password.length > 0, [password, confirmPassword]);

  const canCreateKey = useMemo(() => 
      isPasswordValid && 
      passwordsMatch &&
      ((selectedKeyTarget === 'vault' || selectedKeyTarget === 'both') ? oldVaultPassword.length > 0 : true) &&
      ((selectedKeyTarget === 'external' || selectedKeyTarget === 'both') ? Object.values(oldDevicePasswords).some(pwd => pwd.length > 0) : true)
  , [isPasswordValid, passwordsMatch, selectedKeyTarget, oldVaultPassword, oldDevicePasswords]);
  
  const canUpdateKey = Boolean(
    selectedDevice && 
    diskInfo && 
    isDeviceEligibleForKeyUpdate(selectedDevice, blockDevices, diskInfo) && 
    password.length > 0
  );
  
  // Add a function to check key status
  const getKeyStatus = useCallback(async (devicePath: string): Promise<KeyStatusResponse | null> => {
    try {
      debug('Fetching key status for device:', devicePath);
      
      // Ensure device path has the correct format
      const formattedPath = formatDevicePath(devicePath);
      
      // Get key status from the API
      const response = await post<KeyStatusResponse>(API_ENDPOINTS.diskman.keyStatus, {
        device: formattedPath
      });
      
      debug('Key status response:', response);
      return response;
    } catch (error) {
      logger.error('Error fetching key status:', error);
      return null;
    }
  }, [post]);

  // Action handlers
  const handleKeyTypeSelect = useCallback((keyType: string) => {
    setSelectedKeyType(keyType);
  }, []);

  const handleKeyTargetSelect = useCallback((target: string) => {
    setSelectedKeyTarget(target);
  }, []);
  
  const handleKeyOperationSelect = useCallback((operation: string) => {
    setSelectedKeyOperation(operation);
  }, []);

  const handleDeviceSelect = useCallback((deviceName: string | null) => {
    setSelectedDevice(deviceName);
  }, []);

  const handleStrategySelect = useCallback((strategy: string) => {
    setSelectedStrategy(strategy);
  }, []);

  const handleFlexibleOptionSelect = useCallback((option: string) => {
    setSelectedFlexibleOption(option);
  }, []);

  const handleKeySlotSelect = useCallback((slot: number) => {
    setSelectedKeySlot(slot);
  }, []);

  const handlePasswordChange = useCallback((password: string) => {
    setPassword(password);
  }, []);

  const handleConfirmPasswordChange = useCallback((confirmPassword: string) => {
    setConfirmPassword(confirmPassword);
  }, []);

  const handleOldVaultPasswordChange = useCallback((password: string) => {
    setOldVaultPassword(password);
  }, []);

  const handleOldDevicePasswordChange = useCallback((devicePath: string, password: string) => {
    const formattedPath = formatDevicePath(devicePath);
    setOldDevicePasswords(prev => ({
      ...prev,
      [formattedPath]: password
    }));
  }, []);

  const resetForm = useCallback(() => {
    setPassword('');
    setConfirmPassword('');
    setSelectedKeySlot(null);
    setOldVaultPassword('');
    setOldDevicePasswords({});
  }, []);

  // Create key handler
  const handleCreateKey = useCallback(async (): Promise<void> => {
    if (!canCreateKey) return;

    // Get the selected key operation
    const keyOperation = KEY_OPERATIONS.find(op => op.id === selectedKeyOperation);
    if (!keyOperation) return;
    
    // Create confirmation message based on operation and target
    let confirmMessage = `Are you sure you want to create a new ${selectedKeyType.toUpperCase()} key`;
    
    // Add target information to message
    if (selectedKeyTarget === 'external') {
      confirmMessage += ' for external drives';
    } else if (selectedKeyTarget === 'vault') {
      confirmMessage += ' for the system vault';
    } else if (selectedKeyTarget === 'both') {
      confirmMessage += ' for both external drives and system vault';
    }
    
    // Add operation warning for high-risk operations
    if (keyOperation.warningLevel === 'high') {
      confirmMessage += `?\n\nWARNING: You are using the "${keyOperation.label}" operation which ${keyOperation.description}. This is a high-risk operation and could result in permanent data loss if not done properly.`;
    } else {
      confirmMessage += `?`;
    }
    
    confirmMessage += `\n\nThis action is permanent with no backups available.`;

    // Get confirmation first
    const confirmed = await confirm(confirmMessage);
    if (!confirmed) return;

    startCreatingKey();

    try {
      // Ensure device paths are properly formatted
      const devicePaths: string[] = [];
      
      if (selectedDevice && (selectedKeyTarget === 'external' || selectedKeyTarget === 'both')) {
        // Add /dev/ prefix if needed
        const formattedPath = formatDevicePath(selectedDevice);
        devicePaths.push(formattedPath);
      }
      
      // Add secondary device if available and target is external or both
      // Look for devices that don't match the primary device pattern
      const secondaryDevices = Object.keys(oldDevicePasswords).filter(
        device => {
          const primaryDevicePath = selectedDevice ? formatDevicePath(selectedDevice) : null;
          return device !== primaryDevicePath && 
                 device !== selectedDevice &&
                 device.startsWith('/dev/');
        }
      );

      if (secondaryDevices.length > 0 && (selectedKeyTarget === 'external' || selectedKeyTarget === 'both')) {
        secondaryDevices.forEach(device => {
          // Don't add duplicate devices
          if (!devicePaths.includes(device)) {
            devicePaths.push(device);
            debug('Including secondary device:', device);
          }
        });
      }
      
      // Add vault device if target is vault or both
      if ((selectedKeyTarget === 'vault' || selectedKeyTarget === 'both')) {
        // If we don't have the vault device path yet, try to fetch it
        if (!vaultDevicePath) {
          try {
            debug('Fetching vault device path on-demand');
            const response = await get<VaultDeviceResponse>(API_ENDPOINTS.diskman.vaultDevice);
            if (response.status === 'success' && response.details?.device_path) {
              debug('On-demand vault device path:', response.details.device_path);
              setVaultDevicePath(response.details.device_path);
              devicePaths.push(response.details.device_path);
            } else {
              logger.error('Failed to get on-demand vault device path:', response.message);
              showError('Could not determine vault device path. Please try again later.', { 
                duration: 15000, // 15 seconds for error messages
                dismissOnClick: true
              });
              stopCreatingKey();
              return;
            }
          } catch (error) {
            logger.error('Error fetching on-demand vault device path:', error);
            showError('Could not determine vault device path. Please try again later.', { 
              duration: 15000, // 15 seconds for error messages
              dismissOnClick: true
            });
            stopCreatingKey();
            return;
          }
        } else {
          // Use the vault device path we already have
          devicePaths.push(vaultDevicePath);
          debug('Using cached vault device path:', vaultDevicePath);
        }
      }
      
      // Format device passwords to ensure they use full paths
      const formattedDevicePasswords: Record<string, string> = {};
      
      if ((selectedKeyTarget === 'external' || selectedKeyTarget === 'both')) {
        // Convert any device names to full paths and include only for selected devices
        Object.entries(oldDevicePasswords).forEach(([key, value]) => {
          const devicePath = formatDevicePath(key);
          
          // Only include passwords for paths that are in our devicePaths array
          if (devicePaths.includes(devicePath) || devicePaths.some(dp => devicePath.includes(dp))) {
            formattedDevicePasswords[devicePath] = value;
          }
        });
      }
      
      // Encrypt passwords
      const encryptedPassword = encryptData(password);
      if (!encryptedPassword) {
        showError('Failed to encrypt the new password.', { 
          duration: 15000, // 15 seconds for error messages
          dismissOnClick: true
        });
        stopCreatingKey();
        return;
      }
      
      let encryptedVaultPassword;
      if ((selectedKeyTarget === 'vault' || selectedKeyTarget === 'both') && oldVaultPassword) {
          encryptedVaultPassword = encryptData(oldVaultPassword);
          if (!encryptedVaultPassword) {
              showError('Failed to encrypt the old vault password.', { 
                duration: 15000, // 15 seconds for error messages
                dismissOnClick: true
              });
              stopCreatingKey();
              return;
          }
      }

      const encryptedDevicePasswords: Record<string, string> = {};
      if ((selectedKeyTarget === 'external' || selectedKeyTarget === 'both')) {
          for (const [devicePath, devicePassword] of Object.entries(formattedDevicePasswords)) {
              const encrypted = encryptData(devicePassword);
              if (!encrypted) {
                  showError(`Failed to encrypt password for device ${devicePath}`, { 
                    duration: 15000, // 15 seconds for error messages
                    dismissOnClick: true
                  });
                  stopCreatingKey();
                  return;
              }
              encryptedDevicePasswords[devicePath] = encrypted;
          }
      }
      
      // Add logging to debug device paths
      debug('Creating key with device paths:', devicePaths);
      debug('Using encrypted device passwords for:', Object.keys(encryptedDevicePasswords));

      const request: CreateKeyRequest = {
        target: selectedKeyTarget as 'external' | 'vault' | 'both',
        strategy: selectedKeyOperation as 'replace_primary' | 'safe_rotation' | 'flexible_addition',
        password: encryptedPassword,
        devices: devicePaths.length > 0 ? devicePaths : [],
        vaultPassword: encryptedVaultPassword,
        devicePasswords: encryptedDevicePasswords
      };

      debug('Sending create key request:', JSON.stringify({
        ...request,
        password: '***ENCRYPTED***',
        vaultPassword: request.vaultPassword ? '***ENCRYPTED***' : undefined,
        devicePasswords: Object.keys(request.devicePasswords || {}).reduce((acc, key) => ({
          ...acc,
          [key]: '***ENCRYPTED***'
        }), {})
      }, null, 2));

      const response = await withCreatingKey(
        post<CreateKeyResponse>(API_ENDPOINTS.diskman.createKey, request)
      );

      if (response.status === 'success') {
        // Handle partial success scenario
        if (response.details?.partial_success) {
          const failedDevices = response.details.failed_devices || [];
          
          // Create message about partial success
          const successMessage = 'Keys created successfully for some devices.';
          success(successMessage, { duration: 8000 }); // 8 seconds for success message

          // Show error for each failed device with longer duration
          failedDevices.forEach((device: {
            device: string;
            success: boolean;
            message: string;
            operation_time?: string;
          }) => {
            const deviceName = device.device.replace('/dev/', '');
            showError(`Failed for ${deviceName}: ${device.message}`, { 
              duration: 15000, // 15 seconds for error messages
              dismissOnClick: true
            });
          });
        } else {
          // Full success
          success('Key created successfully. Remember to securely store this key!', { duration: 8000 });
        }
        resetForm();
      } else {
        showError(response.message || 'Failed to create key', { 
          duration: 15000, // 15 seconds for error messages
          dismissOnClick: true
        });
      }
    } catch (err) {
      logger.error('Error creating key:', err);
      showError('An error occurred while creating the key. Please try again.', { 
        duration: 15000, // 15 seconds for error messages
        dismissOnClick: true
      });
    } finally {
      stopCreatingKey();
    }
  }, [
    canCreateKey, 
    selectedKeyType, 
    selectedKeyTarget, 
    selectedKeyOperation, 
    selectedDevice, 
    oldVaultPassword, 
    oldDevicePasswords, 
    password, 
    post, 
    confirm, 
    showError, 
    success, 
    startCreatingKey, 
    stopCreatingKey, 
    withCreatingKey, 
    resetForm,
    vaultDevicePath
  ]);

  // Update key handler
  const handleUpdateKey = useCallback(async (): Promise<void> => {
    if (!canUpdateKey || !selectedDevice) return;

    // Get the selected strategy
    const strategy = KEY_STRATEGIES.find(s => s.id === selectedStrategy);
    if (!strategy) return;

    // Validate password confirmation match
    if (password !== confirmPassword) {
      showError('Passwords do not match. Please verify and try again.', { 
        duration: 15000, // 15 seconds for error messages
        dismissOnClick: true
      });
      return;
    }

    // For high warning level (Replace Primary Key), require additional confirmation
    let warningMessage = `Are you sure you want to update the key for device ${selectedDevice} using the ${strategy.label} strategy?`;
    
    if (strategy.warningLevel === 'high') {
      warningMessage = `WARNING: You are about to replace the primary factory access key (key0) on device ${selectedDevice}. This is a high-risk operation and could result in permanent loss of access to your data if not done properly.\n\nAre you ABSOLUTELY sure you want to proceed?`;
    }

    // Handle flexible addition with manual slot selection
    if (strategy.id === 'flexible_addition' && selectedFlexibleOption === 'manual' && !selectedKeySlot) {
      showError('Please select a key slot between 1 and 31.', { 
        duration: 15000, // 15 seconds for error messages
        dismissOnClick: true
      });
      return;
    }

    // Get confirmation
    const confirmed = await confirm(warningMessage);
    if (!confirmed) return;

    startUpdatingKey();

    try {
      // Ensure device has /dev/ prefix
      const devicePath = formatDevicePath(selectedDevice);

      // Get device label for API call if available
      const encryptedDevice = diskInfo?.encryptionInfo?.encrypted_devices?.find(
        ed => ed.device === devicePath || ed.label === selectedDevice
      );
      const nasDevice = diskInfo?.nasCompatibleDevices?.find(
        d => d.device === selectedDevice || d.label === selectedDevice
      );
      const deviceLabel = encryptedDevice?.label || nasDevice?.label;
      const deviceToSend = deviceLabel || devicePath;

      // Encrypt the current password
      const encryptedCurrentPassword = encryptData(password);
      if (!encryptedCurrentPassword) {
          showError('Failed to encrypt the current device password.', { 
            duration: 15000, // 15 seconds for error messages
            dismissOnClick: true
          });
          stopUpdatingKey();
          return;
      }

      const request: UpdateKeyRequest = {
        device: deviceToSend,
        strategy: selectedStrategy as 'replace_primary' | 'safe_rotation' | 'flexible_addition',
        current_password: encryptedCurrentPassword
      };

      // Add flexible options if needed
      if (strategy.id === 'flexible_addition') {
        request.flexibleOption = selectedFlexibleOption as 'random' | 'manual';
        if (selectedFlexibleOption === 'manual' && selectedKeySlot) {
          request.keySlot = selectedKeySlot;
        }
      }
      
      debug('Sending update key request:', JSON.stringify({
        ...request,
        current_password: '***ENCRYPTED***'
      }, null, 2));

      const response = await withUpdatingKey(
        post<UpdateKeyResponse>(API_ENDPOINTS.diskman.updateKey, request)
      );

      if (response.status === 'success') {
        success('Key updated successfully on device.', { duration: 8000 });
        resetForm();
      } else {
        showError(response.message || 'Failed to update key', { 
          duration: 15000, // 15 seconds for error messages
          dismissOnClick: true
        });
      }
    } catch (err) {
      logger.error('Error updating key:', err);
      showError('An error occurred while updating the key. Please try again.', { 
        duration: 15000, // 15 seconds for error messages
        dismissOnClick: true
      });
    } finally {
      stopUpdatingKey();
    }
  }, [
    canUpdateKey, 
    selectedDevice, 
    selectedStrategy, 
    selectedFlexibleOption, 
    selectedKeySlot,
    password, 
    confirmPassword,
    post, 
    confirm, 
    showError, 
    success, 
    startUpdatingKey, 
    stopUpdatingKey, 
    withUpdatingKey, 
    resetForm
  ]);

  return [
    {
      selectedKeyType,
      selectedKeyTarget,
      selectedKeyOperation,
      selectedDevice,
      selectedStrategy,
      selectedFlexibleOption,
      selectedKeySlot,
      password,
      confirmPassword,
      oldVaultPassword,
      oldDevicePasswords,
      isCreatingKey,
      isUpdatingKey,
      canCreateKey,
      canUpdateKey,
      isPasswordValid,
      passwordsMatch,
      vaultDevicePath
    },
    {
      handleKeyTypeSelect,
      handleKeyTargetSelect,
      handleKeyOperationSelect,
      handleDeviceSelect,
      handleStrategySelect,
      handleFlexibleOptionSelect,
      handleKeySlotSelect,
      handlePasswordChange,
      handleConfirmPasswordChange,
      handleOldVaultPasswordChange,
      handleOldDevicePasswordChange,
      handleCreateKey,
      handleUpdateKey,
      resetForm,
      getKeyStatus
    }
  ];
}; 