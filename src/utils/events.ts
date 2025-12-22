import { StoreState } from '../store';
import { socketClient } from '../components/WebSocket/client';
import { fallbackManager } from './fallbackManager';
import { tabManager } from './tabManager';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useStore } from '../store';
import { debug, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('Events');

// Define the return type of useToast hook
interface UseToastReturn {
  show: (message: string, variant: any, options?: any) => void;
  success: (message: string, options?: any) => void;
  error: (message: string, options?: any) => void;
  info: (message: string, options?: any) => void;
  warning: (message: string, options?: any) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// Types for event details
interface TabChangeEventDetail {
  previousTabId?: string | null;
  newTabId: string;
  source: 'click' | 'websocket' | 'api' | 'store' | 'bootstrap' | 'fallback_recovery';
  oldTabId?: string;
}

interface FallbackEventDetail {
  reason?: string;
  details?: any;
  timestamp: number;
  type: string;
}

interface VisibilityEventDetail {
  tabId: string;
  visible: boolean;
}

/**
 * Creates and returns all application event handlers
 * 
 * @param getState Function to access current store state
 * @param setState Function to update store state
 * @param toast Toast notification service
 * @param refs Object containing component refs
 * @returns Object containing all event handlers
 */
export const createAppEventHandlers = (
  getState: () => StoreState,
  setState: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  toast: UseToastReturn,
  refs: {
    isMounted: React.MutableRefObject<boolean>;
    currentTabId: React.MutableRefObject<string | null>;
    loadCount: React.MutableRefObject<number>;
    loadingTabletRef: React.MutableRefObject<boolean>;
    lastLoadTimeRef: React.MutableRefObject<number>;
    loadTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
    previousAdmin: React.MutableRefObject<boolean>;
    previousFallbackState: React.MutableRefObject<boolean>;
    bootstrapInitialTabRef: React.MutableRefObject<string | null>;
  },
  setters: {
    setTabletModule: (module: any) => void;
    setIsLoadingTablet: (isLoading: boolean) => void;
    setTabletError: (error: Error | null) => void;
    setIsFallbackActive: (isActive: boolean) => void;
  },
  loaders: {
    loadTabletModule: (tabId: string) => Promise<any>;
    cachedFallbackTablet: any;
    loadTablet: (tabId: string) => void;
  }
) => {
  // Fallback system event handlers
  const handleFallbackActivate = (event: Event) => {
    const customEvent = event as CustomEvent<FallbackEventDetail>;
    const { reason } = customEvent.detail;
    debug(`Fallback mode activated: ${reason}`);
    setters.setIsFallbackActive(true);
    
    // Store fallback state without showing toast
    if (!refs.previousFallbackState.current) {
      refs.previousFallbackState.current = true;
    }
  };
  
  const handleFallbackDeactivate = () => {
    debug('Fallback deactivated');
    setters.setIsFallbackActive(false);
    
    // Update state without showing toast
    if (refs.previousFallbackState.current) {
      refs.previousFallbackState.current = false;
    }
  };
  
  const handleRecoverySuccess = (event: Event) => {
    const customEvent = event as CustomEvent<FallbackEventDetail>;
    const { details } = customEvent.detail;
    debug(`Fallback recovery successful, switching to: ${details?.targetTab}`);
    // No toast notification needed for recovery success
  };
  
  const handleRecoveryFailure = (event: Event) => {
    const customEvent = event as CustomEvent<FallbackEventDetail>;
    const { reason } = customEvent.detail;
    debug(`Fallback recovery failed: ${reason}`);
    // No toast notification needed for recovery failure
  };
  
  const handleTabletRecovery = (event: Event) => {
    const customEvent = event as CustomEvent<{targetTabId: string, previousTabId: string, source: string}>;
    const { targetTabId, previousTabId, source } = customEvent.detail;
    
    debug(`Received tablet-recovery event: ${previousTabId} -> ${targetTabId} (source: ${source})`);
    
    // Skip if the target tab is fallback - we're trying to recover FROM fallback
    if (targetTabId === 'fallback') {
      debug('Skipping recovery to fallback tablet - this would defeat the purpose of recovery');
      return;
    }
    
    // Get current state
    const currentState = getState();
    const currentActiveTab = currentState.activeTab;
    
    // If we're already on the target tab, check if it's properly loaded
    if (currentActiveTab === targetTabId && !refs.loadingTabletRef.current) {
      debug(`Already on target tab ${targetTabId} and not loading, skipping recovery`);
      
      // Dispatch a success event to notify other components
      window.dispatchEvent(new CustomEvent('tablet-recovery-complete', {
        detail: {
          targetTabId,
          previousTabId,
          success: true,
          timestamp: Date.now()
        }
      }));
      
      return;
    }
    
    // Force unload the current tablet
    setters.setTabletModule(null);
    setters.setIsLoadingTablet(true);
    setters.setTabletError(null);
    
    // Update the current tab ID reference
    refs.currentTabId.current = targetTabId;
    
    // Update the store's active tab
    setState({ activeTab: targetTabId });
    
    // Force load the target tablet with a small delay to ensure state is updated
    setTimeout(() => {
      debug(`Force loading tablet for recovery: ${targetTabId}`);
      
      try {
        // Clear any existing load timeout
        if (refs.loadTimeoutRef.current) {
          clearTimeout(refs.loadTimeoutRef.current);
          refs.loadTimeoutRef.current = null;
        }
        
        // Force clear the module from cache to ensure a fresh load
        // This is especially important when recovering from fallback mode
        if (source === 'fallback_recovery') {
          debug(`Force clearing module cache for ${targetTabId} during fallback recovery`);
          window.dispatchEvent(new CustomEvent('clear-tablet-cache', {
            detail: { tabId: targetTabId }
          }));
        }
        
        // Load the target tablet
        loaders.loadTablet(targetTabId);
        
        // Dispatch a custom event to notify other components about the recovery
        window.dispatchEvent(new CustomEvent('tablet-recovery-started', {
          detail: {
            targetTabId,
            previousTabId,
            timestamp: Date.now(),
            source
          }
        }));
      } catch (error) {
        logger.error('Error during tablet recovery:', error);
        
        // If recovery fails, we need to ensure the UI is in a consistent state
        setters.setIsLoadingTablet(false);
        setters.setTabletError(error instanceof Error ? error : new Error(String(error)));
        
        // Dispatch a failure event
        window.dispatchEvent(new CustomEvent('tablet-recovery-failed', {
          detail: {
            targetTabId,
            previousTabId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
          }
        }));
      }
    }, 100);
  };
  
  // Tablet cache management
  const handleClearCache = (event: Event) => {
    const customEvent = event as CustomEvent<{tabId?: string}>;
    debug('Received clear-tablet-cache event:', customEvent.detail);
    
    // This function should be implemented in the main component and passed as a callback
    // because it depends on moduleCache which is in App.tsx closure
  };
  
  // WebSocket tab change handler
  const handleWebSocketTabChange = (event: Event) => {
    const customEvent = event as CustomEvent<TabChangeEventDetail>;
    const { newTabId: rawNewTabId, oldTabId: rawOldTabId, source } = customEvent.detail;
    
    // Normalize tab IDs (remove @ prefix if present)
    const newTabId = rawNewTabId?.startsWith('@') ? rawNewTabId.substring(1) : rawNewTabId;
    const oldTabId = rawOldTabId?.startsWith('@') ? rawOldTabId.substring(1) : rawOldTabId;
    
    debug('Received websocket-tab-change event:', {
      oldTabId, newTabId, source
    });
    
    // Skip if newTabId is undefined or null
    if (!newTabId) {
      debug(`Skipping tab change with undefined/null newTabId (source: ${source})`);
      return;
    }
    
    // Get the current active tab directly from the store for maximum accuracy
    const storeActiveTab = getState().activeTab;
    
    if (source === 'websocket' && newTabId !== storeActiveTab) {
      debug(`Setting active tab to ${newTabId} from websocket event`);
      
      // Delegate to TabManager for subscription management
      // Instead of doing our own cleanup
      tabManager.handleTabChangeFromEvent(oldTabId || null, newTabId, source);
      
      // Set active tab in store
      if (newTabId === 'fallback') {
        setState({ activeTab: 'fallback' });
      } else {
        setState({ activeTab: newTabId });
      }
    } else if (newTabId !== storeActiveTab) {
      // Handle case where the tab needs to change even if not from websocket
      debug(`Setting active tab to ${newTabId} (non-websocket source: ${source})`);
      
      // Delegate to TabManager for subscription management
      tabManager.handleTabChangeFromEvent(oldTabId || null, newTabId, source);
      
      setState({ activeTab: newTabId });
    } else {
      debug(`Ignoring websocket tab change to ${newTabId} (already active: ${storeActiveTab})`);
    }
  };
  
  // Tablet unmount handler
  const handleTabletUnmount = (event: Event) => {
    debug('Tablet unmount event received:', 
                (event as CustomEvent).detail);
  };
  
  // Visibility change handler
  const handleVisibilityChange = (event: Event) => {
    const customEvent = event as CustomEvent<VisibilityEventDetail>;
    debug('Visibility changed:', customEvent.detail);
    
    // Check if we need to update fallback state
    setTimeout(() => {
      fallbackManager.checkAndActivateFallback();
    }, 100);
  };
  
  // WebSocket disconnect handler
  const handleSocketDisconnect = (event: Event) => {
    const customEvent = event as CustomEvent<{reason?: string}>;
    const reason = customEvent.detail?.reason || 'unknown';
    debug(`Received socket-disconnect event, reason: ${reason}`);
    
    // Track disconnection times to prevent rapid reconnect cycles
    const now = Date.now();
    
    // For parse errors, handle specially with an extended grace period
    if (reason === 'parse error') {
      debug('Parse error detected - using extended grace period before fallback activation');
      
      // Create a longer grace period for parse errors during rapid page refreshes
      const parseErrorGracePeriod = 10000; // 10 seconds - this gives more time for socket to reconnect
      
      // Store the current time so we know when this disconnect occurred
      const disconnectTime = now;
      
      // Don't immediately activate fallback for parse errors 
      // Add a grace period timer that only activates fallback if we're still disconnected after the period
      const parseErrorTimer = setTimeout(() => {
        // Check if the socket has reconnected in the meantime
        const socketStatus = socketClient.getStatus();
        if (!socketStatus || socketStatus === 'disconnected') {
          debug('Socket still disconnected after parse error grace period, activating fallback');
          
          if (!fallbackManager.isActive()) {
            // Force fallback after the grace period if still not connected
            fallbackManager.activateFallback('parse_error_timeout');
            setState({ activeTab: 'fallback' });
          }
        } else {
          debug('Socket reconnected during parse error grace period, not activating fallback');
        }
      }, parseErrorGracePeriod);
      
      // Add listener to clear this timer if we reconnect before grace period ends
      const reconnectHandler = () => {
        clearTimeout(parseErrorTimer);
        debug('Socket reconnected, clearing parse error grace period timer');
        window.removeEventListener('socket-connect', reconnectHandler);
      };
      
      window.addEventListener('socket-connect', reconnectHandler, { once: true });
      
      return; // Exit early for parse errors
    }
    
    // Force fallback mode for other disconnection reasons
    if (!fallbackManager.isActive()) {
      debug('Activating fallback mode due to WebSocket disconnect');
      
      // Cancel any pending tablet loadings immediately
      if (refs.loadTimeoutRef.current) {
        clearTimeout(refs.loadTimeoutRef.current);
        refs.loadTimeoutRef.current = null;
      }
      
      // Set fallback tab ASAP
      setState({ activeTab: 'fallback' });
      
      // Activate fallback with small delay to ensure state is updated
      setTimeout(() => {
        fallbackManager.activateFallback('websocket_disconnected');
      }, 50);
    }
  };
  
  // User activity tracking
  const handleActivity = () => {
    if (getState().isAdmin) {
      getState().updateLastActivity();
    }
  };
  
  return {
    handleFallbackActivate,
    handleFallbackDeactivate,
    handleRecoverySuccess,
    handleRecoveryFailure,
    handleTabletRecovery,
    handleClearCache,
    handleWebSocketTabChange,
    handleTabletUnmount,
    handleVisibilityChange,
    handleSocketDisconnect,
    handleActivity
  };
};

/**
 * Attaches event listeners for all app events
 * 
 * @param handlers Object containing event handlers
 * @returns Function to remove all event listeners
 */
export const attachAppEventListeners = (
  handlers: ReturnType<typeof createAppEventHandlers>
): () => void => {
  // Fallback events
  window.addEventListener('fallback-activate', handlers.handleFallbackActivate);
  window.addEventListener('fallback-deactivate', handlers.handleFallbackDeactivate);
  window.addEventListener('fallback-recovery_success', handlers.handleRecoverySuccess);
  window.addEventListener('fallback-recovery_failure', handlers.handleRecoveryFailure);
  
  // Tablet events
  window.addEventListener('clear-tablet-cache', handlers.handleClearCache);
  window.addEventListener('websocket-tab-change', handlers.handleWebSocketTabChange);
  window.addEventListener('tablet-unmount', handlers.handleTabletUnmount);
  window.addEventListener('tablet-recovery', handlers.handleTabletRecovery);
  
  // Fallback system events
  window.addEventListener('fallback-activated', handlers.handleFallbackActivate);
  window.addEventListener('fallback-deactivated', handlers.handleFallbackDeactivate);
  window.addEventListener('visibility-changed', handlers.handleVisibilityChange);
  
  // WebSocket events
  window.addEventListener('socket-disconnect', handlers.handleSocketDisconnect);
  
  // Activity tracking events
  const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
  activityEvents.forEach(event => 
    window.addEventListener(event, handlers.handleActivity, { passive: true })
  );
  
  // Return cleanup function
  return () => {
    // Remove fallback events
    window.removeEventListener('fallback-activate', handlers.handleFallbackActivate);
    window.removeEventListener('fallback-deactivate', handlers.handleFallbackDeactivate);
    window.removeEventListener('fallback-recovery_success', handlers.handleRecoverySuccess);
    window.removeEventListener('fallback-recovery_failure', handlers.handleRecoveryFailure);
    
    // Remove tablet events
    window.removeEventListener('clear-tablet-cache', handlers.handleClearCache);
    window.removeEventListener('websocket-tab-change', handlers.handleWebSocketTabChange);
    window.removeEventListener('tablet-unmount', handlers.handleTabletUnmount);
    window.removeEventListener('tablet-recovery', handlers.handleTabletRecovery);
    
    // Remove fallback system events
    window.removeEventListener('fallback-activated', handlers.handleFallbackActivate);
    window.removeEventListener('fallback-deactivated', handlers.handleFallbackDeactivate);
    window.removeEventListener('visibility-changed', handlers.handleVisibilityChange);
    
    // Remove WebSocket events
    window.removeEventListener('socket-disconnect', handlers.handleSocketDisconnect);
    
    // Remove activity tracking events
    activityEvents.forEach(event => 
      window.removeEventListener(event, handlers.handleActivity)
    );
  };
};

/**
 * Creates specialized event handler for module cache operations
 * This is separate because it depends on the moduleCache reference in App.tsx
 */
export const createModuleCacheHandlers = (
  moduleCache: Map<string, any>,
  currentTabIdRef: React.MutableRefObject<string | null>,
  setTabletModule: (module: any) => void
) => {
  const handleClearCache = (event: Event) => {
    const customEvent = event as CustomEvent<{tabId?: string}>;
    debug('Received clear-tablet-cache event:', customEvent.detail);
    
    // Clear the specific tab module from cache
    if (customEvent.detail?.tabId) {
      moduleCache.delete(customEvent.detail.tabId);
    } else {
      // If no specific tab, clear all
      moduleCache.clear();
    }
    
    // Clear current module if it matches
    if (currentTabIdRef.current === customEvent.detail?.tabId) {
      setTabletModule(null);
      
      // Trigger a reload of the current tablet after a short delay
      // This ensures that after clearing the cache, we reload the tablet
      setTimeout(() => {
        const store = useStore.getState();
        const currentTab = store.activeTab;
        
        if (currentTab && currentTab === customEvent.detail?.tabId) {
          debug(`Reloading tablet after cache clear: ${currentTab}`);
          // Dispatch an event to trigger a reload
          window.dispatchEvent(new CustomEvent('reload-tablet', {
            detail: { tabId: currentTab }
          }));
        }
      }, 150);
    }
  };
  
  return {
    handleClearCache
  };
}; 