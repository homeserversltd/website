/**
 * HOMESERVER Backup Backblaze Provider Component
 * Backblaze B2 cloud storage configuration with keyman integration
 */

import React, { useState, useEffect } from 'react';
import { CloudProvider } from '../../types';
// CRITICAL: This import path is specifically calculated for the React build system
// The build runs from /var/www/homeserver/src/ and treats src/ as the root directory
// From providers/ directory: ../../../../ goes up 4 levels to reach src/, then down to components/Popup/PopupManager
// Changing this path will cause "Module not found" errors during npm run build
import { showToast } from '../../../../components/Popup/PopupManager'; //do not touch this
import { Input, Select, Button } from '../../../../components/ui';

interface BackblazeProviderProps {
  config: CloudProvider | null;
  onConfigChange: (config: Partial<CloudProvider>) => void;
  onSave: () => Promise<void>;
  isLoading?: boolean;
  isKeymanConfigured?: boolean;
  onKeymanCredentialsChange?: (credentials: { username: string; password: string }) => void;
}

export const BackblazeProvider: React.FC<BackblazeProviderProps> = ({
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to save Backblaze configuration';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    }
  };

  return (
    <div className="backblaze-provider">
      <div className="provider-header">
        <h4>Backblaze B2 Configuration</h4>
        
        {/* Configuration Status Indicator */}
        {isKeymanConfigured && (
          <div className="config-status-banner configured">
            <div className="status-icon">✓</div>
            <div className="status-content">
              <strong>Configuration Complete</strong>
              <p>Backblaze B2 is configured and ready for backups. Credentials are securely stored in the keyman vault.</p>
            </div>
          </div>
        )}
        
        {!isKeymanConfigured && localConfig.application_key_id && localConfig.application_key && (
          <div className="config-status-banner warning">
            <div className="status-icon">⚠</div>
            <div className="status-content">
              <strong>Configuration Incomplete</strong>
              <p>Credentials are entered but not saved to the secure vault. Click "Save Configuration" to complete setup.</p>
            </div>
          </div>
        )}
      </div>

      <div className="config-form">
        {/* Main Configuration Section */}
        <div className="config-section">
          <div className="form-group">
            <Input
              id="application_key_id"
              type="text"
              label="Application Key ID"
              value={localConfig.application_key_id || ''}
              onChange={(e) => handleFieldChange('application_key_id', e.target.value)}
              placeholder="K12345678901234567890"
              required
              size="medium"
            />
            <small className="field-help">
              Your Backblaze B2 Application Key ID (starts with K, 20 characters)
            </small>
          </div>

          <div className="form-group">
            <Input
              id="application_key"
              type="password"
              label="Application Key"
              value={localConfig.application_key || ''}
              onChange={(e) => handleFieldChange('application_key', e.target.value)}
              placeholder="K123456789012345678901234567890"
              required
              size="medium"
            />
            <small className="field-help">
              Your Backblaze B2 Application Key (starts with K, 32 characters)
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
              B2 bucket name (3-63 characters, alphanumeric and hyphens only)
            </small>
          </div>
        </div>

        <div className="config-section">
          <div className="form-group">
            <Select
              id="region"
              label="Region"
              value={localConfig.region || 'us-west-000'}
              onChange={(e) => handleFieldChange('region', e.target.value)}
              options={[
                { value: 'us-west-000', label: 'US West (Oregon)' },
                { value: 'us-west-001', label: 'US West (California)' },
                { value: 'us-west-002', label: 'US West (Nevada)' },
                { value: 'us-east-000', label: 'US East (Virginia)' },
                { value: 'us-east-001', label: 'US East (Ohio)' },
                { value: 'eu-central-000', label: 'EU Central (Frankfurt)' }
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

export default BackblazeProvider;
