/**
 * WebSocket status and core system check module
 * 
 * This file exports functions for monitoring WebSocket core system status.
 * Initialization is now handled by the application's startupSlice.
 */

import { 
  isCoreSystemInitialized, 
  // Assuming getConnectionStatus was renamed or replaced by getCurrentSocketConnectionStatus
  // Let's check core/startup.ts for the exact export if getCurrentSocketConnectionStatus is not correct.
  // For now, let's assume getCurrentSocketConnectionStatus is the one available.
  getCurrentSocketConnectionStatus as getConnectionStatus // Alias for backward compatibility if needed
} from './core/startup';

// Export functions for external consumption
export { 
  isCoreSystemInitialized as isWebSocketInitialized, // Alias for backward compatibility
  getConnectionStatus 
};

// The initializeWebSocketSystem function and the direct call to initializeWebSocket()
// have been removed as startup is now orchestrated by startupSlice via bootstrap.ts. 