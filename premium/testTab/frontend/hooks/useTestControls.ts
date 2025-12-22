// Test custom hook for premium tab actions and API interactions
import { useState, useCallback } from 'react';
import { 
  TestService, 
  TestData, 
  AnalyticsResult, 
  ExternalDataResponse, 
  TestConfig, 
  HealthStatus,
  UseTestControlsReturn 
} from '../types';

const API_BASE = '/api/test';

export function useTestControls(): UseTestControlsReturn {
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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

  const generateData = useCallback(async (type: string, count: number): Promise<TestData> => {
    return handleApiCall(async () => {
      const params = new URLSearchParams({
        type,
        count: count.toString()
      });
      
      return fetch(`${API_BASE}/data/sample?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  const analyzeData = useCallback(async (dataset: any[]): Promise<AnalyticsResult> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/analytics/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset }),
      });
    });
  }, [handleApiCall]);

  const fetchExternalData = useCallback(async (url: string): Promise<ExternalDataResponse> => {
    return handleApiCall(async () => {
      const params = new URLSearchParams({ url });
      
      return fetch(`${API_BASE}/external/fetch?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  const getConfig = useCallback(async (): Promise<TestConfig> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  const checkHealth = useCallback(async (): Promise<HealthStatus> => {
    return handleApiCall(async () => {
      return fetch(`${API_BASE}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  }, [handleApiCall]);

  // Legacy function for backward compatibility
  const executeTestAction = useCallback((service: TestService) => {
    console.log(`Action executed for service: ${service.name}`);
    // You can extend this to perform actual actions
  }, []);

  return {
    generateData,
    analyzeData,
    fetchExternalData,
    getConfig,
    checkHealth,
    isLoading,
    error,
    clearError,
    // Legacy support
    executeTestAction
  } as UseTestControlsReturn & { executeTestAction: (service: TestService) => void };
} 