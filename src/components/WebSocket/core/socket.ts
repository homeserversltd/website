import { Socket } from 'socket.io-client';
import { connect as socketIO } from 'socket.io-client';
import { WebSocketEventMap } from '../types';
import { fallbackManager } from '../../../utils/fallbackManager';

// Socket state
let socket: ReturnType<typeof socketIO> | null = null;
let connectionPromise: Promise<void> | null = null;
let isConnectionInProgress = false;
let heartbeatInterval: NodeJS.Timeout;
let missedHeartbeats = 0;
const MAX_MISSED_HEARTBEATS = 5;

// Tracking for socket cleanup
let socketCleanupInProgress = false;
let lastSocketCreationTime = 0;
const MIN_SOCKET_LIFETIME = 5000; // Min 5 seconds between socket creation/cleanup cycles

// Heartbeat debug settings
const HEARTBEAT_DEBUG = false; // Set to true to enable verbose heartbeat logging

// User activity tracking
let lastUserActivity = Date.now();
let activityCheckInterval: NodeJS.Timeout;
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
// const INACTIVITY_TIMEOUT = 100; // 1 second in milliseconds
// Flag to track if inactivity timeout is disabled
let isInactivityTimeoutDisabled = false;
// Keep track of why timeout is disabled for logging
let timeoutDisabledReason = '';

/**
 * Update the last user activity timestamp
 */
export const updateUserActivity = () => {
  lastUserActivity = Date.now();
};

/**
 * Get the time since last user activity in milliseconds
 */
export const getTimeSinceLastActivity = (): number => {
  return Date.now() - lastUserActivity;
};

/**
 * Check if the user has been inactive for longer than the timeout
 */
export const isUserInactive = (): boolean => {
  // If timeout is disabled, always return false
  if (isInactivityTimeoutDisabled) {
    return false;
  }
  return getTimeSinceLastActivity() > INACTIVITY_TIMEOUT;
};

/**
 * Disable the inactivity timeout for long-running operations
 * @param reason Optional reason for disabling timeout (for logging)
 */
export const disableInactivityTimeout = (reason = 'unspecified_operation') => {
  isInactivityTimeoutDisabled = true;
  timeoutDisabledReason = reason;
  console.log(`[WebSocket] Inactivity timeout disabled for: ${reason}`);
  
  // Update activity timestamp to avoid immediate timeout when re-enabled
  updateUserActivity();
  
  return true;
};

/**
 * Re-enable the inactivity timeout after long-running operations
 */
export const enableInactivityTimeout = () => {
  isInactivityTimeoutDisabled = false;
  console.log(`[WebSocket] Inactivity timeout re-enabled (was disabled for: ${timeoutDisabledReason})`);
  timeoutDisabledReason = '';
  
  // Update activity timestamp to give the user time to interact
  updateUserActivity();
  
  return true;
};

/**
 * Check if inactivity timeout is currently disabled
 */
export const isTimeoutDisabled = (): boolean => {
  return isInactivityTimeoutDisabled;
};

/**
 * Start monitoring user activity
 */
export const startActivityMonitoring = () => {
  // Clear any existing interval
  if (activityCheckInterval) {
    clearInterval(activityCheckInterval);
  }
  
  // Set initial activity timestamp
  updateUserActivity();
  
  // Check for inactivity every minute
  activityCheckInterval = setInterval(() => {
    // Skip inactivity check if timeout is disabled
    if (isInactivityTimeoutDisabled) {
      return;
    }
    
    if (isUserInactive() && socket?.connected) {
      console.warn(`[WebSocket] User inactive for ${Math.floor(getTimeSinceLastActivity() / 60000)} minutes, disconnecting`);
      
      // Dispatch a websocket status change event before activating fallback
      window.dispatchEvent(new CustomEvent('websocket-status-change', {
        detail: {
          status: 'disconnected',
          reason: 'user_inactivity'
        }
      }));
      
      // Activate fallback manager before cleaning up socket
      fallbackManager.activateFallback('user_inactivity');
      cleanupSocket();
    }
  }, 60000); // Check every minute
};

