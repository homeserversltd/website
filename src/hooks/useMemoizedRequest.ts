import { useRef, useCallback, useEffect } from 'react';

export interface MemoizedRequestOptions<T> {
  /**
   * Time in milliseconds to cache the result
   * Default: 5000ms (5 seconds)
   */
  cacheDuration?: number;
  
  /**
   * Whether to deduplicate in-flight requests with the same key
   * Default: true
   */
  deduplicate?: boolean;
  
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
   * Whether to clear the cache when the component unmounts
   * Default: true
   */
  clearOnUnmount?: boolean;
  
  /**
   * Optional dependency array that, when changed, will invalidate the cache
   * Default: undefined (no dependencies)
   */
  dependencies?: any[];
  
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

export interface MemoizedRequestResult<T, P extends any[]> {
  /**
   * Executes the request, using the cached result if valid
   * Force=true will bypass the cache
   */
  execute: (force?: boolean, ...params: P) => Promise<T | null>;
  
  /**
   * Manually clears the cached result
   */
  clearCache: () => void;
  
  /**
   * Returns the currently cached result (may be null)
   */
  getCachedResult: () => T | null;
  
  /**
   * Whether there is a request in progress
   */
  isLoading: boolean;
  
  /**
   * Last error that occurred (if any)
   */
  error: Error | null;
  
