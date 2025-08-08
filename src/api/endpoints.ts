/**
 * API Endpoint Definitions.
 *
 * Our ApiClient (accessed via the useApi hook or direct import) and its
 * request interceptors automatically handle common tasks, including:
 *   - Prepending "/api" to standard HTTP request paths.
 *   - Injecting necessary authentication tokens (e.g., CSRF, Auth, Admin).
 *
 * Consequently, endpoint paths defined in this file should be the simple,
 * base path (e.g., "/users", "/settings/profile") without the "/api" prefix.
 * The ApiClient takes care of constructing the full, correct URL.
 *
 * For WebSocket URLs or other special cases not intended for ApiClient's
 * standard processing, define the full path as required.
 * This design keeps endpoint definitions clean and component-level API calls straightforward.
 */



// Type definitions for API endpoints
export type AuthEndpoints = {
  validatePin: string;
  verifyPin: string;
  changePin: string;
  logout: string;
};

// Add type for admin endpoints
export type AdminEndpoints = {
  updatePassword: string;
  logs: {
    homeserver: string;
    clear: string;
  };
  ping: string;
  downloadRootCA: (platform?: 'windows' | 'android' | 'chromeos' | 'linux' | 'macos') => string;
  refreshRootCA: string;
  updates: {
    check: string;
    apply: string;
    modules: string;
    moduleStatus: (moduleName: string) => string;
    moduleToggle: (moduleName: string) => string;
    componentToggle: (moduleName: string, componentName: string) => string;
    logs: string;
    logfile: string;
    systemInfo: string;
    schedule: string;
  };
};

export type SystemEndpoints = {
  stats: string;
  install: string;
  keaLeases: string;
  uptime: string;
  log: string;
  restart: string;
  shutdown: string;
  update: string;
};

export type NetworkEndpoints = {
  config: string;
  interfaces: string;
  updateInterface: (name: string) => string;
  notes: string;
};

export type TabManagementEndpoints = {
  list: string;
  setStarred: string;
  updateVisibility: string;
  updateElementVisibility: string;
};

export type FileManagementEndpoints = {
  browse: string;
  browseHierarchical: (path: string, expand?: boolean) => string;
  upload: string;
  download: (path: string) => string;
};

export type UploadEndpoints = {
  forceAllow: string;
  history: string;
  setDefaultDirectory: string;
  blacklist: string;
  blacklistUpdate: string;
  clearHistory: string;
  getPinRequiredStatus: string;
  setPinRequiredStatus: string;
};

export type PortalManagementEndpoints = {
  list: string;
  status: string;
  create: string;
  update: (id: string) => string;
  delete: (name: string) => string;
  factory: string;
  image: (filename: string) => string;
};

export type ServiceControlEndpoints = {
  control: string;
};

export type ThemeManagementEndpoints = {
  list: string;
};

export type DiskManagementEndpoints = {
  unlock: string;
  unlockWithPassword: string;
  mount: string;
  unmount: string;
  format: string;
  encrypt: string;
  permissions: string;
  checkServices: string;
  manageServices: string;
  createKey: string;
  updateKey: string;
  keyStatus: string;
  sync: string;
  getSyncSchedule: string;
  setSyncSchedule: string;
  vaultDevice: string;
  cryptoTest: string;
};

export type DevEndpoints = {
  disable: string;
  files: string;
  wipeDeployPartition: string;
  finaleWrapup: string;
  deploymentLog: string;
  unlockDeploy: string;
  hardDriveTest: {
    devices: string;
    start: string;
    results: string;
  };
  thermalTest: {
    start: string;
    results: string;
    clearResults: string;
  };
};

export type SystemStatusEndpoints = {
  tailscale: {
    connect: string;
    disconnect: string;
    authkey: string;
    enable: string;
    disable: string;
    config: string;
    updateTailnet: string;
  };
  vpn: {
    updatePIA: string;
    updateTransmission: string;
    enable: string;
    disable: string;
    piaKeyExists: string;
    transmissionKeyExists: string;
  };
  ssh: {
    status: string;
    toggle: string;
    serviceStatus: string;
    serviceToggle: string;
  };
  samba: {
    serviceStatus: string;
    serviceToggle: string;
  };
  hardDriveTest: {
    devices: string;
    start: string;
    progress: string;
    results: string;
  };
  hardReset: string;
  speedtest: string;
  power: {
    usage: string;
  };
  vault: {
    status: string;
    preUnlock: string;
  };
};