/**
 * Create a Socket.io socket with standard configuration
 * @returns The socket instance or null if creation failed or is in progress
 */
export const createSocket = () => {
  // If we're in the middle of cleaning up, wait
  if (socketCleanupInProgress) {
    return socket; // This could be null
  }
  
  // Don't create a new socket if one exists
  if (socket) return socket;
  
  try {
    // Keep track of when we create the socket
    lastSocketCreationTime = Date.now();
    
    socket = socketIO({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: false,
      autoConnect: false,
      forceNew: false,
      // Add some additional options for better stability
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5
    });
    
    if (!socket) {
      console.error('[WebSocket] Failed to create socket: socketIO returned null');
    }
    
    return socket;
  } catch (error) {
    console.error('[WebSocket] Error creating socket:', error);
    return null;
  }
};

/**
 * Clean up socket resources
 */
export const cleanupSocket = () => {
  // Prevent multiple cleanups from running at once
  if (socketCleanupInProgress) {
    return;
  }
  
  // Prevent rapid socket creation/disposal cycles
  const socketAge = Date.now() - lastSocketCreationTime;
  if (socketAge < MIN_SOCKET_LIFETIME) {
    return;
  }
  
  if (!socket) {
    // If socket is null and we're cleaning up, ensure fallback is activated
    if (!fallbackManager.isActive()) {
      fallbackManager.activateFallback('socket_null');
    }
    return;
  }
  
  socketCleanupInProgress = true;

  try {
    // Safely remove listeners
    socket.removeAllListeners();
    
    // Safely disconnect if needed
    if (socket.connected) {
      socket.disconnect();
    }
    
    socket = null;
    connectionPromise = null;
    
    // Clean up heartbeat resources
    clearInterval(heartbeatInterval);
    missedHeartbeats = 0;
  } catch (error) {
    console.error('[WebSocket] Error during socket cleanup:', error);
    // Activate fallback on cleanup error
    if (!fallbackManager.isActive()) {
      fallbackManager.activateFallback('socket_cleanup_error');
    }
  } finally {
    // Always mark cleanup as complete
    socketCleanupInProgress = false;
  }
};

/**
 * Get current socket instance
 */
export const getSocket = () => socket;

/**
 * Get connection promise
 */
export const getConnectionPromise = () => connectionPromise;

/**
 * Set connection promise
 */
export const setConnectionPromise = (promise: Promise<void> | null) => {
  connectionPromise = promise;
};

/**
 * Check if connection is in progress
 */
export const getIsConnectionInProgress = () => isConnectionInProgress;

/**
 * Set connection in progress state
 */
export const setIsConnectionInProgress = (inProgress: boolean) => {
  isConnectionInProgress = inProgress;
};

/**
 * Set up and start heartbeat monitoring
 */
export const startHeartbeatMonitoring = () => {
  // Clean up any existing interval
  clearInterval(heartbeatInterval);
  missedHeartbeats = 0;
  
  heartbeatInterval = setInterval(() => {
    // If socket is null or disconnected, stop the heartbeat monitoring
    if (!socket || !socket.connected) {
      return;
    }
    
    if (missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
      console.warn(`[WebSocket] Missed too many heartbeats (${missedHeartbeats}/${MAX_MISSED_HEARTBEATS}), disconnecting`);
      socket?.disconnect();
      console.debug('[WebSocket] No reconnection will be attempted. User must refresh the page.');
      // Stop the heartbeat monitoring after disconnection
      clearInterval(heartbeatInterval);
      return;
    }
    
    missedHeartbeats++;
    socket?.emit('heartbeat');
  }, 5000); // Send heartbeat every 5 seconds
};

/**
 * Reset heartbeat counter when acknowledgment is received
 */
export const resetHeartbeatCounter = () => {
  missedHeartbeats = 0;
};

/**
 * Get current socket connection status
 */
export const getConnectionStatus = () => {
  return socket?.connected ? 'connected' : 'disconnected';
}; 