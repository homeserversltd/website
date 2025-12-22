import React from 'react';
import { ServiceActionResult, ServiceMetadata } from '../../types';
import './ServiceResultsModal.css';

interface ServiceResultsModalProps {
  results: ServiceActionResult[];
  metadata?: ServiceMetadata;
  action: 'start' | 'stop';
}

const ServiceResultsModal: React.FC<ServiceResultsModalProps> = ({ results, metadata, action }) => {
  // Group services by their status
  const successfulServices = results.filter(r => r.success);
  const failedServices = results.filter(r => !r.success && !r.isScriptManaged);
  const scriptManagedServices = results.filter(r => r.isScriptManaged);
  
  // Determine action text
  const actionText = action === 'start' ? 'Start' : 'Stop';
  const actionPastTense = action === 'start' ? 'started' : 'stopped';
  
  return (
    <div className="service-results-modal">
      <div className="service-results-summary">
        <h2>{actionText} Applications Results</h2>
        <div className="service-stats">
          <div className="stat-item success">
            <span className="stat-count">{successfulServices.length}</span>
            <span className="stat-label">Successful</span>
          </div>
          <div className="stat-item failed">
            <span className="stat-count">{failedServices.length}</span>
            <span className="stat-label">Failed</span>
          </div>
          {scriptManagedServices.length > 0 && (
            <div className="stat-item script-managed">
              <span className="stat-count">{scriptManagedServices.length}</span>
              <span className="stat-label">Needs Reboot</span>
            </div>
          )}
        </div>
        
        {metadata?.rebootNote && (
          <div className="reboot-note">
            <i className="fas fa-sync-alt"></i> {metadata.rebootNote}
          </div>
        )}
      </div>
      
      <div className="service-results-details">
        {successfulServices.length > 0 && (
          <div className="service-group">
            <h3>Successfully {actionPastTense}</h3>
            <ul className="service-list success">
              {successfulServices.map(service => (
                <li key={service.name} className="service-item">
                  <span className="service-icon success">
                    <i className="fas fa-check-circle"></i>
                  </span>
                  <span className="service-name">{service.name}</span>
                  <span className="service-message">{service.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {failedServices.length > 0 && (
          <div className="service-group">
            <h3>Failed to {actionText.toLowerCase()}</h3>
            <ul className="service-list failed">
              {failedServices.map(service => (
                <li key={service.name} className="service-item">
                  <span className="service-icon failed">
                    <i className="fas fa-times-circle"></i>
                  </span>
                  <span className="service-name">{service.name}</span>
                  <span className="service-message">{service.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {scriptManagedServices.length > 0 && (
          <div className="service-group">
            <h3>Requires System Reboot</h3>
            <ul className="service-list script-managed">
              {scriptManagedServices.map(service => (
                <li key={service.name} className="service-item">
                  <span className="service-icon script-managed">
                    <i className="fas fa-sync-alt"></i>
                  </span>
                  <span className="service-name">{service.name}</span>
                  <span className="service-message">{service.message}</span>
                </li>
              ))}
            </ul>
            <div className="script-managed-info">
              <p>Script-managed services require a system reboot to fully {action === 'start' ? 'start' : 'clean up'} because they manage system resources differently than standard services.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceResultsModal; 