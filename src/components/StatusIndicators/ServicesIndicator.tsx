import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showModal } from '../Popup/PopupManager';
import { useStore, useBroadcastData } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import { API_ENDPOINTS } from '../../api/endpoints';
import { useResponsiveTooltip } from '../../hooks/useTooltip';

// Define the interface for service indicator objects
interface ServiceIndicator {
  service: string;
  name: string;
  description: string;
  status: string;
  isEnabled?: boolean; // Admin-only field indicating if service is enabled at boot
}

/**
 * Custom hook for processing services status data
 * Follows the pattern from the subscription README
 */
export function useServicesStatus() {
  const [serviceStatus, setServiceStatus] = useState<ServiceIndicator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serviceStatusRef = useRef(serviceStatus);
  const isAdmin = useStore(state => state.isAdmin);
  
  // Use the broadcast data hook to access services status data
  const { getBroadcastData } = useBroadcastData();
  
  // Update local state when broadcast data changes
  useEffect(() => {
    // Get the latest services data from the broadcast store
    const latestServicesData = getBroadcastData('services_status', isAdmin);
    
    if (latestServicesData && Array.isArray(latestServicesData) && latestServicesData.length > 0) {
      setServiceStatus(latestServicesData);
      setError(null);
    }
    
    // Set up a polling interval to continually check for updated data
    const interval = setInterval(() => {
      const updatedData = getBroadcastData('services_status', isAdmin);
      if (updatedData && 
          Array.isArray(updatedData) && 
          updatedData.length > 0 && 
          (!serviceStatus || 
           JSON.stringify(updatedData) !== JSON.stringify(serviceStatus))) {
        setServiceStatus(updatedData);
        setError(null);
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [getBroadcastData, serviceStatus, isAdmin]);
  
  // Update ref when state changes
  useEffect(() => {
    serviceStatusRef.current = serviceStatus;
  }, [serviceStatus]);
  
  return {
    serviceStatus,
    serviceStatusRef,
    error
  };
}

/**
 * Component for Services status.
 * Regular Mode: shows service health based on port status.
 * Admin Mode: shows a detailed modal listing service statuses along with extra admin actions.
 */
export const ServicesIndicator: React.FC = () => {
  const { 
    isAdmin, 
    isElementVisible
  } = useStore(state => ({
    isAdmin: state.isAdmin,
    isElementVisible: state.isElementVisible
  }));

  const { serviceStatus, serviceStatusRef, error } = useServicesStatus();
  const isAdminRef = useRef(isAdmin);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { isLoading: isServicesLoading, error: servicesError, withLoading } = useLoading({
    timeout: 10000,
    minDuration: 500
  });

  // Update admin ref
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // Calculate tooltip based on current services statuses
  const { color, tooltipMessage } = React.useMemo(() => {
    if (!serviceStatus) {  // Handle initial loading state
      return {
        color: "var(--text)",
        tooltipMessage: "Loading service status..."
      };
    }

    if (isServicesLoading) {
      return {
        color: "var(--secondary)",
        tooltipMessage: "Loading service status..."
      };
    }

    if (servicesError) {
      return {
        color: "var(--error)",
        tooltipMessage: `Services Error: ${servicesError.message}`
      };
    }

    const total = serviceStatus.length;
    const runningCount = serviceStatus.filter(ind => ind.status === "running").length;
    const message = `Service Health: ${runningCount} of ${total} running`;

    let statusColor = "var(--secondary)";
    if (total > 0) {
      if (runningCount === total) {
        statusColor = "var(--success)";
      } else if (runningCount === 0) {
        statusColor = "var(--error)";
      } else {
        statusColor = "var(--warning)";
      }
    }

    return {
      color: statusColor,
      tooltipMessage: message
    };
  }, [serviceStatus, isServicesLoading, servicesError]);

  // Create a callback for the tooltip message to use with useResponsiveTooltip
  const getTooltipMessage = useCallback(() => {
    return tooltipMessage;
  }, [tooltipMessage]);

  // Use the responsive tooltip hook
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  // Update modal content rendering
  const renderModalContent = useCallback(() => {
    const currentStatus = serviceStatusRef.current;
    const currentIsAdmin = isAdminRef.current;

    return (
      <div className={`services-status-modal ${currentIsAdmin ? 'services-status-modal-admin' : ''}`}>
        {isServicesLoading ? (
          <div className="loading-section">
            <FontAwesomeIcon icon={faSpinner} spin />
            <p>Loading service status...</p>
          </div>
        ) : servicesError ? (
          <div className="error-section">
            <h3>Error Loading Services</h3>
            <p className="error-message">{servicesError.message}</p>
            <button
              ref={buttonRef}
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {currentStatus ? (
              <ul className="service-status-list">
                {currentStatus
                  .filter(indicator => currentIsAdmin || isElementVisible("portals", indicator.name))
                  .map(indicator => {
                    // Create a completely new approach for admin mode
                    if (currentIsAdmin) {
                      return (
                        <li key={indicator.service} className={`admin-service-item ${indicator.status}`}>
                          <div className="admin-service-grid">
                            <div className="admin-service-description">
                              {indicator.description || "—"}
                            </div>
                            <div className="admin-service-name">
                              {indicator.name || "—"}
                            </div>
                            {typeof indicator.isEnabled !== 'undefined' && (
                              <div className="admin-service-right">
                                <span className={`admin-service-status ${indicator.isEnabled ? 'enabled' : 'disabled'}`}>
                                  {indicator.isEnabled ? 'enabled' : 'disabled'}
                                </span>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    }
                    
                    // Regular mode remains the same
                    return (
                      <li key={indicator.service} className={`service-status-item ${indicator.status}`}>
                        <div className="service-item-content">
                          {indicator.description && (
                            <span className="service-description">{indicator.description}</span>
                          )}
                          {indicator.description && indicator.name && (
                            <span className="separator">  </span>
                          )}
                          {indicator.name && (
                            <span className="service-name">{indicator.name}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <div>No status data available</div>
            )}
          </>
        )}
      </div>
    );
  }, [isServicesLoading, servicesError, isElementVisible]);

  // Update click handler
  const handleClick = useCallback(() => {
    showModal({
      title: 'Services Status',
      children: renderModalContent,
      hideActions: true
    });
  }, [renderModalContent]);

  // Create the indicator element
  const indicator = (
    <div onClick={handleClick} className="indicator">
      {(isServicesLoading || !serviceStatus) ? (
        <FontAwesomeIcon 
          icon={faSpinner} 
          spin
          size="lg" 
          style={{ color: "var(--text)" }}
          aria-label="Loading Services Status" 
        />
      ) : (
        <FontAwesomeIcon 
          icon={faServer} 
          size="lg" 
          style={{ color }} 
          aria-label="Services Status" 
        />
      )}
    </div>
  );

  // Return the indicator wrapped in a tooltip (which will be disabled on mobile)
  return wrapWithTooltip(indicator);
}; 