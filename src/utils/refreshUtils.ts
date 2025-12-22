/**
 * Utility functions for handling page refreshes and connection cooldowns
 */

// Constants for refresh detection
const MINIMUM_REFRESH_INTERVAL = 150; // Minimum time (ms) between logged refreshes to consider them distinct
const RAPID_REFRESH_COUNT = 3; // Number of refreshes needed to trigger rapid refresh detection
const RAPID_REFRESH_THRESHOLD = 3000; // Time window (ms) for rapid refresh detection
const MAX_REFRESH_HISTORY = 5; // Maximum number of refresh timestamps to keep in history

/**
 * Detect if the page is being rapidly refreshed
 * This helps us handle websocket connections more carefully during rapid refreshes
 */
export const detectRapidRefresh = (): boolean => {
  try {
    // Check if there's an active block in sessionStorage (matches our WebSocket logic)
    const REFRESH_BLOCK_KEY = 'ws_refresh_block_until';
    const blockUntil = sessionStorage.getItem(REFRESH_BLOCK_KEY);
    
    if (blockUntil) {
      const blockTime = parseInt(blockUntil, 10);
      const now = Date.now();
      
      if (now < blockTime) {
        // Still in the block period
        const remainingTime = Math.ceil((blockTime - now) / 1000);
        console.log(`[RefreshUtils] Connections blocked for ${remainingTime}s due to rapid refreshes`);
        return true;
      }
    }
    
    // Fallback to the history-based detection
    const now = Date.now();
    
    // Prevent duplicate detection of the same refresh event
    const REFRESH_LAST_TRACKED_KEY = 'ws_last_tracked_refresh';
    const lastTrackedStr = sessionStorage.getItem(REFRESH_LAST_TRACKED_KEY);
    
    // If the WebSocket module already tracked this refresh, don't count it again here
    if (lastTrackedStr) {
      const lastTracked = parseInt(lastTrackedStr, 10);
      if (now - lastTracked < MINIMUM_REFRESH_INTERVAL) {
        console.log('[RefreshUtils] Refresh already tracked by WebSocket module, using existing status');
        // Don't add a duplicate entry, but still return true if we're in a rapid refresh period
        return isInRapidRefreshCooldown();
      }
    }
    
    // Get existing history from sessionStorage
    let history: number[] = [];
    try {
      const storedHistory = sessionStorage.getItem('page_refresh_history');
      if (storedHistory) {
        history = JSON.parse(storedHistory);
      }
    } catch (error) {
      console.warn('[RefreshUtils] Error reading refresh history from sessionStorage:', error);
    }
    
    // Add current time
    history.push(now);
    
    // Keep only the last MAX_REFRESH_HISTORY items
    if (history.length > MAX_REFRESH_HISTORY) {
      history = history.slice(-MAX_REFRESH_HISTORY);
    }
    
    // Store back to sessionStorage
    try {
      sessionStorage.setItem('page_refresh_history', JSON.stringify(history));
    } catch (error) {
      console.warn('[RefreshUtils] Error storing refresh history to sessionStorage:', error);
    }
    
    if (history.length < RAPID_REFRESH_COUNT) {
      return false;
    }
    
    // Check if the time between first and last refresh is less than threshold
    const timeSpan = history[history.length - 1] - history[0];
    const isRapid = history.length >= RAPID_REFRESH_COUNT && timeSpan < RAPID_REFRESH_THRESHOLD;
    
    if (isRapid) {
      console.warn(`[RefreshUtils] Rapid page refreshes detected (${history.length} in ${timeSpan}ms)`);
    }
    
    return isRapid;
  } catch (error) {
    console.warn('[RefreshUtils] Error in detectRapidRefresh:', error);
    return false;
  }
};

/**
 * Check if we're in a cool-down period after rapid refreshes
 */
export const isInRapidRefreshCooldown = (): boolean => {
  try {
    const wasRapidRefresh = localStorage.getItem('rapid_refresh_detected') === 'true';
    if (!wasRapidRefresh) return false;
    
    const lastRapidRefreshTime = parseInt(localStorage.getItem('rapid_refresh_time') || '0', 10);
    const now = Date.now();
    const cooldownTime = 30000; // 30 second cooldown
    
    // If we're within the cooldown period, return true
    if (now - lastRapidRefreshTime < cooldownTime) {
      console.log(`[RefreshUtils] In rapid refresh cooldown period (${Math.round((now - lastRapidRefreshTime) / 1000)}s elapsed of ${cooldownTime / 1000}s cooldown)`);
      return true;
    }
    
    // Reset the flag if we're outside the cooldown period
    localStorage.removeItem('rapid_refresh_detected');
    return false;
  } catch (error) {
    console.warn('[RefreshUtils] Error checking rapid refresh cooldown:', error);
    return false;
  }
};

/**
 * Checks if there's an active connection block in sessionStorage
 */
export const checkConnectionBlock = (): { blocked: boolean, remainingTime: number } => {
  try {
    const REFRESH_BLOCK_KEY = 'ws_refresh_block_until';
    const blockUntil = sessionStorage.getItem(REFRESH_BLOCK_KEY);
    
    if (blockUntil) {
      const blockTime = parseInt(blockUntil, 10);
      const now = Date.now();
      
      if (now < blockTime) {
        // Connection is blocked
        const remainingTime = Math.ceil((blockTime - now) / 1000);
        return { blocked: true, remainingTime };
      }
    }
    
    return { blocked: false, remainingTime: 0 };
  } catch (error) {
    console.warn('[RefreshUtils] Error in checkConnectionBlock:', error);
    return { blocked: false, remainingTime: 0 };
  }
};

/**
 * Calculate exponential backoff delay for retries
 */
export const getRetryDelay = (attempt: number): number => {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}; 