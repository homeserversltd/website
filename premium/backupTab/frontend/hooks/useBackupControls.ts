/**
 * HOMESERVER Backup Controls Hook
 * Manages backup system operations and state
 */

import { useState, useCallback } from 'react';
import { showToast } from '../../../components/Popup/PopupManager';
import { 
  BackupStatus, 
  Repository, 
  BackupOperation, 
  CloudTestResult, 
  BackupConfig, 
  BackupHistory, 
  ScheduleInfo,
  ProviderStatus,
  HeaderStats,
  ApiResponse,
  UseBackupControlsReturn 
} from '../types';

const API_BASE = '/api/backup';

export function useBackupControls(): UseBackupControlsReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleApiCall = useCallback(async <T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();
      console.log('API Response for', endpoint, ':', data);

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'API call failed');
      }

      console.log('API Success - returning data:', data.data);
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      // Show error toast
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 5000,
        priority: 10
      });
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getStatus = useCallback(async (): Promise<BackupStatus> => {
    return handleApiCall<BackupStatus>('/status');
  }, [handleApiCall]);

  const getRepositories = useCallback(async (): Promise<Repository[]> => {
    return handleApiCall<Repository[]>('/repositories');
  }, [handleApiCall]);

  const runBackup = useCallback(async (
    type: string, 
    repositories: string[]
  ): Promise<BackupOperation> => {
    return handleApiCall<BackupOperation>('/backup/run', {
      method: 'POST',
      body: JSON.stringify({ type, repositories }),
    });
  }, [handleApiCall]);

  const syncNow = useCallback(async (): Promise<any> => {
    console.log('=== useBackupControls.syncNow() CALLED ===');
    console.log('Making API call to /sync-now with POST method');
    
    try {
      const result = await handleApiCall<any>('/sync-now', {
        method: 'POST',
      });
      console.log('handleApiCall returned successfully:', result);
      return result;
    } catch (error) {
      console.error('=== useBackupControls.syncNow() ERROR ===');
      console.error('handleApiCall threw error:', error);
      console.error('Error type:', typeof error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }, [handleApiCall]);

  const testCloudConnections = useCallback(async (): Promise<CloudTestResult> => {
    return handleApiCall<CloudTestResult>('/cloud/test', {
      method: 'POST',
    });
  }, [handleApiCall]);

  const getConfig = useCallback(async (): Promise<BackupConfig> => {
    return handleApiCall<BackupConfig>('/config');
  }, [handleApiCall]);

  const updateConfig = useCallback(async (config: Partial<BackupConfig>): Promise<boolean> => {
    await handleApiCall('/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
    return true;
  }, [handleApiCall]);

  const getHistory = useCallback(async (): Promise<BackupHistory> => {
    return handleApiCall<BackupHistory>('/history');
  }, [handleApiCall]);

  const getSchedule = useCallback(async (): Promise<ScheduleInfo> => {
    return handleApiCall<ScheduleInfo>('/schedule');
  }, [handleApiCall]);

  const updateSchedule = useCallback(async (action: string): Promise<boolean> => {
    await handleApiCall('/schedule', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    return true;
  }, [handleApiCall]);

  const setScheduleConfig = useCallback(async (config: any): Promise<boolean> => {
    await handleApiCall('/schedule/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
    return true;
  }, [handleApiCall]);

  const getScheduleHistory = useCallback(async (): Promise<any> => {
    return handleApiCall<any>('/schedule/history');
  }, [handleApiCall]);

  const getScheduleTemplates = useCallback(async (): Promise<any> => {
    return handleApiCall<any>('/schedule/templates');
  }, [handleApiCall]);

  const testSchedule = useCallback(async (): Promise<any> => {
    return handleApiCall<any>('/schedule/test', {
      method: 'POST',
    });
  }, [handleApiCall]);

  // Keyman credential management functions
  const createKeymanCredentials = useCallback(async (serviceName: string, username: string, password: string): Promise<boolean> => {
    await handleApiCall(`/keyman/credentials/${serviceName}`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return true;
  }, [handleApiCall]);

  const updateKeymanCredentials = useCallback(async (serviceName: string, newPassword: string, username?: string, oldPassword?: string): Promise<boolean> => {
    const body: any = { new_password: newPassword };
    if (username) body.username = username;
    if (oldPassword) body.old_password = oldPassword;
    
    await handleApiCall(`/keyman/credentials/${serviceName}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return true;
  }, [handleApiCall]);

  const deleteKeymanCredentials = useCallback(async (serviceName: string): Promise<boolean> => {
    await handleApiCall(`/keyman/credentials/${serviceName}`, {
      method: 'DELETE',
    });
    return true;
  }, [handleApiCall]);

  const getKeymanCredentials = useCallback(async (serviceName: string): Promise<any> => {
    return handleApiCall<any>(`/keyman/credentials/${serviceName}`);
  }, [handleApiCall]);

  const getProvidersStatus = useCallback(async (): Promise<ProviderStatus[]> => {
    console.log('Making API call to /providers/status');
    const result = await handleApiCall<{providers: ProviderStatus[]}>('/providers/status');
    console.log('Raw API response for providers status:', result);
    console.log('Extracted providers array:', result.providers);
    return result.providers;
  }, [handleApiCall]);

  const installBackupSystem = useCallback(async (): Promise<boolean> => {
    try {
      const result = await handleApiCall<{message: string, installed: boolean}>('/install', {
        method: 'POST'
      });
      
      if (result.installed) {
        showToast({
          message: result.message,
          variant: 'success',
          duration: 5000
        });
        return true;
      } else {
        showToast({
          message: 'Installation failed',
          variant: 'error',
          duration: 5000
        });
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Installation failed';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 5000
      });
      return false;
    }
  }, [handleApiCall]);

  const uninstallBackupSystem = useCallback(async (): Promise<boolean> => {
    try {
      const result = await handleApiCall<{message: string, installed: boolean}>('/uninstall', {
        method: 'POST'
      });
      
      if (!result.installed) {
        showToast({
          message: result.message,
          variant: 'success',
          duration: 5000
        });
        return true;
      } else {
        showToast({
          message: 'Uninstallation failed',
          variant: 'error',
          duration: 5000
        });
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Uninstallation failed';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 5000
      });
      return false;
    }
  }, [handleApiCall]);

  return {
    getStatus,
    getRepositories,
    runBackup,
    syncNow,
    testCloudConnections,
    getConfig,
    updateConfig,
    getHistory,
    getSchedule,
    updateSchedule,
    setScheduleConfig,
    getScheduleHistory,
    getScheduleTemplates,
    testSchedule,
    getProvidersStatus,
    installBackupSystem,
    uninstallBackupSystem,
    // Keyman credential management
    createKeymanCredentials,
    updateKeymanCredentials,
    deleteKeymanCredentials,
    getKeymanCredentials,
    isLoading,
    error,
    clearError,
  };
}

// Hook for header statistics
export const useHeaderStats = () => {
  const [stats, setStats] = useState<HeaderStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/backup/header-stats');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse<HeaderStats> = await response.json();
      
      if (data.success && data.data) {
        setStats(data.data);
      } else {
        throw new Error(data.error || 'Failed to load header statistics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load header statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    stats,
    loading,
    error,
    loadStats
  };
};