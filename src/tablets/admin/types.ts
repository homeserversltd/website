import { IconDefinition } from '@fortawesome/free-solid-svg-icons';

export interface SystemButton {
  variant: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  label: string;
  icon: any; // FontAwesome icon
  action: string;
  confirmTitle: string;
  confirmMessage: string;
  successMessage: string;
  progressMessage: string;
  endpoint: string;
  tooltip: string;
  onClick?: () => Promise<void>; // Add the onClick handler for the button
}

export interface UpdateProgressModalProps {
  output: string[];
  onCopy: () => void;
}

// Disk Management Types
export interface BlockDevice {
  name: string;
  size: string;
  type: string;
  mountpoint: string | null;
  mountpoints?: (string | null)[];
  fstype: string | null;
  model?: string;
  serial?: string;
  children?: BlockDevice[];
}

export interface DiskUsageItem {
  filesystem: string;
  type: string;
  size: string;
  used: string;
  avail: string;
  use: string;
  mounted: string;
}

export interface EncryptedDevice {
  device: string;
  is_open: boolean;
  mapper_name: string | null;
  type: string;
  uuid: string | null;
}

export interface NasCompatibleDevice {
  device: string;
  partition: string | null;
  mapper: string | null;
  size: string;
  model: string | null;
  serial: string | null;
  uuid: string | null;
  mountpoint: string | null;
  is_mounted: boolean;
  is_nas_ready: boolean;
  filesystem: string | null;
  total_size?: string;
  used_space?: string;
  available_space?: string;
  use_percent?: string;
}

export interface AdminDiskInfo {
  blockDevices: {
    blockdevices: BlockDevice[];
  };
  diskUsage: {
    disk_usage: DiskUsageItem[];
  };
  encryptionInfo: {
    encrypted_devices: EncryptedDevice[];
  };
  nasCompatibleDevices: NasCompatibleDevice[];
  rawFormat: boolean;
  timestamp: number;
}

export interface MountDestination {
  id: string;
  label: string;
  path: string;
}

// Disk Management API Response Types
export interface DiskManResponse {
  status: 'success' | 'error';
  message: string;
  details?: Record<string, any>;
}

export interface UnlockResponse {
  status: 'success' | 'error';
  message: string;
  details?: {
    device: string;
    mapper: string;
    is_open: boolean;
    unlocked_with?: 'nas_key' | 'manual_password';
  };
  needs_manual_password?: boolean;
}

export interface MountResponse extends DiskManResponse {
  details?: {
    device: string;
    mount_point: string;
    filesystem: string;
  };
}

export interface UnmountResponse extends DiskManResponse {
  details?: {
    device: string;
    mount_point: string;
  };
}

export interface FormatResponse extends DiskManResponse {
  details?: {
    device: string;
    filesystem: string;
    mount_point?: string;
    closed_luks?: string[];
    failed_mapper?: string;
  };
}

export interface EncryptResponse extends DiskManResponse {
  details?: {
    device: string;
    mapper: string;
    filesystem: string;
  };
}

export interface PermissionsResponse extends DiskManResponse {
  details?: {
    device: string;
    mount_point: string;
    permissions: string;
  };
}

export interface SyncResponse extends DiskManResponse {
  details?: {
    source: string;
    destination: string;
    bytes_transferred: number;
    files_transferred: number;
    duration: number;
    errors?: string[];
  };
}

export interface SyncScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  day?: number; // 0-6 for weekly (Sunday-Saturday)
  hour: number; // 0-23
  minute: number; // 0-59
}

export interface GetSyncScheduleResponse extends DiskManResponse {
  details?: {
    schedule: SyncScheduleConfig | null;
    crontabEntry?: string;
  };
}

export interface SetSyncScheduleResponse extends DiskManResponse {
  details?: {
    schedule: SyncScheduleConfig;
    crontabEntry: string;
  };
}

// Service Management Types
export interface ServiceStatus {
  name: string;
  systemdName?: string;
  isEnabled: boolean;
  isActive: boolean;
  status: 'running' | 'stopped' | 'unknown';
  statusDetails: string;
  isScriptManaged?: boolean;
  needsReboot?: boolean;
  needsRebootToStop?: boolean;
  needsRebootToStart?: boolean;
  stopMessage?: string;
  startMessage?: string;
  metadata?: ServiceMetadata;
}

export interface ServiceMetadata {
  hasScriptManagedServices: boolean;
  scriptManagedCount: number;
  systemdCount: number;
  totalCount: number;
  rebootRequiredForCompleteStop?: boolean;
  rebootRequiredForCompleteStart?: boolean;
  rebootRecommended?: boolean;
  rebootNote?: string;
}

