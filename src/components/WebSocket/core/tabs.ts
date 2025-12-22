import { tabSubscriptions, activeSubscriptions } from './subscriptions';
import { getSocket } from './socket';
import { useStore } from '../../../store';
import { tabManager } from '../../../utils/tabManager';

// Active tab tracking
let activeTabId: string | null = null;

/**
 * Set the active tab ID and manage tab-specific subscriptions
 */
export const setActiveTab = (tabId: string) => {
  try {
    // Normalize tabId if needed
    const normalizedTabId = tabId.startsWith('@') ? tabId.substring(1) : tabId;
    
    // Get current store state for extra validation
    const storeActiveTab = typeof useStore !== 'undefined' ? useStore.getState().activeTab : null;
    
    // Prevent processing if tab ID is the same as what we already have in the socket client
    if (activeTabId === normalizedTabId) {
      return;
    }
    
    // Log store state comparison for debugging
    if (storeActiveTab && storeActiveTab !== normalizedTabId) {
      // console.log(`[WebSocket] Note: Store active tab (${storeActiveTab}) != new tab (${normalizedTabId})`);
    }
    
    const oldTabId = activeTabId;
    // console.log(`[WebSocket] Tab changed from ${oldTabId} to ${normalizedTabId}`);
    
    // Store new active tab ID
    activeTabId = normalizedTabId;
    
    // Delegate to TabManager for subscription management
    // This ensures TabManager is the central authority for tab subscriptions
    tabManager.handleTabChangeFromEvent(oldTabId, normalizedTabId, 'websocket');
    
    // Dispatch tab change event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('websocket-tab-change', {
        detail: { 
          oldTabId, 
          newTabId: normalizedTabId,
          source: 'websocket'
        }
      }));
    }
  } catch (error) {
    console.error('[WebSocket] Error in setActiveTab:', error);
  }
};

/**
 * Get the current active tab ID
 */
export const getActiveTab = () => {
  return activeTabId;
}; 