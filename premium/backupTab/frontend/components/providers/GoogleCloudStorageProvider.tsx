/**
 * HOMESERVER Backup Google Cloud Storage Provider Component
 * Google Cloud Storage configuration with keyman integration
 */

import React, { useState, useEffect } from 'react';
import { CloudProvider } from '../../types';
// CRITICAL: This import path is specifically calculated for the React build system
// The build runs from /var/www/homeserver/src/ and treats src/ as the root directory
// From providers/ directory: ../../../../ goes up 4 levels to reach src/, then down to components/Popup/PopupManager
// Changing this path will cause "Module not found" errors during npm run build
import { showToast } from '../../../../components/Popup/PopupManager'; //do not touch this
import { Input, Select, Button } from '../../../../components/ui';

interface GoogleCloudStorageProviderProps {
  config: CloudProvider | null;
  onConfigChange: (config: Partial<CloudProvider>) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  isKeymanConfigured?: boolean;
  onKeymanCredentialsChange?: (credentials: { username: string; password: string }) => void;
}

export const GoogleCloudStorageProvider: React.FC<GoogleCloudStorageProviderProps> = ({
  config,
  onConfigChange,
  onSave,
  isLoading = false,
  isKeymanConfigured = false,
  onKeymanCredentialsChange
}) => {
  const [localConfig, setLocalConfig] = useState<Partial<CloudProvider>>({});

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
      const errorMessage = error instanceof Error ? error.message : 'Failed to save Google Cloud Storage configuration';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    }
  };

  return (
    <div className="google-cloud-storage-provider">
      <div className="provider-header">
        <h4>Google Cloud Storage Configuration</h4>
        <p className="provider-description">
          Configure Google Cloud Storage for your backups
        </p>
      </div>

      <div className="config-form">
        {/* Main Configuration Section */}
        <div className="config-section">
          <div className="form-group">
            <label htmlFor="service_account_key">
              Service Account Key <span className="required">*</span>
            </label>
            <textarea
              id="service_account_key"
              value={isKeymanConfigured ? '********************' : (localConfig.service_account_key || '')}
              onChange={(e) => handleFieldChange('service_account_key', e.target.value)}
              placeholder='{"type": "service_account", "project_id": "your-project", ...}'
              className="form-textarea"
              rows={6}
              disabled={isKeymanConfigured}
            />
            <small className="field-help">
              JSON service account key file content. Download from Google Cloud Console → IAM & Admin → Service Accounts
            </small>
          </div>

          <div className="form-group">
            <Input
              id="project_id"
              type="text"
              label="Project ID"
              value={localConfig.project_id || ''}
              onChange={(e) => handleFieldChange('project_id', e.target.value)}
              placeholder="your-project-id"
              required
              size="medium"
            />
            <small className="field-help">
              Google Cloud Project ID where your storage bucket is located
            </small>
          </div>

          <div className="form-group">
            <Input
              id="container"
              type="text"
              label="Bucket Name"
              value={localConfig.container || ''}
              onChange={(e) => handleFieldChange('container', e.target.value)}
              placeholder="homeserver-backups"
              required
              size="medium"
            />
            <small className="field-help">
              Google Cloud Storage bucket name (3-63 characters, lowercase letters, numbers, hyphens, and periods)
            </small>
          </div>
        </div>

        <div className="config-section">
          <div className="form-group">
            <Select
              id="region"
              label="Region"
              value={localConfig.region || 'us-central1'}
              onChange={(e) => handleFieldChange('region', e.target.value)}
              options={[
                { value: 'us-central1', label: 'US Central (Iowa)' },
                { value: 'us-east1', label: 'US East (South Carolina)' },
                { value: 'us-east4', label: 'US East (N. Virginia)' },
                { value: 'us-west1', label: 'US West (Oregon)' },
                { value: 'us-west2', label: 'US West (Los Angeles)' },
                { value: 'us-west3', label: 'US West (Salt Lake City)' },
                { value: 'us-west4', label: 'US West (Las Vegas)' },
                { value: 'europe-west1', label: 'Europe West (Belgium)' },
                { value: 'europe-west2', label: 'Europe West (London)' },
                { value: 'europe-west3', label: 'Europe West (Frankfurt)' },
                { value: 'europe-west4', label: 'Europe West (Netherlands)' },
                { value: 'europe-west6', label: 'Europe West (Zurich)' },
                { value: 'asia-east1', label: 'Asia East (Taiwan)' },
                { value: 'asia-east2', label: 'Asia East (Hong Kong)' },
                { value: 'asia-northeast1', label: 'Asia Northeast (Tokyo)' },
                { value: 'asia-northeast2', label: 'Asia Northeast (Osaka)' },
                { value: 'asia-northeast3', label: 'Asia Northeast (Seoul)' },
                { value: 'asia-south1', label: 'Asia South (Mumbai)' },
                { value: 'asia-southeast1', label: 'Asia Southeast (Singapore)' },
                { value: 'asia-southeast2', label: 'Asia Southeast (Jakarta)' },
                { value: 'australia-southeast1', label: 'Australia Southeast (Sydney)' }
              ]}
              size="medium"
            />
          </div>
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

export default GoogleCloudStorageProvider;
