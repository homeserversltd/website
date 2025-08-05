import { getSocket, getConnectionStatus as getSocketConnectionStatus, startActivityMonitoring } from './socket';
import { coreSubscriptions, addSubscription, registerEventListener, getCoreSubscriptions, activeSubscriptions } from './subscriptions';
import { getIsAdmin } from './auth';
import { WebSocketEventKey, WebSocketEventMap, SubscriptionType } from '../types';
import { CORE_EVENTS } from '../config';
import { debug, createComponentLogger } from '../../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('WebSocketStartup');

let isCoreWebSocketSystemInitialized = false;

/**
 * Check if connections are blocked due to rapid refreshes
 */
const isConnectionBlocked = (): boolean => {
  try {
    const REFRESH_BLOCK_KEY = 'ws_refresh_block_until';
    const blockUntil = sessionStorage.getItem(REFRESH_BLOCK_KEY);
    
    if (blockUntil) {
      const blockTime = parseInt(blockUntil, 10);
      const now = Date.now();
      
      if (now < blockTime) {
        const remainingTime = Math.ceil((blockTime - now) / 1000);
        logger.warn(`Connection blocked for ${remainingTime}s due to rapid refreshes`);
        return true;
      }
    }
    return false;
  } catch (error) {
    logger.warn('Error checking connection block state:', error);
    return false;
  }
};

/**
 * Initializes the core WebSocket system components (listeners, monitoring, etc.)
 * This function DOES NOT establish the connection itself.
 * Connection is handled by the startupSlice via websocketSlice.
 * Should be called by the startup process once it's ready for WebSocket interactions.
 */
export const initializeCoreWebSocketSystem = async (): Promise<void> => {
  if (isCoreWebSocketSystemInitialized) {
    logger.warn('Core WebSocket system already initialized, skipping.');
    return;
  }

  debug('Initializing core WebSocket system components...');
  isCoreWebSocketSystemInitialized = true;

  // Start activity monitoring for the socket (if it exists or gets created)
  startActivityMonitoring();

  // Check if connections are blocked due to rapid refreshes.
  // This might influence higher-level logic in startupSlice deciding when to attempt connection.
  if (isConnectionBlocked()) {
    logger.warn('Core WebSocket system initialization occurring, but connection attempts might be delayed by startupSlice due to rapid refresh block.');
    // No direct delay here; startupSlice will manage connection timing.
  }
  
  // Pre-register core events in the coreSubscriptions set
  // This ensures setupCoreSubscriptions has events to work with when called later.
  /*
  CORE_EVENTS.forEach(event => {
    addSubscription(event, SubscriptionType.CORE);
  });
  */

  // These functions set up listeners and will be effective once a socket is connected.
  // They are called here to prepare the system.
  // The actual connection is managed externally by startupSlice -> websocketSlice.
  // setupCoreSubscriptions(); // Commented out to test SubscriptionManager takeover
  monitorConnection(); // Sets up listeners for 'disconnect' on the socket when it's available
    
  debug('Core WebSocket system components initialized and ready for connection.');
  // The actual connection attempt will be made via startupSlice -> websocketSlice.connect()
};

/**
 * Emit core subscriptions to the server
 * This should be called AFTER a WebSocket connection is confirmed.
 */
const emitCoreSubscriptions = (): void => {
  /*
  const socket = getSocket();
  if (!socket || !socket.connected) return;
  
  // Get the current set of core subscriptions
  const coreEvents = getCoreSubscriptions();
  
  debug(`Emitting ${coreEvents.size} core subscriptions`);
  
  // Emit subscribe events for each core subscription
  coreEvents.forEach(event => {
    // Check if we're already subscribed
    if (!activeSubscriptions.has(event)) {
      debug(`Subscribing to core event: ${event}`);
      socket.emit('subscribe', { type: event });
      activeSubscriptions.add(event);
    }
  });
  */
  logger.warn('emitCoreSubscriptions deliberately disabled for testing SubscriptionManager takeover.');
};

/**
 * Set up core subscriptions listeners
 * Called during initializeCoreWebSocketSystem to prepare listeners.
 */
const setupCoreSubscriptions = (): void => {
  // Get the current set of core subscriptions
  const coreEvents = getCoreSubscriptions();
  
  debug(`Setting up ${coreEvents.size} core event listeners`);
  
  // Set up event listeners for each core subscription
  coreEvents.forEach(event => {
    try {
      // Register the event listener
      registerEventListener(
        event as WebSocketEventKey,
        (data: any) => {
          // Basic handler, actual processing is done by the broadcast system
          if (event !== 'power_status') { // Avoid console spam for high-frequency events
            // debug(`Core event received: ${event}`, data);
          }
        }
      );
      
      // Note: We don't emit subscriptions here anymore - that's done in emitCoreSubscriptions
    } catch (error) {
      logger.error(`Failed to setup core event ${event}:`, error);
    }
  });
};

/**
 * Monitor connection status
 * Called during initializeCoreWebSocketSystem to prepare listeners.
 */
const monitorConnection = (): void => {
  // Listen for disconnect events
  const socket = getSocket();
  if (!socket) return;
  
  // Flag to track if we've already logged the disconnection message
  let disconnectionLogged = false;
  
  socket.on('disconnect', (reason: string) => {
    logger.warn(`Disconnected: ${reason}`);
    debug('No reconnection will be attempted. User must refresh the page.');
    disconnectionLogged = true;
  });
  
  // Set up periodic connection check
  const checkInterval = setInterval(() => {
    // If socket is null, stop checking
    if (!getSocket()) {
      debug('Socket is null, stopping connection monitoring');
      clearInterval(checkInterval);
      return;
    }
    
    const status = getSocketConnectionStatus();
    if (status !== 'connected') {
      // Only log once to avoid spamming the console
      if (!disconnectionLogged) {
        logger.warn(`Connection check failed, status: ${status}`);
        debug('No reconnection will be attempted. User must refresh the page.');
        disconnectionLogged = true;
      }
    } else {
      // Reset the flag if we're connected again (though this shouldn't happen without a page refresh)
      disconnectionLogged = false;
    }
  }, 30000); // Check every 30 seconds
  
  // Clean up the interval if the socket is removed
  socket.on('close', () => {
    debug('Socket closed, stopping connection monitoring');
    clearInterval(checkInterval);
  });
};

/**
 * Check if the Core WebSocket system (listeners, etc.) has been initialized.
 * Does not indicate if a connection is active.
 */
export const isCoreSystemInitialized = (): boolean => {
  return isCoreWebSocketSystemInitialized;
};

/**
 * Get current socket connection status (delegates to core/socket)
 */
export const getCurrentSocketConnectionStatus = (): {
  status: 'connected' | 'disconnected';
} => {
  return {
    status: getSocketConnectionStatus() === 'connected' ? 'connected' : 'disconnected'
  };
}; 