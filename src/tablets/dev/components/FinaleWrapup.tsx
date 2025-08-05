import React, { useState, useEffect } from 'react';
import { useDev } from '../useDev';
import { useToast } from '../../../hooks/useToast';
import { DevLogResponse } from '../types';
import './FinaleWrapup.css';

export default function FinaleWrapup() {
  const [logData, setLogData] = useState<DevLogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWrappingUp, setIsWrappingUp] = useState(false);
  const { getDeploymentLog, finaleWrapup } = useDev();
  const { success, error, warning } = useToast();
  const [cleanupResult, setCleanupResult] = useState<any | null>(null);

  const loadDeploymentLog = async () => {
    setIsLoading(true);
    try {
      const data = await getDeploymentLog();
      setLogData(data);
    } catch (err) {
      error('Failed to load deployment log');
      console.error('Error loading deployment log:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeploymentLog();
  }, []);

  const handleCopyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      success('Log content copied to clipboard');
    } catch (err) {
      error('Failed to copy content to clipboard');
    }
  };

  const handleFinaleWrapup = async () => {
    try {
      // Confirmation dialog
      const confirmed = window.confirm(
        'Are you sure you want to perform finale wrapup?\n\n' +
        'This will permanently delete:\n' +
        '• /usr/local/sbin/wipeDeployPartition.sh\n' +
        '• /var/www/homeserver/deployment.log\n\n' +
        'This action cannot be undone.'
      );

      if (!confirmed) return;

      setIsWrappingUp(true);
      warning('Performing finale wrapup - deleting deployment artifacts...');
      
      const result = await finaleWrapup();
      
      if (result) {
        success('Finale wrapup completed successfully. Deployment artifacts have been cleaned up.');
        // Reload the log data to reflect changes
        await loadDeploymentLog();
        setCleanupResult(result);
      }
    } catch (err: any) {
      console.error('Error during finale wrapup:', err);
      error('Failed to complete finale wrapup');
    } finally {
      setIsWrappingUp(false);
    }
  };

  const getFileIcon = () => 'fas fa-file-text';

  const getCardStatus = () => {
    if (!logData) return 'loading';
    if (logData.log_data.error) return 'error';
    return logData.log_data.exists ? 'exists' : 'not-exists';
  };

  return (
    <div className={`dev-file-card finale-wrapup-card ${getCardStatus()}`}>
      <div className="dev-file-card-header">
        <div className="dev-file-icon finale-wrapup-icon">
          <i className={getFileIcon()} />
        </div>
        <div>
          <h3 className="dev-file-title">~/deployment.log</h3>
          <div className="dev-file-path">Path: /var/www/homeserver/deployment.log</div>
        </div>
      </div>

      <div className="dev-file-content">
        {isLoading ? (
          <div className="dev-file-not-found">
            <i className="fas fa-spinner fa-spin" />
            Loading deployment log...
          </div>
        ) : logData?.log_data.exists && logData?.log_data.content ? (
          <div className="dev-file-content-text">
            {logData.log_data.content}
          </div>
        ) : (
          <div className="dev-file-not-found">
            <i className="fas fa-file-excel" />
            {logData?.log_data.error 
              ? `Error: ${logData.log_data.error}` 
              : logData?.log_data.message || 'Deployment log does not exist'}
          </div>
        )}
      </div>

      <div className="dev-file-actions">
        {logData?.log_data.exists && logData?.log_data.content && (
          <button
            className="dev-file-action-btn"
            onClick={() => handleCopyContent(logData.log_data.content!)}
            title="Copy log content to clipboard"
          >
            <i className="fas fa-copy" /> Copy Log
          </button>
        )}
        <button
          onClick={handleFinaleWrapup}
          disabled={isWrappingUp}
          className="dev-file-action-btn finale-wrapup-btn"
          title="Delete deployment script and log file"
        >
          {isWrappingUp ? (
            <>
              <i className="fas fa-spinner fa-spin" />
              Wrapping Up...
            </>
          ) : (
            <>
              <i className="fas fa-broom" />
              Finale Wrapup
            </>
          )}
        </button>
      </div>

      {cleanupResult && (
        <div className="finale-result">
          <div className="finale-result-header">
            <i className="fas fa-check-circle"></i>
            <span>Cleanup Complete</span>
          </div>
          <div className="finale-result-details">
            {cleanupResult.data?.deleted_files && cleanupResult.data.deleted_files.length > 0 && (
              <div className="finale-deleted-files">
                <strong>Deleted Files:</strong>
                <ul>
                  {cleanupResult.data.deleted_files.map((file: string, index: number) => (
                    <li key={index}>{file}</li>
                  ))}
                </ul>
              </div>
            )}
            {cleanupResult.data?.cleaned_components && cleanupResult.data.cleaned_components.length > 0 && (
              <div className="finale-cleaned-components">
                <strong>Cleaned Components:</strong>
                <ul>
                  {cleanupResult.data.cleaned_components.map((component: string, index: number) => (
                    <li key={index}>{component}</li>
                  ))}
                </ul>
              </div>
            )}
            {cleanupResult.data?.total_cleaned && (
              <div className="finale-total">
                <strong>Total Items Cleaned: {cleanupResult.data.total_cleaned}</strong>
              </div>
            )}
            {cleanupResult.data?.errors && cleanupResult.data.errors.length > 0 && (
              <div className="finale-errors">
                <strong>Errors:</strong>
                <ul>
                  {cleanupResult.data.errors.map((error: string, index: number) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="finale-note">
              <i className="fas fa-info-circle"></i>
              <span>Developer tab has been cleaned up and minimized for customer use.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 