export type VersionEndpoints = {
  info: string;
};

export type CryptoEndpoints = {
  getKey: string;
  test: string;
};

export type PremiumTabEndpoints = {
  validateAndClone: string;
  install: (tabName: string) => string;
  uninstall: (tabName: string) => string;
  delete: (tabName: string) => string;
  status: string;
  installAll: string;
  uninstallAll: string;
  logs: string;
  autoUpdateStatus: string;
  autoUpdate: (tabName: string) => string;
};

// Main API endpoints type
export type APIEndpoints = {
  auth: AuthEndpoints;
  admin: AdminEndpoints;
  system: SystemEndpoints;
  network: NetworkEndpoints;
  tabs: TabManagementEndpoints;
  files: FileManagementEndpoints;
  upload: UploadEndpoints;
  portals: PortalManagementEndpoints;
  services: ServiceControlEndpoints;
  themes: ThemeManagementEndpoints;
  diskman: DiskManagementEndpoints;
  status: SystemStatusEndpoints;
  version: VersionEndpoints;
  crypto: CryptoEndpoints;
  premium: PremiumTabEndpoints;
  dev: DevEndpoints;
};

// API endpoints definition
// /api/client.ts prepends /api to endpoint calls for us
// Keep without /api prefix for WebSocket
export const API_ENDPOINTS: APIEndpoints = {
    // Auth endpoints
    auth: {
      validatePin: '/validatePin',
      verifyPin: '/verifyPin',
      changePin: '/admin/pin',
      logout: '/logout',
    },
  
    // Admin endpoints
    admin: {
      updatePassword: '/admin/system/update-password',
      logs: {
        homeserver: '/admin/logs/homeserver',
        clear: '/admin/logs/homeserver/clear'
      },
      ping: '/admin/ping',
      downloadRootCA: (platform = 'linux') => `/admin/download-root-crt?platform=${platform}`,
      refreshRootCA: '/admin/refresh-root-crt',
      updates: {
        check: '/admin/updates/check',
        apply: '/admin/updates/apply',
        modules: '/admin/updates/modules',
        moduleStatus: (moduleName: string) => `/admin/updates/modules/${moduleName}/status`,
        moduleToggle: (moduleName: string) => `/admin/updates/modules/${moduleName}/toggle`,
        componentToggle: (moduleName: string, componentName: string) => `/admin/updates/modules/${moduleName}/components/${componentName}/toggle`,
        logs: '/admin/updates/logs',
        logfile: '/admin/updates/logfile',
        systemInfo: '/admin/updates/system-info',
        schedule: '/admin/updates/schedule',
      },
    },
  
    // System endpoints
    system: {
      stats: '/system/stats',
      install: '/system/updates/install',
      keaLeases: '/kea-leases',
      uptime: '/uptime',
      log: '/system/log',
      restart: '/admin/system/restart',
      shutdown: '/admin/system/shutdown',
      update: '/admin/system/update',
    },
  
    // Network endpoints
    network: {
      config: '/network/config',
      interfaces: '/network/interfaces',
      updateInterface: (name: string) => `/network/interfaces/${name}`,
      notes: '/network/notes',
    },
  
    // Tab management
    tabs: {
      list: '/tabs',
      setStarred: '/setstarredtab',
      updateVisibility: '/tabs/visibility',
      updateElementVisibility: '/tabs/elements',
    },
  
    // File management
    files: {
      browse: '/files/browse',
      browseHierarchical: (path: string, expand = false) => `/files/browse-hierarchical?path=${encodeURIComponent(path)}&expand=${expand}`,
      upload: '/files/upload',
      download: (path: string) => `/files/download?path=${encodeURIComponent(path)}`,
    },
    
    // Upload-specific endpoints
    upload: {
      forceAllow: '/upload/force-permissions',
      history: '/upload/history',
      setDefaultDirectory: '/upload/default-directory',
      blacklist: '/upload/blacklist/list',
      blacklistUpdate: '/upload/blacklist/update',
      clearHistory: '/upload/history/clear',
      getPinRequiredStatus: '/upload/pin-required-status',
      setPinRequiredStatus: '/upload/pin-required-status',
    },
  
    // Portal management
    portals: {
      list: '/portals',
      status: '/portals/status',
      create: '/portals',
      update: (id: string) => `/portals/${id}`,
      delete: (name: string) => `/portals/${encodeURIComponent(name)}`,
      factory: '/portals/factory',
      image: (filename: string) => `/api/portals/images/${encodeURIComponent(filename)}`,
    },
  
    // Portal service control endpoints
    services: {
      control: '/service/control',
    },
  
    // Theme management endpoints
    themes: {
      list: '/themes',
    },
    
    // Disk management endpoints
    diskman: {
      unlock: '/admin/diskman/unlock',
      unlockWithPassword: '/admin/diskman/unlock-with-password',
      mount: '/admin/diskman/mount',
      unmount: '/admin/diskman/unmount',
      format: '/admin/diskman/format',
      encrypt: '/admin/diskman/encrypt',
      permissions: '/admin/diskman/apply-permissions',
      checkServices: '/admin/diskman/check-services',
      manageServices: '/admin/diskman/manage-services',
      createKey: '/admin/diskman/create-key',
      updateKey: '/admin/diskman/update-key',
      keyStatus: '/admin/diskman/key-status',
      vaultDevice: '/admin/diskman/vault-device',
      sync: '/admin/diskman/sync',
      getSyncSchedule: '/admin/diskman/sync-schedule',
      setSyncSchedule: '/admin/diskman/sync-schedule-update',
      cryptoTest: '/admin/crypto/test',
    },
  
    // System status endpoints
    status: {
      tailscale: {
        connect: '/status/tailscale/connect',
        disconnect: '/status/tailscale/disconnect',
        authkey: '/status/tailscale/authkey',
        enable: '/status/tailscale/enable',
        disable: '/status/tailscale/disable',
        config: '/status/tailscale/config',
        updateTailnet: '/status/tailscale/update-tailnet',
      },
      vpn: {
        updatePIA: '/status/vpn/updatekey/pia',
        updateTransmission: '/status/vpn/updatekey/transmission',
        enable: '/status/vpn/enable',
        disable: '/status/vpn/disable',
        piaKeyExists: '/status/vpn/pia/exists',
        transmissionKeyExists: '/status/vpn/transmission/exists',
      },
      ssh: {
        status: '/admin/ssh/status',
        toggle: '/admin/ssh/toggle',
        serviceStatus: '/admin/ssh/service/status',
        serviceToggle: '/admin/ssh/service',
      },
      samba: {
        serviceStatus: '/admin/samba/service/status',
        serviceToggle: '/admin/samba/service',
      },
      hardDriveTest: {
        devices: '/admin/hard-drive-test/devices',
        start: '/admin/hard-drive-test/start',
        progress: '/admin/hard-drive-test/progress',
        results: '/admin/hard-drive-test/results',
      },
      hardReset: '/admin/services/hard-reset',
      speedtest: '/status/internet/speedtest',
      power: {
        usage: '/status/power/usage'
      },
      vault: {
        status: '/vault/status',
        preUnlock: '/pre-unlock'
      },
    },

    // Version information
    version: {
      info: '/version',
    },

    // Crypto endpoints
    crypto: {
      getKey: '/crypto/getKey',
      test: '/admin/crypto/test',
    },

    // Premium tab endpoints
    premium: {
      validateAndClone: '/admin/premium/validate-and-clone',
      install: (tabName: string) => `/admin/premium/install/${encodeURIComponent(tabName)}`,
      uninstall: (tabName: string) => `/admin/premium/uninstall/${encodeURIComponent(tabName)}`,
      delete: (tabName: string) => `/admin/premium/delete/${encodeURIComponent(tabName)}`,
      status: '/admin/premium/status',
      installAll: '/admin/premium/install-all',
      uninstallAll: '/admin/premium/uninstall-all',
      logs: '/admin/premium/logs',
      autoUpdateStatus: '/admin/premium/auto-update-status',
      autoUpdate: (tabName: string) => `/admin/premium/auto-update/${encodeURIComponent(tabName)}`,
    },

    // Dev endpoints
    dev: {
      disable: '/dev/disable',
      files: '/dev/files',
      wipeDeployPartition: '/dev/wipe-deploy-partition',
      finaleWrapup: '/dev/finale-wrapup',
      deploymentLog: '/dev/deployment-log',
      unlockDeploy: '/dev/unlock-deploy',
      hardDriveTest: {
        devices: '/dev/hard-drive-test/devices',
        start: '/dev/hard-drive-test/start',
        results: '/dev/hard-drive-test/results',
      },
      thermalTest: {
        start: '/dev/thermal-test/start',
        results: '/dev/thermal-test/results',
        clearResults: '/dev/thermal-test/clear-results',
      },
    },
  } as const;