  /**
   * Timestamp of when the cached result was last updated
   */
  lastUpdated: number | null;
}

// Global in-flight request tracking for deduplication
const inFlightRequests: Record<string, Promise<any> | undefined> = {};

/**
 * Hook for memoizing async requests with configurable caching
 * 
 * @param requestFn The async function to memoize
 * @param key A unique key for this request (used for cache and deduplication)
 * @param options Optional configuration
 * @returns Object with execute function and cache control
 */
export function useMemoizedRequest<T, P extends any[] = []>(
  requestFn: (...params: P) => Promise<T>,
  key: string,
  options: MemoizedRequestOptions<T> = {}
): MemoizedRequestResult<T, P> {
  // Apply default options
  const {
    cacheDuration = 5000,
    deduplicate = true,
    executeOnMount = false,
    refreshInterval,
    transform,
    clearOnUnmount = true,
    dependencies = [],
    onError = (error) => console.error(`[useMemoizedRequest] ${key} error:`, error),
    debug = false
  } = options;
  
  // Refs for cache state
  const cacheRef = useRef<T | null>(null);
  const lastUpdatedRef = useRef<number | null>(null);
  const pendingRequestRef = useRef<Promise<T> | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const errorRef = useRef<Error | null>(null);
  const intervalRef = useRef<number | null>(null);
  const requestCountRef = useRef<number>(0);
  
  // For logging
  const logPrefix = `[MemoizedRequest:${key}]`;
  
  // Debug logging function
  const log = (message: string, data?: any) => {
    if (debug) {
      console.log(`${logPrefix} ${message}`, data !== undefined ? data : '');
    }
  };

  log('Hook initialized', { cacheDuration, deduplicate, executeOnMount });
  
  // Function to check if cache is valid
  const isCacheValid = useCallback((): boolean => {
    if (lastUpdatedRef.current === null) {
      log('Cache validity check: No cache timestamp');
      return false;
    }
    const age = Date.now() - lastUpdatedRef.current;
    const valid = age < cacheDuration;
    log(`Cache validity check: ${valid ? 'Valid' : 'Expired'}`, { age, cacheDuration });
    return valid;
  }, [cacheDuration, debug]);
  
  // Clear the cache
  const clearCache = useCallback((): void => {
    log('Cache cleared');
    cacheRef.current = null;
    lastUpdatedRef.current = null;
    errorRef.current = null;
  }, [debug]);
  
  // Execute the request with caching
  const execute = useCallback(
    async (force = false, ...params: P): Promise<T | null> => {
      const requestId = ++requestCountRef.current;
      log(`Execute called (${requestId})`, { force, params });
      
      try {
        // If cache is valid and not forced, return cached result
        if (!force && isCacheValid()) {
          log(`Using cached result (${requestId})`, cacheRef.current);
          return cacheRef.current;
        }
        
        // Check for global in-flight request with same key
        const existingRequest = inFlightRequests[key];
        if (deduplicate && existingRequest) {
          log(`Using in-flight global request (${requestId})`, { hasExistingRequest: !!existingRequest });
          return existingRequest;
        }
        
        // If deduplicate is enabled and there's a pending request, return that
        if (deduplicate && pendingRequestRef.current) {
          log(`Using in-flight component request (${requestId})`);
          return pendingRequestRef.current;
        }
        
        // Start new request
        log(`Starting new request (${requestId})`, { force });
        errorRef.current = null;
        isLoadingRef.current = true;
        
        // Create request promise
        const requestPromise = requestFn(...params);
        
        // Store the request promise
        pendingRequestRef.current = requestPromise;
        if (deduplicate) {
          inFlightRequests[key] = requestPromise;
        }
        
        // Await the request
        const result = await requestPromise;
        log(`Request completed (${requestId})`, { result });
        
        // Transform result if needed
        const finalResult = transform ? transform(result) : result;
        
        // Update cache
        cacheRef.current = finalResult;
        lastUpdatedRef.current = Date.now();
        
        return finalResult;
      } catch (err) {
        log(`Request error (${requestId})`, err);
        errorRef.current = err as Error;
        onError(err);
        return null;
      } finally {
        log(`Request finalized (${requestId})`);
        isLoadingRef.current = false;
        pendingRequestRef.current = null;
        if (deduplicate) {
          delete inFlightRequests[key];
        }
      }
    },
    [requestFn, isCacheValid, deduplicate, transform, onError, key, debug]
  );
  
  // Function to execute with no parameters
  const executeWithNoParams = useCallback(() => {
    log('Execute with no params called');
    return execute(false, ...([] as unknown as P));
  }, [execute, debug]);
  
  // Get the currently cached result
  const getCachedResult = useCallback((): T | null => {
    log('Get cached result called', cacheRef.current);
    return cacheRef.current;
  }, [debug]);
  
  // Handle auto-refresh and executeOnMount
  useEffect(() => {
    let mounted = true;
    let intervalId: number | null = null;
    
    // Clear previous interval if it exists
    if (intervalRef.current !== null) {
      log('Clearing previous interval');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Execute on mount if enabled
    if (executeOnMount) {
      log('Execute on mount triggered');
      executeWithNoParams();
    }
    
    // Set up refresh interval if provided
    if (refreshInterval && mounted) {
      log(`Setting up refresh interval: ${refreshInterval}ms`);
      intervalId = window.setInterval(() => {
        if (mounted) {
          log('Auto-refresh triggered');
          executeWithNoParams();
        }
      }, refreshInterval);
      intervalRef.current = intervalId;
    }
    
    // Cleanup on unmount
    return () => {
      log('Component unmounting');
      mounted = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        log('Interval cleared on unmount');
      }
      
      if (clearOnUnmount) {
        log('Cache cleared on unmount');
        clearCache();
      }
    };
  }, [executeWithNoParams, executeOnMount, refreshInterval, clearCache, clearOnUnmount, debug, ...dependencies]);
  
  return {
    execute,
    clearCache,
    getCachedResult,
    get isLoading() { return isLoadingRef.current; },
    get error() { return errorRef.current; },
    get lastUpdated() { return lastUpdatedRef.current; }
  };
}

/**
 * Utility to create a memoization key from parameters
 * 
 * @example
 * // Creates a key like "fetchUser:123"
 * const key = createMemoKey('fetchUser', userId);
 */
export function createMemoKey(prefix: string, ...params: any[]): string {
  return `${prefix}:${params.map(p => String(p)).join('-')}`;
} 