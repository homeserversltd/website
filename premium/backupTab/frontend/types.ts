/**
 * HOMESERVER Backup Tab Types
 * Professional backup system type definitions
 */

export interface BackupStatus {
  system_status: 'not_configured' | 'partial' | 'configured';
  config_exists: boolean;
  state_exists: boolean;
  service_status: 'active' | 'inactive' | 'failed' | 'unknown';
  last_backup: string | null;
  repositories_count: number;
  cloud_providers: string[];
  key_exists: boolean;
}

export interface Repository {
  name: string;
  status: 'active' | 'inactive';
  path: string;
  size?: number;
  last_commit?: string;
}

export interface CloudProvider {
  enabled: boolean;
  credentials_key: string;
  container: string;
  container_type: string;
  username?: string;
  password?: string;
  application_key_id?: string;
  application_key?: string;
  access_key?: string;
  secret_key?: string;
  service_account_key?: string;
  project_id?: string;
  region?: string;
  max_retries?: number;
  retry_delay?: number;
  timeout?: number;
  max_bandwidth?: number | null;
  upload_chunk_size?: number;
  connection_pool_size?: number;
}

export interface ProviderStatus {
  name: string;
  enabled: boolean;
  available: boolean;
  configured: boolean;
  initialized?: boolean;
  initialization_error?: string;
  display_name: string;
  description: string;
  icon: string;
}

export interface BackupConfig {
  backup_items: string[];
  providers: Record<string, CloudProvider>;
  retention_days: number;
  encryption_enabled: boolean;
  encryption_key?: string | null;
  encryption_salt?: string | null;
  backup_count: number;
  backupTypes?: {
    full: BackupTypeConfig;
    incremental: BackupTypeConfig;
    differential: BackupTypeConfig;
  };
  logging: {
    enabled: boolean;
    log_file: string;
    log_level: string;
    max_file_size_mb: number;
    backup_count: number;
    format: string;
  };
}

export interface BackupHistory {
  recent_backups: BackupRecord[];
  log_entries: string[];
  state: {
    last_daily_backup?: string;
    last_weekly_backup?: string;
    last_monthly_backup?: string;
    last_yearly_backup?: string;
    backup_history: BackupRecord[];
  };
}

export interface BackupRecord {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  timestamp: string;
  results: BackupResult[];
}

export interface BackupResult {
  repository: string;
  backup_type: string;
  timestamp: string;
  local_path: string;
  upload_results: Record<string, boolean>;
  success: boolean;
}

export interface ScheduleInfo {
  timer_status: 'active' | 'inactive' | 'failed' | 'unknown';
  next_run: string | null;
  last_run: string | null;
  schedule_config: {
    enabled?: boolean;
    frequency?: string;
    hour?: number;
    minute?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    activeBackupType?: 'full' | 'incremental' | 'differential';
    backupType?: 'full' | 'incremental' | 'differential';
    time?: string;
    schedule?: string;
    [key: string]: any;
  };
}

// Generic backup type configuration - system makes intelligent decisions
export interface GenericBackupConfig {
  type: 'full' | 'incremental' | 'differential';
  
  // User-configurable parameters (system handles the rest)
  userConfig: {
    // For Full: user chooses frequency and retention count
    // For Differential: user chooses retention count (system handles daily + weekly full)
    // For Incremental: user chooses full refresh interval and retention count
    retentionCount: number; // How many backups to keep in rotation
    fullRefreshInterval?: number; // For incremental: weeks between full refreshes
    fullRefreshIntervalUnit?: 'weeks' | 'months'; // Unit for full refresh interval
  };
  
