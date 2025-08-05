import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { WebSocketEventMap, WebSocketEventKey, WebSocketStatus, SubscriptionType } from '../components/WebSocket/types';
import { useStore } from '../store';
import { socketClient } from '../components/WebSocket/client';
import { isValidCoreEvent, isAdminEvent } from '../components/WebSocket/config';

/**
 * Configuration options for WebSocket hook
 */
interface UseWebSocketOptions<T extends WebSocketEventKey> {
  /** 
   * Specific WebSocket event to subscribe to 
   * Determines which event type the hook will listen for
   */
  event: T;
  
  /** 
   * Callback function to handle received WebSocket events 
   * Will be called when a matching event is received
   */
  callback: (data: WebSocketEventMap[T]) => void;
  
  /** 
   * Whether to automatically connect to WebSocket on initialization
   * @default true
   */
  autoConnect?: boolean;
  
  /** 
   * Additional dependencies that trigger re-subscription 
   * Useful for dynamic event handling
   */
  deps?: any[];
}

/**
 * Return type for WebSocket hook
 * Provides methods to manage WebSocket connection and monitor its state
 */
interface UseWebSocketResult {
  /** Current status of the WebSocket connection */
  status: WebSocketStatus;
  
  /** Method to manually establish WebSocket connection */
  connect: () => Promise<void>;
  
  /** Method to manually disconnect WebSocket */
  disconnect: () => void;

  /** Whether the WebSocket connection is currently in progress */
  isConnecting: boolean;

  /** Set of active event subscriptions */
  activeSubscriptions: Set<string>;

  /** Whether the client is authenticated as admin */
  isAuthenticated: boolean;

  /** Emit an event to the server */
  emit: <E extends keyof WebSocketEventMap>(event: E, data?: WebSocketEventMap[E]) => void;

  /** Subscribe to an event with a specified subscription type */
  subscribe: <E extends WebSocketEventKey>(
    event: E, 
    callback: (data: WebSocketEventMap[E]) => void,
    type?: SubscriptionType,
    tabId?: string
  ) => () => void;

  /** Unsubscribe from a specific event */
  unsubscribe: <E extends WebSocketEventKey>(event: E) => void;
}

/**
 * Comprehensive hook for managing WebSocket connections and event subscriptions
 * 
 * Provides a unified interface for:
 * - WebSocket connection management
 * - Event subscription and unsubscription
 * - Automatic connection handling
 * 
 * @param options - Configuration for WebSocket event subscription
 * @returns Object with WebSocket connection status and methods
 * 
 * @example
 * ```tsx
 * const { 
 *   status, 
 *   connect, 
 *   disconnect, 
 *   isConnecting,
 *   activeSubscriptions 
 * } = useWebSocket({
 *   event: 'system_stats',
 *   callback: (data) => {
 *     // Handle system stats update
 *     console.log('System stats:', data);
 *   },
 *   autoConnect: true
 * });
 * 
 * // Check connection status
 * if (isConnecting) {
 *   return <div>Connecting to server...</div>;
 * }
 * 
 * // Display current subscriptions
 * console.log(`Active subscriptions: ${Array.from(activeSubscriptions).join(', ')}`);
 * ```
 */
