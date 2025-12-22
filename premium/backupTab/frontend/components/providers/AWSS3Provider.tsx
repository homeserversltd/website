/**
 * HOMESERVER Backup AWS S3 Provider Component
 * AWS S3 cloud storage configuration with keyman integration
 */

import React, { useState, useEffect } from 'react';
import { CloudProvider } from '../../types';
// CRITICAL: This import path is specifically calculated for the React build system
// The build runs from /var/www/homeserver/src/ and treats src/ as the root directory
// From providers/ directory: ../../../../ goes up 4 levels to reach src/, then down to components/Popup/PopupManager
// Changing this path will cause "Module not found" errors during npm run build
import { showToast } from '../../../../components/Popup/PopupManager'; //do not touch this
import { Input, Select, Button } from '../../../../components/ui';

interface AWSS3ProviderProps {
  config: CloudProvider | null;
  onConfigChange: (config: Partial<CloudProvider>) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  isKeymanConfigured?: boolean;
  onKeymanCredentialsChange?: (credentials: { username: string; password: string }) => void;
}

export const AWSS3Provider: React.FC<AWSS3ProviderProps> = ({
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to save AWS S3 configuration';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    }
  };

  return (
    <div className="aws-s3-provider">
      <div className="provider-header">
        <h4>AWS S3 Configuration</h4>
        <p className="provider-description">
          Configure AWS S3 cloud storage for your backups
        </p>
      </div>

      <div className="config-form">
        {/* Main Configuration Section */}
        <div className="config-section">
          <div className="form-group">
            <Input
              id="access_key"
              type="text"
              label="Access Key ID"
              value={isKeymanConfigured ? '********************' : (localConfig.access_key || '')}
              onChange={(e) => handleFieldChange('access_key', e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              required
              disabled={isKeymanConfigured}
              size="medium"
            />
            <small className="field-help">
              Your AWS Access Key ID (starts with AKIA, 20 characters)
            </small>
          </div>

          <div className="form-group">
            <Input
              id="secret_key"
              type="password"
              label="Secret Access Key"
              value={isKeymanConfigured ? '********************************' : (localConfig.secret_key || '')}
              onChange={(e) => handleFieldChange('secret_key', e.target.value)}
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              required
              disabled={isKeymanConfigured}
              size="medium"
            />
            <small className="field-help">
              Your AWS Secret Access Key (40 characters)
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
              S3 bucket name (3-63 characters, lowercase letters, numbers, hyphens, and periods)
            </small>
          </div>
        </div>

        <div className="config-section">
          <div className="form-group">
            <Select
              id="region"
              label="Region"
              value={localConfig.region || 'us-east-1'}
              onChange={(e) => handleFieldChange('region', e.target.value)}
              options={[
                { value: 'us-east-1', label: 'US East (N. Virginia)' },
                { value: 'us-east-2', label: 'US East (Ohio)' },
                { value: 'us-west-1', label: 'US West (N. California)' },
                { value: 'us-west-2', label: 'US West (Oregon)' },
                { value: 'eu-west-1', label: 'Europe (Ireland)' },
                { value: 'eu-west-2', label: 'Europe (London)' },
                { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
                { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
                { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
                { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' }
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

export default AWSS3Provider;
