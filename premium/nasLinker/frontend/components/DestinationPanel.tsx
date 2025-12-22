import React, { useState, useEffect, useCallback } from 'react';
import { FileEntry } from '../types';
import { useNasLinkerControls } from '../hooks/useNasLinkerControls';
import { PathBreadcrumb } from './PathBreadcrumb';
import './DestinationPanel.css';

const BASE_PATH = '/mnt/nas';

interface DestinationPanelProps {
  selectedPaths: Set<string>;
  onDeployComplete: () => void;
}

export const DestinationPanel: React.FC<DestinationPanelProps> = ({
  selectedPaths,
  onDeployComplete
}) => {
  const {
    browse,
    deploy,
    isLoading,
    error,
    clearError
  } = useNasLinkerControls();

  const [currentPath, setCurrentPath] = useState(BASE_PATH);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    clearError();
    try {
      const result = await browse(path);
      if (result.success) {
        setCurrentPath(result.path);
        setEntries(result.entries);
      } else {
        console.error('Failed to browse directory:', result.error);
      }
    } catch (err) {
      console.error('Error loading directory:', err);
    } finally {
      setLoading(false);
    }
  }, [browse, clearError]);

  useEffect(() => {
    loadDirectory(BASE_PATH);
  }, [loadDirectory]);

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const handleGoUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    if (parentPath.startsWith(BASE_PATH) || parentPath === BASE_PATH) {
      loadDirectory(parentPath || BASE_PATH);
    }
  };

  const handleDeploy = async () => {
    if (selectedPaths.size === 0) {
      return;
    }

    const sources = Array.from(selectedPaths);
    
    try {
      const result = await deploy(sources, currentPath, 'rename');
      if (result.success) {
        await loadDirectory(currentPath);
        onDeployComplete();
        
        alert(`Deployment complete! Success: ${result.success_count}, Failed: ${result.fail_count}`);
      } else {
        alert(`Deployment failed: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      console.error('Error deploying:', err);
      alert('Failed to deploy hardlinks');
    }
  };

  const canGoUp = currentPath !== BASE_PATH && currentPath.startsWith(BASE_PATH);

  return (
    <div className="destination-panel">
      <div className="destination-panel-header">
        <PathBreadcrumb
          currentPath={currentPath}
          onNavigate={handleNavigate}
          basePath={BASE_PATH}
        />
        <div className="destination-panel-actions">
          {canGoUp && (
            <button
              className="destination-btn"
              onClick={handleGoUp}
              type="button"
              title="Go up one directory"
            >
              ⬆️ Up
            </button>
          )}
          <button
            className="destination-btn refresh-btn"
            onClick={() => loadDirectory(currentPath)}
            type="button"
            title="Refresh directory"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button onClick={clearError}>✕</button>
        </div>
      )}

      <div className="destination-panel-content">
        {loading || isLoading ? (
          <div className="loading-indicator">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="empty-directory">Directory is empty</div>
        ) : (
          <div className="destination-file-list">
            {entries.map((entry) => (
              <div
                key={entry.path}
                className={`destination-file-item ${entry.is_dir ? 'directory' : 'file'}`}
                onClick={() => entry.is_dir && handleNavigate(entry.path)}
                style={{ cursor: entry.is_dir ? 'pointer' : 'default' }}
              >
                <span className="destination-file-icon">
                  {entry.is_dir ? '📁' : entry.is_hardlink ? '🔗' : '📄'}
                </span>
                <span className="destination-file-name" title={entry.name}>
                  {entry.name}
                </span>
                {entry.is_dir && (
                  <span className="destination-file-badge">Directory</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="destination-panel-footer">
        <button
          className="destination-deploy-btn"
          onClick={handleDeploy}
          disabled={selectedPaths.size === 0}
          type="button"
        >
          Deploy ({selectedPaths.size} item{selectedPaths.size !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
};
