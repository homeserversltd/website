import { WebSocketEventMap, SubscriptionType } from './types';
import { fallbackManager } from '../../utils/fallbackManager';
import { warn, error } from '../../utils/debug';
import { 
  // Socket management
  getSocket, 
  getConnectionStatus, 
  cleanupSocket,
  
  // Connection management
  connect,
  getIsConnectionInProgress,
  
  // Authentication
  setIsAdmin as coreSetIsAdmin,
  getIsAdmin,
  isAuthenticated,
  authenticateAsAdmin,
  
  // Tab management
  setActiveTab as coreSetActiveTab,
  getActiveTab as coreGetActiveTab,
  
  // Subscription management
  activeSubscriptions,
  subscriptionMeta,
  coreSubscriptions,
  adminSubscriptions,
  tabSubscriptions,
  eventListeners,
  clearTabSubscriptions,
  addSubscription,
  removeSubscription,
  registerEventListener,
  removeEventListener,
  disableInactivityTimeout,
  enableInactivityTimeout,
  isTimeoutDisabled
} from './core';

// Export the singleton client with a clean interface that matches the original
export const socketClient = {
  // Connection Management
  connect: () => connect(),
  
  disconnect: () => {
    // Ensure we properly clean up all resources
    
    // Get the socket before cleaning up
    const socket = getSocket();
    
    // Check if a page refresh is in progress
    let isRefreshing = false;
    try {
      if (sessionStorage.getItem('isPageRefreshing') === 'true') {
        isRefreshing = true;
      }
    } catch (e) {
      warn('[WebSocket] Could not check sessionStorage for refresh detection during disconnect:', e);
    }

    // Activate fallback mode if not already active AND not currently refreshing the page
    if (!fallbackManager.isActive() && !isRefreshing) {
      fallbackManager.activateFallback('manual_disconnect');
    }
    
    // Clean up the socket
    cleanupSocket();
  },
  
  getStatus: () => getConnectionStatus(),
  
  isConnecting: () => getIsConnectionInProgress(),
  // Activity timeout control
  disableInactivityTimeout: (reason = 'unspecified_operation') => {
    return disableInactivityTimeout(reason);
  },
  
  enableInactivityTimeout: () => {
    return enableInactivityTimeout();
  },
  
  isInactivityTimeoutDisabled: () => {
    return isTimeoutDisabled();
  },
  // Admin Management
  setIsAdmin: (admin: boolean) => {
    coreSetIsAdmin(admin);
  },
  
  // Tab Management
  setActiveTab: (tabId: string) => {
    coreSetActiveTab(tabId);
  },
  
  getActiveTab: () => coreGetActiveTab(),
  
  // Event Emission
  emit: <T extends keyof WebSocketEventMap>(event: T, data?: WebSocketEventMap[T]) => {
    const socket = getSocket();
    
    if (event === 'subscribe' && data && typeof data === 'object' && 'type' in data) {
      const type = (data as { type: string }).type;
      
      if (!activeSubscriptions.has(type)) {
        activeSubscriptions.add(type);
        socket?.emit(event, data);
      }
    } else if (event === 'unsubscribe' && data && typeof data === 'object' && 'type' in data) {
      const type = (data as { type: string }).type;
      activeSubscriptions.delete(type);
    } 
    
    if (socket) {
      socket.emit(event, data);
    }
  },
  
  // Event Listening
  on: <T extends keyof WebSocketEventMap>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    const wrappedCallback = (data: WebSocketEventMap[T]) => {
      // Skip logging for power_status events to reduce console spam
      if (String(event) !== 'power_status' && String(event) !== 'system_stats') {
        // Don't log here if this is a system_stats event, as it's already logged elsewhere
      }
      callback(data);
    };
    
    registerEventListener(event, wrappedCallback);
  },
  
  off: <T extends keyof WebSocketEventMap>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    removeEventListener(event, callback);
  },
  
  // Subscription Management
  getActiveSubscriptions: () => {
    return new Set(activeSubscriptions);
  },
  
  // Admin Authentication
  authenticateAsAdmin: (token: string): Promise<boolean> => {
    return authenticateAsAdmin(token);
  },
  
  isAuthenticated: () => isAuthenticated(),
  
  // Metadata Access
  getSubscriptionMeta: () => subscriptionMeta,
  getCoreSubscriptions: () => new Set(coreSubscriptions),
  getAdminSubscriptions: () => new Set(adminSubscriptions),
  getTabSubscriptions: (tabId?: string) => {
    if (tabId) {
      return tabSubscriptions.has(tabId) ? new Set(tabSubscriptions.get(tabId)) : new Set<string>();
    }
    return new Map(tabSubscriptions);
  },
  
  // Subscription Type Checking
  isAdminSubscription: (event: string) => adminSubscriptions.has(event),
  isCoreSubscription: (event: string) => coreSubscriptions.has(event),
  isTabSubscription: (event: string) => {
    return Array.from(tabSubscriptions.entries()).some(([, events]) => events.has(event));
  },
  
  // Subscription Management Methods
  subscribe: <T extends keyof WebSocketEventMap>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void,
    type: SubscriptionType = SubscriptionType.STANDARD,
    tabId?: string
  ) => {
    if (!getSocket()) {
      // Check if fallback mode is active before throwing an error
      if (fallbackManager.isActive()) {
        // Return a no-op function instead of throwing
        return () => { /* no-op */ };
      }
      throw new Error('Socket not initialized');
    }
    
    // Register subscription based on type
    addSubscription(event, type, tabId);
    
    // Create a wrapper to log events
    const wrappedCallback = (data: WebSocketEventMap[T]) => {
      // Don't log here if this is a system_stats event, as it's already logged elsewhere
      // Skip logging for power_status events to reduce console spam
      if (String(event) !== 'power_status' && String(event) !== 'system_stats') {
        // Don't log here if this is a system_stats event, as it's already logged elsewhere
      }
      callback(data);
    };
    
    // Register the callback
    registerEventListener(event, wrappedCallback);
    
    // Subscribe at the server if needed
    const socket = getSocket();
    
    // Special handling for different subscription types
    if (type === SubscriptionType.ADMIN && isAuthenticated()) {
      if (String(event) === 'admin_disk_info') {
        // console.log('[DEBUG_SOCKET_EMIT] Emitting LOW-LEVEL subscribe for admin_disk_info to backend');
      }
      socket?.emit('subscribe', { type: event, admin: true });
    } else if (type === SubscriptionType.TAB) {
      socket?.emit('subscribe', { type: event });
    } else {
      socket?.emit('subscribe', { type: event });
    }
    
    // Return unsubscribe function
    return () => {
      const socket = getSocket();
      
      if (socket) {
        socket.off(event, wrappedCallback);
        // Always attempt to emit unsubscribe, even if socket.connected is false
        // The server should handle this gracefully, and it ensures we don't miss unsubscribes
        // during connection state transitions
        try {
          if (String(event) === 'admin_disk_info') {
            // console.log('[DEBUG_SOCKET_EMIT] Emitting LOW-LEVEL unsubscribe for admin_disk_info to backend (from subscribe return)');
          }
          socket.emit('unsubscribe', { type: event });
        } catch (error) {
          // If emit fails, still log for debugging but continue with cleanup
          warn(`[WebSocket] Failed to emit unsubscribe for ${String(event)}:`, error);
        }
      }
      
      // Remove event listener
      removeEventListener(event, wrappedCallback);
      
      // Remove subscription from tracking
      removeSubscription(event);
    };
  },
  
  subscribeCoreEvent: <T extends keyof WebSocketEventMap>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    try {
      return socketClient.subscribe(event, callback, SubscriptionType.CORE);
    } catch (subscriptionError) {
      error(`[WebSocket] Error subscribing to core event ${event}:`, subscriptionError);
      return () => { /* no-op */ };
    }
  },
  
  subscribeAdminEvent: <T extends keyof WebSocketEventMap>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void
  ) => {
    try {
      return socketClient.subscribe(event, callback, SubscriptionType.ADMIN);
    } catch (subscriptionError) {
      error(`[WebSocket] Error subscribing to admin event ${event}:`, subscriptionError);
      return () => { /* no-op */ };
    }
  },
  
  subscribeTabEvent: <T extends keyof WebSocketEventMap>(
    event: T, 
    callback: (data: WebSocketEventMap[T]) => void,
    tabId: string
  ) => {
    try {
      return socketClient.subscribe(event, callback, SubscriptionType.TAB, tabId);
    } catch (subscriptionError) {
      // Check if this is a "Socket not initialized" error, which is expected during fallback mode
      if (subscriptionError instanceof Error && subscriptionError.message === 'Socket not initialized') {
        // Return a no-op function instead of throwing
        return () => { /* no-op */ };
      }
      
      // For other errors, log but don't throw
      error(`[WebSocket] Error subscribing to tab event ${event}:`, subscriptionError);
      return () => { /* no-op */ };
    }
  },
  
  unsubscribe: <T extends keyof WebSocketEventMap>(event: T) => {
    const socket = getSocket();
    
    // Special handling for system_stats to ensure all listeners are removed
    if (event === 'system_stats') {
      // Remove associated event listeners
      if (socket) {
        socket.off(event);
      }
    }
    
    // Emit unsubscribe event to the server
    // Always attempt to emit, even if socket.connected is false
    // This ensures we don't miss unsubscribes during connection state transitions
    if (socket) {
      try {
        if (String(event) === 'admin_disk_info') {
          // console.log('[DEBUG_SOCKET_EMIT] Emitting LOW-LEVEL unsubscribe for admin_disk_info to backend');
        }
        // Attempt to emit regardless of connection state
        // The server should handle this gracefully, and socket.io may queue it if disconnected
        socket.emit('unsubscribe', { type: event });
      } catch (error) {
        // If emit fails, log for debugging but continue with cleanup
        warn(`[WebSocket] Failed to emit unsubscribe for ${String(event)}:`, error);
      }
    }
    
    // Remove from all tracking collections
    removeSubscription(event);
  },
  
  clearTabSubscriptions
};