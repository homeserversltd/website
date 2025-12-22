import { StateCreator } from 'zustand';
import { WebSocketEventMap, WebSocketStatus, SubscriptionType, SubscriptionInfo } from '../../components/WebSocket/types';
import { socketClient } from '../../components/WebSocket/client';
import { debug, createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('WebSocketSlice');

export interface WebSocketSlice {
  // State
  status: WebSocketStatus;
  activeSubscriptions: Set<string>;
  subscriptionMeta: Map<string, SubscriptionInfo>;
  lastMessageTime: number | null;
  lastHeartbeatAck: number | null;
  connectionAttempts: number;
  isConnecting: boolean;
  error: Error | null;
  activeTabId: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;

  // Standard Subscription Management
  subscribe: <T extends keyof WebSocketEventMap>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    type?: SubscriptionType,
    tabId?: string
  ) => () => void;
  unsubscribe: <T extends keyof WebSocketEventMap>(event: T) => void;
  
  // Specialized Subscription Methods
  subscribeCoreEvent: <T extends keyof WebSocketEventMap>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void
  ) => () => void;
  subscribeAdminEvent: <T extends keyof WebSocketEventMap>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void
  ) => () => void;
  subscribeTabEvent: <T extends keyof WebSocketEventMap>(
    event: T,
    callback: (data: WebSocketEventMap[T]) => void,
    tabId: string
  ) => () => void;
  
  // Tab Management for WebSocket specific active tab
  setWebSocketActiveTabId: (tabId: string) => void;
  clearTabSubscriptions: (tabId: string) => void;
  
  // State Management
  resetState: () => void;
  setStatus: (status: WebSocketStatus) => void;
  setError: (error: Error | null) => void;
  incrementConnectionAttempts: () => void;
  resetConnectionAttempts: () => void;
  setIsConnecting: (isConnecting: boolean) => void;
  updateLastMessageTime: () => void;
  updateLastHeartbeatAck: () => void;
}

const INITIAL_STATE = {
  status: 'disconnected' as WebSocketStatus,
  activeSubscriptions: new Set<string>(),
  subscriptionMeta: new Map<string, SubscriptionInfo>(),
  lastMessageTime: null,
  lastHeartbeatAck: null,
  connectionAttempts: 0,
  isConnecting: false,
  error: null,
  activeTabId: null
};

