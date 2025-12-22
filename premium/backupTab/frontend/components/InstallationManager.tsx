import React, { useState } from 'react';
import { showToast } from '../../../components/Popup/PopupManager';
import { Button } from '../../../components/ui';

interface InstallationManagerProps {
  installationStatus: any;
  onStatusChange: () => void;
}

export const InstallationManager: React.FC<InstallationManagerProps> = ({
  installationStatus,
  onStatusChange
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const response = await fetch('/api/backup/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        await onStatusChange();
        showToast({
          message: 'backupTab installed successfully!',
          variant: 'success',
          duration: 5000
        });
      } else {
        showToast({
          message: `Installation failed: ${result.error}`,
          variant: 'error',
          duration: 8000
        });
      }
    } catch (error) {
      showToast({
        message: `Installation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
        duration: 8000
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!confirm('Are you sure you want to disable backup services? This will stop all backup functionality and remove backup configurations.')) {
      return;
    }

    setIsUninstalling(true);
    try {
      const response = await fetch('/api/backup/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        await onStatusChange();
        showToast({
          message: 'Backup services disabled successfully!',
          variant: 'success',
          duration: 5000
        });
      } else {
        showToast({
          message: `Failed to disable backup services: ${result.error}`,
          variant: 'error',
          duration: 8000
        });
      }
    } catch (error) {
      showToast({
        message: `Error disabling backup services: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
        duration: 8000
      });
    } finally {
      setIsUninstalling(false);
    }
  };

  if (!installationStatus) {
    return (
      <div className="installation-manager">
        <div className="installation-status unknown">
          <h3>Installation Status Unknown</h3>
          <p>Unable to determine installation status</p>
        </div>
      </div>
    );
  }

  return (
    <div className="installation-manager-compact">
      <div className={`installation-row ${installationStatus.installed ? 'installed' : 'not-installed'}`}>
        <div className="installation-info">
          <div className="status-indicator-compact">
            <span className="icon">
              {installationStatus.installed ? '✓' : '⚠'}
            </span>
            <span className="text">
              {installationStatus.installed ? 'Installed' : 'Not Installed'}
            </span>
          </div>
          
          <div className="version-tile">
            <span className="version-label">Version:</span>
            <span className="version-value">{installationStatus.version || 'N/A'}</span>
          </div>
        </div>
        
        <div className="installation-actions">
          {installationStatus.installed ? (
            installationStatus.can_uninstall && (
              <Button 
                variant="danger"
                size="medium"
                onClick={handleUninstall}
                disabled={isUninstalling}
                loading={isUninstalling}
              >
                Disable
              </Button>
            )
          ) : (
            installationStatus.can_install && (
              <Button 
                variant="primary"
                size="medium"
                onClick={handleInstall}
                disabled={isInstalling}
                loading={isInstalling}
              >
                Enable
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
