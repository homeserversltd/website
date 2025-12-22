import { useEffect, useCallback } from 'react';
import { useStore, StoreState } from '../store';

/**
 * Hook to manage requests for disabling the WebSocket inactivity timeout.
 * 
 * Returns an object with:
 * - requestDisable: Call this to request disabling the timeout.
 * - releaseDisable: Call this to release the request (typically in cleanup).
 *
 * The hook interacts with a central store slice to ensure the timeout
 * is only truly enabled when *no* component requires it to be disabled.
 */
export const useInactivityTimeout = () => {
  // Get the action functions from the Zustand store.
  // These actions interact with the inactivityTimeoutSlice.
  const requestDisableAction = useStore((state: StoreState) => state.requestInactivityDisable);
  const releaseDisableAction = useStore((state: StoreState) => state.releaseInactivityDisable);

  /**
   * Requests that the WebSocket inactivity timeout be disabled.
   * @param reason - An optional reason string for logging/debugging.
   */
  const requestDisable = useCallback((reason?: string) => {
    requestDisableAction(reason);
  }, [requestDisableAction]);

  /**
   * Releases a previous request to disable the WebSocket inactivity timeout.
   * The central store will re-enable the timeout if no other requests are active.
   */
  const releaseDisable = useCallback(() => {
    releaseDisableAction();
  }, [releaseDisableAction]);

  return { requestDisable, releaseDisable };
};

/**
 * Convenience hook that automatically requests disable on mount/when active
 * and releases on unmount/when inactive.
 *
 * @param isActive - Boolean indicating if the timeout should be disabled.
 * @param reason - Optional reason string.
 */
export const useManagedInactivityTimeout = (isActive: boolean, reason?: string) => {
  const { requestDisable, releaseDisable } = useInactivityTimeout();

  useEffect(() => {
    if (isActive) {
      requestDisable(reason);
      // Return the release function to be called on cleanup
      return () => {
        releaseDisable();
      };
    }
    // If not active, do nothing (no request, no cleanup needed for this effect cycle)
  }, [isActive, reason, requestDisable, releaseDisable]);
}; 