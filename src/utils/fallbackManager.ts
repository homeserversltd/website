/**
 * fallbackManager.ts
 * 
 * Provides utilities for managing the Tablet Fallback System
 * Implements event-driven fallback logic for graceful degradation when tablets fail to load
 */

import { socketClient } from '../components/WebSocket/client';
import { useStore, StoreState } from '../store';
import { tabManager } from './tabManager';
import { WebSocketEventMap } from '../components/WebSocket/types';
import { adminModeManager } from './adminModeManager';
import { closeAllModals } from '../components/Popup/PopupManager';
import React from 'react';
import { usePopupStore } from '../components/Popup/PopupManager';
import { debug, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('FallbackManager');

// Extend the WebSocketEventMap interface to include connect_error event
declare module '../components/WebSocket/types' {
  export interface WebSocketEventMap {
    'connect_error': Error;
  }
}

// Cooldown period before allowing recovery attempts (3 seconds)
const RECOVERY_COOLDOWN = 3000;

// Add a longer cooldown for admin mode transitions
const ADMIN_TRANSITION_COOLDOWN = 5000;

// Interface for fallback system state
interface FallbackState {
  isActive: boolean;
  reason: string | null;
  activationTime: number | null;
  inRecoveryAttempt: boolean;
  lastRecoveryAttempt: number | null;
  isRecovering: boolean;
}

// Types of fallback events
type FallbackEventType = 
  | 'activate'
  | 'deactivate'
  | 'recovery_attempt'
  | 'recovery_success'
  | 'recovery_failure'
  | 'prepare_recovery';

// Event listener type
type FallbackEventListener = (data: {
  type: FallbackEventType;
  reason?: string;
  timestamp: number;
  details?: any;
}) => void;

// Type for store subscription state
interface FallbackStoreState {
  activeTab: string | null;
  visibility: any;
  isAdmin: boolean;
}

// Update the TabChangeEventDetail interface to include fallback_recovery
interface TabChangeEventDetail {
  previousTabId?: string | null;
  newTabId: string;
  source: 'click' | 'websocket' | 'api' | 'store' | 'bootstrap' | 'fallback_recovery';
}

class FallbackManager {
  private state: FallbackState = {
    isActive: false,
    reason: null,
    activationTime: null,
    inRecoveryAttempt: false,
    lastRecoveryAttempt: null,
    isRecovering: false
  };
  // Track initialization state to avoid redundant init/cleanup cycles
  private isInitialized = false; // Type annotation removed as it's trivially inferred

  // Event emitter system
  private eventListeners: Map<FallbackEventType, Set<FallbackEventListener>> = new Map();

  // Parse error handling
  private parseErrorStartTime: number | null = null;

  // Store subscription unsubscribe function
  private storeUnsubscribe: (() => void) | null = null;

  // WebSocket event listeners cleanup functions
  private cleanupFunctions: Array<() => void> = [];

  /**
   * Initialize fallback system by setting up event listeners
   */
  public initialize(): void {
    // Prevent multiple initializations
    if (this.isInitialized) {
      debug('Already initialized, skipping initialization');
      return;
    }
    
    debug('Initializing event-driven fallback system');
    
    // Set up store subscription for state changes
    this.setupStoreSubscription();
    
    // Set up socket event listeners
    this.setupSocketEventListeners();
    
    // Set up DOM event listeners
    this.setupDOMEventListeners();
    
    // Check initial state rather than unconditionally activating fallback
    this.checkInitialState();
    
    // Mark as initialized
    this.isInitialized = true;
  }

  /**
   * Set up subscription to the store for state changes
   */
  private setupStoreSubscription(): void {
    // Clean up any existing subscription
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }

    let prevState = {
      activeTab: useStore.getState().activeTab,
      visibility: useStore.getState().visibility
    };

    // Create a periodic check for state changes
    const stateCheckInterval = setInterval(() => {
      const newState = {
        activeTab: useStore.getState().activeTab,
        visibility: useStore.getState().visibility
      };

      // Visibility changes detection
      if (JSON.stringify(newState.visibility) !== JSON.stringify(prevState.visibility)) {
        const currentStoreState = useStore.getState(); // Get fresh store state
        const startupPhase = currentStoreState.currentPhase; // Get startup phase
        const visibleTabs = currentStoreState.getVisibleTabs();
        
        // debug(`Store visibility changed. Visible tabs: ${visibleTabs.length}, StartupPhase: ${startupPhase}`);

        // Only activate for no_visible_tabs if startup has progressed enough
        if (startupPhase !== 'CoreInitialized' && startupPhase !== 'WebSocketConnected' && startupPhase !== 'AppReady') {
          // debug('Startup not complete, deferring no_visible_tabs check from store subscription. Phase:', startupPhase);
        } else if (visibleTabs.length === 0 && !this.state.isActive) {
          debug('No visible tabs after store update (and startup complete), activating fallback');
          this.activateFallback('no_visible_tabs_from_store'); // Differentiate reason slightly
        }
      }

      // Update previous state for next comparison
      prevState = newState;
    }, 500); // Check every 500ms

    // Add the interval cleanup to our cleanup functions
    this.cleanupFunctions.push(() => clearInterval(stateCheckInterval));
  }

  /**
   * Set up WebSocket event listeners for connection status
   */
  private setupSocketEventListeners(): void {
    // Clean up any existing listeners
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];

    // Listen for socket disconnect events
    const disconnectHandler = (reason: any) => {
      debug('Socket disconnected, reason:', reason);
      
      // Check if this disconnect is due to a page refresh
      try {
        if (sessionStorage.getItem('isPageRefreshing') === 'true') {
          debug('Page refresh detected, suppressing fallback activation for this disconnect.');
          return;
        }
      } catch (e) {
        logger.warn('Could not check sessionStorage for refresh detection during disconnect:', e);
      }

      // If startup is not yet complete (AppReady), defer fallback activation for disconnects,
      // as startupSlice is still responsible for establishing the connection.
      const currentStartupPhase = useStore.getState().currentPhase;
      if (currentStartupPhase !== 'AppReady') {
        debug(`Disconnect event received during startup phase '${currentStartupPhase}'. Deferring fallback activation.`);
        // Optionally, you could set a flag here to re-evaluate after AppReady if still disconnected.
        return;
      }
      
      // Add special handling for parse errors which may be temporary
      if (reason === 'parse error' || (reason && reason.type === 'parse error')) {
        debug('Parse error detected - applying grace period before fallback activation');
        
        // Store the current time to track how long we've been seeing parse errors
        const currentTime = Date.now();
        if (!this.parseErrorStartTime) {
          this.parseErrorStartTime = currentTime;
        }
        
        // Only activate fallback if we've been seeing parse errors for more than our grace period
        const parseErrorDuration = currentTime - (this.parseErrorStartTime || currentTime);
        if (parseErrorDuration > 5000) { // 5 second grace period for parse errors
          debug(`Parse errors persisted for ${parseErrorDuration}ms, activating fallback`);
          this.activateFallback('parse_error_timeout');
          this.parseErrorStartTime = null; // Reset the timer
        } else {
          // Set a timer to check again after the grace period
          setTimeout(() => {
            if (this.parseErrorStartTime && socketClient.getStatus() !== 'connected') {
              debug('Parse error grace period expired, activating fallback');
              this.activateFallback('parse_error_timeout');
              this.parseErrorStartTime = null;
            }
          }, 5000 - parseErrorDuration);
        }
      } else {
        // Immediate activation for non-parse errors
        debug(`Non-parse error disconnect detected (reason: "${reason}"). Attempting to activate fallback.`);
        this.activateFallback('websocket_disconnected');
      }
    };

    // Listen for socket connect events
    const connectHandler = () => {
      debug('Socket connected');
      
      // Reset parse error tracking
      this.parseErrorStartTime = null;
      
      // REMOVED: No longer attempt recovery on socket connection
    };

    // Listen for connection failures
    const connectErrorHandler = (error: Error) => {
      debug('Socket connection error:', error);
      if (!this.state.isActive) {
        this.activateFallback('connection_error');
      }
    };

    // Register socket event listeners
    // debug('Registering disconnectHandler with socketClient');
    socketClient.on('disconnect', disconnectHandler);
    socketClient.on('connect', connectHandler);
    
    // Connect error is a standard Socket.io event
    socketClient.on('connect_error', connectErrorHandler);
    // Add cleanup
    this.cleanupFunctions.push(() => {
      try {
        socketClient.off('connect_error', connectErrorHandler);
      } catch (error) {
        logger.error('Error removing connect_error handler:', error);
      }
    });

    // Add cleanup functions for standard events
    this.cleanupFunctions.push(() => socketClient.off('disconnect', disconnectHandler));
    this.cleanupFunctions.push(() => socketClient.off('connect', connectHandler));
  }

  /**
   * Set up DOM and custom event listeners
   */
  private setupDOMEventListeners(): void {
    // Listen for visibility changes
    const visibilityHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { tabId, visible } = customEvent.detail;
      
      // React to visibility changes but don't trigger recovery
      this.handleTabVisibilityChangeNoRecovery(tabId, visible);
    };

    // Listen for overall visibility state changes (all tabs)
    const visibilityStateHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { visibleTabs, reason } = customEvent.detail;
      const store = useStore.getState(); // Get store for startupPhase
      const startupPhase = store.currentPhase;

      // debug(`Received visibility state changed event: ${visibleTabs?.length || 0} visible tabs, StartupPhase: ${startupPhase}`);
      
      // Only consider activating if startup is sufficiently progressed
      if (startupPhase === 'CoreInitialized' || startupPhase === 'WebSocketConnected' || startupPhase === 'AppReady') {
        if (visibleTabs && visibleTabs.length === 1) { // FALLBACK IS ALWAYS A VISIBLE TAB, 1 is lowest valid number of visible tabs.
          if (!this.state.isActive) {
            debug('DOM: No visible tabs (and startup complete), activating fallback');
            this.activateFallback(reason || 'visibility_state_no_tabs');
          }
        }
      } else {
        // debug('DOM: Startup not complete, deferring no_visible_tabs check from visibility-state-changed. Phase:', startupPhase);
      }
    };

    // Listen for admin mode changes
    const adminModeHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { isAdmin } = customEvent.detail;
      
      debug(`Received admin mode changed event: isAdmin=${isAdmin}`);
      
      // Handle admin mode change - this is the ONLY place where recovery can happen
      this.handleAdminModeChange(isAdmin);
    };

    // Listen for DOM content loaded
    const domLoadedHandler = () => {
      const container = document.querySelector('.tablet-container');
      
      // Use MutationObserver to watch for container changes
      if (container) {
        const observer = new MutationObserver((mutations) => {
          // Only process if not in fallback mode already
          if (this.state.isActive) return;
          
          // Check for empty container conditions
          if (container && (!container.children || container.children.length === 0)) {
            const loadingElement = document.querySelector('.tablet-loading');
            
            // If no loading indicator and container is empty, this is an error state
            if (!loadingElement) {
              const currentStartupPhaseObs = useStore.getState().currentPhase;
              debug(`Empty tablet container detected by MutationObserver. CurrentPhase: '${currentStartupPhaseObs}'. Attempting to activate fallback.`);
              this.activateFallback('empty_container');
            }
          }
        });
        
        // Start observing with these configuration parameters
        const config = { childList: true, subtree: true };
        observer.observe(container, config);
        
        // Add cleanup function
        this.cleanupFunctions.push(() => observer.disconnect());
      }
    };

    // Register DOM event listeners
    window.addEventListener('visibility-changed', visibilityHandler);
    window.addEventListener('visibility-state-changed', visibilityStateHandler);
    window.addEventListener('admin-mode-changed', adminModeHandler);
    window.addEventListener('DOMContentLoaded', domLoadedHandler);
    
    // Add cleanup functions
    this.cleanupFunctions.push(() => window.removeEventListener('visibility-changed', visibilityHandler));
    this.cleanupFunctions.push(() => window.removeEventListener('visibility-state-changed', visibilityStateHandler));
    this.cleanupFunctions.push(() => window.removeEventListener('admin-mode-changed', adminModeHandler));
    this.cleanupFunctions.push(() => window.removeEventListener('DOMContentLoaded', domLoadedHandler));
  }

  /**
   * Check the initial state of the application
   */
  private checkInitialState(): void {
    // Get current visibility state
    const storeState = useStore.getState();
    const startupPhase = storeState.currentPhase; // Get startup phase
    const visibleTabs = storeState.getVisibleTabs?.() || [];
    const socketStatus = socketClient.getStatus();
    
    // debug(`Checking initial state: ${visibleTabs.length} visible tabs, socket status: ${socketStatus}, startupPhase: ${startupPhase}`);
    
    // Defer fallback activation based on visibility if startup is not yet at a stage where tab/visibility info is reliably loaded.
    // OR if the socket is disconnected but startup isn't AppReady yet (meaning it might still be trying to connect).
    if (startupPhase !== 'AppReady') {
      // debug(`Startup not AppReady (phase: ${startupPhase}), deferring initial fallback checks.`);
      return; // Exit early if startup is not fully ready for these checks
    }

    // At this point, startupPhase IS AppReady.
    const needsFallbackBasedOnVisibility = visibleTabs.length === 0;
    const needsFallbackBasedOnConnection = socketStatus !== 'connected'; // Simpler check: if AppReady and not connected, it's an issue.
    
    if ((needsFallbackBasedOnVisibility || needsFallbackBasedOnConnection) && !this.state.isActive) {
      const reason = needsFallbackBasedOnVisibility
        ? 'initial_no_visible_tabs_at_appready' 
        : 'initial_connection_failure_at_appready';
      
      debug(`Activating fallback at AppReady. Reason: ${reason}`);
      this.activateFallback(reason);
    }
  }

  /**
   * Register event listener
   */
  public addEventListener(event: FallbackEventType, listener: FallbackEventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)?.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(listener);
    };
  }

  /**
   * Emit event to listeners
   */
  private emit(event: FallbackEventType, data: {
    type: FallbackEventType;
    reason?: string;
    timestamp: number;
    details?: any;
  }): void {
    // Emit to internal listeners
    this.eventListeners.get(event)?.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error(`Error in event listener for ${event}:`, error);
      }
    });
    
    // Also dispatch to window for other components
    window.dispatchEvent(new CustomEvent(`fallback-${event}`, {
      detail: data
    }));
  }

  /**
   * Activates the fallback mode with a given reason
   * @param reason The reason for activating fallback mode
   */
  public activateFallback(reason: string): void {
    const currentStartupPhase = useStore.getState().currentPhase; // Get phase immediately
    logger.warn(
      `activateFallback CALLED. Reason: '${reason}', CurrentPhase: '${currentStartupPhase}', Current Internal State: isActive=${this.state.isActive}, currentReason=${this.state.reason}`,
      new Error().stack // Log stack trace
    );

    // If already active with the same reason, don't re-activate
    if (this.state.isActive && this.state.reason === reason) {
      debug(`Fallback already active with IDENTICAL reason '${reason}'. No change.`);
      return;
    }
    
    // If already active but with a DIFFERENT reason, log the change of reason.
    if (this.state.isActive && this.state.reason !== reason) {
       debug(`Fallback already active, but REASON CHANGING from '${this.state.reason}' to '${reason}'.`);
    }
    
    // The user reverted the change that added a startup phase check here, so we proceed.
    
    debug(`>>> ACTIVATING FALLBACK <<< Reason: '${reason}', Phase: '${currentStartupPhase}'`);
    
    // Store the last active tab before switching to fallback
    // if (!this.state.isActive) { // REMOVED BLOCK
    //   const activeTab = useStore.getState().activeTab;
    //   this.state.lastActiveTab = activeTab !== 'fallback' ? activeTab : this.state.lastActiveTab;
    // }
    
    // Update state
    this.state.isActive = true;
    debug(`Internal state.isActive SET to true. Reason: '${reason}'.`);
    this.state.reason = reason;
    this.state.activationTime = Date.now();
    
    // Emit fallback activation event
    this.emit('activate', {
      type: 'activate',
      reason,
      timestamp: Date.now()
    });
    
    // Update store state to reflect fallback mode
    useStore.setState({
      isFallbackActive: true,
      fallbackReason: reason
    });
    
    // For user inactivity, also dispatch a websocket status change event
    if (reason === 'user_inactivity') {
      debug('Dispatching websocket-status-change event for user inactivity');
      window.dispatchEvent(new CustomEvent('websocket-status-change', {
        detail: {
          status: 'disconnected',
          reason: 'user_inactivity'
        }
      }));
      
      // Also dispatch a fallback-update event for backward compatibility
      window.dispatchEvent(new CustomEvent('fallback-update', {
        detail: {
          type: 'websocket_disconnected',
          reason: 'user_inactivity'
        }
      }));
    }
    
    // Ensure the active tab is set to fallback
    this.changeActiveTabToFallback();
    
    // Get all modal popups
    const state = usePopupStore.getState();
    const modalPopups = state.popups.filter(popup => popup.type === 'modal');
    
    // Check each modal to see if it should stay open
    modalPopups.forEach(popup => {
      try {
        if (popup.type === 'modal') {
          const content = popup.children;
          
          // If the content is a React element
          if (React.isValidElement(content)) {
            const componentType = content.type as any;
            
            // First, check if it's the SyncResultsModal by display name
            if (componentType && 
                ((typeof componentType === 'function' && componentType.name === 'SyncResultsModal') ||
                 (componentType.displayName === 'SyncResultsModal'))) {
              debug('Found SyncResultsModal, keeping it open during fallback');
              return; // Skip removing this popup
            }
            
            // Then check for data-stay-open attribute using type assertion
            const props = content.props as Record<string, any>;
            if (props && props['data-stay-open'] === 'true') {
              debug('Found modal with data-stay-open attribute, keeping it open during fallback');
              return; // Skip removing this popup
            }
            
            // Check for stayOpenOnFallback prop
            if (props && props.stayOpenOnFallback === true) {
              debug('Found modal with stayOpenOnFallback prop, keeping it open during fallback');
              return; // Skip removing this popup
            }
          }
        }
        
        // Remove the popup if no stayOpenOnFallback flag was found
        state.removePopup(popup.id);
      } catch (error) {
        logger.error('Error checking modal:', error);
        // If there's an error, default to removing the popup
        state.removePopup(popup.id);
      }
    });
  }

  /**
   * Deactivates fallback mode and attempts to return to previous state
   */
  public deactivateFallback(): void { // This is the public one called by App.tsx or similar
    const currentStartupPhase = useStore.getState().currentPhase;
    logger.warn(
      `Public deactivateFallback CALLED. CurrentPhase: '${currentStartupPhase}', Current Internal State: isActive=${this.state.isActive}, reason=${this.state.reason}`,
      new Error().stack // Log stack trace
    );

    if (!this.state.isActive || this.state.isRecovering) { // Prevent if not active or already processing a recovery/deactivation
      debug('Not in active fallback mode or already recovering/deactivating, ignoring deactivation request.');
      return;
    }
    
    this.state.isRecovering = true; // Mark that we are processing deactivation
    
    // Determine tab to restore to
    let tabToRestore: string | null = null;
    const store = useStore.getState();
    const starredTab = store.starredTab;
    const accessibleTabs = store.getVisibleTabs()
      .filter(tabId => tabId !== 'fallback' && store.hasTabAccess(tabId));

    if (starredTab && starredTab !== 'fallback' && store.hasTabAccess(starredTab)) {
      tabToRestore = starredTab;
      debug(`Deactivating (public): using starred tab: ${tabToRestore}`);
    } else if (accessibleTabs.length > 0) {
      tabToRestore = accessibleTabs[0];
      debug(`Deactivating (public): using first accessible tab: ${tabToRestore}`);
    } else {
      logger.warn('Deactivating (public): no suitable tab found to restore. Active tab will not be changed by this function.');
    }

    if (tabToRestore) {
      debug(`Deactivating (public): Restoring to tab: ${tabToRestore}`);
      // Use TabManager to handle the switch; use a distinct source
      tabManager.setActiveTab(tabToRestore, 'fallback_recovery'); // Changed source to fallback_recovery to match existing types
    }
    
    // Reset internal state and emit events, possibly after a short delay for tab change to propagate
    setTimeout(() => {
      this._resetFallbackStateAndEmitDeactivation(tabToRestore ?? undefined); // Pass undefined if null
      this.state.isRecovering = false; // Reset recovery flag after all processing
    }, 100);
  }

  /**
   * Resets internal fallback state, updates the global store, and emits deactivation event.
   * Does NOT handle changing the active tab itself.
   * @param nextActiveTabForEvent Optional tab ID to include in the deactivation event details.
   */
  private _resetFallbackStateAndEmitDeactivation(nextActiveTabForEvent?: string): void {
    // Reset local state
    this.state = {
      isActive: false,
      reason: null,
      activationTime: null,
      inRecoveryAttempt: false, // Should be reset by the caller (e.g., attemptRecovery)
      lastRecoveryAttempt: this.state.lastRecoveryAttempt, // Preserve last attempt time if set
      isRecovering: false // Should be reset by the caller
    };
    
    debug('Internal fallback state RESET during deactivation process.');
    
    // Update store state to reflect normal mode
    useStore.setState({
      isFallbackActive: false,
      fallbackReason: null
    });
    
    // Emit deactivation event
    this.emit('deactivate', {
      type: 'deactivate',
      timestamp: Date.now(),
      details: { nextActiveTab: nextActiveTabForEvent }
    });
    
    debug('Fallback deactivation state reset and event emission complete.');
  }

  /**
   * Execute the fallback chain to find a viable tab
   */
  public executeFallbackChain(): string {
    const store = useStore.getState();
    
    // Get list of accessible tabs (excluding fallback)
    const accessibleTabs = store.getVisibleTabs()
      .filter(tabId => tabId !== 'fallback' && store.hasTabAccess(tabId));
    
    debug(`Executing fallback chain - accessible tabs: ${accessibleTabs.join(', ')}`);
    
    // Try starred tab first if it exists and is accessible
    const starredTab = store.starredTab;
    if (starredTab && starredTab !== 'fallback' && store.hasTabAccess(starredTab)) {
      debug(`Using starred tab: ${starredTab}`);
      return starredTab;
    }
    
    // If we have any accessible tabs, use the first one
    if (accessibleTabs.length > 0) {
      const viableTab = accessibleTabs[0];
      debug(`Using first accessible tab: ${viableTab}`);
      return viableTab;
    }
    
    // If no accessible tabs found, activate fallback mode
    debug('No accessible tabs found, activating fallback');
    this.activateFallback('no_accessible_tabs');
    return 'fallback';
  }

  /**
   * Handle admin mode changes
   */
  public handleAdminModeChange(isAdmin: boolean): void {
    debug(`Admin mode changed to: ${isAdmin}`);
    
    // If entering admin mode, attempt recovery from fallback
    if (isAdmin && this.isActive()) {
      // Check if we're in a cooldown period
      const now = Date.now();
      const timeSinceLastRecovery = this.state.lastRecoveryAttempt 
        ? now - this.state.lastRecoveryAttempt 
        : Infinity;
      
      if (timeSinceLastRecovery < ADMIN_TRANSITION_COOLDOWN) {
        debug(`Admin mode recovery attempt too soon (${timeSinceLastRecovery}ms), waiting for cooldown`);
        
        // Schedule a delayed recovery attempt
        setTimeout(() => {
          debug('Executing delayed admin mode recovery attempt');
          this.attemptRecovery();
        }, ADMIN_TRANSITION_COOLDOWN - timeSinceLastRecovery);
        
        return;
      }
      
      // Attempt recovery immediately if cooldown has passed
      this.attemptRecovery();
    }
  }

  /**
   * Handle tab visibility changes without triggering recovery
   */
  public handleTabVisibilityChangeNoRecovery(tabId: string, visible: boolean): void {
    // Skip processing if not relevant to fallback state
    if (!this.state.isActive && visible) return;
    if (this.state.isActive && !visible && tabId !== 'fallback') return;
    
    const store = useStore.getState();
    const visibleTabs = store.getVisibleTabs();
    const activeTab = store.activeTab;
    
    debug(`Visibility change check - visible tabs: ${visibleTabs.join(', ')}, activeTab: ${activeTab}`);
    
    // REMOVED: No longer attempt recovery when a tab becomes visible
    
    // Handle a tab becoming invisible
    if (!visible) {
      // If all tabs are now invisible, activate fallback
      if (visibleTabs.length === 0 && !this.state.isActive) {
        debug('No visible tabs after visibility change, activating fallback');
        this.activateFallback('no_visible_tabs');
      }
      
      // If the active tab is no longer visible, switch to another tab
      if (activeTab && !visibleTabs.includes(activeTab)) {
        debug(`Current tab ${activeTab} no longer visible`);
        
        // Find the best tab to show
        const tabToShow = this.executeFallbackChain();
        
        if (tabToShow !== 'fallback') {
          debug(`Switching to viable tab: ${tabToShow}`);
          
          // Update active tab - use a valid source
          tabManager.setActiveTab(tabToShow, 'api');
        } else if (!this.state.isActive) {
          // No viable tabs, activate fallback
          debug('No viable tabs after visibility change, activating fallback');
          this.activateFallback('visibility_change_no_visible_tabs');
        }
      }
    }
  }

  /**
   * Check and activate fallback if needed
   * This can be called from outside the class to check fallback conditions
   */
  public checkAndActivateFallback(): void {
    // This method is now event-driven and not polled
    // It's kept for backwards compatibility but now simply checks state once
    
    const store = useStore.getState();
    const { activeTab } = store;
    const visibleTabs = store.getVisibleTabs();
    
    debug(`Checking fallback state - visible tabs: ${visibleTabs.join(', ')}, activeTab: ${activeTab}, isActive: ${this.state.isActive}`);
    
    // If no visible tabs and not already in fallback mode, activate it
    if (visibleTabs.length === 0) {
      if (!this.state.isActive) {
        debug('No visible tabs available, activating fallback');
        
        // Force update active tab to ensure UI consistency
        useStore.setState({ activeTab: 'fallback' });
        
        this.activateFallback('no_visible_tabs');
      }
      return;
    }
    
    // REMOVED: No longer attempt recovery when visible tabs become available
  }

  /**
   * Register a callback for when fallback mode is activated
   */
  public onActivate(callback: (reason: string) => void): () => void {
    return this.addEventListener('activate', (data) => {
      if (data.reason) {
        callback(data.reason);
      }
    });
  }

  /**
   * Register a callback for when fallback mode is deactivated
   */
  public onDeactivate(callback: () => void): () => void {
    return this.addEventListener('deactivate', () => {
      callback();
    });
  }

  /**
   * Check if fallback mode is active
   */
  public isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get the reason for fallback activation
   */
  public getReason(): string | null {
    return this.state.reason;
  }

  /**
   * Attempt to recover from fallback mode
   * This should ONLY be called when entering admin mode
   */
  public attemptRecovery(): boolean {
    // Skip if not in fallback mode
    if (!this.isActive()) {
      debug('Not in fallback mode, skipping recovery attempt');
      return false;
    }
    
    // Check if we're in a cooldown period
    const now = Date.now();
    const timeSinceLastRecovery = this.state.lastRecoveryAttempt 
      ? now - this.state.lastRecoveryAttempt 
      : Infinity;
    
    if (timeSinceLastRecovery < RECOVERY_COOLDOWN) {
      debug(`Recovery attempt too soon (${timeSinceLastRecovery}ms), waiting for cooldown`);
      
      // Schedule a delayed recovery attempt if this is an important recovery trigger
      const store = useStore.getState();
      const isAdminMode = store.isAdmin;
      
      if (isAdminMode) {
        debug('Important admin-triggered recovery, scheduling delayed attempt');
        
        setTimeout(() => {
          debug('Executing delayed recovery attempt');
          this.attemptRecovery();
        }, RECOVERY_COOLDOWN - timeSinceLastRecovery);
      }
      
      return false;
    }
    
    // Set recovery state to true to prevent race conditions
    this.state.isRecovering = true;
    
    // Update recovery attempt timestamp
    this.state.lastRecoveryAttempt = now;
    this.state.inRecoveryAttempt = true;
    
    // Emit recovery attempt event
    this.emit('recovery_attempt', {
      type: 'recovery_attempt',
      reason: this.state.reason || undefined, // Fix type mismatch
      timestamp: now
    });
    
    const store = useStore.getState();
    const isAdminMode = store.isAdmin;
    
    let targetTab: string | null = null;
    
    // Find the first accessible tab (non-fallback)
    const visibleTabs = store.getVisibleTabs().filter(id => id !== 'fallback' && store.hasTabAccess(id));
      
    if (visibleTabs.length > 0) {
      targetTab = visibleTabs[0];
      debug(`Recovery: using first accessible non-fallback tab ${targetTab}`);
    } else if (isAdminMode) {
        // In admin mode, if no regular tabs are visible/accessible, try to use admin tabs
      const adminTabs = store.getAdminTabs().filter(id => store.hasTabAccess(id)); // Ensure admin tabs are also accessible
      if (adminTabs.length > 0) {
        targetTab = adminTabs[0];
        debug(`Recovery: no regular tabs, using first accessible admin tab ${targetTab}`);
      }
    }
    
    // If we found a target tab, switch to it
    if (targetTab) {
      debug(`Recovery attempt: determined targetTab: ${targetTab}. Proceeding with switch.`);
      
      // 1. Change the tab using TabManager
      tabManager.handleFallbackRecovery(targetTab);
      
      // 2. Emit recovery success event
      this.emit('recovery_success', {
        type: 'recovery_success',
        timestamp: now,
        details: {
          targetTab,
          previousReason: this.state.reason || undefined
        }
      });
      
      // 3. Reset fallback state and emit deactivation.
      //    The setTimeout allows the tab change to propagate and UI to potentially update
      //    before we fully clear fallback flags and emit deactivation.
      setTimeout(() => {
        this._resetFallbackStateAndEmitDeactivation(targetTab ?? undefined); // Pass undefined if null
        // Ensure these are reset after all processing related to this recovery attempt
        this.state.inRecoveryAttempt = false; 
        this.state.isRecovering = false;
        debug('Recovery process fully complete.');
      }, 100); // Small delay consistent with previous logic
      
      return true;
    }
    
    // If we couldn't find a target tab, recovery failed
    this.emit('recovery_failure', {
      type: 'recovery_failure',
      reason: 'no_accessible_tabs',
      timestamp: now
    });
    
    // Reset recovery attempt state even on failure
    this.state.inRecoveryAttempt = false;
    this.state.isRecovering = false; // Also reset isRecovering flag
    // Even if recovery failed to find a tab, we might still be "deactivated" in the sense that we tried.
    // However, if no tab was found, the app remains in a potentially broken state.
    // Consider if _resetFallbackStateAndEmitDeactivation should be called here or if we should stay 'active'.
    // For now, keeping it as is: if no targetTab, we don't call _resetFallbackStateAndEmitDeactivation.
    // This means fallback remains technically "active" but without a successful recovery.
    debug('Recovery failed, fallback mode remains active.');
    return false;
  }

  /**
   * Change the active tab to fallback
   */
  private changeActiveTabToFallback(): void {
    const store = useStore.getState();
    const currentActiveTab = store.activeTab;
    
    if (currentActiveTab !== 'fallback') {
      debug(`Changing active tab from ${currentActiveTab} to fallback`);
      
      // Update active tab in store
      useStore.setState({
        activeTab: 'fallback'
      });
      
      // Dispatch tab change event for WebSocket and other components
      window.dispatchEvent(new CustomEvent('tab-changed', {
        detail: {
          oldTabId: currentActiveTab,
          newTabId: 'fallback',
          source: 'fallback_activation'
        }
      }));
    }
  }

  /**
   * Clean up resources when component unmounts
   */
  public cleanup(): void {
    // Skip if not initialized
    if (!this.isInitialized) {
      return;
    }
    
    debug('Cleaning up resources');
    
    // Execute all cleanup functions
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during cleanup:', error);
      }
    });
    
    // Clear cleanup functions
    this.cleanupFunctions = [];
    
    // Unsubscribe from store
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    
    // Clear all event listeners
    this.eventListeners.clear();
    
    // Mark as not initialized
    this.isInitialized = false;
  }

  /**
   * Get string representation of visible tabs for logging
   */
  private getVisibleTabsString(): string {
    const store = useStore.getState();
    const visibleTabs = store.getVisibleTabs();
    return visibleTabs.join(', ');
  }

  /**
   * Get current active tab
   */
  private getActiveTab(): string | null {
    const store = useStore.getState();
    return store.activeTab;
  }

  /**
   * Check if fallback mode is in recovery process
   */
  public isRecovering(): boolean {
    return this.state.isRecovering;
  }

  /**
   * Prepare for recovery initiated by the bootstrap process
   * This method is called by the bootstrap process when it detects
   * that we're recovering from a previous fallback state
   */
  public prepareForBootstrapRecovery(): void {
    debug('Preparing for bootstrap-initiated recovery');
    
    // Set the recovery flag to prevent race conditions
    this.state.isRecovering = true;
    
    // Emit event for components that need to prepare for recovery
    this.emit('prepare_recovery', {
      type: 'prepare_recovery',
      timestamp: Date.now(),
      details: { source: 'bootstrap' }
    });
  }
}

// Export singleton instance
export const fallbackManager = new FallbackManager(); 