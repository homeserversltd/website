/**
 * WebSocket module public API
 * Centralizes all exports for WebSocket functionality
 */

// Re-export client for backward compatibility
export { socketClient } from './client';

// Export WebSocketProvider component
// export { WebSocketProvider } from './WebSocketProvider';

// Export types
export * from './types';

// Export configuration utilities
export * from './config';

// Export activity monitoring functions
export { 
  updateUserActivity,
  getTimeSinceLastActivity,
  isUserInactive,
  disableInactivityTimeout,
  enableInactivityTimeout,
  isTimeoutDisabled
} from './core/socket';

// Export initialization functionality from ./init
// initializeWebSocketSystem was removed from init.ts as startup is now orchestrated by startupSlice.
export { 
  isWebSocketInitialized, // This is now an alias for isCoreSystemInitialized from core/startup.ts
  getConnectionStatus     // This is now an alias for getCurrentSocketConnectionStatus from core/startup.ts
} from './init'; 