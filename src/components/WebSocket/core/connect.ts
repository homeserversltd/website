import { getSocket, createSocket, getConnectionPromise, setConnectionPromise, setIsConnectionInProgress, getIsConnectionInProgress } from './socket';
import { setupSocketEventListeners } from './events';

// Track connection attempts globally to prevent race conditions
let lastConnectionAttempt = 0;
const minConnectionInterval = 3000; // 3 seconds for better stability during rapid refreshes

// Constants for rapid refresh detection
const REFRESH_HISTORY_KEY = 'ws_refresh_history';
const REFRESH_BLOCK_KEY = 'ws_refresh_block_until';
const REFRESH_LAST_TRACKED_KEY = 'ws_last_tracked_refresh';
const RAPID_REFRESH_THRESHOLD = 1000; // 1 second - more lenient to normal refresh patterns
const RAPID_REFRESH_COUNT = 2; // Number of refreshes needed to be considered "rapid"
const CONNECTION_BLOCK_DURATION = 1000; // 1 second block duration
const MINIMUM_REFRESH_INTERVAL = 200; // 200ms minimum interval to be considered a distinct refresh

/**
 * Check if connections should be blocked due to rapid refreshes
 * @returns true if connections should be blocked
 */
const shouldBlockConnections = (): boolean => {
  try {
    // Check if there's an active block
    const blockUntil = sessionStorage.getItem(REFRESH_BLOCK_KEY);
    if (blockUntil) {
      const blockTime = parseInt(blockUntil, 10);
      const now = Date.now();
      
      if (now < blockTime) {
        // Still in the block period
        const remainingTime = Math.ceil((blockTime - now) / 1000);
        return true;
      } else {
        // Block period expired, remove the block
        sessionStorage.removeItem(REFRESH_BLOCK_KEY);
      }
    }
    return false;
  } catch (error) {
    console.warn('[WebSocket] Error checking connection block state:', error);
    return false;
  }
};

/**
 * Check for rapid refreshes and update block state if needed
 */
const checkForRapidRefreshes = (): void => {
  try {
    const now = Date.now();
    
    // Prevent duplicate tracking of the same refresh
    // Check when we last tracked a refresh
    const lastTrackedStr = sessionStorage.getItem(REFRESH_LAST_TRACKED_KEY);
    if (lastTrackedStr) {
      const lastTracked = parseInt(lastTrackedStr, 10);
      // If this page load happened too soon after the last tracked one, it's likely
      // the same refresh being detected multiple times (multiple module initializations)
      if (now - lastTracked < MINIMUM_REFRESH_INTERVAL) {
        return; // Exit without counting this as a new refresh
      }
    }
    
    // This is a distinct refresh - update the last tracked time
    const previousTimeStr = sessionStorage.getItem(REFRESH_LAST_TRACKED_KEY);
    if (previousTimeStr) {
      const previousTime = parseInt(previousTimeStr, 10);
      const timeSinceLast = now - previousTime;
    } else {
      // Initial page refresh detected
    }
    
    sessionStorage.setItem(REFRESH_LAST_TRACKED_KEY, now.toString());
    
    let refreshHistory: number[] = [];
    
    // Get existing refresh history
    try {
      const storedHistory = sessionStorage.getItem(REFRESH_HISTORY_KEY);
      if (storedHistory) {
        refreshHistory = JSON.parse(storedHistory);
      }
    } catch (e) {
      refreshHistory = [];
    }
    
    // Add current refresh time
    refreshHistory.push(now);
    
    // Keep only the last few refreshes
    if (refreshHistory.length > RAPID_REFRESH_COUNT) {
      refreshHistory = refreshHistory.slice(-RAPID_REFRESH_COUNT);
    }
    
    // Save updated history
    sessionStorage.setItem(REFRESH_HISTORY_KEY, JSON.stringify(refreshHistory));
    
    // Check if we have rapid refreshes
    if (refreshHistory.length >= RAPID_REFRESH_COUNT) {
      const timeSpan = refreshHistory[refreshHistory.length - 1] - refreshHistory[0];
      
      if (timeSpan < RAPID_REFRESH_THRESHOLD) {
        // Rapid refreshes detected - set a block
        const blockUntil = now + CONNECTION_BLOCK_DURATION;
        sessionStorage.setItem(REFRESH_BLOCK_KEY, blockUntil.toString());
      }
    }
  } catch (error) {
    console.warn('[WebSocket] Error in rapid refresh detection:', error);
  }
};

