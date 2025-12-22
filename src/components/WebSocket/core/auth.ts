import { getSocket } from './socket';
import { adminSubscriptions } from './subscriptions';
import { SecureAuthClient } from '../../../utils/secureAuth';

// Authentication state
let socketAuthenticated = false;
let isAdminMode = false;

/**
 * Set admin mode status
 */
export const setIsAdmin = (admin: boolean) => {
  isAdminMode = admin;
  if (!admin) { // If exiting admin mode
    socketAuthenticated = false; // Reset the WebSocket authentication status
  }
};

/**
 * Get admin mode status
 */
export const getIsAdmin = () => isAdminMode;

/**
 * Get authentication status
 */
export const isAuthenticated = () => socketAuthenticated;

/**
 * Set authentication status
 */
export const setAuthenticated = (status: boolean) => {
  socketAuthenticated = status;
};

/**
 * Authenticate as admin using secure authentication
 */
export const authenticateAsAdmin = async (token: string): Promise<boolean> => {
  const socket = getSocket();
  if (!socket?.connected) {
    return Promise.reject(new Error('Socket not connected'));
  }
  
  if (socketAuthenticated) {
    return Promise.resolve(true); // Already authenticated
  }

  // Use our secure authentication client
  const authClient = new SecureAuthClient(socket);
  return authClient.authenticateAdmin(token)
    .then(() => {
      socketAuthenticated = true;
      
      // Note: We don't need to emit a custom event here because
      // the events.ts file already calls adminModeManager.handleAuthenticationSubscriptions()
      // when it receives the 'admin_auth_response' event from the server
      
      return true;
    })
    .catch(error => {
      console.error('[WebSocket] Secure authentication failed:', error);
      throw error;
    });
};

/**
 * Restore admin subscriptions after authentication
 */
export const restoreAdminSubscriptions = () => {
  const socket = getSocket();
  if (!socket) return;
  
  // Check if AdminModeManager exists and is handling subscriptions
  const adminModeManager = (window as any).adminModeManager;
  
  // If AdminModeManager is available, let it handle subscriptions
  if (adminModeManager) {
    return;
  }
  
  // Legacy fallback for when AdminModeManager is not available
  setTimeout(() => {
    if (isAdminMode && adminSubscriptions.size > 0) {
      adminSubscriptions.forEach(type => {
        socket.emit('subscribe', { type, admin: true });
      });
    }
  }, 100);
}; 