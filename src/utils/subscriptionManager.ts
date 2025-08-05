import { useStore } from '../store';
import { WebSocketEventKey, SubscriptionType } from '../components/WebSocket/types';
import { socketClient } from '../components/WebSocket/client';
import { 
  ADMIN_EVENTS, 
  CORE_EVENTS, 
  EVENTS_WITHOUT_ADMIN_FIELDS,
  TAB_EVENT_MAP,
  isAdminEvent
} from '../components/WebSocket/config';
import { debug, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('SubscriptionManager');

interface MonitoredState {
  activeTab: string | null;
  isAdmin: boolean;
  isWebSocketAdminAuthenticated: boolean;
  status: string;
}

class SubscriptionManager {
  private static instance: SubscriptionManager;
  private isInitialized = false;
  private isEvaluating = false;

  // Store previous states to detect changes accurately
  private previousActiveTab: string | null = null;
  private previousIsAdmin = false;
  private previousIsWebSocketAdminAuthenticated = false;
  private previousWsStatus = '';

  private constructor() {
    debug('Constructor called');
  }

  public static getInstance(): SubscriptionManager {
    if (!SubscriptionManager.instance) {
      SubscriptionManager.instance = new SubscriptionManager();
    }
    return SubscriptionManager.instance;
  }

  public initialize(): void {
    if (this.isInitialized) {
      debug('Already initialized.');
      return;
    }
    debug('Initializing...');

    const initialState = useStore.getState();
    this.previousActiveTab = initialState.activeTab;
    this.previousIsAdmin = initialState.isAdmin;
    this.previousIsWebSocketAdminAuthenticated = initialState.isWebSocketAdminAuthenticated;
    this.previousWsStatus = initialState.status;

    // Basic subscription to all store changes.
    // handleStateChange will determine if the change is relevant.
    useStore.subscribe(this.handleStateChange.bind(this));

    this.isInitialized = true;
    debug('Initialized and subscribed to store changes.');
    this.evaluateSubscriptions(); // Initial evaluation
  }

  private handleStateChange(): void { // Takes no arguments, gets state internally
    const currentState = useStore.getState();
    
    const activeTabChanged = currentState.activeTab !== this.previousActiveTab;
    const isAdminChanged = currentState.isAdmin !== this.previousIsAdmin;
    const wsAdminAuthChanged = currentState.isWebSocketAdminAuthenticated !== this.previousIsWebSocketAdminAuthenticated;
    const wsStatusChanged = currentState.status !== this.previousWsStatus;

    if (activeTabChanged) {
      debug(`State change: activeTab from '${this.previousActiveTab}' to '${currentState.activeTab}'`);
    }
    if (isAdminChanged) {
      debug(`State change: isAdmin from '${this.previousIsAdmin}' to '${currentState.isAdmin}'`);
    }
    if (wsAdminAuthChanged) {
      debug(`State change: wsAdminAuth from '${this.previousIsWebSocketAdminAuthenticated}' to '${currentState.isWebSocketAdminAuthenticated}'`);
    }
    if (wsStatusChanged) {
      debug(`State change: wsStatus from '${this.previousWsStatus}' to '${currentState.status}'`);
    }
    
    // Check if any of the *monitored* states have changed compared to our internal previous trackers.
    if (activeTabChanged || isAdminChanged || wsAdminAuthChanged || wsStatusChanged) {
        debug('Relevant monitored state changed, re-evaluating subscriptions.');
        
        this.evaluateSubscriptions();

        // After evaluation, update the 'previous' trackers to reflect the state we just processed.
        this.previousActiveTab = currentState.activeTab;
        this.previousIsAdmin = currentState.isAdmin;
        this.previousIsWebSocketAdminAuthenticated = currentState.isWebSocketAdminAuthenticated;
        this.previousWsStatus = currentState.status;
    } else {
      // This log can be helpful to see if handleStateChange is being called unnecessarily
      // (e.g., due to changes in parts of the store SubscriptionManager doesn't directly care about for its logic trigger)
      debug('handleStateChange called, but no change detected in actively monitored fields.');
    }
  }
  
  private evaluateSubscriptions(): void {
    if (this.isEvaluating) {
      debug('Skipping re-entrant call to evaluateSubscriptions.');
      return;
    }
    this.isEvaluating = true;
    debug('Evaluating all subscription needs...');
    const { activeTab, isAdmin, isWebSocketAdminAuthenticated, status: wsStatus } = useStore.getState();

    // Log if WebSocket connection was just lost
    if (this.previousWsStatus === 'connected' && wsStatus !== 'connected') {
      debug('WebSocket connection lost. Subscription evaluation will proceed to clean up or defer subscriptions accordingly.');
    }

    // TODO: Determine the full desired set of subscriptions based on current state
    // TODO: Compare with actual subscriptions (from a simplified SubscriptionSlice or core/subscriptions.ts)
    // TODO: Issue subscribe/unsubscribe commands
    // TODO: Update SubscriptionSlice with the new ground truth

    try {
      this.manageCoreSubscriptions(wsStatus);
      this.manageTabSubscriptions(this.previousActiveTab, activeTab, wsStatus); // Pass previous to handle cleanup and wsStatus
      this.manageAdminModeSubscriptions(isAdmin, isWebSocketAdminAuthenticated, wsStatus); // Pass wsStatus
    } finally {
      this.isEvaluating = false; // Ensure flag is reset even if an error occurs
    }
    
    // After tab and admin logic, potentially re-evaluate and consolidate.
    // For now, the individual handlers will manage their respective areas.
  }

  private manageCoreSubscriptions(wsStatus: string): void {
    debug(`Managing Core Subscriptions based on WebSocket status: ${wsStatus}`);
    if (wsStatus === 'connected') {
      debug('  WebSocket connected. Ensuring CORE_EVENTS are subscribed.');
      CORE_EVENTS.forEach(event => {
        if (!this.isSubscribed(event, SubscriptionType.CORE)) {
          debug(`    Subscribing to CORE event: ${event}`);
          // Bind the event name to the callback to know which event it is for
          useStore.getState().subscribeToCoreEvent(
            event, 
            (data) => this.genericCoreCallback(event, data),
            { isFeeder: true }
          );
        } else {
          debug(`    CORE event ${event} already subscribed.`);
        }
      });
    } else {
      debug('  WebSocket not connected. Ensuring CORE_EVENTS are unsubscribed/cleaned up.');
      const { subscriptions, unsubscribeFromEvent } = useStore.getState();
      CORE_EVENTS.forEach(event => {
        const coreSub = subscriptions.find(sub => sub.event === event && sub.type === SubscriptionType.CORE);
        if (coreSub) {
          debug(`    Unsubscribing from CORE event: ${event} (ID: ${coreSub.id})`);
          unsubscribeFromEvent(coreSub.id);
        } else {
          debug(`    CORE event ${event} not found in subscriptions, no need to unsubscribe.`);
        }
      });
    }
  }

  private manageTabSubscriptions(previousTab: string | null, currentTab: string | null, wsStatus: string): void {
    debug(`Managing Tab Subscriptions. Previous: '${previousTab}', Current: '${currentTab}', WebSocket Status: '${wsStatus}'`);
    const { subscribeToTabEvent, clearTabSubscriptions } = useStore.getState();

    if (wsStatus !== 'connected') {
      debug('  WebSocket not connected. Skipping tab subscription changes.');
      // Optional: If a tab was active and we disconnect, should we clear its subscriptions?
      // For now, we only manage subscriptions when connected.
      // If connection drops, core/admin will clean up. When it reconnects, evaluateSubscriptions will run.
      return;
    }

    // Unsubscribe from previous tab's events (if it's different from current and was not null)
    if (previousTab && previousTab !== currentTab) {
      const eventsToUnsubscribe = TAB_EVENT_MAP[previousTab] || [];
      if (eventsToUnsubscribe.length > 0) {
        debug(`  Unsubscribing from all events for previous tab '${previousTab}'.`);
        // This will internally call socketClient.clearTabSubscriptions and update subscriptionSlice state
        clearTabSubscriptions(previousTab);
      } else {
        debug(`  No specific events mapped for previous tab '${previousTab}', or tab had no subscriptions to clear via manager.`);
      }
    }

    // Subscribe to current tab's events (if it's not null)
    if (currentTab) {
      const eventsToSubscribe = TAB_EVENT_MAP[currentTab] || [];
      if (eventsToSubscribe.length > 0) {
        debug(`  Subscribing to events for current tab '${currentTab}':`, eventsToSubscribe);
        eventsToSubscribe.forEach(event => {
          // Check if already subscribed by the manager for this tab to avoid duplicate feeders.
          // Note: isSubscribed checks the store's state. If another part of the app subscribed,
          // this feeder will still be added, which is the desired behavior for SubscriptionManager's feeders.
          // We specifically check for a TAB type subscription. A CORE or ADMIN subscription for the same event name
          // should not prevent a TAB-specific feeder subscription.
          if (!this.isSubscribed(event as WebSocketEventKey, SubscriptionType.TAB, currentTab)) {
            debug(`    Subscribing to TAB event: ${event} for tab ${currentTab} as FEEDER`);
            useStore.getState().subscribeToEvent(
              event as WebSocketEventKey,
              // Bind event and tabId to the generic callback
              (data) => this.genericTabCallback(event as WebSocketEventKey, currentTab, data),
              SubscriptionType.TAB,
              currentTab,
              { isFeeder: true }
            );
          } else {
            debug(`    TAB event ${event} for tab ${currentTab} already has a subscription of type TAB. Manager won't add another feeder.`);
          }
        });
      } else {
        debug(`  No specific events mapped for current tab '${currentTab}'.`);
      }
    }
  }

  private manageAdminModeSubscriptions(isAdmin: boolean, isWsAdminAuthenticated: boolean, wsStatus: string): void {
    debug(`Managing Admin Mode Subscriptions. isAdmin: ${isAdmin}, isWsAdminAuthenticated: ${isWsAdminAuthenticated}, wsStatus: ${wsStatus}`);

    const regularAdminEnhanced = CORE_EVENTS.filter(event => 
      isAdminEvent(event as string) && !EVENTS_WITHOUT_ADMIN_FIELDS.includes(event)
    ) as WebSocketEventKey[];
    
    const adminOnlyEvents = ADMIN_EVENTS.filter(event => !CORE_EVENTS.includes(event)) as WebSocketEventKey[];

    const { subscribeToAdminEvent, subscribeToCoreEvent, unsubscribeFromEvent, clearBroadcastData, subscriptions } = useStore.getState();

    if (isAdmin) {
      // ENTERING ADMIN MODE or ALREADY IN ADMIN MODE
      
      // Unsubscribe from regular/core versions of admin-enhanced events
      regularAdminEnhanced.forEach(event => {
        const coreSub = subscriptions.find(sub => sub.event === event && sub.type === SubscriptionType.CORE);
        if (coreSub) {
          debug(`  Admin Mode: Unsubscribing from CORE version of '${event}' (ID: ${coreSub.id}).`);
          unsubscribeFromEvent(coreSub.id);
        }
      });
      
      // Subscribe to admin-enhanced versions of regular events
      regularAdminEnhanced.forEach(event => {
        if (!this.isSubscribed(event, SubscriptionType.ADMIN)) {
          debug(`  Admin Mode: Subscribing to admin-enhanced version of '${event}'.`);
          if (wsStatus === 'connected') {
            subscribeToAdminEvent(event, (data) => this.genericAdminCallback(event, data), { isFeeder: true });
          } else {
            debug(`  Admin Mode: WebSocket not connected, deferring admin-enhanced subscription for '${event}'.`);
          }
        }
      });

      if (isWsAdminAuthenticated) {
        debug('  Admin Mode & Authenticated: Subscribing to ADMIN_ONLY_EVENTS.');
        adminOnlyEvents.forEach(event => {
          // ADD LOGGING HERE for admin_disk_info
          let subscribedCheckResult = false; // Default to false
          if (event === 'admin_disk_info') {
            subscribedCheckResult = this.isSubscribed(event, SubscriptionType.ADMIN);
            debug(`Checking isSubscribed for ADMIN_ONLY event admin_disk_info: ${subscribedCheckResult}. Current subs:`, JSON.parse(JSON.stringify(useStore.getState().subscriptions)));
          }
          if (!this.isSubscribed(event, SubscriptionType.ADMIN)) { // Check 1
            debug(`    Subscribing to ADMIN_ONLY event: ${event}`);
            if (wsStatus === 'connected') { // Check 2
              if (event === 'admin_disk_info') {
                 debug(`Condition met, calling subscribeToAdminEvent for admin_disk_info.`);
              }
              subscribeToAdminEvent(event, (data) => this.genericAdminCallback(event, data), { isFeeder: true });
            } else {
              debug(`    Admin Mode & Authenticated: WebSocket not connected, deferring ADMIN_ONLY subscription for '${event}'.`);
            }
          }
        });
        // Also ensure admin-enhanced regular events are active if WS just got authenticated
        regularAdminEnhanced.forEach(event => {
          if (!this.isSubscribed(event, SubscriptionType.ADMIN)) {
            debug(`  Admin Mode & Authenticated: Ensuring admin-enhanced version of '${event}' is active by subscribing.`);
            if (wsStatus === 'connected') {
              subscribeToAdminEvent(event, (data) => this.genericAdminCallback(event, data), { isFeeder: true });
            } else {
              debug(`    Admin Mode & Authenticated: WebSocket not connected, deferring admin-enhanced subscription for '${event}'.`);
            }
          }
        });

      } else {
        debug('  Admin Mode but NOT Authenticated: Admin-only events deferred. Ensuring they are not subscribed if admin ws is not auth.');
        adminOnlyEvents.forEach(event => {
          const adminSub = subscriptions.find(sub => sub.event === event && sub.type === SubscriptionType.ADMIN);
          if (adminSub) {
            debug(`    Unsubscribing from ADMIN_ONLY event due to lack of WS auth: ${event} (ID: ${adminSub.id})`);
            unsubscribeFromEvent(adminSub.id);
          }
        });
      }
      
      // Ensure events without admin fields remain subscribed as CORE events
      EVENTS_WITHOUT_ADMIN_FIELDS.forEach(event => {
        if (CORE_EVENTS.includes(event) && !this.isSubscribed(event, SubscriptionType.CORE)) {
          debug(`  Admin Mode: Ensuring CORE event '${event}' (no admin fields) is subscribed.`);
          if (wsStatus === 'connected') {
            subscribeToCoreEvent(event, (data) => this.genericCoreCallback(event, data), { isFeeder: true });
          } else {
            debug(`  Admin Mode: WebSocket not connected, deferring CORE subscription for '${event}' (no admin fields).`);
          }
        }
      });

    } else {
      // EXITING ADMIN MODE or ALREADY IN REGULAR MODE
      debug('  Regular Mode (Exiting Admin): Managing subscriptions.');

      // Unsubscribe from admin-only events
      adminOnlyEvents.forEach(event => {
        const adminSub = subscriptions.find(sub => sub.event === event && sub.type === SubscriptionType.ADMIN);
        if (adminSub) {
          // ADD LOGGING HERE for admin_disk_info
          if (event === 'admin_disk_info') {
            debug(`Attempting to unsubscribe from ADMIN_ONLY event admin_disk_info (ID: ${adminSub.id}). Current subs BEFORE:`, JSON.parse(JSON.stringify(subscriptions)));
          }
          unsubscribeFromEvent(adminSub.id);
          // ADD LOGGING HERE for admin_disk_info
          if (event === 'admin_disk_info') {
            debug(`Called unsubscribeFromEvent for admin_disk_info. Current subs AFTER:`, JSON.parse(JSON.stringify(useStore.getState().subscriptions)));
          }
        }
      });

      // Unsubscribe from admin-enhanced versions of regular events
      regularAdminEnhanced.forEach(event => {
        const adminSub = subscriptions.find(sub => sub.event === event && sub.type === SubscriptionType.ADMIN);
        if (adminSub) {
          debug(`  Regular Mode: Unsubscribing from admin-enhanced version of '${event}' (ID: ${adminSub.id}).`);
          unsubscribeFromEvent(adminSub.id);
        }
      });
      
      // Subscribe back to regular/core versions of previously admin-enhanced events
      regularAdminEnhanced.forEach(event => {
        if (!this.isSubscribed(event, SubscriptionType.CORE)) {
          debug(`  Regular Mode: Subscribing back to CORE version of '${event}'.`);
          if (wsStatus === 'connected') {
            subscribeToCoreEvent(event, (data) => this.genericCoreCallback(event, data), { isFeeder: true });
          } else {
            debug(`  Regular Mode: WebSocket not connected, deferring CORE subscription for '${event}'.`);
          }
        }
      });
      
      // Clear admin data from broadcast slice
      debug('  Regular Mode: Requesting cleanup of admin data in broadcastSlice.');
      clearBroadcastData(undefined, 'admin');
      
      // Ensure events without admin fields (essential core) are subscribed as CORE events
      EVENTS_WITHOUT_ADMIN_FIELDS.forEach(event => {
        if (CORE_EVENTS.includes(event) && !this.isSubscribed(event, SubscriptionType.CORE)) {
          debug(`  Regular Mode: Ensuring CORE event '${event}' (no admin fields) is subscribed.`);
          if (wsStatus === 'connected') {
            subscribeToCoreEvent(event, (data) => this.genericCoreCallback(event, data), { isFeeder: true });
          } else {
            debug(`  Regular Mode: WebSocket not connected, deferring CORE subscription for '${event}' (no admin fields).`);
          }
        }
      });
    }
  }

  private genericCoreCallback(event: WebSocketEventKey, data: any): void {
    debug(`Core event '${event}' received by genericCoreCallback, forwarding to handleWebSocketData.`);
    useStore.getState().handleWebSocketData(event, data, false);
  }

  // Added a similar generic callback for admin events for consistency and clarity
  private genericAdminCallback(event: WebSocketEventKey, data: any): void {
    debug(`Admin event '${event}' received by genericAdminCallback, forwarding to handleWebSocketData.`);
    useStore.getState().handleWebSocketData(event, data, true); // Assuming true for isAdmin flag for admin events
  }

  private genericTabCallback(event: WebSocketEventKey, tabId: string, data: any): void {
    debug(`Tab event '${event}' for tab '${tabId}' received by genericTabCallback, forwarding to handleWebSocketData.`);
    // Tab events are generally not admin events unless explicitly handled elsewhere.
    useStore.getState().handleWebSocketData(event, data, false);
  }

  private isSubscribed(event: WebSocketEventKey, type: SubscriptionType, tabId?: string): boolean {
    const { subscriptions } = useStore.getState();
    return subscriptions.some(sub => 
      sub.event === event && 
      sub.type === type && 
      (type === SubscriptionType.TAB ? sub.tabId === tabId : true)
    );
  }

}

// Export a singleton instance
export const subscriptionManager = SubscriptionManager.getInstance(); 