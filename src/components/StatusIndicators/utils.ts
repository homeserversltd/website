import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore, useBroadcastData } from '../../store';
import { WebSocketEventKey, WebSocketEventMap } from '../WebSocket/types';

/**
 * Generic hook for consuming WebSocket broadcast data for status indicators
 * This eliminates polling and makes indicators fully event-driven
 * 
 * @param eventKey The WebSocket event to subscribe to
 * @returns Object containing the event data and helper functions
 */
export function useEventDrivenStatus<T extends WebSocketEventKey>(
  eventKey: T
): {
  data: WebSocketEventMap[T] | undefined;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | undefined;
} {
  const { getBroadcastData, getLastUpdated } = useBroadcastData();
  const isAdmin = useStore(state => state.isAdmin);
  
  // Get data directly from broadcast store. 
  // The SubscriptionManager will be responsible for ensuring this data is populated.
  const data = getBroadcastData(eventKey, isAdmin);
  const lastUpdated = getLastUpdated(eventKey, isAdmin ? 'admin' : 'regular');
  const isLoading = data === undefined; // Simplified loading: true if data is not yet available
  const error = null; // Assuming no direct error handling within this hook anymore for subscription issues

  // TODO: Consider if a local state update is still needed for reactivity 
  // if useBroadcastData itself doesn't trigger re-renders appropriately in all consuming components.
  // For now, assuming useBroadcastData + direct return is sufficient.

  // The useEffect that previously handled direct subscription is now removed.
  // console.log(`[useEventDrivenStatus] Data for ${eventKey}:`, data);

  return {
    data,
    isLoading,
    error,
    lastUpdated
  };
}

/**
 * Higher-order component that wraps a status indicator with proper memoization
 * and ensures it only re-renders when its data actually changes
 * 
 * @param Component The status indicator component to wrap
 * @param displayName The display name for the wrapped component
 * @returns A memoized version of the component
 */
export function withMemoizedIndicator<P extends object>(
  Component: React.ComponentType<P>, 
  displayName: string
): React.MemoExoticComponent<React.ComponentType<P>> {
  // Create a memoized version of the component
  const MemoizedComponent = React.memo(Component);
  
  // Set a display name for easier debugging
  MemoizedComponent.displayName = displayName;
  
  return MemoizedComponent;
}

/**
 * Utility function to extract the enabled state from a status object
 * Works with different status data formats to provide consistent behavior
 * 
 * @param data The status data object
 * @param key Optional key to look for enabled state (defaults to 'isEnabled')
 * @returns Boolean indicating if the service is enabled, or null if unknown
 */
export function getServiceEnabledState(
  data: any, 
  key = 'isEnabled'
): boolean | null {
  if (!data) return null;
  
  // Only log when debugging is explicitly enabled
  const shouldLog = localStorage.getItem('DEBUG_VPN_STATUS') === 'true';
  
  if (shouldLog) {
    console.debug('[VPN_STATUS] Checking status data:', 
      JSON.stringify({
        hasData: !!data,
        hasKey: key in data,
        keyValue: data[key],
        keyType: data[key] !== undefined ? typeof data[key] : 'undefined'
      })
    );
  }
  
  // Handle different data formats
  if (typeof data[key] === 'boolean') {
    return data[key];
  }
  
  // If isEnabled is not present but we have other status indicators
  if (data.status === 'enabled' || data.state === 'enabled') {
    return true;
  }
  
  if (data.status === 'disabled' || data.state === 'disabled') {
    return false;
  }
  
  if (shouldLog) {
    console.debug('[VPN_STATUS] Could not determine enabled state');
  }
  return null;
}