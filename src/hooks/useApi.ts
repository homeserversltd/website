import { api } from '../api/client';
import { useCallback, useMemo } from 'react';
import { isOfflineApiError } from '../api/interceptors';

/**
 * Hook for accessing the API client with consistent error handling
 * Provides typed methods for making API requests
 */
export const useApi = () => {
  const get = useCallback(async <T>(endpoint: string) => {
    try {
      return await api.get<T>(endpoint);
    } catch (error) {
      if (!isOfflineApiError(error)) {
        console.error('[useApi] GET request failed:', error);
      }
      throw error;
    }
  }, []);

  const post = useCallback(async <T>(endpoint: string, data?: any) => {
    try {
      return await api.post<T>(endpoint, data);
    } catch (error) {
      if (!isOfflineApiError(error)) {
        console.error('[useApi] POST request failed:', error);
      }
      throw error;
    }
  }, []);

  const put = useCallback(async <T>(endpoint: string, data: any) => {
    try {
      return await api.put<T>(endpoint, data);
    } catch (error) {
      if (!isOfflineApiError(error)) {
        console.error('[useApi] PUT request failed:', error);
      }
      throw error;
    }
  }, []);

  const del = useCallback(async <T>(endpoint: string) => {
    try {
      return await api.delete<T>(endpoint);
    } catch (error) {
      if (!isOfflineApiError(error)) {
        console.error('[useApi] DELETE request failed:', error);
      }
      throw error;
    }
  }, []);

  return useMemo(() => ({
    get,
    post,
    put,
    delete: del,
  }), [get, post, put, del]);
};