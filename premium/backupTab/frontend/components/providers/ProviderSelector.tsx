/**
 * HOMESERVER Backup Provider Selector Component
 * Left column provider selection and enable/disable controls
 */

import React from 'react';
import { BackupConfig, ProviderStatus } from '../../types';
import { Toggle } from '../../../../components/ui';

interface ProviderSelectorProps {
  config: BackupConfig | null;
  providerStatuses: ProviderStatus[];
  selectedProvider: string;
  onProviderSelect: (provider: string) => void;
  onProviderToggle: (provider: string, enabled: boolean) => Promise<void>;
  isLoading?: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  config,
  providerStatuses,
  selectedProvider,
  onProviderSelect,
  onProviderToggle,
  isLoading = false
}) => {
  console.log('ProviderSelector received providerStatuses:', providerStatuses);
  console.log('ProviderSelector received config:', config);
  
  const handleProviderClick = (provider: string) => {
    const providerStatus = providerStatuses.find(p => p.name === provider);
    // Prevent clicks on unavailable providers
    if (!providerStatus?.available) {
      return;
    }
    onProviderSelect(provider);
  };

  const handleToggleProvider = async (provider: string, enabled: boolean) => {
    await onProviderToggle(provider, enabled);
  };

  if (!config || !providerStatuses.length) {
    return (
      <div className="provider-selector">
        <div className="loading-state">
          <span>Loading providers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="provider-selector">
      <div className="selector-header">
        <h3>Providers</h3>
        <p className="selector-description">
          Select and configure backup storage providers
        </p>
      </div>

      <div className="provider-list">
        {providerStatuses.map((providerStatus) => {
          const providerConfig = config.providers[providerStatus.name];
          const isEnabled = providerConfig?.enabled || false;
          const isSelected = selectedProvider === providerStatus.name;
          const isAvailable = providerStatus.available;
          const isConfigured = providerStatus.configured;
          const isInitialized = providerStatus.initialized ?? false;
          const initError = providerStatus.initialization_error;

          return (
            <div
              key={providerStatus.name}
              className={`provider-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}`}
              onClick={() => handleProviderClick(providerStatus.name)}
            >
              <div className="provider-icon">{providerStatus.icon}</div>
              
              <div className="provider-info">
                <div className="provider-name">{providerStatus.display_name}</div>
                <div className="provider-description">{providerStatus.description}</div>
                
                {!isAvailable && (
                  <div className="provider-status not-available">
                    Coming Soon
                  </div>
                )}
                
                {isAvailable && !isConfigured && (
                  <div className="provider-status not-configured">
                    Not Configured
                  </div>
                )}
                
                {isAvailable && isConfigured && !isInitialized && (
                  <div className="provider-status not-initialized" title={initError || 'Provider configured but failed to initialize'}>
                    Configured but Not Working
                  </div>
                )}
                
                {isAvailable && isConfigured && isInitialized && (
                  <div className="provider-status available">
                    Ready
                  </div>
                )}
              </div>

              {isAvailable && (
                <div className="provider-controls">
                  <Toggle
                    checked={isEnabled}
                    onChange={(checked) => handleToggleProvider(providerStatus.name, checked)}
                    disabled={isLoading}
                    size="medium"
                  />
                </div>
              )}

              {isSelected && isAvailable && (
                <div className="provider-indicator">
                  <span className="indicator-dot"></span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="selector-footer">
        <div className="provider-summary">
          <div className="summary-item">
            <span className="summary-label">Enabled:</span>
            <span className="summary-value">
              {Object.values(config.providers).filter(p => p.enabled).length}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Available:</span>
            <span className="summary-value">
              {providerStatuses.filter(p => p.available).length}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Ready:</span>
            <span className="summary-value">
              {providerStatuses.filter(p => p.available && p.configured).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderSelector;
