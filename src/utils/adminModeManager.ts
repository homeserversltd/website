/**
 * adminModeManager.ts
 * 
 * Manages admin mode state transitions and related tab accessibility
 * Handles tab visibility and accessibility during admin mode changes
 */

import { useStore } from '../store';
import { tabManager } from './tabManager';
import { fallbackManager } from './fallbackManager';
import { socketClient } from '../components/WebSocket/client';
import { WebSocketEventKey, SubscriptionType } from '../components/WebSocket/types';
import { 
  ADMIN_EVENTS, 
  CORE_EVENTS, 
  EVENTS_WITHOUT_ADMIN_FIELDS,
  isAdminEvent 
} from '../components/WebSocket/config';
import { debug, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('AdminModeManager');

interface AdminState {
  isAdmin: boolean;
  transitionTime: number | null;
  isTransitioning: boolean;
}

class AdminModeManager {
  private state: AdminState = {
    isAdmin: false,
    transitionTime: null,
    isTransitioning: false
  };

  // Add a minimum time between transitions (in milliseconds)
  private readonly TRANSITION_COOLDOWN = 1000;
  
  // Event emitter system
  private eventListeners: Map<AdminEventType, Set<AdminEventListener>> = new Map();
  
  // Add a timeout reference for debouncing executeTransition
  private transitionTimeout: NodeJS.Timeout | null = null;

  // Add a timeout reference for the tab setting logic in handleAdminModeExit
  private exitModeTabSetTimeout: NodeJS.Timeout | null = null;

  private cleanupFunctions: Array<() => void> = [];

  // Properties for event categorization are no longer needed here as SubscriptionManager will handle it.
  // private get regularEventsWithAdminFields(): WebSocketEventKey[] { ... }
  // private get regularEventsWithoutAdminFields(): WebSocketEventKey[] { ... }
  // private get adminOnlyEvents(): WebSocketEventKey[] { ... }

  /**
   * Initialize admin mode manager
   */
  public initialize(): void {
    debug('Initializing');
    
    // Set up store subscription
    this.setupStoreSubscription();
    
    // Set up event listeners - this part can remain if it handles non-subscription events
    this.setupEventListeners();
    
    // Log the event categorization for debugging - remove as properties are removed
    // debug('Regular events with admin fields:', this.regularEventsWithAdminFields);
    // debug('Regular events without admin fields:', this.regularEventsWithoutAdminFields);
    // debug('Admin-only events:', this.adminOnlyEvents);
    
    // Expose the instance on window for debugging and cross-module access
    if (typeof window !== 'undefined') {
      (window as any).adminModeManager = this;
    }
  }

  /**
   * Set up store subscription for state changes
   */
  private setupStoreSubscription(): void {
    const store = useStore.getState();
    this.state.isAdmin = store.isAdmin;

    // Track previous state for WebSocket admin authentication conditions
    let prevIsAdmin = store.isAdmin;
    let prevAdminToken = store.adminToken;
    let prevWebSocketStatus = store.status; // Assuming 'status' is from websocketSlice
    let prevIsWebSocketAdminAuthenticated = store.isWebSocketAdminAuthenticated;

    // Subscribe to store changes
    useStore.subscribe((currentState) => {
      // Original logic for admin mode change
      if (currentState.isAdmin !== this.state.isAdmin) {
        this.processAdminModeChangeFromStore(currentState.isAdmin);
      }

      // New logic for WebSocket admin authentication
      const { 
        isAdmin: currentIsAdmin, 
        adminToken: currentAdminToken, 
        status: currentWebSocketStatus, // from websocketSlice
        isWebSocketAdminAuthenticated: currentIsWebSocketAdminAuthenticated // from adminSlice
      } = currentState;

      const conditionsMetNow = 
        currentIsAdmin && 
        currentAdminToken && 
        currentWebSocketStatus === 'connected' && 
        !currentIsWebSocketAdminAuthenticated;

      const conditionsMetPreviously = 
        prevIsAdmin && 
        prevAdminToken && 
        prevWebSocketStatus === 'connected' && 
        !prevIsWebSocketAdminAuthenticated;

      if (conditionsMetNow && !conditionsMetPreviously) {
        debug('Conditions for WebSocket admin authentication met. Initiating...');
        socketClient.authenticateAsAdmin(currentAdminToken as string); // Type assertion as adminToken will be non-null if conditionsMetNow is true
      } else if (conditionsMetNow && conditionsMetPreviously) {
        // This case means conditions were already met and nothing changed to re-trigger.
        // debug('Conditions for WebSocket admin authentication remain met, no new action needed.');
      } else if (!conditionsMetNow && conditionsMetPreviously) {
        debug('Conditions for WebSocket admin authentication no longer met.');
      }


      // Update previous state trackers
      prevIsAdmin = currentIsAdmin;
      prevAdminToken = currentAdminToken;
      prevWebSocketStatus = currentWebSocketStatus;
      prevIsWebSocketAdminAuthenticated = currentIsWebSocketAdminAuthenticated;
    });
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Admin mode toggle event listener
    // const adminModeHandler = (event: Event) => {
    //   const customEvent = event as CustomEvent;
    //   const isAdmin = customEvent.detail?.isAdmin ?? false;
    //   
    //   debug(`Admin mode change detected via window event: ${isAdmin}`);
    //   this.handleAdminModeChange(isAdmin);
    // };
    
    // Listen for admin mode toggle events
    // window.addEventListener('admin_mode_toggle', adminModeHandler);
    
    // Store cleanup function
    // this.cleanupFunctions.push(() => {
    //   window.removeEventListener('admin_mode_toggle', adminModeHandler);
    // });
  }

  /**
   * Handle admin mode changes -- Renamed to processAdminModeChangeFromStore
   * This will be called by the store subscription
   */
  public processAdminModeChangeFromStore(isAdmin: boolean): void {
    debug(`processAdminModeChangeFromStore CALLED. Requested isAdmin: ${isAdmin}. Current internal state isAdmin: ${this.state.isAdmin}, isTransitioning: ${this.state.isTransitioning}`);

    // Skip if already in the requested state
    if (this.state.isAdmin === isAdmin) {
      debug(`processAdminModeChangeFromStore: Current state this.state.isAdmin (${this.state.isAdmin}) ALREADY MATCHES requested isAdmin (${isAdmin}). Skipping.`);
      return;
    }

    // Skip if already in a transition
    if (this.state.isTransitioning) {
      debug(`processAdminModeChangeFromStore: Transition already in progress (this.state.isTransitioning is ${this.state.isTransitioning}), ignoring request to change to ${isAdmin}.`);
      return;
    }

    // Check if we're trying to transition too quickly
    const now = Date.now();
    const timeSinceLastTransition = this.state.transitionTime ? now - this.state.transitionTime : Infinity;
    
    if (timeSinceLastTransition < this.TRANSITION_COOLDOWN) {
      debug(`processAdminModeChangeFromStore: Transition requested too soon (${timeSinceLastTransition}ms since last transition), debouncing`);
      
      // Clear any existing timeout
      if (this.transitionTimeout) {
        clearTimeout(this.transitionTimeout);
      }
      
      // Schedule the transition after the cooldown
      this.transitionTimeout = setTimeout(() => {
        debug(`processAdminModeChangeFromStore: Executing debounced transition to ${isAdmin}`);
        this.executeTransition(isAdmin);
      }, this.TRANSITION_COOLDOWN - timeSinceLastTransition);
      
      return;
    }
    
    // Execute the transition immediately if cooldown has passed
    this.executeTransition(isAdmin);
  }

  /**
   * Public-facing method to handle admin mode changes.
   * This allows us to trace if it's called externally.
   */
  public handleAdminModeChange(isAdmin: boolean): void {
    this.processAdminModeChangeFromStore(isAdmin);
  }

  /**
   * Execute the actual admin mode transition
   */
  private executeTransition(isAdmin: boolean): void {
    debug(`ENTERING executeTransition. Requested isAdmin: ${isAdmin}. Current internal state isAdmin: ${this.state.isAdmin}, isTransitioning: ${this.state.isTransitioning}`);
    
    // Clear any pending tab set from a previous exit operation
    if (this.exitModeTabSetTimeout) {
      clearTimeout(this.exitModeTabSetTimeout);
      this.exitModeTabSetTimeout = null;
      debug('Cleared pending exitModeTabSetTimeout.');
    }

    // Mark as transitioning
    this.state.isTransitioning = true;
    
    const store = useStore.getState();
    
    // Store current tab before transition
    // if (!isAdmin) {
    //   this.state.lastActiveTab = currentTab;
    // }

    // Update state
    this.state.isAdmin = isAdmin;
    this.state.transitionTime = Date.now();

    // Update socket client admin state
    socketClient.setIsAdmin(isAdmin);

    // When exiting admin mode
    if (!isAdmin) {
      debug(`executeTransition: Condition !isAdmin is TRUE. Calling handleAdminModeExit(). Current internal isAdmin state: ${this.state.isAdmin}`);
      this.handleAdminModeExit();
    } else {
      // When entering admin mode
      debug(`executeTransition: Condition !isAdmin is FALSE. Calling handleAdminModeEntry(). Current internal isAdmin state: ${this.state.isAdmin}`);
      this.handleAdminModeEntry();
    }

    // Emit admin mode change event
    this.emit('admin_mode_changed', {
      type: 'admin_mode_changed',
      isAdmin,
      timestamp: Date.now()
    });
    
    // Clear transition state after a short delay to ensure all state updates have propagated
    setTimeout(() => {
      this.state.isTransitioning = false;
      debug(`Transition to ${isAdmin ? 'admin' : 'non-admin'} mode completed`);
    }, 500);
  }

  /**
   * Handle exiting admin mode
   */
  private handleAdminModeExit(): void {
    const store = useStore.getState();
    const currentActiveTabBeforeExit = store.activeTab; // Capture current tab
    
    // First, handle subscription changes to prevent race conditions
    this.handleSubscriptionsForAdminExit(); // This will now mostly log intentions
    
    // Clear any existing timeout before setting a new one
    if (this.exitModeTabSetTimeout) {
      clearTimeout(this.exitModeTabSetTimeout);
    }

    // Wait a short time for visibility state and subscription changes to propagate fully
    this.exitModeTabSetTimeout = setTimeout(() => {
      // Re-fetch visible tabs here as a final check, store.isAdmin is now false
      const currentVisibleNonAdminTabs = store.getVisibleTabs();

      if (currentVisibleNonAdminTabs.length === 0) {
        debug('No visible non-admin tabs after admin exit, activating fallback.');
        fallbackManager.activateFallback('admin_mode_no_visible_tabs');
        return;
      }

      let nextTabId: string | null = null;

      // Prioritize current tab if it's still accessible
      if (
        currentActiveTabBeforeExit &&
        currentActiveTabBeforeExit !== 'fallback' && // Ensure it's not the fallback tab itself
        currentVisibleNonAdminTabs.includes(currentActiveTabBeforeExit) &&
        store.hasTabAccess(currentActiveTabBeforeExit)
      ) {
        nextTabId = currentActiveTabBeforeExit;
        debug(`Current tab '${nextTabId}' is still accessible. Staying on it.`);
      } else {
        if (currentActiveTabBeforeExit && currentActiveTabBeforeExit !== 'fallback') {
          debug(`Current tab '${currentActiveTabBeforeExit}' is no longer accessible or was fallback. Determining next eligible tab.`);
        } else {
          debug('Determining next eligible tab upon admin exit (no valid current tab or current was fallback).');
        }
        nextTabId = store.getEligibleStarredTab(currentVisibleNonAdminTabs);
        debug(`Determined next eligible tab (starred, first visible, or fallback): ${nextTabId}`);
      }
      
      if (nextTabId) {
        tabManager.setActiveTab(nextTabId, 'store');
      } else {
        // This case should ideally be covered by getEligibleStarredTab returning 'fallback'
        logger.error('Critical error: Could not determine next tab ID after admin exit. Activating fallback.');
        fallbackManager.activateFallback('admin_mode_next_tab_error');
        // Ensure activeTab is set to fallback in store if not already
        if (store.activeTab !== 'fallback') {
          tabManager.setActiveTab('fallback', 'store');
        }
      }
    }, 150); // Slightly increased delay to ensure all state updates settle
  }

  /**
   * Handle entering admin mode
   */
  private handleAdminModeEntry(): void {
    // First, handle subscription changes to prevent race conditions
    this.handleSubscriptionsForAdminEntry(); // This will now mostly log intentions
    
    // Check if we should recover from fallback
    if (fallbackManager.isActive()) {
      fallbackManager.attemptRecovery();
    }
  }

  /**
   * Handle subscriptions when exiting admin mode
   * This centralizes all subscription management to prevent race conditions
   */
  private handleSubscriptionsForAdminExit(): void {
    debug('Managing subscriptions for admin mode exit - (Responsibility of SubscriptionManager)');
    
    // Get all current admin subscriptions (logging for context, SubscriptionManager will query its own state)
    // const adminSubscriptions = socketClient.getAdminSubscriptions();
    // debug(`Current admin subscriptions (at start of exit, per socketClient): ${Array.from(adminSubscriptions).join(', ')}`);
    
    // const store = useStore.getState(); // Only needed if we were calling store methods directly
    
    // Step 1: Unsubscribe from admin-only events (Responsibility of SubscriptionManager)
    // const adminOnlyEvents = this.adminOnlyEvents; // SubscriptionManager will determine these
    debug('EXIT Step 1: Intention: Unsubscribe from admin-only events (Handled by SubscriptionManager)');
    // adminOnlyEvents.forEach(event => { ... socketClient.unsubscribe(event); ... });
    
    // Step 2: Unsubscribe from regular events with admin privileges (Responsibility of SubscriptionManager)
    // const regularEventsWithAdminFields = this.regularEventsWithAdminFields; // SubscriptionManager will determine these
    debug('EXIT Step 2: Intention: Unsubscribe from regular events with admin privileges (Handled by SubscriptionManager)');
    // regularEventsWithAdminFields.forEach(event => { ... socketClient.unsubscribe(event); ... });
    
    // Step 3: Clear admin-specific subscriptions from the store's internal tracking (Responsibility of SubscriptionManager)
    // if (store.clearSubscriptionsByType) { // This check is now redundant
    debug('EXIT Step 3: Intention: Clear admin-specific subscriptions from client-side store tracking (Handled by SubscriptionManager).');
      // store.clearSubscriptionsByType(SubscriptionType.ADMIN); // SubscriptionManager will manage its own slice
    // }
    
    // Step 4: Clear admin-level data from broadcast store
    // This might remain if AdminModeManager is responsible for this specific data cache, or move to SubscriptionManager if it's tied to admin subscriptions.
    // For now, assuming SubscriptionManager might handle this if it's tied to the lifecycle of admin data availability.
    // if (store.clearBroadcastData) { // This check is now redundant
    debug('EXIT Step 4: Clearing admin-level data from broadcast cache (Potentially SubscriptionManager or AdminModeManager if state-related).');
      // Original: store.clearBroadcastData(undefined, 'admin'); - If SubscriptionManager handles admin data related to subs, it should do this.
      // Let's assume SubscriptionManager will call this.
    // }
    
    // Step 5: Set up regular subscriptions for events that previously had admin fields (Responsibility of SubscriptionManager)
    debug('EXIT Step 5: Intention: Set up regular subscriptions for events that had admin fields (Handled by SubscriptionManager)');
    // this.setupRegularSubscriptions(regularEventsWithAdminFields, false, 'ExitTransition'); // This method will be gutted

    // Step 6: Ensure core events without admin fields are (re)subscribed for regular mode (Responsibility of SubscriptionManager)
    // const coreEventsWithoutAdminFields = CORE_EVENTS.filter(...) // SubscriptionManager will determine these
    // if (coreEventsWithoutAdminFields.length > 0) {
    debug('EXIT Step 6: Intention: Ensure regular subscriptions for core events without admin fields (Handled by SubscriptionManager)');
      // this.setupRegularSubscriptions(coreEventsWithoutAdminFields, true, 'ExitTransitionEssential'); // This method will be gutted
    // }
    debug('Completed managing intentions for subscriptions for admin mode exit.');
  }

  /**
   * Handle subscriptions when entering admin mode
   * This centralizes all subscription management to prevent race conditions
   */
  private handleSubscriptionsForAdminEntry(): void {
    debug('Managing subscriptions for admin mode entry - (Responsibility of SubscriptionManager)');
    
    // const store = useStore.getState(); // May not be needed here anymore
    
    // debug(`Current admin subscriptions (at start of entry, per socketClient): ${Array.from(socketClient.getAdminSubscriptions()).join(', ')}`);

    // const regularEventsWithAdminFields = this.regularEventsWithAdminFields; // SubscriptionManager will determine these
    
    // Step 1: Unsubscribe from regular events that will now have admin fields (Responsibility of SubscriptionManager)
    debug('ENTRY Step 1: Intention: Unsubscribe from regular versions of events that will get admin fields (Handled by SubscriptionManager)');
    // regularEventsWithAdminFields.forEach(event => { ... socketClient.unsubscribe(event); ... });
    
    // Step 2: Set up admin subscriptions for admin-enhanced regular events ONLY. (Responsibility of SubscriptionManager)
    // Admin-only events are deferred until WebSocket is fully authenticated (Handled by SubscriptionManager).
    debug('ENTRY Step 2: Intention: Set up admin subscriptions for admin-enhanced regular events (Handled by SubscriptionManager). Admin-only events deferred.');
    // this.setupAdminSubscriptions(regularEventsWithAdminFields, [], 'EntryTransition-EnhancedRegular'); // This method will be gutted
    
    debug('Completed managing intentions for initial subscriptions for admin mode entry.');
  }

  /**
   * Handle subscriptions after authentication
   * This method can be called by the authentication system to ensure
   * subscriptions are properly set up after authentication
   */
  public handleAuthenticationSubscriptions(): void {
    debug('Managing subscriptions after authentication');
    
    // Only proceed if we're in admin mode
    if (!this.state.isAdmin) {
      debug('Not in admin mode, skipping post-auth subscription setup');
      return;
    }
    
    // If we're in a transition, wait for it to complete before setting up subscriptions
    if (this.state.isTransitioning) {
      debug('Transition already in progress, waiting for completion before post-auth subscription setup');
      
      // Wait for transition to complete before setting up subscriptions
      setTimeout(() => {
        // Check if we're still in admin mode after the transition
        if (this.state.isAdmin && !this.state.isTransitioning) {
          debug('Transition completed, now setting up post-auth subscriptions');
          this.setupPostAuthSubscriptions();
        }
      }, 600); // Wait a bit longer than the transition completion timeout (500ms)
      
      return;
    }
    
    // If we're not in a transition, set up subscriptions immediately
    this.setupPostAuthSubscriptions();
  }
  
  /**
   * Set up subscriptions after authentication
   * This is a helper method for handleAuthenticationSubscriptions
   */
  private setupPostAuthSubscriptions(): void {
    // const isWsAdminAuthed = useStore.getState().isWebSocketAdminAuthenticated; // SubscriptionManager will check this

    // if (!isWsAdminAuthed) {
    //   logger.warn('setupPostAuthSubscriptions called, but WebSocket is NOT admin authenticated in store. Aborting (SubscriptionManager will handle).');
    //   return;
    // }
    
    debug('Intention: Set up admin-only event subscriptions post-authentication (Handled by SubscriptionManager).');
    // const adminOnlyEvents = this.adminOnlyEvents; // SubscriptionManager will determine these
    // this.setupAdminSubscriptions([], adminOnlyEvents, 'PostAuth-AdminOnly'); // This method will be gutted
  }

  /**
   * Set up regular subscriptions for events
   * @param events The events to subscribe to
   */
  private setupRegularSubscriptions(events: WebSocketEventKey[], isEssentialCore = false, context = 'UnknownContext'): void {
    // const store = useStore.getState(); // Not needed as this method is being gutted
    
    if (!events || events.length === 0) {
      // debug(`setupRegularSubscriptions (${context}): No events to process (Legacy log).`);
      return;
    }
    debug(`setupRegularSubscriptions (${context}): Intention for events:`, events);

    // events.forEach(event => {
    //   const handler = (data: any) => { ... };
    //   const subType = isEssentialCore ? SubscriptionType.CORE : SubscriptionType.STANDARD;
    //   if (store.subscribeToEvent) { store.subscribeToEvent(event, handler, subType); } 
    //   else { socketClient.subscribe(event, handler, subType); }
    // });
    
    // debug(`setupRegularSubscriptions (${context}): Finished processing regular subscriptions for context (Legacy log).`);
  }
  
  /**
   * Set up admin subscriptions for events
   * @param regularEvents Regular events that need admin privileges
   * @param adminOnlyEvents Admin-only events
   * @param context A string to identify the calling context for logging
   */
  private setupAdminSubscriptions(regularEvents: WebSocketEventKey[], adminOnlyEvents: WebSocketEventKey[], context = 'UnknownContext'): void {
    // const store = useStore.getState(); // Not needed as this method is being gutted
    // const isWsAdminAuthed = useStore.getState().isWebSocketAdminAuthenticated; // SubscriptionManager will check

    if ((!regularEvents || regularEvents.length === 0) && (!adminOnlyEvents || adminOnlyEvents.length === 0)) {
      // debug(`setupAdminSubscriptions (${context}): No events to process (Legacy log).`);
      return;
    }
    
    debug(`setupAdminSubscriptions (${context}): Intention for admin-enhanced events:`, regularEvents);
    debug(`setupAdminSubscriptions (${context}): Intention for admin-only events:`, adminOnlyEvents);

    // regularEvents.forEach(event => {
    //   const handler = (data: any) => { ... };
    //   if (store.subscribeToEvent) { store.subscribeToEvent(event, handler, SubscriptionType.ADMIN); } 
    //   else { socketClient.subscribe(event, handler, SubscriptionType.ADMIN); }
    // });
    
    // if (adminOnlyEvents && adminOnlyEvents.length > 0) {
    //   if (this.state.isAdmin && isWsAdminAuthed) {
    //     adminOnlyEvents.forEach(event => {
    //       const handler = (data: any) => { ... };
    //       if (store.subscribeToEvent) { store.subscribeToEvent(event, handler, SubscriptionType.ADMIN); } 
    //       else { socketClient.subscribe(event, handler, SubscriptionType.ADMIN); }
    //     });
    //   } else {
    //     logger.warn(`setupAdminSubscriptions (${context}): Conditions not met for admin-only events (Legacy log).`);
    //   }
    // }
    
    // debug(`setupAdminSubscriptions (${context}): Finished processing admin subscriptions for context (Legacy log).`);
  }
  
  /**
   * Emit event to listeners
   */
  private emit(event: AdminEventType, data: {
    type: AdminEventType;
    isAdmin?: boolean;
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
    window.dispatchEvent(new CustomEvent(`admin-${event}`, {
      detail: data
    }));
  }

  /**
   * Add event listener
   */
  public addEventListener(event: AdminEventType, listener: AdminEventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    
    return () => {
      this.eventListeners.get(event)?.delete(listener);
    };
  }

  /**
   * Check if admin mode is currently transitioning
   */
  public isTransitioning(): boolean {
    return this.state.isTransitioning;
  }

  /**
   * Get the current admin state
   */
  public isAdmin(): boolean {
    return this.state.isAdmin;
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear any pending transitions
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
    }
    
    // Clear any pending tab set from exit operation
    if (this.exitModeTabSetTimeout) {
      clearTimeout(this.exitModeTabSetTimeout);
      this.exitModeTabSetTimeout = null;
    }

    // Execute all cleanup functions
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    
    // Clear event listeners
    this.eventListeners.clear();
    
    debug('Cleaned up resources');
  }
}

// Types
type AdminEventType = 'admin_mode_changed';

type AdminEventListener = (data: {
  type: AdminEventType;
  isAdmin?: boolean;
  timestamp: number;
  details?: any;
}) => void;

// Export singleton instance
export const adminModeManager = new AdminModeManager(); 