import { useEffect } from 'react';
// import { socketClient } from '../components/WebSocket/client'; // No longer needed if not directly interacting for sub setup
import { useStore, useSubscription } from '../store';
// import { WebSocketEventKey, WebSocketEventMap } from '../components/WebSocket/types'; // No longer needed by these informational hooks
import { 
  CORE_EVENTS, 
  ADMIN_EVENTS, 
  EVENTS_WITHOUT_ADMIN_FIELDS,
} from '../components/WebSocket/config';

/*
Overview of Subscription Hooks:
These hooks provide different levels of abstraction for interacting with WebSocket subscriptions.

1. useCoreSubscriptions - Provides information about core subscriptions (CORE_EVENTS).
   - Note: Subscription setup is now handled by SubscriptionManager.

2. useAdminSubscriptions - Provides information about admin-specific events (ADMIN_EVENTS) and admin state.
   - Note: Bulk subscription setup is now handled by SubscriptionManager.

REMOVED Hooks:
- useTabSubscriptions: Functionality absorbed by SubscriptionManager.
- useComponentSubscriptions: Functionality absorbed by SubscriptionManager.
- useSingleCoreEvent: Functionality covered by SubscriptionManager and direct store access for data.

General Flow:
- Components use these hooks for informational purposes regarding event categories or admin state.
- SubscriptionManager orchestrates global and tab-based subscriptions based on application state.
- Components consume event data reactively from the store (e.g., broadcastDataSlice).
*/

/**
 * Hook for providing information about core WebSocket subscriptions.
 * Core event subscriptions (CORE_EVENTS) are managed by SubscriptionManager via startup.ts.
 * 
 * @returns Object containing subscription status and core event list.
 * 
 * @example
 * ```tsx
 * const { status, isReady, coreEvents } = useCoreSubscriptions();
 * if (isReady) {
 *   // Core subscriptions are active
 * }
 * ```
 */
export function useCoreSubscriptions() {
  const { status } = useStore(state => ({
    status: state.status
  }));
  
  const { getSubscriptionsByEvent } = useSubscription();
  
  // Check if core subscriptions (managed by SubscriptionManager) are active
  const areSubscriptionsActive = CORE_EVENTS.every(eventType => {
    const subscriptions = getSubscriptionsByEvent(eventType);
    // Check for feeder subscriptions, as those are the ones set up by SubscriptionManager
    return subscriptions.some(sub => sub.isFeeder);
  });
  
  return {
    status,
    isReady: areSubscriptionsActive,
    coreEvents: CORE_EVENTS
  };
}

/**
 * Hook for providing information about admin-only WebSocket events and admin state.
 * Admin event subscriptions (ADMIN_EVENTS) are managed by SubscriptionManager via AdminModeManager.
 * 
 * @returns Object containing admin status and categorized admin event lists.
 * 
 * @example
 * ```tsx
 * const { isAdmin, adminOnlyEvents } = useAdminSubscriptions();
 * if (isAdmin) {
 *   // User is in admin mode
 * }
 * ```
 */
export function useAdminSubscriptions() {
  const { isAdmin, status } = useStore(state => ({
    isAdmin: state.isAdmin,
    status: state.status
  }));
  
  // const { subscribeToAdminEvent } = useSubscription(); // No longer needed for direct subscription here

  // useEffect for managing admin status in socketClient is handled by AdminModeManager.
  // useEffect for auto-subscribing is handled by AdminModeManager/SubscriptionManager.
  
  // Get the categorized admin events for informational purposes
  const adminOnlyEvents = ADMIN_EVENTS.filter(event => !CORE_EVENTS.includes(event));
  const regularEventsWithAdminFields = CORE_EVENTS.filter(event => 
    ADMIN_EVENTS.includes(event) && 
    !EVENTS_WITHOUT_ADMIN_FIELDS.includes(event)
  );
  const regularEventsWithoutAdminFields = EVENTS_WITHOUT_ADMIN_FIELDS;
  
  return {
    status,
    isAdmin,
    adminOnlyEvents,
    regularEventsWithAdminFields,
    regularEventsWithoutAdminFields,
    // subscribe: <T extends WebSocketEventKey>( // REMOVED - Subscriptions are managed by SubscriptionManager
    //   event: T,
    //   callback: (data: WebSocketEventMap[T]) => void
    // ) => {
    //   if (!isAdmin) {
    //     console.warn(`[useAdminSubscriptions] Attempted to subscribe to ${event} without admin privileges`);
    //     // eslint-disable-next-line @typescript-eslint/no-empty-function
    //     return () => {}; // No-op function when not admin
    //   }
      
    //   return subscribeToAdminEvent(event, callback);
    // }
  };
}

// useSingleCoreEvent has been removed as its functionality is covered by SubscriptionManager
// and components can directly access data from the store if needed.

// No useEffect for setting up subscriptions - this is now handled in startup.ts
// No useEffect for setting up subscriptions - this is now handled in startup.ts 