export interface ServiceActionResult {
  name: string;
  success: boolean;
  message: string;
  isScriptManaged?: boolean;
  needsReboot?: boolean;
}

export interface CheckServicesResponse extends DiskManResponse {
  details?: {
    action: 'mount' | 'unmount';
    hasRunningServices?: boolean;
    runningServices?: ServiceStatus[];
    hasStoppedServices?: boolean;
    stoppedServices?: ServiceStatus[];
  };
}

export interface ManageServicesResponse extends DiskManResponse {
  details?: {
    action: 'start' | 'stop';
    serviceResults: {
      results: ServiceActionResult[];
      metadata: ServiceMetadata;
    }
  };
}

// Key Management Types
export interface KeyType {
  id: 'nas' | 'vault' | 'combined' | 'update';
  label: string;
  description: string;
}

export interface KeyTarget {
  id: 'external' | 'vault' | 'both';
  label: string;
  description: string;
}

export interface KeyOperation {
  id: 'replace_primary' | 'safe_rotation' | 'flexible_addition';
  label: string;
  description: string;
  details: string;
  warningLevel: 'low' | 'medium' | 'high';
}

export interface KeyManagementStrategy {
  id: 'replace_primary' | 'safe_rotation' | 'flexible_addition';
  label: string;
  description: string;
  warningLevel: 'none' | 'low' | 'medium' | 'high';
  details: string;
}

export interface FlexibleAdditionOption {
  id: 'random' | 'manual';
  label: string;
  description: string;
  warningLevel: 'none' | 'low' | 'medium' | 'high';
  details: string;
}

export interface CreateKeyRequest {
  target: 'external' | 'vault' | 'both';
  strategy: 'replace_primary' | 'safe_rotation' | 'flexible_addition';
  password: string;
  devices?: string[];
  flexibleOption?: 'random' | 'manual';
  keySlot?: number;
  vaultPassword?: string;  // Current vault password when target includes vault
  devicePasswords?: Record<string, string>;  // Maps device paths to their current passwords
}

export interface UpdateKeyRequest {
  device: string;
  strategy: 'replace_primary' | 'safe_rotation' | 'flexible_addition';
  current_password: string;
  flexibleOption?: 'random' | 'manual';
  keySlot?: number;
}

export interface KeyStatusResponse extends DiskManResponse {
  details?: {
    keyType: string;
    device?: string;
    keySlots?: {
      total: number;
      used: number;
      available: number;
    };
    lastUpdated?: number;
  };
}

export interface CreateKeyResponse {
  status: string;
  message: string;
  details?: {
    keyType: string;
    target: string;
    created: boolean;
    timestamp: number;
    partial_success?: boolean;
    failed_devices?: Array<{
      device: string;
      success: boolean;
      message: string;
      operation_time?: string;
    }>;
    devices?: Array<{
      device: string;
      success: boolean;
      message: string;
      operation_time?: string;
    }>;
  };
}

export interface UpdateKeyResponse extends DiskManResponse {
  details?: {
    device: string;
    strategy: string;
    slot?: number;
    updated: boolean;
    timestamp: number;
  };
}

export interface VaultDeviceResponse extends DiskManResponse {
  details?: {
    device_path: string;
  };
}

// SSH Control Types
export interface SSHStatus {
  password_auth_enabled: boolean;
  error?: string;
}

export interface SSHToggleRequest {
  enable: boolean;
}

export interface SSHToggleResponse {
  success: boolean;
  message?: string;
  password_auth_enabled?: boolean;
  error?: string;
}

export interface SSHServiceStatus {
  is_enabled: boolean;
  is_running: boolean;
  service_name: string;
  error?: string;
}

export interface SSHServiceToggleResponse {
  success: boolean;
  message?: string;
  ssh_service_enabled?: boolean;
  error?: string;
}

export interface SambaServiceStatus {
  services: {
    [service: string]: {
      is_enabled: boolean;
      is_running: boolean;
      service_name: string;
      status: string;
    };
  };
  all_enabled: boolean;
  all_running: boolean;
  any_running: boolean;
  is_enabled: boolean;
  is_running: boolean;
  error?: string;
}

export interface SambaServiceToggleResponse {
  success: boolean;
  message?: string;
  samba_services_enabled?: boolean;
  error?: string;
}

export interface SystemControlResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface HardResetResponse extends SystemControlResponse {}
export interface SystemRestartResponse extends SystemControlResponse {}
export interface SystemShutdownResponse extends SystemControlResponse {}

export interface SystemActionModalProps {
  action: string;
}

