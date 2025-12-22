import { Socket } from 'socket.io-client';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface TemplateStatus {
  status: 'connected' | 'disconnected' | 'loading' | 'error';
  timestamp: number;
  error?: string;
}

export interface SystemStats {
  timestamp: number;
  load_average: {
    '1min': number;
    '5min': number;
    '15min': number;
  };
  cpu: {
    percent: number;
    temp: number;
    top_processes: Array<{
      name: string;
      cpu_percent: number;
      executablePaths: string[];
      processCount: number;
      memory_bytes: number;
    }>;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    percent: number;
    swap: {
      total: number;
      used: number;
      free: number;
      percent: number;
    };
  };
  network: {
    sent: number;
    recv: number;
    interfaces?: {
      [key: string]: {
        bytes_recv: number;
        bytes_sent: number;
        packets_recv: number;
        packets_sent: number;
      };
    };
  };
  io: {
    devices: {
      [device: string]: {
        read_bytes: number;
        write_bytes: number;
      };
    };
  };
  disk_usage: {
    [device: string]: {
      total: number;
      used: number;
      free: number;
      percent: number;
      mountpoint: string;
    };
  };
}

export interface UploadProgress {
  filename: string;
  progress: number;
  speed: number;
  uploaded: number;
  total: number;
}

export interface ServiceStatus {
  service: string;
  name: string;
  description: string;
  status: string;
}

export interface PowerStatus {
  current: number;
  historical: number[];
  unit: 'W';
  timestamp: number;
}

export interface InternetStatus {
  status: 'connected' | 'disconnected' | 'loading';
  publicIp?: string;
  timestamp: number;
  // Admin-only fields
  ipDetails?: {
    ip?: string;
    hostname?: string;
    city?: string;
    region?: string;
    country?: string;
    loc?: string;
    org?: string;
    postal?: string;
    timezone?: string;
    [key: string]: any;
  };
}

export interface TailscaleStatus {
  status: 'connected' | 'disconnected' | 'error' | 'loading';
  interface: boolean;
  error?: string;
  timestamp: number;
  // Admin-only fields
  ip?: string;
  tailnet?: string;
  isEnabled?: boolean;
  loginUrl?: string;
}

export interface VPNStatus {
  vpnStatus: 'running' | 'stopped' | 'loading' | 'error';
  transmissionStatus: 'running' | 'stopped' | 'loading' | 'error';
  isEnabled?: boolean | null;
  error?: string;
  timestamp: number;
}

export interface WebSocketEventMap {
  'system_stats': SystemStats;
  'subscription_update': {
    type: string;
    status: 'subscribed' | 'unsubscribed' | 'error';
    timestamp: number;
    sid?: string;
    message?: string;
  };
  'services_status': ServiceStatus[];
  'power_status': PowerStatus;
  'connect': void;
  'disconnect': void;
  'error': Error;
  'heartbeat': void;
  'subscribe': { type: string };
  'unsubscribe': { type: string };
  'subscribe_stats': void;
  'unsubscribe_stats': void;
  'server_shutdown': void;
  'internet_status': InternetStatus;
  'tailscale_status': TailscaleStatus;
  'disk_usage': {
    [device: string]: {
      total: number;
      used: number;
      free: number;
      percent: number;
      mountpoint: string;
    };
  };
  'template_status': TemplateStatus;
  'vpn_status': VPNStatus;
  'hard_drive_test': {
    id: string;
    message: string;
    timestamp: number;
    progress?: number;
    complete?: boolean;
  };
  'hard_drive_test_status': {
    testing: boolean;
    device: string | null;
    test_type: string | null;
    progress: number;
    timestamp: number;
    complete?: boolean;
  };
  'admin_auth': { 
    encrypted_payload: string; 
    timestamp: string; 
    nonce: string; 
  };
  'admin_auth_response': { status: string; message: string };
  'admin_command': { command: string; params: Record<string, any>; timestamp: number };
  'admin_command_response': unknown;
  'auth_challenge_request': void;
  'auth_challenge': {
    nonce: string;
    timestamp: string;
    sid: string;
  };
  'admin_system': SystemStats & {
    processes: Array<{
      pid: number;
      name: string;
      username: string;
      cpu_percent: number;
      memory_percent: number;
      status: string;
      created: number;
    }>;
    users: Array<{
      name: string;
      terminal: string;
      host: string;
      started: number;
    }>;
    networkConnections: Array<{
      type: string;
      local_address: string;
      remote_address: string;
      status: string;
      pid?: number;
    }>;
  };
  'admin_disk_info': {
    blockDevices: string;
    diskUsage: string;
    rawFormat: boolean;
    timestamp: number;
    error?: string;
  };
  'sync_status': {
    id: string;
    status: 'starting' | 'working' | 'done';
    progress?: number;
    timestamp: number;
    success?: boolean;
    /** Total bytes transferred (only present on 'done') */
    bytes_transferred?: number;
    /** Total files transferred (only present on 'done') */
    files_transferred?: number;
    /** Duration in seconds (only present on 'done') */
    duration?: number;
  };
}

export type WebSocketEventKey = keyof WebSocketEventMap;

/**
 * Types of WebSocket subscriptions
 */
export enum SubscriptionType {
  /** Core subscriptions that persist until socket disconnection */
  CORE = 'core',
  /** Admin-only subscriptions that require authentication */
  ADMIN = 'admin',
  /** Tab-specific subscriptions that are dynamic based on active tab */
  TAB = 'tab',
  /** Standard subscriptions that are managed manually */
  STANDARD = 'standard'
}

export interface SubscriptionInfo {
  /** The event type this subscription is for */
  event: WebSocketEventKey;
  /** The type of subscription (core, admin, tab, standard) */
  type: SubscriptionType;
  /** For tab-specific subscriptions, the ID of the tab */
  tabId?: string;
  /** When this subscription was created */
  createdAt: number;
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
}

export interface WebSocketStore {
  socket: typeof Socket | null;
  status: WebSocketStatus;
  activeSubscriptions: Set<string>;
  /**
   * Map of subscription events to their metadata
   * This tracks additional information about each subscription
   */
  subscriptionMeta: Map<string, SubscriptionInfo>;
  lastMessageTime: number | null;
  lastHeartbeatAck: number | null;
  connectionAttempts: number;
  isAdmin: boolean;
  
  // Core Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  emit: <T extends WebSocketEventKey>(event: T, data?: WebSocketEventMap[T]) => void;
  
  // Subscription Management
  subscribe: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    type?: SubscriptionType,
    tabId?: string
  ) => () => void;
  unsubscribe: <T extends WebSocketEventKey>(event: T) => void;
  
  // Specialized Subscription Management
  subscribeCoreEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void
  ) => () => void;
  subscribeAdminEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void
  ) => () => void;
  subscribeTabEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    tabId: string
  ) => () => void;
  
  // Tab Management
  setActiveTab: (tabId: string) => void;
  clearTabSubscriptions: (tabId: string) => void;
  
  // Admin Status
  setIsAdmin: (isAdmin: boolean) => void;
  authenticateAdmin: (pin: string) => Promise<boolean>;
  
  // Utilities
  resetState: () => void;
}