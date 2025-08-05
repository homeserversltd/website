import { useStore } from '../store';
import { socketClient } from '../components/WebSocket/client';
import { getTabEvents } from '../components/WebSocket/config';
import { clearTabSubscriptions, addSubscription } from '../components/WebSocket/core/subscriptions';
import { SubscriptionType, WebSocketEventKey } from '../components/WebSocket/types';

// Types
interface TabChangeEventDetail {
  previousTabId?: string | null;
  newTabId: string;
  source: 'click' | 'websocket' | 'api' | 'store' | 'bootstrap' | 'fallback_recovery' | 'hash';
}

// Declare type for the global _homeServerState
declare global {
  interface Window {
    _homeServerState: {
      activeTab?: string;
      [key: string]: any;
    };
  }
}

/**
 * TabManager - Central utility for handling tab changes
 * 
 * This utility is the dedicated tab management system for the application.
 * It handles all tab-related operations including:
 * - Tab initialization from bootstrap
 * - Tab changes from user interaction
 * - Tab changes from WebSocket events
 * - Tab subscription management
 * - Tab visibility management
 * 
 * TabManager defers actual state management to the Zustand store,
 * which serves as the single source of truth.
 */
class TabManager {
  private debug = true;
  private lastActiveTab: string | null = null;
  private isUpdating = false; // Lock to prevent recursive updates
  private initialTabId: string | null = null; // Track the initial tab from bootstrap
  private processingEventId: string | null = null; // Track the current event being processed
  private recentEvents = new Set<string>(); // Track recent events to prevent duplicates
  private debounceTimer: NodeJS.Timeout | null = null; // For debouncing tab changes
  private debounceDelay = 50; // ms
  
  constructor() {
    // Initialize global state if not already present
    if (typeof window !== 'undefined') {
      window._homeServerState = window._homeServerState || {};
    }
    
    // this.log('TabManager initialized');
  }
  
  /**
   * Log a message if debug is enabled
   */
  private log(message: string): void {
    if (this.debug) {
      // console.log(`[TabManager] ${message}`);
    }
  }
  
  /**
   * Generate a unique event ID for tracking
   */
  private generateEventId(tabId: string, source: string): string {
    return `${tabId}-${source}-${Date.now()}`;
  }
  
  /**
   * Check if an event is already being processed
   */
  private isEventBeingProcessed(eventId: string): boolean {
    return this.processingEventId === eventId || this.recentEvents.has(eventId);
  }
  
  /**
   * Track an event as being processed
   */
  private trackEvent(eventId: string): void {
    this.processingEventId = eventId;
    this.recentEvents.add(eventId);
    
    // Clean up old events after a delay
    setTimeout(() => {
      this.recentEvents.delete(eventId);
    }, 500); // Keep events for 500ms to prevent duplicates
  }
  
  /**
   * Set the active tab
   * This is the main entry point for tab changes from any source
   */
  public setActiveTab(
    tabId: string, 
    source: 'click' | 'websocket' | 'api' | 'store' | 'hash' | 'bootstrap' | 'fallback_recovery' = 'click'
  ): void {
    // Skip debouncing for certain sources that need immediate action
    if (source === 'bootstrap' || source === 'fallback_recovery' || source === 'store') {
      this._setActiveTab(tabId, source);
      return;
    }
    
    // Generate a unique event ID for this tab change
    const eventId = `${tabId}-${source}-${Date.now()}`;
    
    // Clear any existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    // Set a new debounce timer
    this.debounceTimer = setTimeout(() => {
      this._setActiveTab(tabId, source, eventId);
      this.debounceTimer = null;
    }, this.debounceDelay);
  }
  
