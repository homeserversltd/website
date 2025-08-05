import { StateCreator } from 'zustand';
import { StoreState } from '..';
import { createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('SyncSlice');

// Session storage key (kept for compatibility)
export const SYNC_SESSION_KEY = 'current_sync_job';

// Interface for the sync state
export interface SyncState {
  jobId: string | null;
  elapsedTime: number;
  keepaliveCount: number;
  syncStatus: any; // Using any for now, can be typed more specifically later
  lastWorkingTimestamp: number | null;
  syncStarted: boolean;
}

export interface SyncSlice {
  // State
  syncState: SyncState;
  
  // Actions
  registerSyncJob: (jobId: string) => void;
  clearSyncState: () => void;
  updateSyncStatus: (status: any) => void;
  incrementElapsedTime: () => void;
  incrementKeepaliveCount: (timestamp: number) => void;
  isActiveSyncInProgress: () => boolean;
}

export const createSyncSlice: StateCreator<
  StoreState,
  [],
  [],
  SyncSlice
> = (set, get) => {
  // Initialize timer outside of React component lifecycle
  let timer: NodeJS.Timeout | null = null;
  
  // Helper to start the elapsed time timer
  const startTimer = () => {
    // Clear existing timer if any
    if (timer) {
      clearInterval(timer);
    }
    
    // Start a new timer that increments elapsed time every second
    timer = setInterval(() => {
      // We need to directly call the function on the store since it may not be initialized yet
      const syncSlice = get();
      if (syncSlice.incrementElapsedTime) {
        syncSlice.incrementElapsedTime();
      }
    }, 1000);
  };
  
  // Helper to stop the timer
  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  
  return {
    // Initial state
    syncState: {
      jobId: null,
      elapsedTime: 0,
      keepaliveCount: 0,
      syncStatus: null,
      lastWorkingTimestamp: null,
      syncStarted: false
    },
    
    // Register a new sync job
    registerSyncJob: (jobId: string) => {
      set((state) => {
        // Start the timer for elapsed time
        startTimer();
        
        // Save to session storage for compatibility with existing code
        try {
          sessionStorage.setItem(SYNC_SESSION_KEY, JSON.stringify({
            id: jobId,
            timestamp: Date.now(),
            internalState: {
              elapsedTime: 0,
              keepaliveCount: 0,
              lastWorkingTimestamp: null
            }
          }));
        } catch (error) {
          logger.error('Error saving new sync job to session:', error);
        }
        
        return {
          syncState: {
            jobId,
            elapsedTime: 0,
            keepaliveCount: 0,
            syncStatus: null,
            lastWorkingTimestamp: null,
            syncStarted: true
          }
        };
      });
    },
    
    // Clear sync state
    clearSyncState: () => {
      set((state) => {
        // Stop the timer
        stopTimer();
        
        // Remove from session storage
        sessionStorage.removeItem(SYNC_SESSION_KEY);
        
        return {
          syncState: {
            jobId: null,
            elapsedTime: 0,
            keepaliveCount: 0,
            syncStatus: null,
            lastWorkingTimestamp: null,
            syncStarted: false
          }
        };
      });
    },
    
    // Update sync status
    updateSyncStatus: (status: any) => {
      set((state) => {
        // Don't update if there's no job ID to match against
        if (!state.syncState.jobId) {
          return {};
        }
        
        // Only update if the status matches our tracked job
        if (status && status.id === state.syncState.jobId) {
          
          // Handle sync job completion
          if (status.status === 'done' && state.syncState.syncStarted) {
            stopTimer();
          }
          
          // Handle new/existing sync job
          if ((status.status === 'starting' || status.status === 'working') && !state.syncState.syncStarted) {
            startTimer();
          }
          
          // Save current state to session storage for compatibility
          try {
            sessionStorage.setItem(SYNC_SESSION_KEY, JSON.stringify({
              id: state.syncState.jobId,
              timestamp: Date.now(),
              internalState: {
                elapsedTime: state.syncState.elapsedTime,
                keepaliveCount: state.syncState.keepaliveCount,
                lastWorkingTimestamp: state.syncState.lastWorkingTimestamp
              }
            }));
          } catch (error) {
            logger.error('Error saving sync state to session:', error);
          }
          
          return {
            syncState: {
              ...state.syncState,
              syncStatus: status,
              syncStarted: status.status === 'starting' || status.status === 'working'
            }
          };
        }
        
        return {};
      });
    },
    
    // Increment elapsed time (called by timer)
    incrementElapsedTime: () => {
      set((state) => {
        if (state.syncState.syncStarted) {
          // Only update if we have an active sync
          return {
            syncState: {
              ...state.syncState,
              elapsedTime: state.syncState.elapsedTime + 1
            }
          };
        }
        return {};
      });
    },
    
    // Increment keepalive count when a new working status comes in
    incrementKeepaliveCount: (timestamp: number) => {
      set((state) => {
        // Only increment if timestamp is different from last one
        if (state.syncState.lastWorkingTimestamp !== timestamp) {
          return {
            syncState: {
              ...state.syncState,
              keepaliveCount: state.syncState.keepaliveCount + 1,
              lastWorkingTimestamp: timestamp
            }
          };
        }
        return {};
      });
    },
    
    // Check if there's an active sync in progress
    isActiveSyncInProgress: () => {
      const state = get();
      return !!(state.syncState.jobId && state.syncState.syncStarted);
    }
  };
};

// Clean up timer when module is unmounted
const cleanupModuleTimer = () => {
  // This is a bit of a hack, but we need to ensure the interval is cleared
  // when the module is hot-reloaded during development
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      const allIntervals = Object.keys(window)
        .filter(key => key.toString().includes('Interval'))
        .map(key => window[key as any]);
        
      allIntervals.forEach(interval => {
        if (typeof interval === 'number') {
          clearInterval(interval);
        }
      });
    });
  }
};

cleanupModuleTimer(); 