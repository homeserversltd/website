import { useState, useEffect, useRef, useCallback } from 'react';

export interface SimpleRequestOptions<T> {
  /**
   * Unique key for this request (used for logging)
   */
  key: string;
  
  /**
   * Time in milliseconds to cache the result
   * Default: 30000ms (30 seconds)
   */
  cacheDuration?: number;
  
  /**
   * Whether to automatically execute the request when the component mounts
   * Default: false
   */
  executeOnMount?: boolean;
  
  /**
   * Interval in milliseconds to automatically refresh the data
   * If provided, will set up an interval to re-execute the request
   * Default: undefined (no auto-refresh)
   */
  refreshInterval?: number;
  
  /**
   * Optional function to transform the result before caching
   * Default: undefined (no transformation)
   */
  transform?: (result: T) => T;
  
  /**
   * Optional callback to handle errors
   * Default: console.error
   */
  onError?: (error: any) => void;
  
  /**
   * Enable detailed logging for debugging
   * Default: false
   */
  debug?: boolean;
}

export interface SimpleRequestResult<T, P extends any[]> {
  /**
   * The cached data, or null if no data is cached
   */
  data: T | null;
  
  /**
   * Whether a request is currently in progress
   */
  isLoading: boolean;
  
  /**
   * Any error that occurred during the last request
   */
  error: Error | null;
  
  /**
   * Timestamp of when the data was last updated (ms since epoch)
   */
  lastUpdated: number | null;
  
  /**
   * Executes the request, using the cached result if valid
   * force=true will bypass the cache
   */
  execute: (force?: boolean, ...params: P) => Promise<T | null>;
  
  /**
   * Clears the cached data
   */
  clearCache: () => void;
}

/**
 * A lightweight hook for making requests with caching in local refs.
 * Unlike useStoreMemoizedRequest, this doesn't interact with any global state.
 * 
 * @param requestFn The async function to call
 * @param options Configuration options
 * @returns Result object with data and control functions
 */
export function useSimpleRequest<T, P extends any[] = []>(
  requestFn: (...params: P) => Promise<T>,
  options: SimpleRequestOptions<T>
): SimpleRequestResult<T, P> {
  const {
    key,
    cacheDuration = 30000,
    executeOnMount = false,
    refreshInterval,
    transform,
    onError = (error) => console.error(`[useSimpleRequest] ${key} error:`, error),
    debug = false
  } = options;
  
  // Local state using refs to avoid re-renders
  const [isLoading, setIsLoading] = useState(false);
  const dataRef = useRef<T | null>(null);
  const lastUpdatedRef = useRef<number | null>(null);
  const errorRef = useRef<Error | null>(null);
  const intervalRef = useRef<number | null>(null);
  const requestCountRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const lastParamsRef = useRef<P | null>(null);
  
  // For logging
  const logPrefix = `[SimpleRequest:${key}]`;
  
  // Debug logging function
  const log = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`${logPrefix} ${message}`, data !== undefined ? data : '');
    }
  }, [debug, logPrefix]);
  
  // Function to check if cache is valid
  const isCacheValid = useCallback((): boolean => {
    if (lastUpdatedRef.current === null) {
      log('Cache validity check: No cache timestamp');
      return false;
    }
    
    const age = Date.now() - lastUpdatedRef.current;
    const valid = age < cacheDuration;
    
    log(`Cache validity check: ${valid ? 'Valid' : 'Expired'}`, { 
      age, 
      cacheDuration,
      now: Date.now(),
      lastUpdated: lastUpdatedRef.current
    });
    
    return valid;
  }, [cacheDuration, log]);
  
  // Clear the cache
  const clearCache = useCallback((): void => {
    log('Cache cleared');
    dataRef.current = null;
    lastUpdatedRef.current = null;
    errorRef.current = null;
  }, [log]);
  
  // Execute the request with caching
  const execute = useCallback(async (force = false, ...params: P): Promise<T | null> => {
    const requestId = ++requestCountRef.current;
    log(`Execute called (${requestId})`, { force, params });
    
    // Save the last params used
    if (params.length > 0) {
      lastParamsRef.current = params;
    }
    
    try {
      // If cache is valid and not forced, return cached result
      if (!force && isCacheValid()) {
        log(`Using cached result (${requestId})`, dataRef.current);
        return dataRef.current;
      }
      
      // Start new request
      log(`Starting new request (${requestId})`, { force });
      errorRef.current = null;
      setIsLoading(true);
      
      // Execute the request
      const result = await requestFn(...params);
      log(`Request completed (${requestId})`, { result });
      
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        // Transform result if needed
        const finalResult = transform ? transform(result) : result;
        
        // Update cache
        dataRef.current = finalResult;
        lastUpdatedRef.current = Date.now();
        
        return finalResult;
      } else {
        log(`Component unmounted during request (${requestId}), discarding result`);
        return null;
      }
    } catch (err) {
      log(`Request error (${requestId})`, err);
      
      if (isMountedRef.current) {
        errorRef.current = err as Error;
        onError(err);
      }
      
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [requestFn, isCacheValid, transform, onError, log]);
  
  // Simple way to execute with no params
  const executeWithNoParams = useCallback(() => {
    log('Execute with no params called');
    return execute(false, ...([] as unknown as P));
  }, [execute, log]);
  
  // Set up auto-refresh and executeOnMount
  useEffect(() => {
    // Mark component as mounted
    isMountedRef.current = true;
    
    // Execute on mount if enabled
    if (executeOnMount) {
      log('Execute on mount triggered');
      executeWithNoParams();
    }
    
    // Set up refresh interval if provided
    if (refreshInterval) {
      log(`Setting up refresh interval: ${refreshInterval}ms`);
      
      // Clear any existing interval
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      
      // Create new interval
      const intervalId = window.setInterval(() => {
        if (isMountedRef.current) {
          log('Auto-refresh triggered');
          executeWithNoParams();
        }
      }, refreshInterval);
      
      intervalRef.current = intervalId;
    }
    
    // Cleanup function for unmount
    return () => {
      log('Component unmounting');
      isMountedRef.current = false;
      
      // Clear interval if it exists
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [executeWithNoParams, executeOnMount, refreshInterval, log]);
  
  // Return the current state and methods
  return {
    data: dataRef.current,
    isLoading,
    error: errorRef.current,
    lastUpdated: lastUpdatedRef.current,
    execute,
    clearCache
  };
}

/**
 * Utility to create a request key from parameters
 * 
 * @example
 * // Creates a key like "fetchUser:123"
 * const key = createRequestKey('fetchUser', userId);
 */
export function createRequestKey(prefix: string, ...params: any[]): string {
  return `${prefix}:${params.map(p => String(p)).join('-')}`;
} 