  /**
   * Internal implementation of setActiveTab that handles the actual tab change
   * @private
   */
  private _setActiveTab(
    tabId: string, 
    source: 'click' | 'websocket' | 'api' | 'store' | 'hash' | 'bootstrap' | 'fallback_recovery' = 'click',
    eventId?: string
  ): void {
    // Generate a unique event ID for this tab change if not provided
    const actualEventId = eventId || `${tabId}-${source}-${Date.now()}`;
    
    // Get current active tab from store
    const currentActiveTab = useStore.getState().activeTab;

    // this.log(`Attempting to set active tab to: ${tabId} (current store tab: ${currentActiveTab}), source: ${source}, eventId: ${actualEventId}`);
    
    // Skip if already on this tab to prevent circular updates
    if (currentActiveTab === tabId) {
      // this.log(`Tab ${tabId} is already active in the store, skipping further processing for event ${actualEventId}.`);
      return;
    }
    
    // Skip if we're already processing this event
    if (this.processingEventId === actualEventId) {
      // this.log(`Already processing event ${actualEventId}, skipping duplicate`);
      return;
    }
    
    // Skip if we've recently processed this exact event
    if (this.recentEvents.has(actualEventId)) {
      // this.log(`Recently processed event ${actualEventId}, skipping duplicate`);
      return;
    }
    
    // Add to recent events and set as processing
    this.recentEvents.add(actualEventId);
    this.processingEventId = actualEventId;
    
    // Clean up recent events after a delay
    setTimeout(() => {
      this.recentEvents.delete(actualEventId);
    }, 1000);
    
    // this.log(`setActiveTab called with tabId: ${tabId}, source: ${source}, eventId: ${actualEventId}`);
    
    try {
      this.lastActiveTab = currentActiveTab;
      
      // 1. Update the global state object for backward compatibility
      if (typeof window !== 'undefined') {
        window._homeServerState = window._homeServerState || {};
        window._homeServerState.activeTab = tabId;
      }
      
      // 2. Clean up subscriptions for the previous tab
      if (currentActiveTab && currentActiveTab !== tabId) {
        this.cleanupTabSubscriptions(currentActiveTab);
      }
      
      // 3. Dispatch events to notify components
      this.dispatchTabChangeEvent(tabId, currentActiveTab, source);
      
      // 4. Update the store state - SINGLE SOURCE OF TRUTH
      this.updateStoreState(tabId);
      
      // 5. Set up subscriptions for the new tab
      this.setupTabSubscriptions(tabId);
      
      // 6. If change originated from UI or API, notify WebSocket
      // Skip if source is websocket to avoid circular updates
      if (source !== 'websocket' && socketClient.getActiveTab() !== tabId) {
        this.updateWebSocketActiveTab(tabId);
      }
    } catch (error) {
      // console.error(`[TabManager] Error setting active tab: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Clear processing flag
      if (this.processingEventId === actualEventId) {
        this.processingEventId = null;
      }
    }
  }
  
  /**
   * Get the current active tab
   */
  public getActiveTab(): string | null {
    // Always use the store as the single source of truth
    return useStore.getState().activeTab;
  }
  
  /**
   * Get the initial tab from bootstrap
   */
  public getInitialTab(): string | null {
    return this.initialTabId;
  }
  
  /**
   * Update the store state with the new active tab
   */
  private updateStoreState(tabId: string): void {
    try {
      const store = useStore.getState();
      const currentStoreTab = store.activeTab;
      // this.log(`updateStoreState: Requested tabId is '${tabId}'. Current store.activeTab is '${currentStoreTab}'.`);
      
      // Only update if different to prevent unnecessary renders
      if (currentStoreTab !== tabId) {
        // this.log(`updateStoreState: Updating store.activeTab from '${currentStoreTab}' to '${tabId}'.`);
        store.setActiveTab(tabId);
        // this.log(`updateStoreState: Store.activeTab successfully updated to '${tabId}'.`);
      } else {
        // this.log(`updateStoreState: Store.activeTab ('${currentStoreTab}') already matches requested tabId ('${tabId}'), no actual store update performed by this call.`);
      }
    } catch (error) {
      // this.log(`Error updating store state: ${error}`);
    }
  }
  
  /**
   * Update the WebSocket active tab
   */
  private updateWebSocketActiveTab(tabId: string): void {
    try {
      socketClient.setActiveTab(tabId);
      // this.log(`WebSocket active tab updated to ${tabId}`);
    } catch (error) {
      // this.log(`Error updating WebSocket active tab: ${error}`);
    }
  }
  
