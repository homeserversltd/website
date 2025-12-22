// Custom hook for nasLinker API interactions
import { useState, useCallback } from 'react';
import {
  BrowseResponse,
  DeployResponse,
  DeleteResponse,
  RenameResponse,
  NewDirResponse,
  ScanResponse,
  NasLinkerConfig,
  UseNasLinkerControlsReturn
} from '../types';

const API_BASE = '/api/nasLinker';

export function useNasLinkerControls(): UseNasLinkerControlsReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleApiCall = useCallback(async <T>(
    apiCall: () => Promise<Response>
  ): Promise<T> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiCall();
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success && data.error) {
        throw new Error(data.error);
      }
      
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const browse = useCallback(async (path: string): Promise<BrowseResponse> => {
    return handleApiCall(async () => {
      const params = new URLSearchParams({ path });
      return fetch(`${API_BASE}/browse?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  const deploy = useCallback(async (
    sources: string[],
    destination: string,
    conflict_strategy: string = 'rename'
  ): Promise<DeployResponse> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sources,
          destination,
          conflict_strategy
        }),
      });
    });
  }, [handleApiCall]);

  const deleteItem = useCallback(async (path: string): Promise<DeleteResponse> => {
    return handleApiCall(async () => {
      const params = new URLSearchParams({ path });
      return fetch(`${API_BASE}/delete?${params}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  const renameItem = useCallback(async (path: string, new_name: string): Promise<RenameResponse> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          new_name
        }),
      });
    });
  }, [handleApiCall]);

  const createDirectory = useCallback(async (
    parent_path: string,
    dir_name: string
  ): Promise<NewDirResponse> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/newdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent_path,
          dir_name
        }),
      });
    });
  }, [handleApiCall]);

  const scan = useCallback(async (path: string): Promise<ScanResponse> => {
    return handleApiCall(async () => {
      const params = new URLSearchParams({ path });
      return fetch(`${API_BASE}/scan?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  const getConfig = useCallback(async (): Promise<NasLinkerConfig> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  return {
    browse,
    deploy,
    deleteItem,
    renameItem,
    createDirectory,
    scan,
    getConfig,
    isLoading,
    error,
    clearError
  };
}