export function useWebSocket<T extends WebSocketEventKey>({
  event,
  callback,
  autoConnect = true,
  deps = []
}: UseWebSocketOptions<T>): UseWebSocketResult {
  // Add initialization tracking
  const initRef = useRef(false);
  
  if (!initRef.current) {
    initRef.current = true;
  }

  const { 
    subscribe, 
    unsubscribe,
    status, 
    connect, 
    disconnect,
    activeSubscriptions,
    isConnecting
  } = useStore(state => ({
    subscribe: state.subscribe,
    unsubscribe: state.unsubscribe,
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
    activeSubscriptions: state.activeSubscriptions,
    isConnecting: state.isConnecting || false
  }));

  // Memoize the callback
  const memoizedCallback = useCallback(callback, [callback]);

  // Cleanup on unmount or when deps change
  useEffect(() => {
    return () => {
      if (activeSubscriptions.has(event)) {
        unsubscribe(event);
      }
    };
  }, [event, unsubscribe, ...deps]);

  const mountedRef = useRef(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const callbackRef = useRef(callback);
  const hasSubscribedRef = useRef(false);
  const setupInProgressRef = useRef(false);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  // Handle subscription setup and cleanup
  useEffect(() => {
    let mounted = true;

    const setupSubscription = async () => {
      // Prevent concurrent setup attempts
      if (setupInProgressRef.current) {
        return;
      }

      try {
        setupInProgressRef.current = true;

        // Check if we're already subscribed in the store
        if (activeSubscriptions.has(event)) {
          hasSubscribedRef.current = true;
          return;
        }

        // Clean up existing subscription first
        cleanup();

        if (status === 'disconnected' && autoConnect) {
          await connect();
        }

        if (mounted && status === 'connected' && !hasSubscribedRef.current) {
          hasSubscribedRef.current = true;
          unsubscribeRef.current = subscribe(event, (data: WebSocketEventMap[T]) => {
            if (mountedRef.current) {
              callbackRef.current(data);
            }
          });
        }
      } catch (error) {
        console.error('[useWebSocket] Setup failed:', {
          error,
          event,
          status
        });
      } finally {
        setupInProgressRef.current = false;
      }
    };

    if ((status === 'connected' || (status === 'disconnected' && autoConnect)) && !hasSubscribedRef.current) {
      setupSubscription();
    }

    return () => {
      mounted = false;
      cleanup();
    };
  }, [status, event, autoConnect, subscribe, connect, cleanup, activeSubscriptions, ...deps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // Get client-specific information
  const isAuthenticated = useMemo(() => socketClient.isAuthenticated(), []);

  // Use socketClient's emit method directly
  const emit = useCallback(<E extends keyof WebSocketEventMap>(
    event: E, 
    data?: WebSocketEventMap[E]
  ) => {
    return socketClient.emit(event, data);
  }, []);

  return {
    status,
    connect,
    disconnect,
    isConnecting,
    activeSubscriptions,
    isAuthenticated,
    emit,
    subscribe,
    unsubscribe
  };
}

/**
 * Enhanced version of useWebSocket with automatic event type detection
 * This hook uses the centralized event configuration to determine the correct
 * subscription type (core, admin, tab) for the event.
 * 
 * @param options Configuration options
 * @returns WebSocket connection management object
 * 
 * @example
 * ```tsx
 * // For a core event like internet_status
 * const { status, isConnecting } = useConfiguredWebSocket({
 *   event: 'internet_status',
 *   callback: (data) => {
 *     setConnectionStatus(data.status);
 *   }
 * });
 * 
 * // For a tab-specific event
 * const { status, activeSubscriptions } = useConfiguredWebSocket({
 *   event: 'system_stats',
 *   callback: (data) => {
 *     setSystemStats(data);
 *   },
 *   tabId: 'stats'
 * });
 * ```
 */
export function useConfiguredWebSocket<T extends WebSocketEventKey>({
  event,
  callback,
  autoConnect = true,
  deps = [],
  tabId
}: UseWebSocketOptions<T> & { tabId?: string }): UseWebSocketResult {
  // Get admin status from store
  const isAdmin = useStore(state => state.isAdmin);
  
  // Determine the subscription type based on event and configuration
  const getSubscriptionType = useCallback(() => {
    if (isValidCoreEvent(event)) {
      return 'core';
    } else if (isAdminEvent(event) && isAdmin) {
      return 'admin';
    } else if (tabId) {
      return 'tab';
    } else {
      return 'standard';
    }
  }, [event, isAdmin, tabId]);
  
  // Use the basic hook with additional logging
  const result = useWebSocket({
    event,
    callback,
    autoConnect,
    deps: [...deps, isAdmin, tabId] // Add dependencies that should trigger re-subscription
  });
  
  // Log subscription type for debugging
  useEffect(() => {
  }, [event, getSubscriptionType]);
  
  return result;
}

/**
 * Hook to get current WebSocket status without subscribing to any specific event
 * Useful for components that only need to display connection status
 * 
 * @returns Current WebSocket connection status and methods
 * 
 * @example
 * ```tsx
 * const { status, isConnecting, connect, disconnect } = useWebSocketStatus();
 * 
 * return (
 *   <div>
 *     {status === 'connected' ? (
 *       <div className="status-indicator connected">Connected</div>
 *     ) : status === 'connecting' || isConnecting ? (
 *       <div className="status-indicator connecting">Connecting...</div>
 *     ) : (
 *       <div className="status-indicator disconnected">
 *         Disconnected
 *         <button onClick={connect}>Connect</button>
 *       </div>
 *     )}
 *   </div>
 * );
 * ```
 */
export function useWebSocketStatus(): Omit<UseWebSocketResult, 'subscribe' | 'unsubscribe'> {
  const { 
    status, 
    connect, 
    disconnect,
    activeSubscriptions,
    isConnecting
  } = useStore(state => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
    activeSubscriptions: state.activeSubscriptions,
    isConnecting: state.isConnecting || false
  }));

  // Get client-specific information
  const isAuthenticated = useMemo(() => socketClient.isAuthenticated(), []);
  
  // Force re-render when socketClient status changes
  const [renderCount, setRenderCount] = useState(0);
  
  useEffect(() => {
    // Setup status checking
    const checkStatus = () => {
      const currentStatus = socketClient.getStatus();
      
      if (currentStatus !== status) {
        setRenderCount(count => count + 1);
      }
    };
    
    // Check status every 2 seconds
    const interval = setInterval(checkStatus, 2000);
    
    return () => {
      clearInterval(interval);
    };
  }, [status]);

  // Use socketClient's emit method directly
  const emit = useCallback(<E extends keyof WebSocketEventMap>(
    event: E, 
    data?: WebSocketEventMap[E]
  ) => {
    return socketClient.emit(event, data);
  }, []);

  return {
    status,
    connect,
    disconnect,
    isConnecting,
    activeSubscriptions,
    isAuthenticated,
    emit
  };
}