  /**
   * Dispatch a tab change event
   */
  private dispatchTabChangeEvent(
    newTabId: string,
    previousTabId: string | null,
    source: 'click' | 'websocket' | 'api' | 'store' | 'bootstrap' | 'fallback_recovery' | 'hash'
  ): void {
    try {
      // Ensure newTabId is valid
      if (!newTabId) {
        // this.log(`Cannot dispatch tab-changed event with undefined/null newTabId`);
        return;
      }
      
      // Create event with validated details
      const eventDetail: TabChangeEventDetail = {
        previousTabId: previousTabId || null,
        newTabId,
        source
      };
      
      // Log the event details for debugging
      // this.log(`Dispatching tab-changed event: ${JSON.stringify(eventDetail)}`);
      
      const event = new CustomEvent('tab-changed', {
        detail: eventDetail
      });
      
      window.dispatchEvent(event);
      // this.log(`Dispatched tab-changed event from ${previousTabId || 'null'} to ${newTabId}`);
    } catch (error) {
      // this.log(`Error dispatching tab change event: ${error}`);
    }
  }
  
  /**
   * Dispatch a clear tablet cache event
   */
  private dispatchClearTabletCache(tabId: string): void {
    try {
      const event = new CustomEvent('clear-tablet-cache', {
        detail: { tabId }
      });
      
      window.dispatchEvent(event);
      // this.log(`Dispatched clear-tablet-cache event for ${tabId}`);
    } catch (error) {
      // this.log(`Error dispatching clear tablet cache event: ${error}`);
    }
  }
  
  /**
   * Clean up subscriptions for a tab
   */
  private cleanupTabSubscriptions(tabId: string): void {
    try {
      // Get events for this tab
      const events = getTabEvents(tabId);
      
      if (events && events.length > 0) {
        // this.log(`Found ${events.length} events to clean up for tab ${tabId}: ${events.join(', ')}`);
        
        // Clear subscriptions for this tab's events
        clearTabSubscriptions(tabId);
      } else {
        // this.log(`No events to clean up for tab ${tabId}`);
      }
      
      // Emit tablet unmount event
      // this.log(`Emitting tablet-unmount event for tab: ${tabId}`);
      window.dispatchEvent(new CustomEvent('tablet-unmount', {
        detail: { tabId }
      }));
    } catch (error) {
      // this.log(`Error cleaning up tab subscriptions: ${error}`);
    }
  }
  
  /**
   * Set up subscriptions for a tab
   */
  private setupTabSubscriptions(tabId: string): void {
    try {
      // Get events for this tab
      const events = getTabEvents(tabId);
      
      if (events && events.length > 0) {
        // this.log(`Found ${events.length} events to set up for tab ${tabId}: ${events.join(', ')}`);
        
        // Add subscriptions for this tab's events
        events.forEach(event => {
          // Use socketClient.subscribe instead of addSubscription directly
          // Use a no-op callback that will be replaced by actual handlers in components
          socketClient.subscribe(event as WebSocketEventKey, () => {
            // This is intentionally empty as component-specific handlers will be added later
          }, SubscriptionType.STANDARD);
        });
      } else {
        // this.log(`No events to set up for tab ${tabId}`);
      }
    } catch (error) {
      // this.log(`Error setting up tab subscriptions: ${error}`);
    }
  }
  
  /**
   * Notifies the system about tab visibility changes
   * @param tabId The ID of the tab whose visibility changed
   * @param visible Whether the tab is now visible
   */
  public notifyVisibilityChange(tabId: string, visible: boolean): void {
    console.log(`[TabManager] Tab visibility changed - tabId: ${tabId}, visible: ${visible}`);
    
    // Dispatch an event that the App and other components can listen for
    window.dispatchEvent(new CustomEvent('visibility-changed', {
      detail: { tabId, visible }
    }));
  }
  
