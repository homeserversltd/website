import { getSocket, cleanupSocket, startHeartbeatMonitoring, resetHeartbeatCounter } from './socket';
import { socketClient } from '../client';
import { reattachEventListeners, restoreSubscriptions } from './subscriptions';
import { setAuthenticated, restoreAdminSubscriptions } from './auth';
// import { initializeBroadcastIntegration, cleanupBroadcastIntegration } from './broadcastIntegration'; // REMOVED
import { useStore } from '../../../store'; // Import the Zustand store

/**
 * Set up event listeners for the socket
 * @param socket A non-null Socket.io socket instance
 */
export const setupSocketEventListeners = (socket: NonNullable<ReturnType<typeof import('socket.io-client').connect>>) => {
  // Connection established
  socket.on('connect', () => {
    setAuthenticated(false); // Reset auth state on new connection
    
    // Dispatch custom connection event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('socket-connect'));
    }
    
    // Start heartbeat monitoring
    startHeartbeatMonitoring();
    
    // Reattach all event listeners
    reattachEventListeners();
    
    // Restore all subscriptions
    restoreSubscriptions();
  });
  
  // Handle connection rejection from server
  socket.on('connect_error', (error: Error) => {
    cleanupSocket();
  });
  
  // Handle specific message from server about connection rejection
  socket.on('message', (data: any) => {
    if (data && data.message === 'Connection rejected by server') {
      // Wait briefly before disconnecting to avoid immediate reconnection loops
      setTimeout(() => {
        cleanupSocket();
      }, 1000);
    }
  });

  // Add admin authentication response handler
  socket.on('admin_auth_response', (response: { status: string; message: string }) => {
    const authenticated = response.status === 'authenticated';
    setAuthenticated(authenticated);
    
    if (authenticated) {
      useStore.getState().setWebSocketAdminAuthenticated(true); // Set store flag
      
      // Check if AdminModeManager exists and use it for subscription management
      const adminModeManager = (window as any).adminModeManager;
      if (adminModeManager && typeof adminModeManager.handleAuthenticationSubscriptions === 'function') {
        adminModeManager.handleAuthenticationSubscriptions();
      } else {
        // Fallback to legacy subscription management
        restoreAdminSubscriptions();
      }
    } else {
      useStore.getState().setWebSocketAdminAuthenticated(false); // Set store flag on failure
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason: string) => {
    useStore.getState().setWebSocketAdminAuthenticated(false); // Also ensure flag is false on disconnect
    
    // Special handling for parse errors which are often due to rapid refreshes
    if (reason === 'parse error') {
      handleParseError();
    } else {
      // For other disconnect reasons, handle immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socket-disconnect', { 
          detail: { reason }
        }));
      }
    }
  });

  // Handle socket errors
  socket.on('error', (error: Error) => {
    
    // Check if this is a parse error
    const errorStr = error.toString();
    if (errorStr.includes('parse error')) {
      console.warn('[WebSocket] Parse error in socket - likely due to rapid page refresh');
      
      // Add a debounce for parse errors to prevent immediate cleanup
      const parseErrorDebounceTimeout = 1500; // 1.5 seconds
      
      setTimeout(() => {
        // Only clean up if we're still disconnected after the timeout
        if (!socket?.connected) {
          cleanupSocket();
        } else {
          // console.log('[WebSocket] Recovered from parse error, no cleanup needed'); // REMOVED
        }
      }, parseErrorDebounceTimeout);
    } else {
      // For other errors, clean up immediately
      cleanupSocket();
    }
  });

  // Heartbeat acknowledgment
  socket.on('heartbeat_ack', () => {
    resetHeartbeatCounter();
  });
};

/**
 * Handle parse error during disconnection
 */
const handleParseError = () => {
  console.log('[WebSocket] Parse error detected - may be due to rapid page refreshes');
  
  // If we have a pending connection attempt, clear it to prevent stale promises
  if (socketClient.isConnecting()) {
    console.log('[WebSocket] Clearing existing connection state due to parse error');
    socketClient.disconnect(); // Disconnect and reset state instead
  }
  
  // Increase debounce timeout for parse errors to give more time for recovery
  const parseErrorDebounceTimeout = 5000; // Increased from 3000ms to 5000ms for better stability
  
  // Add a debounce flag to prevent multiple reconnection attempts
  let reconnectAttemptInProgress = false;
  
  // Try to reconnect immediately for parse errors, which are often transient
  if (!socketClient.isConnecting() && !reconnectAttemptInProgress) {
    console.log('[WebSocket] Attempting immediate reconnect after parse error');
    reconnectAttemptInProgress = true;
    
    // Increase wait time before reconnect attempt to allow browser to stabilize
    setTimeout(() => {
      const socket = getSocket();
      if (!socket?.connected && !socketClient.isConnecting()) {
        socketClient.connect()
          .then(() => {
            reconnectAttemptInProgress = false;
          })
          .catch(err => {
            console.warn('[WebSocket] Immediate reconnect attempt failed:', err.message);
            reconnectAttemptInProgress = false;
          });
      } else if (socket?.connected) {
        reconnectAttemptInProgress = false;
      } else if (socketClient.isConnecting()) {
        reconnectAttemptInProgress = false;
      }
    }, 1000); // Increased from 500ms to 1000ms for better stability
  }
  
  setTimeout(() => {
    const socket = getSocket();
    // Only dispatch the disconnect event if we're still disconnected after the timeout
    if (!socket?.connected) {
      console.log('[WebSocket] Still disconnected after debounce period, activating fallback');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socket-disconnect', { 
          detail: { reason: 'parse error' }
        }));
      }
    } else {
      // console.log('[WebSocket] Reconnected during debounce period, ignoring parse error'); // REMOVED
    }
  }, parseErrorDebounceTimeout);
}; 