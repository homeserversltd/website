import { StateCreator } from 'zustand';
import { WebSocketEventKey, WebSocketEventMap } from '../../components/WebSocket/types';

// Define types for broadcast data storage
export interface BroadcastDataStore {
  // Regular user broadcast data
  regular: {
    [K in WebSocketEventKey]?: WebSocketEventMap[K];
  };
  
  // Admin-enhanced broadcast data
  admin: {
    [K in WebSocketEventKey]?: WebSocketEventMap[K];
  };
  
  // Last updated timestamps
  lastUpdated: {
    [K in WebSocketEventKey]?: {
      regular?: number;
      admin?: number;
    };
  };
}

// Define interface for the slice state and methods
export interface BroadcastDataSlice {
  // State
  broadcastData: BroadcastDataStore;
  
  // Actions for data updates
  updateBroadcastData: <T extends WebSocketEventKey>(
    event: T, 
    data: WebSocketEventMap[T], 
    mode: 'regular' | 'admin'
  ) => void;
  
  clearBroadcastData: (event?: WebSocketEventKey, mode?: 'regular' | 'admin' | 'all') => void;
  
  // Data access methods
  getBroadcastData: <T extends WebSocketEventKey>(event: T, preferAdmin?: boolean) => WebSocketEventMap[T] | undefined;
  getLastUpdated: <T extends WebSocketEventKey>(event: T, mode?: 'regular' | 'admin') => number | undefined;
}

// Create the slice
export const createBroadcastDataSlice: StateCreator<
  BroadcastDataSlice & { isAdmin: boolean },
  [],
  [],
  BroadcastDataSlice
> = (set, get) => ({
  // Initial state with empty data stores
  broadcastData: {
    regular: {},
    admin: {},
    lastUpdated: {},
  },

  // Update broadcast data when new WebSocket messages arrive
  updateBroadcastData: <T extends WebSocketEventKey>(
    event: T, 
    data: WebSocketEventMap[T], 
    mode: 'regular' | 'admin'
  ) => {
    set((state) => {
      // Create a new broadcast data object to maintain immutability
      const newBroadcastData = { ...state.broadcastData };
      
      // Update the appropriate data store
      newBroadcastData[mode] = {
        ...newBroadcastData[mode],
        [event]: data
      };
      
      // Update the timestamp
      newBroadcastData.lastUpdated = {
        ...newBroadcastData.lastUpdated,
        [event]: {
          ...(newBroadcastData.lastUpdated[event] || {}),
          [mode]: Date.now()
        }
      };
      
      return { broadcastData: newBroadcastData };
    });
  },

  // Clear broadcast data for a specific event or all events
  clearBroadcastData: (event, mode = 'all') => {
    set((state) => {
      // Create a new broadcast data object to maintain immutability
      const newBroadcastData = { ...state.broadcastData };
      
      // If no event specified, clear all data based on mode
      if (!event) {
        if (mode === 'all' || mode === 'regular') {
          newBroadcastData.regular = {};
        }
        if (mode === 'all' || mode === 'admin') {
          newBroadcastData.admin = {};
        }
        if (mode === 'all') {
          newBroadcastData.lastUpdated = {};
        }
      } 
      // Otherwise, clear just the specified event
      else {
        if (mode === 'all' || mode === 'regular') {
          const newRegular = { ...newBroadcastData.regular };
          delete newRegular[event];
          newBroadcastData.regular = newRegular;
        }
        
        if (mode === 'all' || mode === 'admin') {
          const newAdmin = { ...newBroadcastData.admin };
          delete newAdmin[event];
          newBroadcastData.admin = newAdmin;
        }
        
        if (mode === 'all') {
          const newLastUpdated = { ...newBroadcastData.lastUpdated };
          delete newLastUpdated[event];
          newBroadcastData.lastUpdated = newLastUpdated;
        } else {
          const eventUpdated = { ...newBroadcastData.lastUpdated[event] };
          delete eventUpdated[mode];
          newBroadcastData.lastUpdated = {
            ...newBroadcastData.lastUpdated,
            [event]: eventUpdated
          };
        }
      }
      
      return { broadcastData: newBroadcastData };
    });
  },

  // Get the appropriate broadcast data based on current mode
  getBroadcastData: <T extends WebSocketEventKey>(event: T, preferAdmin = true): WebSocketEventMap[T] | undefined => {
    const { broadcastData } = get();
    const isAdmin = (get() as any).isAdmin;
    
    // Try to return admin data first if in admin mode and preferAdmin is true
    if (isAdmin && preferAdmin && broadcastData.admin[event]) {
      return broadcastData.admin[event] as WebSocketEventMap[T];
    }
    
    // Otherwise return regular data
    return broadcastData.regular[event] as WebSocketEventMap[T];
  },

  // Get timestamp of the last update for a specific event
  getLastUpdated: <T extends WebSocketEventKey>(event: T, mode?: 'regular' | 'admin'): number | undefined => {
    const { broadcastData } = get();
    const eventUpdated = broadcastData.lastUpdated[event];
    
    if (!eventUpdated) {
      return undefined;
    }
    
    if (mode) {
      return eventUpdated[mode];
    }
    
    // If no mode specified, return most recent timestamp
    const regularTime = eventUpdated.regular || 0;
    const adminTime = eventUpdated.admin || 0;
    
    return Math.max(regularTime, adminTime) || undefined;
  }
}); 