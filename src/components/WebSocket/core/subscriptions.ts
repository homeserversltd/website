import { WebSocketEventMap, SubscriptionType, SubscriptionInfo } from '../types';
import { isValidCoreEvent, isAdminEvent } from '../config';
import { getSocket } from './socket';

// Subscription state
export const activeSubscriptions = new Set<string>();
export const subscriptionMeta = new Map<string, SubscriptionInfo>();
export const coreSubscriptions = new Set<string>();
export const adminSubscriptions = new Set<string>();
export const tabSubscriptions = new Map<string, Set<string>>();

// Event listeners tracking
export const eventListeners = new Map<string, Set<(data: any) => void>>();

/**
 * Add an event subscription based on its type
 */
export const addSubscription = <T extends keyof WebSocketEventMap>(
  event: T,
  type: SubscriptionType = SubscriptionType.STANDARD,
  tabId?: string
): void => {
  // Register event in appropriate collection based on type
  switch (type) {
    case SubscriptionType.CORE:
      // Validate that this is actually a core event
      if (!isValidCoreEvent(event)) {
        console.warn(`Attempted to subscribe to ${event} as core, but it's not a valid core event. Skipping add.`);
        return;
      }
      coreSubscriptions.add(event);
      break;
    case SubscriptionType.ADMIN:
      adminSubscriptions.add(event);
      break;
    case SubscriptionType.TAB:
      if (!tabId) {
        throw new Error('Tab ID is required for TAB subscription type');
      }
      if (!tabSubscriptions.has(tabId)) {
        tabSubscriptions.set(tabId, new Set());
      }
      tabSubscriptions.get(tabId)?.add(event);
      break;
  }
  
  // Add to active subscriptions set
  activeSubscriptions.add(event);
  
  // Store subscription metadata
  subscriptionMeta.set(event, {
    event,
    type,
    tabId,
    createdAt: Date.now()
  });
};

/**
 * Remove an event subscription
 */
export const removeSubscription = <T extends keyof WebSocketEventMap>(event: T): void => {
  // Remove from type-specific collections
  coreSubscriptions.delete(event);
  adminSubscriptions.delete(event);
  
  // Remove from tab collections if present
  for (const [tabId, events] of Array.from(tabSubscriptions.entries())) {
    if (events.has(event)) {
      events.delete(event);
      // Clean up empty sets
      if (events.size === 0) {
        tabSubscriptions.delete(tabId);
      }
      break;
    }
  }
  
  // Delete from metadata
  subscriptionMeta.delete(event);
  
  // Remove from active subscriptions
  activeSubscriptions.delete(event);
};

/**
 * Register an event listener for a specific event
 */
export const registerEventListener = <T extends keyof WebSocketEventMap>(
  event: T,
  callback: (data: WebSocketEventMap[T]) => void
): void => {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  
  const listeners = eventListeners.get(event);
  if (listeners && Array.from(listeners).some(existingCallback => 
    existingCallback.toString() === callback.toString())) {
    return;
  }
  
  eventListeners.get(event)?.add(callback);
  
  const socket = getSocket();
  if (socket) {
    socket.on(event, callback);
  }
};

/**
 * Remove an event listener for a specific event
 */
export const removeEventListener = <T extends keyof WebSocketEventMap>(
  event: T,
  callback: (data: WebSocketEventMap[T]) => void
): void => {
  const listeners = eventListeners.get(event);
  if (listeners) {
    listeners.delete(callback);
  }
  
  // If socket exists, remove the listener
  const socket = getSocket();
  if (socket) {
    socket.off(event, callback);
  }
};

/**
 * Clear all subscriptions for a specific tab
 */
export const clearTabSubscriptions = (tabId: string): void => {
  if (!tabSubscriptions.has(tabId)) return;
  
  const tabSubs = tabSubscriptions.get(tabId);
  if (tabSubs) {
    
    const socket = getSocket();
    
    // Unsubscribe from each event
    tabSubs.forEach(event => {
      if (socket && socket.connected) {
        socket.emit('unsubscribe', { type: event });
      }
      
      // Remove from active subscriptions
      activeSubscriptions.delete(event);
      
      // Remove subscription metadata
      subscriptionMeta.delete(event);
    });
    
    // Clear the tab's subscription set
    tabSubs.clear();
  }
  
  // Remove the tab entry
  tabSubscriptions.delete(tabId);
};

/**
 * Reattach all event listeners to a socket
 */
export const reattachEventListeners = (): void => {
  const socket = getSocket();
  if (!socket) return;
  
  // To prevent duplicates, we'll first remove all existing listeners
  // for the events we're about to reattach
  eventListeners.forEach((callbacks, event) => {
    // First remove existing listeners for this event to prevent duplicates
    // Need to remove them one by one since removeAllListeners() without args 
    // would remove ALL listeners for ALL events
    callbacks.forEach(callback => {
      socket.off(event, callback);
    });
    
    callbacks.forEach(callback => {
      socket.on(event, callback);
    });
  });
};

/**
 * Restore all subscriptions after reconnection
 */
export const restoreSubscriptions = (): void => {
  const socket = getSocket();
  if (!socket) return;
  
  // Track restored subscriptions to avoid duplicates
  const restoredEvents = new Set<string>();
  
  // First restore core subscriptions as these are highest priority
  setTimeout(() => {
    if (coreSubscriptions.size > 0) {
      // Filter out any non-core events that might have been mistakenly added
      const validCoreSubs = Array.from(coreSubscriptions).filter(sub => isValidCoreEvent(sub));
      
      // If any were filtered out, log a warning
      if (validCoreSubs.length < coreSubscriptions.size) {
        console.warn('[WebSocket] Found non-core events in coreSubscriptions:', 
                    Array.from(coreSubscriptions).filter(sub => !isValidCoreEvent(sub)));
        
        // Clean up the set by removing invalid core events
        Array.from(coreSubscriptions).forEach(sub => {
          if (!isValidCoreEvent(sub)) {
            coreSubscriptions.delete(sub);
          }
        });
      }
      
      coreSubscriptions.forEach(type => {
        if (!restoredEvents.has(type)) {
          socket?.emit('subscribe', { type });
          restoredEvents.add(type);
        }
      });
    }
  }, 50);
  
  // Then restore regular subscriptions
  setTimeout(() => {
    // Filter out core subscriptions as we've already handled those
    const standardSubs = Array.from(activeSubscriptions)
      .filter(sub => !coreSubscriptions.has(sub) && !adminSubscriptions.has(sub));
    
    if (standardSubs.length > 0) {
      standardSubs.forEach(type => {
        if (!restoredEvents.has(type)) {
          socket?.emit('subscribe', { type });
          restoredEvents.add(type);
        }
      });
    }
  }, 100);
};

/**
 * Get the set of core subscriptions
 * Helper function to make it easier to access the core subscriptions
 */
export const getCoreSubscriptions = (): Set<string> => {
  return new Set(coreSubscriptions);
}; 