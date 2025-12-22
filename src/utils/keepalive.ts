import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../api/client';
import { API_ENDPOINTS } from '../api/endpoints';

// Constants
const DEFAULT_KEEPALIVE_INTERVAL = 60 * 1000; // 60 seconds for standard keepalive
const ACTIVITY_UPDATE_INTERVAL = 30 * 1000; // 30 seconds for activity updates

// Singleton instance of keepalive manager for admin session
let adminKeepaliveManager: KeepaliveManager | null = null;

/**
 * Class for managing a keepalive timer outside React.
 */
export class KeepaliveManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private interval: number;
  private customIntervalId: ReturnType<typeof setInterval> | null = null;
  private onPing?: (success: boolean) => void;
  private logPrefix: string;

  constructor(interval: number = DEFAULT_KEEPALIVE_INTERVAL, logPrefix = '[KeepaliveManager]') {
    this.interval = interval;
    this.logPrefix = logPrefix;
  }

  /**
   * Start the keepalive timer with the standard ping method
   */
  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      sendKeepalivePing().then(success => {
        if (this.onPing) this.onPing(success);
      });
    }, this.interval);
  }

  /**
   * Start a custom keepalive with a specific ping function and logging
   * @param pingFn - The ping function to call
   * @param verbose - Whether to log the ping results
   */
  startCustom(
    pingFn: () => Promise<boolean>,
    verbose = false
  ) {
    // Stop any existing intervals first
    this.stop();
    
    this.customIntervalId = setInterval(() => {
      if (verbose) console.log(`${this.logPrefix} Sending ping to maintain session`);
      
      pingFn().then(success => {
        if (verbose) {
          if (success) {
            console.log(`${this.logPrefix} Ping successful, session maintained`);
          } else {
            console.error(`${this.logPrefix} Ping failed, session may expire`);
          }
        }
        
        if (this.onPing) this.onPing(success);
      });
    }, this.interval);
    
    // Immediately send a ping to verify it's working
    pingFn().then(success => {
      if (verbose) console.log(`${this.logPrefix} Initial ping ${success ? 'successful' : 'failed'}`);
    });
  }

  /**
   * Stop all keepalive timers
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.customIntervalId) {
      clearInterval(this.customIntervalId);
      this.customIntervalId = null;
    }
  }

  /**
   * Set a callback to be called after each ping
   * @param callback - Function to call with ping result
   */
  onPingComplete(callback: (success: boolean) => void) {
    this.onPing = callback;
  }
}

/**
 * Sends a standard keepalive request to the backend.
 * @returns Promise that resolves to true if successful, false otherwise.
 */
export async function sendKeepalivePing(): Promise<boolean> {
  try {
    await api.get(API_ENDPOINTS.admin.ping);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Sends an admin-specific ping and updates activity timestamps
 * @returns Promise that resolves to true if successful, false otherwise.
 */
export async function pingAdminSession(): Promise<boolean> {
  try {
    await api.get(API_ENDPOINTS.admin.ping);
    
    // Update lastActivity in the store to ensure client-side timeouts don't occur
    const { updateLastActivity } = useStore.getState();
    if (updateLastActivity) {
      updateLastActivity();
    }
    
    return true;
  } catch (err) {
    console.error('[AdminSessionKeepAlive] Ping failed:', err);
    return false;
  }
}

/**
 * React hook for keepalive during long-running operations.
 * 
 * @param enabled Whether to enable keepalive (e.g., isTesting)
 * @param interval Interval in ms (default: 60s)
 * @param logPrefix Optional prefix for logs
 */
export function useKeepalive(
  enabled: boolean, 
  interval: number = DEFAULT_KEEPALIVE_INTERVAL,
  logPrefix = '[Keepalive]'
) {
  const keepaliveRef = useRef<KeepaliveManager | null>(null);

  useEffect(() => {
    if (enabled) {
      if (!keepaliveRef.current) {
        keepaliveRef.current = new KeepaliveManager(interval, logPrefix);
      }
      keepaliveRef.current.start();
    } else {
      keepaliveRef.current?.stop();
    }
    return () => {
      keepaliveRef.current?.stop();
    };
  }, [enabled, interval, logPrefix]);
}

/**
 * Starts the admin session keepalive service
 * @param pingInterval - Interval in ms between ping requests
 * @param verbose - Whether to log each ping
 * @returns The keepalive manager instance
 */
export function startAdminSessionKeepalive(
  pingInterval = DEFAULT_KEEPALIVE_INTERVAL,
  verbose = true
): KeepaliveManager {
  if (!adminKeepaliveManager) {
    adminKeepaliveManager = new KeepaliveManager(
      pingInterval, 
      '[AdminSessionKeepAlive]'
    );
  }
  
  // Start a custom keepalive with admin-specific ping and logging
  adminKeepaliveManager.startCustom(pingAdminSession, verbose);
  
  if (verbose) {
    console.log('[AdminSessionKeepAlive] Started admin session keepalive service');
  }
  
  return adminKeepaliveManager;
}

/**
 * Stops the admin session keepalive service
 */
export function stopAdminSessionKeepalive(): void {
  if (adminKeepaliveManager) {
    adminKeepaliveManager.stop();
    // console.debug('[AdminSessionKeepAlive] Stopped admin session keepalive service');
  }
}

/**
 * React hook that manages admin activity timestamp updates
 * - Only updates activity timestamp to prevent client-side timeouts
 * - Does NOT automatically send keepalive pings to the server
 */
export function useAdminSessionKeepalive(): void {
  const { isAdmin, updateLastActivity } = useStore(state => ({
    isAdmin: state.isAdmin,
    updateLastActivity: state.updateLastActivity,
  }));

  // Only manage activity timestamp updates, not keepalive service
  useEffect(() => {
    if (isAdmin && updateLastActivity) {
      // Update activity timestamp to prevent client-side timeouts
      const activityInterval = setInterval(() => {
        updateLastActivity();
        // console.debug('[AdminSessionKeepAlive] Updated activity timestamp');
      }, ACTIVITY_UPDATE_INTERVAL);
      
      return () => {
        clearInterval(activityInterval);
      };
    }
  }, [isAdmin, updateLastActivity]);
}

// Export the admin session keepalive API
export const adminSessionKeepAlive = {
  start: startAdminSessionKeepalive,
  stop: stopAdminSessionKeepalive,
  ping: pingAdminSession,
  useKeepalive: useAdminSessionKeepalive,
}; 