  /**
   * Handle tab change from an event
   * This method is called by the Events system when a websocket-tab-change event is received
   * @param oldTabId The ID of the old tab
   * @param newTabId The ID of the new tab
   * @param source The source of the tab change
   */
  public handleTabChangeFromEvent(
    oldTabId: string | null, 
    newTabId: string | null, 
    source: 'click' | 'websocket' | 'api' | 'store' | 'bootstrap' | 'fallback_recovery' | 'hash'
  ): void {
    // Skip if newTabId is null or undefined
    if (!newTabId) {
      // this.log(`Skipping tab change with undefined/null newTabId (source: ${source})`);
      return;
    }
    
    // Generate a unique event ID for this tab change
    const eventId = this.generateEventId(newTabId, source);
    
    // Check if this event is already being processed
    if (this.isEventBeingProcessed(eventId)) {
      // this.log(`Event ${eventId} is already being processed, skipping duplicate`);
      return;
    }
    
    // this.log(`Handling tab change from event: ${oldTabId} -> ${newTabId} (source: ${source})`);
    
    // Let the TabManager handle the tab change
    // This will trigger the appropriate subscription cleanup and setup
    this.setActiveTab(newTabId, source);
  }
  
  /**
   * Initialize the tab system from bootstrap result
   * This is the entry point for bootstrap to hand off control to TabManager
   * 
   * @param initialTabId The ID of the initial tab determined by bootstrap
   * @param options Additional options for initialization
   */
  public initializeFromBootstrap(
    initialTabId: string,
    options: { 
      skipStoreUpdate?: boolean,
      skipWebSocketUpdate?: boolean,
      source?: 'bootstrap' | 'fallback_recovery'
    } = {}
  ): void {
    // this.log(`Initializing from bootstrap with initial tab: ${initialTabId}`);
    
    // Store the initial tab ID
    this.initialTabId = initialTabId;
    
    // Update last active tab tracking
    this.lastActiveTab = initialTabId;
    
    // Update global state reference
    if (typeof window !== 'undefined') {
      window._homeServerState.activeTab = initialTabId;
    }
    
    // Update store state if not skipped
    if (!options.skipStoreUpdate) {
      this.updateStoreState(initialTabId);
    }
    
    // Update WebSocket active tab if not skipped
    if (!options.skipWebSocketUpdate) {
      this.updateWebSocketActiveTab(initialTabId);
    }
    
    // Set up subscriptions for the initial tab
    this.setupTabSubscriptions(initialTabId);
    
    // Dispatch custom event for other components that may be listening
    this.dispatchTabChangeEvent(
      initialTabId, 
      null, 
      options.source || 'bootstrap'
    );
    
    // this.log(`Tab system initialized with tab: ${initialTabId}`);
  }
  
  /**
   * Register the initial tab from bootstrap
   * @param tabId The ID of the initial tab determined by bootstrap
   * @deprecated Use initializeFromBootstrap instead
   */
  public registerInitialTab(tabId: string): void {
    // this.log(`Registering initial tab from bootstrap: ${tabId}`);
    
    // Update last active tab tracking
    this.lastActiveTab = tabId;
    
    // Update global state reference
    if (typeof window !== 'undefined') {
      window._homeServerState.activeTab = tabId;
    }
    
    // Store the initial tab ID
    this.initialTabId = tabId;
    
    // Dispatch custom event for other components that may be listening
    this.dispatchTabChangeEvent(tabId, null, 'bootstrap');
    
    // No need to update store state here as bootstrap already does that
  }
  
  /**
   * Handle recovery from fallback mode
   * This method is called when the system is recovering from fallback mode
   * @param targetTabId The tab ID to switch to after recovery
   */
  public handleFallbackRecovery(targetTabId: string): void {
    // this.log(`Handling fallback recovery to tab: ${targetTabId}`);
    
    // Skip debouncing for recovery
    this._setActiveTab(targetTabId, 'fallback_recovery');
    
    // Dispatch a custom event to notify components about the recovery
    // This event will trigger the tablet reload in the App component
    window.dispatchEvent(new CustomEvent('tablet-recovery', {
      detail: {
        targetTabId,
        previousTabId: 'fallback',
        source: 'fallback_recovery'
      }
    }));
    
    // this.log(`Fallback recovery complete, now on tab: ${targetTabId}`);
  }
}

// Export a singleton instance
export const tabManager = new TabManager();

// Custom hook to use the tab manager in React components
export const useTabManager = () => {
  return tabManager;
}; 