/**
 * Connect to the WebSocket server
 */
export const connect = (): Promise<void> => {
  // First, check for rapid refreshes and update state
  checkForRapidRefreshes();
  
  // Don't create multiple connection promises
  const existingPromise = getConnectionPromise();
  if (existingPromise) {
    return existingPromise;
  }
  
  // Check if connections are blocked due to rapid refreshes
  if (shouldBlockConnections()) {
    // Return a promise that resolves when the block expires
    const blockPromise = new Promise<void>((resolve, reject) => {
      const blockUntil = parseInt(sessionStorage.getItem(REFRESH_BLOCK_KEY) || '0', 10);
      const now = Date.now();
      const waitTime = Math.max(blockUntil - now, 0);
      
      setTimeout(() => {
        // Once the block expires, check if we're already connected
        const socket = getSocket();
        if (socket?.connected) {
          resolve();
        } else {
          // If not, attempt to connect
          connectSocket().then(resolve).catch(reject);
        }
      }, waitTime);
    });
    
    setConnectionPromise(blockPromise);
    return blockPromise;
  }
  
  // Standard connection process
  const now = Date.now();
  if (now - lastConnectionAttempt < minConnectionInterval) {
    
    // Create a promise that resolves when the throttling period ends
    const throttledPromise = new Promise<void>((resolve, reject) => {
      const waitTime = Math.max(minConnectionInterval - (now - lastConnectionAttempt), 500); // Minimum 500ms wait
      
      setTimeout(() => {
        const socket = getSocket();
        // If already connected, just resolve
        if (socket?.connected) {
          resolve();
        } else {
          // If not, attempt a new connection
          lastConnectionAttempt = Date.now();
          connectSocket().then(resolve).catch(reject);
        }
      }, waitTime);
    });
    
    setConnectionPromise(throttledPromise);
    return throttledPromise;
  }
  
  // Standard connection process
  lastConnectionAttempt = now;
  const connectionPromise = connectSocket();
  setConnectionPromise(connectionPromise);
  return connectionPromise;
};

/**
 * Helper to encapsulate the actual connection logic
 */
const connectSocket = (): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    // Set a timeout for connection attempts
    const timeout = setTimeout(() => {
      const socket = getSocket();
      if (socket) {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      }
      setIsConnectionInProgress(false);
      reject(new Error('Connection timeout'));
    }, 10000); // 10 second timeout
    
    const onConnect = () => {
      clearTimeout(timeout);
      setIsConnectionInProgress(false);
      resolve();
    };
    
    const onError = (error: Error) => {
      clearTimeout(timeout);
      setIsConnectionInProgress(false);
      reject(error);
    };
    
    let socket = getSocket();
    if (!socket) {
      socket = createSocket();
      // Set up all the event listeners, but only if socket is not null
      if (socket) {
        setupSocketEventListeners(socket);
      } else {
        clearTimeout(timeout);
        setIsConnectionInProgress(false);
        reject(new Error('Failed to create socket'));
        return;
      }
    }
    
    if (socket.connected) {
      onConnect();
    } else {
      setIsConnectionInProgress(true);
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
      
      // Add specific handler for parse errors during connection
      socket.once('connect_failed', (reason: string) => {
        if (reason === 'parse error') {
          // Don't immediately reject - give it time to stabilize
          setTimeout(() => {
            if (!socket?.connected) {
              // Only reject if still not connected after delay
              clearTimeout(timeout);
              setIsConnectionInProgress(false);
              reject(new Error(`Connection failed: ${reason}`));
            }
          }, 1500); // Increase to 1.5 seconds
        } else {
          clearTimeout(timeout);
          setIsConnectionInProgress(false);
          reject(new Error(`Connection failed: ${reason}`));
        }
      });

      // Handle both error types from Socket.io
      socket.once('error', (error: Error) => {
        // Check if this is a parse error
        const errorStr = error.toString();
        if (errorStr.includes('parse error')) {
          // Add cooldown period before rejecting
          setTimeout(() => {
            if (!socket?.connected) {
              clearTimeout(timeout);
              setIsConnectionInProgress(false);
              reject(error);
            }
          }, 1500); // Increase to 1.5 seconds
        } else {
          clearTimeout(timeout);
          setIsConnectionInProgress(false);
          reject(error);
        }
      });
      
      socket.connect();
    }
  });
}; 