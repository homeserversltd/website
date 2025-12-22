import { useState, useCallback } from 'react';

/**
 * Configuration options for loading state management
 */
interface UseLoadingOptions {
  /** 
   * Initial loading state 
   * Determines whether loading starts as true or false
   * @default false
   */
  initialState?: boolean;

  /** 
   * Maximum time (in milliseconds) allowed for an operation before timing out
   * Prevents indefinite loading states
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /** 
   * Minimum duration (in milliseconds) to show loading state
   * Ensures loading indicator is visible for a minimum time
   * Prevents rapid flashing of loading states
   * @default 500 (0.5 seconds)
   */
  minDuration?: number;
}

/**
 * Hook for managing loading states with advanced control
 * 
 * Provides comprehensive loading state management with features:
 * - Automatic loading state tracking
 * - Timeout handling
 * - Minimum duration enforcement
 * - Error tracking
 * 
 * @param options - Configuration options for loading behavior
 * @returns Object with loading state and management methods
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const { 
 *     isLoading, 
 *     error, 
 *     withLoading 
 *   } = useLoading({
 *     timeout: 15000,      // 15 seconds timeout
 *     minDuration: 1000    // Minimum 1 second loading
 *   });
 * 
 *   const fetchData = async () => {
 *     try {
 *       // Automatically manages loading state
 *       const result = await withLoading(
 *         apiCall(),        // Your async operation
 *         { silent: false } // Optional: suppress loading state
 *       );
 *       // Handle successful result
 *     } catch (err) {
 *       // Error is automatically captured
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       {isLoading && <LoadingSpinner />}
 *       {error && <ErrorMessage message={error.message} />}
 *     </div>
 *   );
 * };
 * ```
 */
export const useLoading = ({
  initialState = false,
  timeout = 30000, // 30 seconds default timeout
  minDuration = 500, // 500ms minimum loading duration
}: UseLoadingOptions = {}) => {
  /** Current loading state */
  const [isLoading, setIsLoading] = useState(initialState);
  
  /** Current error state, if any operation fails */
  const [error, setError] = useState<Error | null>(null);

  /**
   * Manually start the loading state
   * Resets any previous error
   */
  const startLoading = useCallback(() => {
    setIsLoading(true);
    setError(null);
  }, []);

  /**
   * Manually stop the loading state
   */
  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  /**
   * Wrap an async operation with automatic loading state management
   * 
   * @template T - The return type of the promise
   * @param promise - The async operation to wrap
   * @param options - Additional configuration for the loading state
   * @returns The result of the async operation
   * 
   * @throws Will throw an error if the operation fails or times out
   */
  const withLoading = useCallback(async <T,>(
    promise: Promise<T>,
    options: { silent?: boolean } = {}
  ): Promise<T> => {
    // Start loading if not in silent mode
    if (!options.silent) {
      startLoading();
    }

    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Set up timeout mechanism
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Operation timed out'));
        }, timeout);
      });

      // Race between the actual promise and timeout
      const result = await Promise.race([promise, timeoutPromise]);

      // Enforce minimum duration
      const elapsed = Date.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }

      return result;
    } catch (err) {
      // Capture and rethrow errors
      setError(err instanceof Error ? err : new Error('An error occurred'));
      throw err;
    } finally {
      // Cleanup
      if (timeoutId) clearTimeout(timeoutId);
      if (!options.silent) {
        stopLoading();
      }
    }
  }, [startLoading, stopLoading, timeout, minDuration]);

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    withLoading,
  };
};