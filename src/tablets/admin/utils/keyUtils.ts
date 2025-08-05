import { BlockDevice, KeyType, KeyManagementStrategy, FlexibleAdditionOption, KeyTarget, KeyOperation } from '../types';
import { isDeviceEncrypted, hasLockedEncryptedPartition, isDeviceMounted } from './diskUtils';

// Constants for key targets
export const KEY_TARGETS: KeyTarget[] = [
  {
    id: 'external',
    label: 'External Device(s)',
    description: 'Update keys for external encrypted devices'
  },
  {
    id: 'vault',
    label: 'System Vault',
    description: 'Update keys for the system vault'
  },
  {
    id: 'both',
    label: 'Both',
    description: 'Update keys for both external devices and system vault'
  }
];

// Constants for key operations
export const KEY_OPERATIONS: KeyOperation[] = [
  {
    id: 'replace_primary',
    label: 'Replace Primary Key',
    description: 'Replaces the primary key (slot 0)',
    details: 'This operation replaces the primary key in slot 0. Use with caution as this affects the main access key.',
    warningLevel: 'high'
  },
  {
    id: 'safe_rotation',
    label: 'Safe Key Rotation',
    description: 'Rotates keys safely using slot 1',
    details: 'This operation safely rotates keys by using slot 1, maintaining access through the primary key.',
    warningLevel: 'low'
  },
  {
    id: 'flexible_addition',
    label: 'Add New Key',
    description: 'Adds a new key to an available slot',
    details: 'This operation adds a new key to the next available slot or follows the specified flexible option if slots are full.',
    warningLevel: 'medium'
  }
];

// Constants for key management strategies
export const KEY_STRATEGIES = [
  {
    id: 'replace_primary',
    label: 'Replace Primary Key',
    description: 'Replace the primary key (slot 0)',
    warningLevel: 'high',
    details: 'WARNING: This replaces the primary key. Ensure you have a backup or secondary key before proceeding.'
  },
  {
    id: 'safe_rotation',
    label: 'Safe Key Rotation',
    description: 'Add or replace key in slot 1, preserving the primary key',
    warningLevel: 'low',
    details: 'This is the safest option as it preserves the primary key while adding a new key to slot 1.'
  },
  {
    id: 'flexible_addition',
    label: 'Flexible Key Addition',
    description: 'Add a new key to the next available slot',
    warningLevel: 'medium',
    details: 'Adds a new key to the next available slot. If no slots are available, you can choose how to handle it.'
  }
] as const;

// Constants for flexible addition options
export const FLEXIBLE_ADDITION_OPTIONS = [
  {
    id: 'random',
    label: 'Random Slot',
    description: 'Replace a randomly chosen non-primary key slot',
    warningLevel: 'medium',
    details: 'A random non-primary key slot will be selected and replaced with the new key.'
  },
  {
    id: 'manual',
    label: 'Manual Selection',
    description: 'Manually select which key slot to replace',
    warningLevel: 'high',
    details: 'You can choose which non-primary key slot to replace. Be careful not to remove needed keys.'
  }
] as const;

/**
 * Check if a device is eligible for key update
 * @param deviceName The device name to check
 * @param blockDevices Array of block devices
 * @param diskInfo Disk information
 * @returns Boolean indicating if the device is eligible for key update
 */
export const isDeviceEligibleForKeyUpdate = (
  deviceName: string,
  blockDevices: BlockDevice[],
  diskInfo: any
): boolean => {
  // Device must be encrypted, not mounted, and have a locked encrypted partition
  return (
    isDeviceEncrypted(deviceName, blockDevices, diskInfo) &&
    !isDeviceMounted(deviceName, blockDevices, diskInfo) &&
    hasLockedEncryptedPartition(deviceName, blockDevices, diskInfo)
  );
};

/**
 * Get key target by ID
 * @param id The key target ID
 * @returns The key target object or undefined if not found
 */
export const getKeyTargetById = (id: string): KeyTarget | undefined => {
  return KEY_TARGETS.find(target => target.id === id);
};

/**
 * Get key operation by ID
 * @param id The key operation ID
 * @returns The key operation object or undefined if not found
 */
export const getKeyOperationById = (id: string): KeyOperation | undefined => {
  return KEY_OPERATIONS.find(operation => operation.id === id);
};

/**
 * Get key management strategy by ID
 * @param id The strategy ID
 * @returns The strategy object or undefined if not found
 */
export const getStrategyById = (id: string): KeyManagementStrategy | undefined => {
  return KEY_STRATEGIES.find(strategy => strategy.id === id);
};

/**
 * Get flexible addition option by ID
 * @param id The option ID
 * @returns The option object or undefined if not found
 */
export const getFlexibleOptionById = (id: string): FlexibleAdditionOption | undefined => {
  return FLEXIBLE_ADDITION_OPTIONS.find(option => option.id === id);
};

/**
 * Generate password strength requirements message
 * @returns String with password requirements
 */
export const getPasswordRequirementsMessage = (): string => {
  return 'Password can only contain alphanumeric characters, underscores, and the following special characters: - . _ ~';
};

/**
 * Check if password meets strength requirements
 * @param password The password to check
 * @returns Boolean indicating if the password meets requirements
 */
export const isPasswordStrong = (password: string): boolean => {
  if (!password) return false;
  // Check that password only contains allowed characters (alphanumeric, underscore, and - . _ ~)
  if (!/^[a-zA-Z0-9_.\-~]+$/.test(password)) return false;
  
  return true;
}; 