  // System-managed advanced settings (not user configurable)
  systemConfig: {
    compression: {
      enabled: boolean;
      level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      algorithm: 'gzip' | 'lz4' | 'zstd';
    };
    encryption: {
      enabled: boolean;
      algorithm: 'AES-256-GCM' | 'AES-128-GCM' | 'ChaCha20-Poly1305';
    };
    deduplication: {
      enabled: boolean;
      algorithm: 'blake2' | 'sha256';
    };
    verification: {
      enabled: boolean;
      frequency: 'every_backup' | 'weekly' | 'monthly';
      integrityCheck: boolean;
    };
    performance: {
      maxBandwidth?: number | null;
      parallelJobs: number;
      chunkSize: number;
    };
    cleanup: {
      autoCleanup: boolean;
      cleanupAfterDays: number;
      keepAtLeast: number;
    };
    scheduling: {
      priority: 'low' | 'medium' | 'high';
      timeout: number;
      retryAttempts: number;
    };
  };
}

// Legacy interface for backward compatibility (will be phased out)
export interface BackupTypeConfig {
  type: 'full' | 'incremental' | 'differential';
  retention: {
    days: number;
    maxBackups?: number;
    keepForever?: boolean;
  };
  compression: {
    enabled: boolean;
    level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    algorithm: 'gzip' | 'lz4' | 'zstd';
  };
  encryption: {
    enabled: boolean;
    algorithm: 'AES-256-GCM' | 'AES-128-GCM' | 'ChaCha20-Poly1305';
    keyId?: string;
  };
  deduplication: {
    enabled: boolean;
    algorithm: 'blake2' | 'sha256';
  };
  verification: {
    enabled: boolean;
    frequency: 'every_backup' | 'weekly' | 'monthly';
    integrityCheck: boolean;
  };
  performance: {
    maxBandwidth?: number | null;
    parallelJobs: number;
    chunkSize: number;
  };
  cleanup: {
    autoCleanup: boolean;
    cleanupAfterDays: number;
    keepAtLeast: number;
  };
  scheduling: {
    priority: 'low' | 'medium' | 'high';
    timeout: number;
    retryAttempts: number;
  };
}

export interface BackupScheduleConfig {
  id: string;
  name: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  day?: number; // 0-6 for weekly (Sunday-Saturday), 1-31 for monthly
  hour: number; // 0-23
  minute: number; // 0-59
  customCron?: string; // For custom schedules
  backupTypes: {
    full: BackupTypeConfig;
    incremental: BackupTypeConfig;
    differential: BackupTypeConfig;
  };
  activeBackupType: 'full' | 'incremental' | 'differential';
  repositories: string[];
  lastRun?: string;
  nextRun?: string;
  status: 'active' | 'paused' | 'error' | 'never_run';
}

export interface BackupOperation {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  repositories: string[];
  start_time: string;
  end_time?: string;
  status: 'running' | 'completed' | 'failed';
  progress?: number;
  output?: string;
  error?: string;
}

export interface CloudTestResult {
  connections: Record<string, boolean>;
  output: string;
  tested_at: string;
}

export interface InstallationStatus {
  installed: boolean;
  installation_timestamp: string | null;
  installation_method: string | null;
  version: string;
  installation_path: string | null;
  missing_components: string[];
  can_install: boolean;
  can_uninstall: boolean;
}