export const createWebSocketSlice: StateCreator<WebSocketSlice> = (set, get) => ({
  ...INITIAL_STATE,

  connect: async () => {
    const { status, isConnecting } = get();
    
    if (status === 'connected' || isConnecting) {
      return;
    }

    try {
      set({ isConnecting: true, error: null });
      await socketClient.connect();
      set({ 
        status: 'connected',
        lastMessageTime: Date.now(),
        isConnecting: false 
      });
    } catch (error) {
      set({ 
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        isConnecting: false
      });
      throw error;
    }
  },

  disconnect: () => {
    socketClient.disconnect();
    set({
      ...INITIAL_STATE,
      activeSubscriptions: new Set(),
      subscriptionMeta: new Map()
    });
  },

  subscribe: (event, callback, type = SubscriptionType.STANDARD, tabId) => {
    const state = get();
    
    // Check if already subscribed
    if (state.activeSubscriptions.has(event)) {
      // Return no-op function since we're already subscribed
      return () => { /* no-op: already subscribed */ };
    }

    // Use the appropriate subscribe method based on type
    let unsubscribeFn: () => void;
    
    switch (type) {
      case SubscriptionType.CORE: {
        unsubscribeFn = socketClient.subscribeCoreEvent(event, callback);
        break;
      }
      case SubscriptionType.ADMIN: {
        unsubscribeFn = socketClient.subscribeAdminEvent(event, callback);
        break;
      }
      case SubscriptionType.TAB: {
        if (!tabId) {
          logger.error('Tab ID is required for TAB subscription type');
          return () => { /* no-op */ };
        }
        unsubscribeFn = socketClient.subscribeTabEvent(event, callback, tabId);
        break;
      }
      default: {
        // Standard subscription
        // Add the event listener
        const wrappedCallback = (data: WebSocketEventMap[typeof event]) => {
          state.updateLastMessageTime();
          callback(data);
        };
        
        socketClient.on(event, wrappedCallback);
        
        // Emit subscribe request
        socketClient.emit('subscribe', { type: event });
        
        // Define unsubscribe function
        unsubscribeFn = () => {
          socketClient.off(event, wrappedCallback);
          get().unsubscribe(event);
        };
        break;
      }
    }
    
    // Update local state tracking
    const subscriptionInfo: SubscriptionInfo = {
      event,
      type,
      tabId,
      createdAt: Date.now()
    };
    
    // Update state
    set(state => {
      const newSubscriptions = new Set(state.activeSubscriptions);
      newSubscriptions.add(event);
      
      const newMeta = new Map(state.subscriptionMeta);
      newMeta.set(event, subscriptionInfo);
      
      return {
        activeSubscriptions: newSubscriptions,
        subscriptionMeta: newMeta
      };
    });

    return unsubscribeFn;
  },

  subscribeCoreEvent: (event, callback) => {
    return get().subscribe(event, callback, SubscriptionType.CORE);
  },

  subscribeAdminEvent: (event, callback) => {
    return get().subscribe(event, callback, SubscriptionType.ADMIN);
  },

  subscribeTabEvent: (event, callback, tabId) => {
    if (!tabId) {
      logger.error('Tab ID is required for TAB subscription type');
      return () => { /* no-op */ };
    }
    return get().subscribe(event, callback, SubscriptionType.TAB, tabId);
  },

  unsubscribe: (event) => {
    const state = get();
    
    if (!state.activeSubscriptions.has(event)) {
      return;
    }

    // Get subscription type
    const meta = state.subscriptionMeta.get(event);
    
    // Emit unsubscribe event to the server
    socketClient.emit('unsubscribe', { type: event });
    
    // Update local state
    set(state => {
      const newSubscriptions = new Set(state.activeSubscriptions);
      newSubscriptions.delete(event);
      
      const newMeta = new Map(state.subscriptionMeta);
      newMeta.delete(event);
      
      return { 
        activeSubscriptions: newSubscriptions,
        subscriptionMeta: newMeta
      };
    });
    
    // Handle client-side cleanup by subscription type
    if (meta) {
      if (meta.type === SubscriptionType.TAB) {
        socketClient.unsubscribe(event);
      }
    }
  },

  setWebSocketActiveTabId: (tabId) => {
    const currentTabId = get().activeTabId;
    
    if (currentTabId !== tabId) {
      // Update socket client
      socketClient.setActiveTab(tabId);
      
      // Update state
      set({ activeTabId: tabId });
      debug(`WebSocket active tab ID set to: ${tabId}`);
    }
  },

  clearTabSubscriptions: (tabId) => {
    socketClient.clearTabSubscriptions(tabId);
    set(state => {
      const newSubscriptions = new Set<string>();
      const newMeta = new Map<string, SubscriptionInfo>();
      state.activeSubscriptions.forEach(event => {
        const meta = state.subscriptionMeta.get(event);
        if (!meta || meta.tabId !== tabId) {
          newSubscriptions.add(event);
          if (meta) newMeta.set(event, meta);
        }
      });
      return { activeSubscriptions: newSubscriptions, subscriptionMeta: newMeta };
    });
  },

  resetState: () => {
    socketClient.disconnect();
    set(INITIAL_STATE);
  },

  setStatus: (status) => {
    set({ status, isConnecting: status === 'connecting' });
  },

  setError: (error) => {
    set({ error });
  },

  incrementConnectionAttempts: () => {
    set(state => ({
      connectionAttempts: state.connectionAttempts + 1
    }));
  },

  resetConnectionAttempts: () => {
    set({ connectionAttempts: 0 });
  },

  setIsConnecting: (isConnecting) => {
    set({ isConnecting });
  },

  updateLastMessageTime: () => {
    set({ lastMessageTime: Date.now() });
  },

  updateLastHeartbeatAck: () => {
    set({ lastHeartbeatAck: Date.now() });
  }
}); 