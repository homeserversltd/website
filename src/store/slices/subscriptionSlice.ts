import { StateCreator } from 'zustand';
import { WebSocketEventKey, WebSocketEventMap, SubscriptionType, SubscriptionInfo } from '../../components/WebSocket/types';
import { socketClient } from '../../components/WebSocket/client';
import { 
  ADMIN_EVENTS, 
  CORE_EVENTS, 
  EVENTS_WITHOUT_ADMIN_FIELDS,
  isAdminEvent,
  isValidCoreEvent
} from '../../components/WebSocket/config';
import { createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('SubscriptionSlice');

export interface ActiveSubscription {
  id: string;  // Unique ID for the subscription (event-type-tabId or event-callback)
  event: WebSocketEventKey;
  type: SubscriptionType;
  tabId?: string;
  createdAt: number;
  callbackId: string; // Reference to a callback ID
  isFeeder?: boolean; // Added to identify feeder subscriptions
  socketUnsubscribe?: () => void; // Stores the actual function to call for socket client cleanup
}

export interface SubscriptionCallbackEntry {
  id: string; // Unique ID for the callback
  callback: (data: any) => void;
  event: WebSocketEventKey;
  createdAt: number;
}

export interface SubscriptionSlice {
  // State
  subscriptions: ActiveSubscription[];
  callbacks: Record<string, SubscriptionCallbackEntry>;
  tabSubscriptions: Record<string, string[]>; // tabId -> subscription IDs

  // Actions - renamed to avoid conflicts
  subscribeToEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    type?: SubscriptionType,
    tabId?: string,
    options?: { isFeeder?: boolean }
  ) => () => void;
  
  unsubscribeFromEvent: (subscriptionId: string) => void;
  
  // Specialized Subscription Methods - renamed to avoid conflicts
  subscribeToCoreEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    options?: { isFeeder?: boolean }
  ) => () => void;
  
  subscribeToAdminEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    options?: { isFeeder?: boolean }
  ) => () => void;
  
  subscribeToTabEvent: <T extends WebSocketEventKey>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    tabId: string
  ) => () => void;
  
  // Tab Management
  clearTabSubscriptions: (tabId: string) => void;
  
  // Utility methods
  getSubscriptionsByTab: (tabId: string) => ActiveSubscription[];
  getSubscriptionsByEvent: (event: WebSocketEventKey) => ActiveSubscription[];
  getSubscriptionsStats: () => {
    totalCount: number;
    byTab: Record<string, number>;
    byEvent: Record<string, number>;
    byType: Record<string, number>;
  };

  // This function will be called by the subscription system when websocket data arrives
  handleWebSocketData: <T extends WebSocketEventKey>(event: T, data: WebSocketEventMap[T], isAdmin?: boolean) => void;

  // Clear subscriptions by type (useful for cleaning up when toggling admin mode)
  clearSubscriptionsByType: (type: SubscriptionType) => void;
}

// Add a type for store with broadcast data slice
type StoreWithBroadcast = SubscriptionSlice & {
  updateBroadcastData?: <T extends WebSocketEventKey>(event: T, data: WebSocketEventMap[T], mode: 'regular' | 'admin') => void;
  isAdmin?: boolean;
};

