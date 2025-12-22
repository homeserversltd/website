import { useEffect } from 'react';
import { useBroadcastData, useSync } from '../../../store';

// Keep this constant for backward compatibility
export const SYNC_SESSION_KEY = 'current_sync_job';

/**
 * Hook for managing sync operations with persistent state.
 * This hook combines the zustand store sync state with broadcast data.
 * It maintains backward compatibility with the original useSyncState API.
 */
export const useSyncState = () => {
  const { syncState, registerSyncJob, updateSyncStatus, incrementKeepaliveCount, isActiveSyncInProgress } = useSync();
  const { getBroadcastData } = useBroadcastData();
  
  // Monitor broadcast data for sync status updates
  useEffect(() => {
    const checkForSyncUpdates = () => {
      const currentSyncStatus = getBroadcastData('sync_status', true);
      
      // If we have sync status data and it matches our job (or we have no job yet)
      if (currentSyncStatus) {
        // If we're tracking a job and this update is for our job
        if (syncState.jobId && currentSyncStatus.id === syncState.jobId) {
          // Update the sync status in the store
          updateSyncStatus(currentSyncStatus);
          
          // If the status is 'working', increment the keepalive count
          if (currentSyncStatus.status === 'working' && typeof currentSyncStatus.timestamp === 'number') {
            incrementKeepaliveCount(currentSyncStatus.timestamp);
          }
        } 
        // If we don't have a job yet but there's an active one (auto-detect mode)
        else if (!syncState.jobId && (currentSyncStatus.status === 'starting' || currentSyncStatus.status === 'working')) {
          // Register this job
          registerSyncJob(currentSyncStatus.id);
          updateSyncStatus(currentSyncStatus);
        }
      }
    };
    
    // Initial check
    checkForSyncUpdates();
    
    // Set up an interval to poll for updates
    const intervalId = setInterval(checkForSyncUpdates, 1000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [syncState.jobId, getBroadcastData, updateSyncStatus, incrementKeepaliveCount, registerSyncJob]);
  
  // Provide a clearSyncState function for backward compatibility
  const clearSyncState = () => {
    // This is now handled by the store, but include for API compatibility
    console.log('[useSyncState] clearSyncState called (now handled by global state)');
    // Storage is already handled in the store
  };

  return {
    syncState,
    registerSyncJob,
    clearSyncState,
    isActiveSyncInProgress
  };
}; 