export interface HeaderStats {
  last_backup: string;
  last_backup_timestamp: string | null;
  next_backup: string;
  backup_items_count: number;
  last_backup_size: string;
  last_backup_size_bytes: number | null;
  backup_in_progress: boolean;
  key_exists: boolean;
  is_configured: boolean;
  installation_status: InstallationStatus | null;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface UseBackupControlsReturn {
  getStatus: () => Promise<BackupStatus>;
  getRepositories: () => Promise<Repository[]>;
  runBackup: (type: string, repositories: string[]) => Promise<BackupOperation>;
  syncNow: () => Promise<any>;
  testCloudConnections: () => Promise<CloudTestResult>;
  getConfig: () => Promise<BackupConfig>;
  updateConfig: (config: Partial<BackupConfig>) => Promise<boolean>;
  getHistory: () => Promise<BackupHistory>;
  getSchedule: () => Promise<ScheduleInfo>;
  updateSchedule: (action: string) => Promise<boolean>;
  setScheduleConfig: (config: any) => Promise<boolean>;
  getScheduleHistory: () => Promise<any>;
  getScheduleTemplates: () => Promise<any>;
  testSchedule: () => Promise<any>;
  getProvidersStatus: () => Promise<ProviderStatus[]>;
  installBackupSystem: () => Promise<boolean>;
  uninstallBackupSystem: () => Promise<boolean>;
  // Keyman credential management
  createKeymanCredentials: (serviceName: string, username: string, password: string) => Promise<boolean>;
  updateKeymanCredentials: (serviceName: string, newPassword: string, username?: string, oldPassword?: string) => Promise<boolean>;
  deleteKeymanCredentials: (serviceName: string) => Promise<boolean>;
  getKeymanCredentials: (serviceName: string) => Promise<any>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

// Generic backup type information - intelligent presets
export interface GenericBackupTypeInfo {
  value: 'full' | 'incremental' | 'differential';
  label: string;
  description: string;
  tooltip: string;
  summary: string;
  
  // Type-specific configuration constraints
  constraints: {
    allowedFrequencies: ('daily' | 'weekly' | 'monthly')[];
    requiresFullRefresh?: boolean; // For incremental
    autoSchedulesFull?: boolean; // For differential
    defaultRetentionCount: number;
    maxRetentionCount: number;
  };
  
  // System-generated schedule description
  getScheduleDescription: (config: GenericBackupConfig) => string;
}

// Default backup type configurations (legacy)
export interface BackupTypeInfo {
  value: 'full' | 'incremental' | 'differential';
  label: string;
  description: string;
  tooltip: string;
  summary: string;
}

export interface BackupCalculation {
  backupsPerDay: number;
  totalBackupsInPeriod: number;
  backupFrequency: string;
  storageImpact: string;
  restoreComplexity: string;
}

// Generic backup type configurations with intelligent defaults
export const GENERIC_BACKUP_TYPES: {
  full: GenericBackupConfig;
  incremental: GenericBackupConfig;
  differential: GenericBackupConfig;
} = {
  full: {
    type: 'full',
    userConfig: {
      retentionCount: 12, // 12 backups in rotation
    },
    systemConfig: {
      compression: {
        enabled: true,
        algorithm: 'zstd',
        level: 6
      },
      encryption: {
        enabled: true,
        algorithm: 'AES-256-GCM'
      },
      deduplication: {
        enabled: true,
        algorithm: 'blake2'
      },
      verification: {
        enabled: true,
        frequency: 'every_backup',
        integrityCheck: true
      },
      performance: {
        maxBandwidth: null,
        parallelJobs: 4,
        chunkSize: 64
      },
      cleanup: {
        autoCleanup: true,
        cleanupAfterDays: 90,
        keepAtLeast: 3
      },
      scheduling: {
        priority: 'high',
        timeout: 7200,
        retryAttempts: 3
      }
    }
  },
  incremental: {
    type: 'incremental',
    userConfig: {
      retentionCount: 30,
      fullRefreshInterval: 4,
      fullRefreshIntervalUnit: 'weeks'
    },
    systemConfig: {
      compression: {
        enabled: true,
        algorithm: 'lz4',
        level: 3
      },
      encryption: {
        enabled: true,
        algorithm: 'AES-256-GCM'
      },
      deduplication: {
        enabled: true,
        algorithm: 'blake2'
      },
      verification: {
        enabled: true,
        frequency: 'weekly',
        integrityCheck: true
      },
      performance: {
        maxBandwidth: null,
        parallelJobs: 8,
        chunkSize: 32
      },
      cleanup: {
        autoCleanup: true,
        cleanupAfterDays: 30,
        keepAtLeast: 5
      },
      scheduling: {
        priority: 'medium',
        timeout: 3600,
        retryAttempts: 5
      }
    }
  },
  differential: {
    type: 'differential',
    userConfig: {
      retentionCount: 30,
    },
    systemConfig: {
      compression: {
        enabled: true,
        algorithm: 'gzip',
        level: 6
      },
      encryption: {
        enabled: true,
        algorithm: 'AES-256-GCM'
      },
      deduplication: {
        enabled: true,
        algorithm: 'blake2'
      },
      verification: {
        enabled: true,
        frequency: 'weekly',
        integrityCheck: true
      },
      performance: {
        maxBandwidth: null,
        parallelJobs: 6,
        chunkSize: 48
      },
      cleanup: {
        autoCleanup: true,
        cleanupAfterDays: 60,
        keepAtLeast: 2
      },
      scheduling: {
        priority: 'medium',
        timeout: 5400,
        retryAttempts: 4
      }
    }
  }
};

export const DEFAULT_BACKUP_TYPES: {
  full: BackupTypeConfig;
  incremental: BackupTypeConfig;
  differential: BackupTypeConfig;
} = {
  full: {
    type: 'full',
    retention: {
      days: 105, // 3.5 months coverage (6 daily + 3 weekly + 3 monthly)
      maxBackups: 12, // 6 daily + 3 weekly + 3 monthly
      keepForever: false
    },
    compression: {
      enabled: true,
      algorithm: 'zstd',
      level: 6
    },
    encryption: {
      enabled: true,
      algorithm: 'AES-256-GCM'
    },
    deduplication: {
      enabled: true,
      algorithm: 'blake2'
    },
    verification: {
      enabled: true,
      frequency: 'every_backup',
      integrityCheck: true
    },
    performance: {
      maxBandwidth: null,
      parallelJobs: 4,
      chunkSize: 64
    },
    cleanup: {
      autoCleanup: true,
      cleanupAfterDays: 90,
      keepAtLeast: 3
    },
    scheduling: {
      priority: 'high',
      timeout: 7200, // 2 hours
      retryAttempts: 3
    }
  },
  incremental: {
    type: 'incremental',
    retention: {
      days: 30,
      maxBackups: 30,
      keepForever: false
    },
    compression: {
      enabled: true,
      algorithm: 'lz4',
      level: 3
    },
    encryption: {
      enabled: true,
      algorithm: 'AES-256-GCM'
    },
    deduplication: {
      enabled: true,
      algorithm: 'blake2'
    },
    verification: {
      enabled: true,
      frequency: 'weekly',
      integrityCheck: true
    },
    performance: {
      maxBandwidth: null,
      parallelJobs: 8,
      chunkSize: 32
    },
    cleanup: {
      autoCleanup: true,
      cleanupAfterDays: 30,
      keepAtLeast: 5
    },
    scheduling: {
      priority: 'medium',
      timeout: 3600, // 1 hour
      retryAttempts: 5
    }
  },
  differential: {
    type: 'differential',
    retention: {
      days: 30,
      maxBackups: 30,
      keepForever: false
    },
    compression: {
      enabled: true,
      algorithm: 'gzip',
      level: 6
    },
    encryption: {
      enabled: true,
      algorithm: 'AES-256-GCM'
    },
    deduplication: {
      enabled: true,
      algorithm: 'blake2'
    },
    verification: {
      enabled: true,
      frequency: 'weekly',
      integrityCheck: true
    },
    performance: {
      maxBandwidth: null,
      parallelJobs: 6,
      chunkSize: 48
    },
    cleanup: {
      autoCleanup: true,
      cleanupAfterDays: 60,
      keepAtLeast: 2
    },
    scheduling: {
      priority: 'medium',
      timeout: 5400, // 1.5 hours
      retryAttempts: 4
    }
  }
};

/**
 * Calculate backup frequency and storage impact based on configuration
 */
export function calculateBackupImpact(
  config: BackupTypeConfig,
  scheduleFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily'
): BackupCalculation {
  const days = config.retention.days;
  const maxBackups = config.retention.maxBackups;
  const keepForever = config.retention.keepForever;

  // Calculate backups per day based on schedule
  let backupsPerDay = 0;
  switch (scheduleFrequency) {
    case 'daily':
      backupsPerDay = 1;
      break;
    case 'weekly':
      backupsPerDay = 1 / 7;
      break;
    case 'monthly':
      backupsPerDay = 1 / 30;
      break;
    case 'yearly':
      backupsPerDay = 1 / 365;
      break;
  }

  // Calculate total backups in retention period
  let totalBackupsInPeriod = Math.floor(days * backupsPerDay);
  
  // Apply max backups limit if set
  if (maxBackups && totalBackupsInPeriod > maxBackups) {
    totalBackupsInPeriod = maxBackups;
  }

  // If keep forever, show unlimited
  if (keepForever) {
    totalBackupsInPeriod = Infinity;
  }

  // Generate frequency description
  const frequencyMap = {
    daily: 'every day',
    weekly: 'once per week',
    monthly: 'once per month',
    yearly: 'once per year'
  };

  const backupFrequency = frequencyMap[scheduleFrequency];

  // Calculate storage impact based on backup type
  let storageImpact = '';
  switch (config.type) {
    case 'full':
      storageImpact = 'Optimized - Daily full backups with GFS rotation (6+3+3 slots)';
      break;
    case 'incremental':
      storageImpact = 'Low - Only changed files since last backup';
      break;
    case 'differential':
      storageImpact = 'Efficient - Daily changes since weekly full backup';
      break;
  }

  // Calculate restore complexity
  let restoreComplexity = '';
  switch (config.type) {
    case 'full':
      restoreComplexity = 'Simple - Single backup file needed';
      break;
    case 'incremental':
      restoreComplexity = 'Complex - Requires all incremental backups since last full';
      break;
    case 'differential':
      restoreComplexity = 'Simple - Requires only latest weekly full + latest daily differential';
      break;
  }

  return {
    backupsPerDay,
    totalBackupsInPeriod,
    backupFrequency,
    storageImpact,
    restoreComplexity
  };
}

/**
 * Generate plain English summary for backup configuration
 */
export function generateBackupSummary(
  config: BackupTypeConfig,
  scheduleFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily'
): string {
  const calculation = calculateBackupImpact(config, scheduleFrequency);
  const { days, maxBackups, keepForever } = config.retention;
  
  let summary = `With ${days} day retention period and ${calculation.backupFrequency} schedule, `;
  
  if (keepForever) {
    summary += `this will keep backups forever (unlimited storage). `;
  } else if (maxBackups && calculation.totalBackupsInPeriod > maxBackups) {
    summary += `this will keep a maximum of ${maxBackups} backups. `;
  } else {
    summary += `this will create approximately ${calculation.totalBackupsInPeriod} backups. `;
  }
  
  summary += `${calculation.storageImpact} ${calculation.restoreComplexity}`;
  
  return summary;
}

/**
 * Get generic backup type information with intelligent presets
 */
export function getGenericBackupTypeInfo(): GenericBackupTypeInfo[] {
  return [
    {
      value: 'full',
      label: 'Full Backup',
      description: 'Rolling full backups with smart rotation',
      tooltip: 'Creates complete backups at your chosen frequency. System manages intelligent rotation to keep your specified number of backups. Perfect for critical data that needs complete, independent restore points.',
      summary: 'Complete backups with intelligent rotation - simple restore, higher storage usage',
      constraints: {
        allowedFrequencies: ['daily', 'weekly', 'monthly'],
        defaultRetentionCount: 12,
        maxRetentionCount: 100
      },
      getScheduleDescription: (config) => {
        const count = config.userConfig.retentionCount;
        return `Full backups with ${count} backup rotation (system manages GFS-style retention)`;
      }
    },
    {
      value: 'differential',
      label: 'Differential',
      description: 'Daily differentials + weekly full backups',
      tooltip: 'System automatically runs daily differential backups plus weekly full backups. You only need to specify how many backups to keep. Restore requires only the latest weekly full plus the latest differential - optimal balance of storage and simplicity.',
      summary: 'Daily differentials + weekly fulls - efficient storage, simple restore (2 files needed)',
      constraints: {
        allowedFrequencies: ['daily'], // System enforces daily + weekly full
        autoSchedulesFull: true,
        defaultRetentionCount: 30,
        maxRetentionCount: 90
      },
      getScheduleDescription: (config) => {
        const count = config.userConfig.retentionCount;
        return `Daily differentials + weekly full backups (${count} backups retained)`;
      }
    },
    {
      value: 'incremental',
      label: 'Incremental',
      description: 'Daily incrementals + periodic full refresh',
      tooltip: 'System runs daily incremental backups and automatically refreshes with full backups at your specified interval. You choose how often to refresh the full backup (weeks/months) and retention count. Most storage-efficient but requires all backups for restore.',
      summary: 'Daily incrementals + periodic full refresh - lowest storage, most complex restore',
      constraints: {
        allowedFrequencies: ['daily'], // System enforces daily + periodic full
        requiresFullRefresh: true,
        defaultRetentionCount: 30,
        maxRetentionCount: 180
      },
      getScheduleDescription: (config) => {
        const count = config.userConfig.retentionCount;
        const interval = config.userConfig.fullRefreshInterval || 4;
        const unit = config.userConfig.fullRefreshIntervalUnit || 'weeks';
        return `Daily incrementals + full refresh every ${interval} ${unit} (${count} backups retained)`;
      }
    }
  ];
}

/**
 * Get backup type information with enhanced descriptions (legacy)
 */
export function getBackupTypeInfo(): BackupTypeInfo[] {
  return [
    {
      value: 'full',
      label: 'Full Backup',
      description: 'GFS rotation: Daily runs, smart retention',
      tooltip: 'Runs daily at 2 AM with intelligent GFS (Grandfather-Father-Son) retention: keeps 6 daily slots, 3 weekly slots, and 3 monthly slots. Provides 3.5 months of recovery points with optimal storage efficiency.',
      summary: 'GFS rotation - 6 daily + 3 weekly + 3 monthly slots (3.5 months coverage)'
    },
    {
      value: 'incremental',
      label: 'Incremental',
      description: 'Only changed files since last backup',
      tooltip: 'Backs up only files that have changed since the last backup (full or incremental). Fast and storage-efficient, but requires all previous backups to restore. Recommended for daily schedules.',
      summary: 'Only changed files - lowest storage usage, most complex restore process'
    },
    {
      value: 'differential',
      label: 'Differential',
      description: 'Daily changes since last full backup',
      tooltip: 'Backs up all files that have changed since the last weekly full backup. Runs daily at 2 AM with randomization. Only requires the latest weekly full backup plus the latest daily differential to restore. Optimal balance of storage efficiency and restore simplicity.',
      summary: 'Daily changes since weekly full - efficient storage, simple restore (2 files needed)'
    }
  ];
}

/**
 * Helper functions for generic backup configuration
 */

// Convert generic config to legacy format for backward compatibility
export function convertGenericToLegacy(genericConfig: GenericBackupConfig): BackupTypeConfig {
  const type = genericConfig.type;
  const userConfig = genericConfig.userConfig;
  const systemConfig = genericConfig.systemConfig;
  
  // Calculate retention days based on type and retention count
  let retentionDays = 30;
  if (type === 'full') {
    retentionDays = userConfig.retentionCount * 7; // Assume weekly frequency for full
  } else if (type === 'differential') {
    retentionDays = userConfig.retentionCount * 7; // Daily differentials, weekly full
  } else if (type === 'incremental') {
    const intervalWeeks = userConfig.fullRefreshIntervalUnit === 'months' 
      ? (userConfig.fullRefreshInterval || 4) * 4 
      : (userConfig.fullRefreshInterval || 4);
    retentionDays = userConfig.retentionCount * intervalWeeks * 7;
  }
  
  return {
    type,
    retention: {
      days: retentionDays,
      maxBackups: userConfig.retentionCount,
      keepForever: false
    },
    compression: systemConfig.compression,
    encryption: systemConfig.encryption,
    deduplication: systemConfig.deduplication,
    verification: systemConfig.verification,
    performance: systemConfig.performance,
    cleanup: systemConfig.cleanup,
    scheduling: systemConfig.scheduling
  };
}

// Convert legacy config to generic format
export function convertLegacyToGeneric(legacyConfig: BackupTypeConfig): GenericBackupConfig {
  return {
    type: legacyConfig.type,
    userConfig: {
      retentionCount: legacyConfig.retention.maxBackups || 30,
      fullRefreshInterval: legacyConfig.type === 'incremental' ? 4 : undefined,
      fullRefreshIntervalUnit: legacyConfig.type === 'incremental' ? 'weeks' : undefined
    },
    systemConfig: {
      compression: legacyConfig.compression,
      encryption: legacyConfig.encryption,
      deduplication: legacyConfig.deduplication,
      verification: legacyConfig.verification,
      performance: legacyConfig.performance,
      cleanup: legacyConfig.cleanup,
      scheduling: legacyConfig.scheduling
    }
  };
}

// Get default generic config for a backup type
export function getDefaultGenericConfig(type: 'full' | 'incremental' | 'differential'): GenericBackupConfig {
  return { ...GENERIC_BACKUP_TYPES[type] };
}

// Validate generic backup configuration
export function validateGenericBackupConfig(config: GenericBackupConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate retention count
  const typeInfo = getGenericBackupTypeInfo().find(info => info.value === config.type);
  if (typeInfo) {
    const { defaultRetentionCount, maxRetentionCount } = typeInfo.constraints;
    
    if (config.userConfig.retentionCount < 1) {
      errors.push('Retention count must be at least 1');
    }
    
    if (config.userConfig.retentionCount > maxRetentionCount) {
      errors.push(`Retention count cannot exceed ${maxRetentionCount} for ${config.type} backups`);
    }
    
    if (config.userConfig.retentionCount > defaultRetentionCount * 2) {
      warnings.push(`High retention count (${config.userConfig.retentionCount}) will use significant storage space`);
    }
  }
  
  // Validate incremental-specific settings
  if (config.type === 'incremental') {
    const interval = config.userConfig.fullRefreshInterval;
    const unit = config.userConfig.fullRefreshIntervalUnit;
    
    if (!interval || interval < 1) {
      errors.push('Full refresh interval must be at least 1');
    }
    
    if (unit === 'weeks' && interval && interval > 12) {
      warnings.push('Full refresh interval longer than 12 weeks may impact restore performance');
    }
    
    if (unit === 'months' && interval && interval > 3) {
      warnings.push('Full refresh interval longer than 3 months may impact restore performance');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get detailed configuration summary for advanced settings (legacy)
 */
export function getConfigurationSummary(config: BackupTypeConfig): {
  retention: string;
  compression: string;
  performance: string;
  verification: string;
} {
  const { retention, compression, performance, verification } = config;
  
  // Retention summary
  let retentionSummary = `${retention.days} days retention`;
  if (retention.maxBackups) {
    retentionSummary += `, max ${retention.maxBackups} backups`;
  }
  if (retention.keepForever) {
    retentionSummary = 'Keep forever (unlimited)';
  }
  
  // Compression summary
  let compressionSummary = 'No compression';
  if (compression.enabled) {
    compressionSummary = `${compression.algorithm.toUpperCase()} level ${compression.level}`;
  }
  
  // Performance summary
  let performanceSummary = `${performance.parallelJobs} parallel jobs, ${performance.chunkSize}MB chunks`;
  if (performance.maxBandwidth) {
    performanceSummary += `, ${performance.maxBandwidth}KB/s max bandwidth`;
  } else {
    performanceSummary += ', unlimited bandwidth';
  }
  
  // Verification summary
  let verificationSummary = 'No verification';
  if (verification.enabled) {
    verificationSummary = `${verification.frequency.replace('_', ' ')} verification`;
    if (verification.integrityCheck) {
      verificationSummary += ' with integrity checks';
    }
  }
  
  return {
    retention: retentionSummary,
    compression: compressionSummary,
    performance: performanceSummary,
    verification: verificationSummary
  };
}

/**
 * Validate backup type configuration
 */
export function validateBackupConfig(config: BackupTypeConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate retention settings
  if (config.retention.days < 1) {
    errors.push('Retention days must be at least 1');
  }
  if (config.retention.days > 3650) {
    warnings.push('Retention period exceeds 10 years - consider storage implications');
  }
  if (config.retention.maxBackups && config.retention.maxBackups < 1) {
    errors.push('Max backups must be at least 1');
  }
  
  // Validate compression settings
  if (config.compression.enabled) {
    if (config.compression.level < 1 || config.compression.level > 9) {
      errors.push('Compression level must be between 1 and 9');
    }
  }
  
  // Validate performance settings
  if (config.performance.parallelJobs < 1 || config.performance.parallelJobs > 16) {
    errors.push('Parallel jobs must be between 1 and 16');
  }
  if (config.performance.chunkSize < 1 || config.performance.chunkSize > 1024) {
    errors.push('Chunk size must be between 1 and 1024 MB');
  }
  if (config.performance.maxBandwidth && config.performance.maxBandwidth < 1) {
    errors.push('Max bandwidth must be at least 1 KB/s');
  }
  
  // Validate verification settings
  if (config.verification.enabled && !config.verification.integrityCheck) {
    warnings.push('Verification enabled without integrity checks - consider enabling for better data safety');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get recommended settings for different use cases
 */
export function getRecommendedSettings(useCase: 'development' | 'production' | 'archive'): {
  full: Partial<BackupTypeConfig>;
  incremental: Partial<BackupTypeConfig>;
  differential: Partial<BackupTypeConfig>;
} {
  const baseConfig = {
    compression: { enabled: true, algorithm: 'zstd' as const, level: 6 as const },
    encryption: { enabled: true, algorithm: 'AES-256-GCM' as const },
    deduplication: { enabled: true, algorithm: 'blake2' as const },
    verification: { enabled: true, frequency: 'weekly' as const, integrityCheck: true },
    performance: { parallelJobs: 4, chunkSize: 64, maxBandwidth: null },
    cleanup: { autoCleanup: true, cleanupAfterDays: 30, keepAtLeast: 3 }
  };

  switch (useCase) {
    case 'development':
      return {
        full: {
          ...baseConfig,
          retention: { days: 30, maxBackups: 4, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 2, chunkSize: 32 }
        },
        incremental: {
          ...baseConfig,
          retention: { days: 14, maxBackups: 14, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 4, chunkSize: 16 }
        },
        differential: {
          ...baseConfig,
          retention: { days: 21, maxBackups: 3, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 3, chunkSize: 24 }
        }
      };
    
    case 'production':
      return {
        full: {
          ...baseConfig,
          retention: { days: 365, maxBackups: 12, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 6, chunkSize: 128 }
        },
        incremental: {
          ...baseConfig,
          retention: { days: 90, maxBackups: 90, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 8, chunkSize: 64 }
        },
        differential: {
          ...baseConfig,
          retention: { days: 180, maxBackups: 6, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 6, chunkSize: 96 }
        }
      };
    
    case 'archive':
      return {
        full: {
          ...baseConfig,
          retention: { days: 3650, maxBackups: 24, keepForever: true },
          performance: { ...baseConfig.performance, parallelJobs: 2, chunkSize: 256 }
        },
        incremental: {
          ...baseConfig,
          retention: { days: 365, maxBackups: 365, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 4, chunkSize: 128 }
        },
        differential: {
          ...baseConfig,
          retention: { days: 730, maxBackups: 12, keepForever: false },
          performance: { ...baseConfig.performance, parallelJobs: 4, chunkSize: 192 }
        }
      };
    
    default:
      return {
        full: baseConfig,
        incremental: baseConfig,
        differential: baseConfig
      };
  }
}