export const createSubscriptionSlice: StateCreator<StoreWithBroadcast, [], [], SubscriptionSlice> = (set, get) => ({
  // State
  subscriptions: [],
  callbacks: {},
  tabSubscriptions: {},

  // Generic subscribe method that all other methods will use - renamed to avoid conflicts
  subscribeToEvent: (event, callback, type = SubscriptionType.STANDARD, tabId, options) => {
    // Validate subscription type based on event configuration
    if (type === SubscriptionType.CORE && !isValidCoreEvent(event as string)) {
      logger.warn(`Event ${event} is not a valid core event, using standard subscription instead`);
      type = SubscriptionType.STANDARD;
    }
    
    if (type === SubscriptionType.ADMIN && !isAdminEvent(event as string)) {
      logger.warn(`Event ${event} is not a valid admin event, using standard subscription instead`);
      type = SubscriptionType.STANDARD;
    }
    
    // Check if we already have a subscription for this event and type
    const existingSubscriptions = get().subscriptions.filter(sub => 
      sub.event === event && sub.type === type && sub.tabId === tabId
    );

    // Generate unique IDs
    const callbackId = `callback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const subscriptionId = type === SubscriptionType.TAB 
      ? `${event}-${type}-${tabId}-${callbackId}`
      : `${event}-${type}-${callbackId}`;
    
    // Subscribe through socket client based on type
    let unsubFnFromSocketClient: () => void;
    
    switch (type) {
      case SubscriptionType.CORE:
        unsubFnFromSocketClient = socketClient.subscribeCoreEvent(event, callback);
        break;
      case SubscriptionType.ADMIN:
        unsubFnFromSocketClient = socketClient.subscribeAdminEvent(event, callback);
        break;
      case SubscriptionType.TAB:
        if (!tabId) {
          logger.error('Tab ID required for tab-specific subscriptions');
          return () => {
            logger.warn('No-op unsubscribe function returned due to missing tabId for event ' + event);
          }; // Updated no-op function with a warning
        }
        unsubFnFromSocketClient = socketClient.subscribeTabEvent(event, callback, tabId);
        break;
      default:
        // Standard subscription
        socketClient.on(event, callback);
        // For standard subscriptions, we need to tell the server we're interested.
        // For CORE, ADMIN, TAB, the respective socketClient methods handle this.
        socketClient.emit('subscribe', { type: event });
        
        // Define unsubscribe function
        unsubFnFromSocketClient = () => {
          socketClient.off(event, callback);
          socketClient.emit('unsubscribe', { type: event });
          // console.debug(`[SubscriptionSlice] Unsubscribed via socketClient.off and emitted 'unsubscribe' for '${event}' (standard unsubFn)`);
        };
    }
    
    // Store callback
    const callbackEntry: SubscriptionCallbackEntry = {
      id: callbackId,
      callback,
      event,
      createdAt: Date.now()
    };
    
    // Store subscription
    const subscription: ActiveSubscription = {
      id: subscriptionId,
      event,
      type,
      tabId,
      createdAt: Date.now(),
      callbackId,
      isFeeder: !!options?.isFeeder, // Set the isFeeder flag
      socketUnsubscribe: unsubFnFromSocketClient, // Store the actual socket client unsubscribe function
    };
    
    // Update state - immutably
    set(state => {
      // Update callbacks map
      let newCallbacks = state.callbacks;
      if (!options?.isFeeder) {
        newCallbacks = { 
          ...state.callbacks, 
          [callbackId]: callbackEntry 
        };
      }
      
      // Update active subscriptions array
      const newSubscriptions = [
        ...state.subscriptions,
        subscription
      ];
      
      // Update tab subscriptions if tabId provided
      let newTabSubscriptions = { ...state.tabSubscriptions };
      if (tabId) {
        const currentTabSubs = state.tabSubscriptions[tabId] || [];
        newTabSubscriptions = {
          ...newTabSubscriptions,
          [tabId]: [...currentTabSubs, subscriptionId]
        };
      }
      
      return {
        callbacks: newCallbacks,
        subscriptions: newSubscriptions,
        tabSubscriptions: newTabSubscriptions
      };
    });
    
    // Return unsubscribe function
    return () => {
      // This function is what a component's useEffect cleanup or SubscriptionManager's feeder cleanup would call.
      // It just tells the slice to handle the full unsubscription process.
      get().unsubscribeFromEvent(subscriptionId);
    };
  },
  
  // Specialized subscribe methods - renamed to avoid conflicts
  subscribeToCoreEvent: (event, callback, options) => {
    return get().subscribeToEvent(event, callback, SubscriptionType.CORE, undefined, options);
  },
  
  subscribeToAdminEvent: (event, callback, options) => {
    return get().subscribeToEvent(event, callback, SubscriptionType.ADMIN, undefined, options);
  },
  
  subscribeToTabEvent: (event, callback, tabId) => {
    return get().subscribeToEvent(event, callback, SubscriptionType.TAB, tabId);
  },
  
  // Unsubscribe method - renamed to avoid conflicts
  unsubscribeFromEvent: (subscriptionId) => {
    // Ensure we only process found subscriptions and do it once.
    const subscription = get().subscriptions.find(sub => sub.id === subscriptionId);
    
    if (!subscription) {
      // Don't log a warning for system_stats subscriptions during tab changes
      if (subscriptionId.includes('system_stats')) {
        // System stats subscription not found during unsubscribe, likely during tab change or reconnection
      } 
      // Don't log warnings for admin subscriptions during admin mode transitions
      else if (subscriptionId.includes('-admin-callback-')) {
        // Admin subscription not found during unsubscribe, likely during admin mode transition
      }
      else {
        // logger.warn(`Subscription ${subscriptionId} not found during unsubscribe`);
      }
      
      // Even if subscription isn't found in our state, still attempt cleanup in the socket client
      // This helps prevent subscription leaks during reconnections
      if (subscriptionId.includes('-')) {
        const [eventName] = subscriptionId.split('-');
        if (eventName) {
          try {
            // Check if this is a valid event before attempting to unsubscribe
            const isValidEvent = [...CORE_EVENTS, ...ADMIN_EVENTS].includes(eventName as any);
            
            if (isValidEvent) {
              // Attempt to unsubscribe from the event in the socket client directly
              socketClient.emit('unsubscribe', { type: eventName });
            }
          } catch (error) {
            // Error cleaning up missing subscription
          }
        }
      }
      return;
    }

    // Step 1: Perform the actual socket client unsubscription logic
    if (subscription.socketUnsubscribe) {
      try {
        subscription.socketUnsubscribe(); // This emits to network, calls socket.off(), etc.
      } catch (error) {
        logger.error(`Error during stored socketUnsubscribe for ${subscriptionId} (event: ${subscription.event}):`, error);
        // Fallback: Try direct unsubscribe as a safety net
        try {
          socketClient.unsubscribe(subscription.event);
        } catch (fallbackError) {
          logger.error(`Error during fallback unsubscribe for ${subscriptionId} (event: ${subscription.event}):`, fallbackError);
        }
      }
    } else {
      // If no stored unsubscribe function, try direct unsubscribe as fallback
      try {
        socketClient.unsubscribe(subscription.event);
      } catch (error) {
        logger.error(`Error during direct unsubscribe for ${subscriptionId} (event: ${subscription.event}):`, error);
      }
    }
    
    // Step 2: Clean up this slice's record of the subscription.
    // This part should only run if the subscription actually exists in the state to make it idempotent from a state perspective.
    set(state => {
      // Double-check if the subscription is still in the current state before filtering.
      // This handles cases where unsubscribeFromEvent might be called multiple times for the same ID.
      if (!state.subscriptions.some(sub => sub.id === subscriptionId)) {
        return state; // No change needed
      }
      
      const newSubscriptions = state.subscriptions.filter(sub => sub.id !== subscriptionId);
      
      // Get associated callback to remove
      const callbackIdToRemove = subscription.callbackId; // Use the callbackId from the subscription object we found
      const { [callbackIdToRemove]: _, ...remainingCallbacks } = state.callbacks;
      
      // Update tab subscriptions if tabId exists
      let newTabSubscriptions = { ...state.tabSubscriptions };
      if (subscription.tabId) {
        const tabId = subscription.tabId;
        if (state.tabSubscriptions[tabId]) { // Check if tabId exists in tabSubscriptions
          const currentTabSubs = state.tabSubscriptions[tabId];
          const updatedTabSubs = currentTabSubs.filter(id => id !== subscriptionId);
          
          if (updatedTabSubs.length === 0) {
            // If no subscriptions remain for this tab, remove the tab entry
            const { [tabId]: __, ...remainingTabSubsForSpread } = state.tabSubscriptions;
            newTabSubscriptions = remainingTabSubsForSpread;
          } else {
            newTabSubscriptions = {
              ...state.tabSubscriptions, // Ensure we start from the current state.tabSubscriptions
              [tabId]: updatedTabSubs
            };
          }
        }
      }
      
      return {
        subscriptions: newSubscriptions,
        callbacks: remainingCallbacks,
        tabSubscriptions: newTabSubscriptions
      };
    });
  },
  
  // Clear all subscriptions for a tab
  clearTabSubscriptions: (tabId) => {
    // Get all subscription IDs for this tab
    const tabSubscriptionIds = get().tabSubscriptions[tabId] || [];
    
    // Early return if no subscriptions exist
    if (tabSubscriptionIds.length === 0) {
      return;
    }
    
    // Clear tab subscriptions in socket client
    socketClient.clearTabSubscriptions(tabId); // This handles the socket.emit('unsubscribe', ...) for these events

    // Update state to remove all tab subscriptions
    set(state => {
      // Filter out subscriptions for this tab
      const newSubscriptions = state.subscriptions.filter(
        sub => sub.tabId !== tabId
      );
      
      // Get callbackIds to remove
      const callbackIdsToRemove = state.subscriptions
        .filter(sub => sub.tabId === tabId)
        .map(sub => sub.callbackId);
      
      // Create new callbacks object without the removed ones
      const newCallbacks = { ...state.callbacks };
      callbackIdsToRemove.forEach(id => {
        delete newCallbacks[id];
      });
      
      // Remove tab from tabSubscriptions
      const { [tabId]: _, ...remainingTabSubscriptions } = state.tabSubscriptions;
      
      return {
        subscriptions: newSubscriptions,
        callbacks: newCallbacks,
        tabSubscriptions: remainingTabSubscriptions
      };
    });
  },
  
  // Clear subscriptions by type (useful for cleaning up when toggling admin mode)
  clearSubscriptionsByType: (type) => {
    const subscriptionsOfType = get().subscriptions.filter(sub => sub.type === type);
    
    // Early return if no subscriptions exist
    if (subscriptionsOfType.length === 0) {
      return;
    }
    
    // For each subscription being cleared, call its socketUnsubscribe method
    subscriptionsOfType.forEach(sub => {
      if (sub.socketUnsubscribe) {
        try {
          sub.socketUnsubscribe();
        } catch (error) {
          logger.error(`Error during socketUnsubscribe for ${sub.id} (event: ${sub.event}) in clearSubscriptionsByType:`, error);
        }
      }
    });

    // Update state to remove all subscriptions of this type
    set(state => {
      // Filter out subscriptions by type
      const newSubscriptions = state.subscriptions.filter(
        sub => sub.type !== type
      );
      
      // Get callbackIds to remove
      const callbackIdsToRemove = subscriptionsOfType.map(sub => sub.callbackId);
      
      // Create new callbacks object without the removed ones
      const newCallbacks = { ...state.callbacks };
      callbackIdsToRemove.forEach(id => {
        delete newCallbacks[id];
      });
      
      // Update tabSubscriptions to remove references to these subscriptions
      const newTabSubscriptions = { ...state.tabSubscriptions };
      Object.entries(newTabSubscriptions).forEach(([tabId, subIds]) => {
        const subscriptionIdsToKeep = subIds.filter(
          id => !subscriptionsOfType.some(sub => sub.id === id)
        );
        newTabSubscriptions[tabId] = subscriptionIdsToKeep;
      });
      
      return {
        subscriptions: newSubscriptions,
        callbacks: newCallbacks,
        tabSubscriptions: newTabSubscriptions
      };
    });
  },
  
  // Utility methods
  getSubscriptionsByTab: (tabId) => {
    return get().subscriptions.filter(sub => sub.tabId === tabId);
  },
  
  getSubscriptionsByEvent: (event) => {
    return get().subscriptions.filter(sub => sub.event === event);
  },
  
  getSubscriptionsStats: () => {
    const subscriptions = get().subscriptions;
    
    // Initialize counters
    const byTab: Record<string, number> = {};
    const byEvent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    
    // Count subscriptions
    subscriptions.forEach(sub => {
      // Count by tab
      if (sub.tabId) {
        byTab[sub.tabId] = (byTab[sub.tabId] || 0) + 1;
      }
      
      // Count by event
      byEvent[sub.event] = (byEvent[sub.event] || 0) + 1;
      
      // Count by type
      byType[sub.type] = (byType[sub.type] || 0) + 1;
    });
    
    return {
      totalCount: subscriptions.length,
      byTab,
      byEvent,
      byType
    };
  },
  
  // Add a method to handle websocket data and store it in broadcast slice
  handleWebSocketData: <T extends WebSocketEventKey>(event: T, data: WebSocketEventMap[T], isAdmin = false) => {
    // Check if we have broadcast update function
    const updateBroadcastData = get().updateBroadcastData;
    const currentIsAdmin = get().isAdmin;
    
    // If we have broadcast slice, store the data
    if (updateBroadcastData) {
      // Determine if this should be stored as admin or regular data
      // Use the event configurations to make this decision
      const isAdminOnlyEvent = !CORE_EVENTS.includes(event) && ADMIN_EVENTS.includes(event);
      const hasAdminFields = isAdminEvent(event as string) && !EVENTS_WITHOUT_ADMIN_FIELDS.includes(event);
      
      // Store as admin data if:
      // 1. We're in admin mode, OR
      // 2. The isAdmin flag is set (for admin-specific callbacks), OR
      // 3. It's an admin-only event
      const mode = (currentIsAdmin || isAdmin || isAdminOnlyEvent) ? 'admin' : 'regular';
      
      // For events with admin fields, ensure we store the right data in the right place
      if (hasAdminFields && !currentIsAdmin && !isAdmin) {
        // If we're not in admin mode but the event has admin fields,
        // make sure we're only storing the regular data
        updateBroadcastData(event, data, 'regular');
      } else {
        // Otherwise store the data in the appropriate mode
        updateBroadcastData(event, data, mode);
      }
    }
    
    // Find all callbacks for this event
    const subscriptions = get().getSubscriptionsByEvent(event);
    
    // Call the callbacks
    subscriptions.forEach(subscription => {
      const callbackEntry = get().callbacks[subscription.callbackId];
      if (callbackEntry) {
        try {
          callbackEntry.callback(data);
        } catch (error) {
          logger.error(`Error calling callback for event ${event} (subscriptionId: '${subscription.id}', callbackId: '${subscription.callbackId}'):`, error);
        }
      } else {
        // If callback not found, check if it was an expected feeder subscription
        if (subscription.isFeeder) {
          // Feeder subscription correctly has no listener callback in map
        } else {
          logger.warn(`handleWebSocketData: Listener callback '${subscription.callbackId}' not found for subscription '${subscription.id}' (event '${event}')`);
        }
      }
    });
  }
}); 