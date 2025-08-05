export interface DevTabConfig {
  displayName: string;
  adminOnly: boolean;
  order: number;
  isEnabled: boolean;
}

export interface DevTabVisibility {
  tab: boolean;
  elements: {
    placeholder: boolean;
  };
}

export interface DevTabData {
  // Add any dev-specific data properties here
}

export interface DevTab {
  config: DevTabConfig;
  visibility: DevTabVisibility;
  data: DevTabData;
}

export interface DevFileData {
  exists: boolean;
  content: string | null;
  path: string;
  error?: string;
}

export interface DevFilesResponse {
  status: string;
  files: {
    admin_user: string;
    admin_home: string;
    results: DevFileData;
    password: DevFileData;
  };
}

export interface DevWipeResponse {
  status: string;
  message?: string;
  data?: {
    output: string;
    timestamp: number;
  };
}

export interface DevFinaleResponse {
  status: string;
  message?: string;
  data?: {
    deleted_files: string[];
    cleaned_components?: string[];
    total_cleaned?: number;
    errors?: string[];
    timestamp: number;
  };
}

export interface DevLogResponse {
  status: string;
  log_data: {
    exists: boolean;
    content: string | null;
    path: string;
    size?: number;
    error?: string;
    message?: string;
  };
}

export interface DevHardDriveDevice {
  device: string;
  name: string;
  size: string;
  label: string;
  fstype: string;
  is_usb: boolean;
  is_luks: boolean;
  mapper_device?: string;
  mapper_fstype?: string;
  description: string;
}

export interface DevHardDriveDevicesResponse {
  status: string;
  devices: DevHardDriveDevice[];
}

export interface DevHardDriveTestRequest {
  device: string;
  test_type: 'quick' | 'full' | 'ultimate';
}

export interface DevHardDriveTestResponse {
  status: string;
  message?: string;
  data?: {
    test_id: string;
    device: string;
    test_type: string;
    output: string;
    timestamp: number;
  };
}

export interface DevHardDriveTestResults {
  exists: boolean;
  content: string | null;
  path: string;
  size?: number;
  error?: string;
  message?: string;
}

export interface DevHardDriveTestResultsResponse {
  status: string;
  results: DevHardDriveTestResults;
}

export interface DevThermalTestResponse {
  status: string;
  message?: string;
  data?: {
    test_id: string;
    output: string;
    timestamp: number;
  };
}

export interface DevThermalTestResults {
  exists: boolean;
  content: string | null;
  path: string;
  size?: number;
  error?: string;
  message?: string;
}

export interface DevThermalTestResultsResponse {
  status: string;
  results: DevThermalTestResults;
}