// Admin password update types
export interface AdminPasswordUpdateRequest {
  oldPassword: string;
  newPassword: string;
}

export interface AdminPasswordUpdateResponse extends SystemControlResponse {
  details?: {
    passwordUpdated: boolean;
    serviceKeyUpdated?: boolean;
  };
}

export interface PinVerificationResponse {
  verified: boolean;
  error?: string;
}

export interface ConfirmModalOptions {
  promptForInput?: boolean;
  inputType?: 'text' | 'password';
  inputLabel?: string;
}

export interface ConfirmModalResult {
  confirmed: boolean;
  input?: string;
}

// Log Viewer types
export interface LogResponse {
  status: 'success' | 'error';
  logs: string[];
  metadata?: {
    offset: number;
    limit: number;
    returned_lines: number;
    total_lines: number;
    file_size: number;
    file_path: string;
  };
  message?: string;
}

export interface LogViewerModalProps {
  onClose: () => void;
}

// Hard Drive Test Types
export interface TestableDevice {
  device: string;
  name: string;
  mount: string;
}

export interface TestableDevicesResponse {
  devices: TestableDevice[];
  timestamp: number;
}

export interface HardDriveTestProgress {
  testing: boolean;
  device: string | null;
  test_type: string | null;
  progress: number;
  timestamp: number;
}

export interface HardDriveTestUpdate {
  id: string;
  message: string;
  timestamp: number;
  progress?: number;
  complete?: boolean;
}

export interface StartTestRequest {
  device: string;
  test_type: 'quick' | 'full' | 'ultimate';
}

export interface StartTestResponse extends DiskManResponse {
  test_id?: string;
  success: boolean;
}

export interface TestResultsResponse extends DiskManResponse {
  results: string | null;
  success: boolean;
}

export interface HardDriveTestModalProps {
  onClose: () => void;
}

// Modern backend event type for hard_drive_test_status
export interface ModernHardDriveTestStatus {
  id: string;
  status: 'working';
  timestamp: number;
  progress?: number;
  complete?: boolean;
  message?: string;
}

// Premium Tab Management Types
export interface PremiumTab {
  name: string;
  installed: boolean;
  hasConflicts: boolean;
  conflictsWithCore: boolean;
  // Optional detailed diagnostics for UI rendering
  conflictOutput?: string[];
}

export interface PremiumTabSummary {
  totalTabs: number;
  installedTabs: number;
  availableTabs: number;
  hasAnyConflicts: boolean;
  canInstallAll: boolean;
  canUninstallAll: boolean;
  // Optional cross-tab validation diagnostics
  crossConflictOutput?: string[];
}

export interface PremiumTabStatusResponse {
  success: boolean;
  tabs: PremiumTab[];
  summary: PremiumTabSummary;
  error?: string;
}

export interface PremiumTabValidateCloneRequest {
  gitUrl: string;
  branch?: string;
}

export interface PremiumTabValidateCloneResponse {
  success: boolean;
  tabName?: string;
  cloned?: boolean;
  error?: string;
}

export interface PremiumTabOperationResponse {
  success: boolean;
  tabName?: string;
  message?: string;
  error?: string;
}

export interface PremiumTabLogsResponse {
  success: boolean;
  logs: string[];
  lastOperation: string;
  timestamp?: string;
  message?: string;
  error?: string;
}

export interface PremiumTabModalProps {
  onClose: () => void;
}

// Auto-Update Types
export interface PremiumTabAutoUpdate {
  tabName: string;
  hasGitDirectory: boolean;
  hasGitMetadata: boolean;
  autoUpdateEnabled: boolean;
  autoUpdateEligible: boolean;
  gitRepository: string | null;
  gitBranch: string | null;
  error?: string | null;
}

export interface PremiumTabAutoUpdateSummary {
  totalTabs: number;
  gitManagedTabs: number;
  autoUpdateEligible: number;
  autoUpdateEnabled: number;
}

export interface PremiumTabAutoUpdateStatusResponse {
  success: boolean;
  tabs: PremiumTabAutoUpdate[];
  summary: PremiumTabAutoUpdateSummary;
  error?: string;
}

export interface PremiumTabAutoUpdateSettingResponse {
  success: boolean;
  tabName: string;
  autoUpdateEnabled: boolean;
  gitRepository: string | null;
  gitBranch: string | null;
  hasGitMetadata: boolean;
  error?: string;
}

export interface PremiumTabToggleAutoUpdateRequest {
  enabled: boolean;
}

export interface PremiumTabToggleAutoUpdateResponse {
  success: boolean;
  message: string;
  enabled: boolean;
  error?: string;
}