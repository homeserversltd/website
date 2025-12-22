import React, { useEffect } from 'react';
import { useLoading } from '../../../../hooks/useLoading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faExclamationCircle, faSync, faDatabase, faFileAlt, faClock } from '@fortawesome/free-solid-svg-icons';
import './SyncResultsModal.css';
import { useManagedInactivityTimeout } from '../../../../hooks/useInactivityTimeout';
import { startAdminSessionKeepalive, stopAdminSessionKeepalive } from '../../../../utils/keepalive';
import CircularProgress from '../../../../utils/circleLoader';
import { useSyncState, SYNC_SESSION_KEY } from '../../hooks/useSyncState';

interface SyncResultsModalProps {
  jobId: string | null;
  stayOpenOnFallback?: boolean;
}

const formatBytes = (bytes: number): string => {
  // Ensure bytes is a valid number and handle edge cases
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }
  
  // Log the incoming value for debugging

  
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Ensure we don't exceed array bounds
  const sizeIndex = Math.min(i, sizes.length - 1);
  const value = bytes / Math.pow(k, sizeIndex);
  
  // Log the calculated values
  
  
  return `${value.toFixed(2)} ${sizes[sizeIndex]}`;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} seconds`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds.toFixed(1)} seconds`;
  }
};

// Complementary colors for progress indicator
const progressColors = [
  'var(--accent)', // Theme accent
  'var(--success)', // Theme success
  'var(--warning)', // Theme warning
  'var(--error)', // Theme error
  'var(--secondary)', // Theme secondary
  'var(--primary)', // Theme primary
];

const SyncResultsModal: React.FC<SyncResultsModalProps> = ({ jobId, stayOpenOnFallback }) => {
  const { syncState, registerSyncJob, isActiveSyncInProgress } = useSyncState();
  const { isLoading, startLoading, stopLoading } = useLoading();
  
  // On mount, register job ID if provided, or check for active syncs
  useEffect(() => {
    if (jobId) {
      // If jobId is provided and different from current, register it
      if (!syncState.jobId || syncState.jobId !== jobId) {
    
        registerSyncJob(jobId);
      }
    } else {
      // If no jobId is provided, check if there's an active sync in progress
      // This will automatically update the syncState if one is found

      isActiveSyncInProgress();
    }
  }, [jobId, syncState.jobId, registerSyncJob, isActiveSyncInProgress]);
  
  // Update loading state based on sync status
  useEffect(() => {
    if (syncState.syncStatus) {
      if (syncState.syncStatus.status === 'starting' || syncState.syncStatus.status === 'working') {
        startLoading();
      } else if (syncState.syncStatus.status === 'done') {
        stopLoading();
      }
    }
  }, [syncState.syncStatus, startLoading, stopLoading]);

  // Start/stop the admin session keepalive based on sync status
  useEffect(() => {
    const syncActive = syncState.syncStatus?.status === 'starting' || syncState.syncStatus?.status === 'working';
    
    if (syncActive) {
  
      startAdminSessionKeepalive();
    } else {
      
      stopAdminSessionKeepalive();
    }
    
    return () => {
      if (syncActive) {
    
        stopAdminSessionKeepalive();
      }
    };
  }, [syncState.syncStatus?.status]);

  // Determine if the sync operation requires the timeout to be disabled
  const shouldDisableTimeout = syncState.syncStatus?.status === 'starting' || syncState.syncStatus?.status === 'working';
  
  // Use the managed hook
  useManagedInactivityTimeout(shouldDisableTimeout, 'sync_operation');

  // Render loading/progress/results
  return (
    <div className="sync-results-modal" data-stay-open={stayOpenOnFallback ? 'true' : 'false'}>
      <div className="sync-results-header">
        <div className={`sync-status-icon ${syncState.syncStatus?.success ? 'success' : syncState.syncStatus?.status === 'done' ? 'error' : ''}`}>
          <FontAwesomeIcon 
            icon={syncState.syncStatus?.success ? faCheckCircle : faExclamationCircle} 
            size="2x"
          />
        </div>
        <h2>{syncState.syncStatus?.status === 'done' ? (syncState.syncStatus?.success ? 'Sync Completed Successfully' : 'Sync Operation Failed') : 'Sync In Progress'}</h2>
      </div>
      
      {/* Show progress */}
      {isLoading && (
        <div className="sync-progress">
          <CircularProgress keepaliveCount={syncState.keepaliveCount} />
          <div>
            <div>{syncState.syncStatus?.status_message || 'Syncing...'}</div>
            <div>
              Run Time: {Math.floor(syncState.elapsedTime / 60).toString().padStart(2, '0')}
              :{(syncState.elapsedTime % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ fontStyle: 'italic', marginTop: '0.5rem', color: 'var(--text)' }}>
              Keep this window open to see results at the end.
            </div>
          </div>
        </div>
      )}
      
      {syncState.syncStatus?.status === 'done' && (
        <div className="sync-details">
          
          <div className="sync-stats">
            {typeof syncState.syncStatus?.bytes_transferred === 'number' && (
              <div className="stat-item">
                <div className="stat-icon">
                  <FontAwesomeIcon icon={faDatabase} />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{formatBytes(syncState.syncStatus.bytes_transferred)}</div>
                  <div className="stat-label">Data Transferred</div>
                </div>
              </div>
            )}
            
            {typeof syncState.syncStatus?.files_transferred === 'number' && (
              <div className="stat-item">
                <div className="stat-icon">
                  <FontAwesomeIcon icon={faFileAlt} />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{syncState.syncStatus.files_transferred}</div>
                  <div className="stat-label">Files Transferred</div>
                </div>
              </div>
            )}
            
            {typeof syncState.syncStatus?.duration === 'number' && (
              <div className="stat-item">
                <div className="stat-icon">
                  <FontAwesomeIcon icon={faClock} />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{formatDuration(syncState.syncStatus.duration)}</div>
                  <div className="stat-label">Time Taken</div>
                </div>
              </div>
            )}
          </div>
          
          {syncState.syncStatus?.errors && syncState.syncStatus.errors.length > 0 && (
            <div className="sync-errors">
              <h3>Errors</h3>
              <ul>
                {syncState.syncStatus.errors.map((error: string, index: number) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          {(syncState.syncStatus?.source_path || syncState.syncStatus?.destination_path) && (
            <div className="sync-paths">
              {syncState.syncStatus.source_path && (
                <div className="path-item">
                  <div className="path-label">Source:</div>
                  <div className="path-value">{syncState.syncStatus.source_path}</div>
                </div>
              )}
              {syncState.syncStatus.destination_path && (
                <div className="path-item">
                  <div className="path-label">Destination:</div>
                  <div className="path-value">{syncState.syncStatus.destination_path}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

SyncResultsModal.displayName = 'SyncResultsModal';

export default SyncResultsModal; 