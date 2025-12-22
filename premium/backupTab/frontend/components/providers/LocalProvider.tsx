/**
 * HOMESERVER Backup Local Provider Component
 * Local filesystem backup configuration
 */

import React, { useState, useEffect } from 'react';
import { CloudProvider } from '../../types';
// CRITICAL: This import path is specifically calculated for the React build system
// The build runs from /var/www/homeserver/src/ and treats src/ as the root directory
// From providers/ directory: ../../../../ goes up 4 levels to reach src/, then down to components/Popup/PopupManager
// Changing this path will cause "Module not found" errors during npm run build
import { showToast } from '../../../../components/Popup/PopupManager';
import { Input, Button, Collapsible } from '../../../../components/ui';

interface LocalProviderProps {
  config: CloudProvider | null;
  onConfigChange: (config: Partial<CloudProvider>) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
}

export const LocalProvider: React.FC<LocalProviderProps> = ({
  config,
  onConfigChange,
  onSave,
  isLoading = false
}) => {
  const [localConfig, setLocalConfig] = useState<Partial<CloudProvider>>({});
  const [isBackupProcessExpanded, setIsBackupProcessExpanded] = useState(false);
  const [isStorageRequirementsExpanded, setIsStorageRequirementsExpanded] = useState(false);

  // Initialize local config when prop changes
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleFieldChange = (field: keyof CloudProvider, value: string | boolean | number | null) => {
    const updatedConfig = {
      ...localConfig,
      [field]: value
    };
    setLocalConfig(updatedConfig);
    onConfigChange(updatedConfig);
  };

  const handleSave = async () => {
    try {
      await onSave();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save Local provider configuration';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    }
  };

  return (
    <div className="local-provider">
      <div className="provider-header">
        <h4>Local Filesystem Configuration</h4>
      </div>

      <div className="config-form">
        {/* Storage Path Section */}
        <div className="config-section">
          <h5>Storage Settings</h5>
          <div className="form-group">
            <Input
              id="path"
              type="text"
              label="NAS Backup Directory"
              value={localConfig.container || '/mnt/nas/backups/homeserver'}
              onChange={(e) => handleFieldChange('container', e.target.value)}
              placeholder="/mnt/nas/backups/homeserver"
              required
              size="medium"
            />
            <small className="field-help">
              Absolute path to the NAS directory where encrypted backup tarballs will be stored
            </small>
          </div>

        </div>

        {/* Backup Process Information */}
        <div className="config-section">
          <Collapsible
            title="Backup Process"
            defaultCollapsed={!isBackupProcessExpanded}
            onToggle={(collapsed) => setIsBackupProcessExpanded(!collapsed)}
            variant="default"
          >
            <div className="collapsible-content expanded">
              <div className="info-box">
                <div className="info-item">
                  <strong>Target Sources:</strong> All items configured in the Config tab (e.g., /opt/gogs, /etc/postgresql/15/main)
                </div>
                <div className="info-item">
                  <strong>Process:</strong> Glob targets → Create compressed tarball → Store on NAS
                </div>
                <div className="info-item">
                  <strong>NAS Path:</strong> /mnt/nas/backups/homeserver (default)
                </div>
                <div className="info-item">
                  <strong>Backup Format:</strong> Compressed .tar.gz archives (never encrypted - local storage only)
                </div>
                <div className="info-item">
                  <strong>Smart Filtering:</strong> Only moves items that aren't already on the NAS - skips redundant local-to-local copies
                </div>
                <div className="info-item">
                  <strong>Permissions:</strong> 755 (drwxr-xr-x)
                </div>
                <div className="info-item">
                  <strong>Owner:</strong> root:root
                </div>
              </div>
            </div>
          </Collapsible>
        </div>


        {/* Storage Requirements */}
        <div className="config-section">
          <Collapsible
            title="Storage Requirements"
            defaultCollapsed={!isStorageRequirementsExpanded}
            onToggle={(collapsed) => setIsStorageRequirementsExpanded(!collapsed)}
            variant="default"
          >
            <div className={`collapsible-content ${isStorageRequirementsExpanded ? 'expanded' : ''}`}>
              <div className="warning-box">
                <div className="warning-icon">⚠</div>
                <div className="warning-content">
                  <strong>Important:</strong> Ensure sufficient NAS disk space is available for encrypted backup tarballs.
                  NAS backups provide local redundancy but are not protected against site-wide disasters - consider using cloud providers for off-site redundancy.
                </div>
              </div>
            </div>
          </Collapsible>
        </div>

        {/* Action Buttons */}
        <div className="form-actions">
          <Button
            variant="primary"
            size="medium"
            onClick={handleSave}
            disabled={isLoading}
            loading={isLoading}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LocalProvider;
