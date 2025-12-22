import { StateCreator } from 'zustand';
import { StoreState } from '../index'; // Assuming index.ts exports the combined state
import { 
  disableInactivityTimeout, 
  enableInactivityTimeout 
} from '../../components/WebSocket'; // Import the actual functions

export interface InactivityTimeoutState {
  disableRequests: number; // Counter for how many components requested disabling
  lastDisableReason: string | null; // Reason for the last disable request
}

export interface InactivityTimeoutSlice extends InactivityTimeoutState {
  requestInactivityDisable: (reason?: string) => void;
  releaseInactivityDisable: () => void;
  // Optional: a selector to check if timeout is currently suppressed
  isTimeoutSuppressed: () => boolean; 
}

export const createInactivityTimeoutSlice: StateCreator<
  StoreState,
  [],
  [],
  InactivityTimeoutSlice
> = (set, get) => ({
  disableRequests: 0,
  lastDisableReason: null,

  requestInactivityDisable: (reason = 'unspecified') => {
    set((state) => {
      const newCount = state.disableRequests + 1;
      // If this is the first request, call the actual disable function
      if (state.disableRequests === 0 && newCount > 0) {
        disableInactivityTimeout(reason); 
      }
      return { 
        disableRequests: newCount,
        lastDisableReason: reason // Store the latest reason
      };
    });
  },

  releaseInactivityDisable: () => {
    set((state) => {
      const newCount = Math.max(0, state.disableRequests - 1);
      // If this release brings the count to zero, call the actual enable function
      if (state.disableRequests > 0 && newCount === 0) {
        enableInactivityTimeout();
      }
      return { 
        disableRequests: newCount,
        // Reset reason only when count hits zero? Or keep last reason? Keeping for now.
        // lastDisableReason: newCount === 0 ? null : state.lastDisableReason 
      };
    });
  },

  isTimeoutSuppressed: () => {
    return get().disableRequests > 0;
  },
});

// Optional: Selectors can be defined outside if preferred
// export const selectIsTimeoutSuppressed = (state: StoreState) => state.disableRequests > 0; 