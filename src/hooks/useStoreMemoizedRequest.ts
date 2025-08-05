import { useRef, useEffect, useCallback } from 'react';
import { useApiCache } from '../store';
import { CacheEntry } from '../store/slices/cacheSlice';

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
  
  /**
   * Optional key prefix to identify admin-related requests
   * If provided, cache will be cleared on admin mode exit
   */
  adminRequest?: boolean;

  /**
   * When true, automatically refetch data when cache expires during getCachedResult
   * Default: true
   */
  refetchOnExpiration?: boolean;
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
   * If cache is expired and refetchOnExpiration is true, will trigger a refetch
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

const ADMIN_PREFIX = 'admin:';

/**
 * Hook for memoizing async requests with configurable caching using global store
 * 
 * @param requestFn The async function to memoize
 * @param key A unique key for this request (used for cache and deduplication)
 * @param options Optional configuration
 * @returns Object with execute function and cache control
 */
export function useStoreMemoizedRequest<T, P extends any[] = []>(
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
    dependencies = [],
    onError = (error) => console.error(`[useStoreMemoizedRequest] ${cacheKey} error:`, error),
    debug = false,
    adminRequest = false,
    refetchOnExpiration = true
  } = options;
  
  // Create a cache key, prefixing admin requests
  const cacheKey = adminRequest ? `${ADMIN_PREFIX}${key}` : key;
  
  // Get store cache methods
  const {
    getApiCacheEntry,
    setApiCacheEntry,
    clearApiCache,
    isApiCacheValid,
    getApiCacheLastUpdated,
    setApiRequestInFlight,
    isApiRequestInFlight
  } = useApiCache();
  
  // Local component state
  const isLoadingRef = useRef<boolean>(false);
  const errorRef = useRef<Error | null>(null);
  const intervalRef = useRef<number | null>(null);
  const requestCountRef = useRef<number>(0);
  const componentIdRef = useRef<string>(`comp-${Date.now()}`);
  const lastParamsRef = useRef<P | null>(null);
  
  // For logging
  const logPrefix = `[StoreRequest:${cacheKey}:${componentIdRef.current}]`;
  
  // Debug logging function
  const log = (message: string, data?: any) => {
    if (debug) {
      console.log(`${logPrefix} ${message}`, data !== undefined ? data : '');
    }
  };

  log('Hook initialized', { cacheDuration, deduplicate, executeOnMount, adminRequest, refetchOnExpiration });
  
  // Clear the cache
  const clearCache = useCallback((): void => {
    log('Clearing cache');
    clearApiCache(cacheKey);
    errorRef.current = null;
  }, [clearApiCache, cacheKey, debug]);
  
  // Execute the request with caching
  const execute = useCallback(
    async (force = false, ...params: P): Promise<T | null> => {
      const requestId = ++requestCountRef.current;
      log(`Execute called (${requestId})`, { force, params });
      
      // Save the last params used to make a request
      lastParamsRef.current = params.length > 0 ? params : null;
      
      try {
        // If cache is valid and not forced, return cached result
        if (!force && isApiCacheValid(cacheKey)) {
          const cachedEntry = getApiCacheEntry<T>(cacheKey);
          const cachedData = cachedEntry?.data;
          log(`Using cached result (${requestId})`, cachedData);
          return cachedData || null;
        }
        
        // Check for global in-flight request with same key
        if (deduplicate && isApiRequestInFlight(cacheKey)) {
          log(`Request already in-flight (${requestId}), waiting for completion`);
          isLoadingRef.current = true;
          
          // Poll for result until it's available or timeout
          let attempts = 0;
          const maxAttempts = 100; // 10 seconds max wait (100ms * 100)
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
            
            // Check if request is still in-flight
            if (!isApiRequestInFlight(cacheKey)) {
              // Get cached result if available
              const entry = getApiCacheEntry<T>(cacheKey);
              if (entry) {
                log(`Got result from completed in-flight request (${requestId})`);
                isLoadingRef.current = false;
                return entry.data;
              }
              break;
            }
          }
          
          // If we got here, either timed out or no result
          log(`In-flight request wait timed out or no result (${requestId})`);
          isLoadingRef.current = false;
          
          // If forced, proceed with new request
          if (!force) {
            return null;
          }
        }
        
        // Start new request
        log(`Starting new request (${requestId})`, { force });
        errorRef.current = null;
        isLoadingRef.current = true;
        
        // Mark request as in-flight
        if (deduplicate) {
          setApiRequestInFlight(cacheKey, true);
        }
        
        // Execute the request
        const result = await requestFn(...params);
        log(`Request completed (${requestId})`, { result });
        
        // Transform result if needed
        const finalResult = transform ? transform(result) : result;
        
        // Update cache
        setApiCacheEntry(cacheKey, finalResult, cacheDuration);
        
        return finalResult;
      } catch (err) {
        log(`Request error (${requestId})`, err);
        errorRef.current = err as Error;
        onError(err);
        return null;
      } finally {
        log(`Request finalized (${requestId})`);
        isLoadingRef.current = false;
        
        // Mark request as no longer in-flight
        if (deduplicate) {
          setApiRequestInFlight(cacheKey, false);
        }
      }
    },
    [
      requestFn,
      cacheKey,
      cacheDuration,
      deduplicate,
      transform,
      onError,
      isApiCacheValid,
      getApiCacheEntry,
      setApiCacheEntry,
      isApiRequestInFlight,
      setApiRequestInFlight,
      debug
    ]
  );
  
  // Function to execute with no parameters
  const executeWithNoParams = useCallback(() => {
    log('Execute with no params called');
    return execute(false, ...([] as unknown as P));
  }, [execute, debug]);
  
  // Get the currently cached result with auto-refetch on expiration
  const getCachedResult = useCallback((): T | null => {
    const entry = getApiCacheEntry<T>(cacheKey);
    const result = entry?.data || null;
    
    // If cache is expired and refetchOnExpiration is enabled, trigger a refetch
    if (result === null && !isApiCacheValid(cacheKey) && refetchOnExpiration && !isLoadingRef.current) {
      log('Cache expired, auto-triggering refetch');
      // Use the last params if available, otherwise use empty array
      const params = lastParamsRef.current || ([] as unknown as P);
      // Execute in the next tick to avoid state updates during render
      setTimeout(() => {
        execute(false, ...params);
      }, 0);
    }
    
    log('Get cached result called', result);
    return result;
  }, [getApiCacheEntry, cacheKey, isApiCacheValid, execute, refetchOnExpiration, debug]);
  
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
    };
  }, [executeWithNoParams, executeOnMount, refreshInterval, debug, ...dependencies]);
  
  return {
    execute,
    clearCache,
    getCachedResult,
    get isLoading() { return isLoadingRef.current; },
    get error() { return errorRef.current; },
    get lastUpdated() { return getApiCacheLastUpdated(cacheKey); }
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