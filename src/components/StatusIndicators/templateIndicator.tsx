/* eslint-disable */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlug, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showModal } from '../Popup/PopupManager';
import { useStore, useBroadcastData } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import { API_ENDPOINTS } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { TemplateStatus } from '../WebSocket/types';
import { useResponsiveTooltip } from '../../hooks/useTooltip';

// Extended TemplateStatus interface for our template indicator
// In a real implementation, you would add these fields to the actual TemplateStatus interface in types.ts
interface ExtendedTemplateStatus extends TemplateStatus {
  details?: string;
}

/**
 * Custom hook for processing template status data
 * Follows the pattern from the subscription README
 */
export function useTemplateStatus() {
  const [templateData, setTemplateData] = useState<ExtendedTemplateStatus>({
    status: 'loading',
    timestamp: Date.now()
  });
  const [error, setError] = useState<string | null>(null);
  const templateDataRef = useRef(templateData);
  const isAdmin = useStore(state => state.isAdmin);
  
  // Use the broadcast data hook to access template status data
  const { getBroadcastData } = useBroadcastData();
  
  // Update local state when broadcast data changes
  useEffect(() => {
    // Get the latest template data from the broadcast store
    const latestTemplateData = getBroadcastData('template_status', isAdmin);
    
    if (latestTemplateData) {
      setTemplateData(latestTemplateData as ExtendedTemplateStatus);
      setError(null);
    }
    
    // Set up a polling interval to continually check for updated data
    const interval = setInterval(() => {
      const updatedData = getBroadcastData('template_status', isAdmin);
      if (updatedData && 
          (!templateData || 
           updatedData.timestamp !== templateData.timestamp)) {
        setTemplateData(updatedData as ExtendedTemplateStatus);
        setError(null);
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [getBroadcastData, isAdmin, templateData]);
  
  // Update the ref whenever templateData changes
  useEffect(() => {
    templateDataRef.current = templateData;
  }, [templateData]);
  
  // Get color based on status
  const getStatusColor = useCallback(() => {
    if (!templateData || templateData.status === 'loading') {
      return 'var(--text)';
    }

    switch (templateData.status) {
      case 'connected':
        return 'var(--success)';
      case 'disconnected':
        return 'var(--error)';
      case 'error':
        return 'var(--error)';
      default:
        return 'var(--text)';
    }
  }, [templateData]);

  // Get tooltip message based on status
  const getTooltipMessage = useCallback(() => {
    if (!templateData || templateData.status === 'loading') {
      return 'Checking template status...';
    }

    switch (templateData.status) {
      case 'connected':
        return `Template: Connected${isAdmin && templateData.details ? ` (${templateData.details})` : ''}`;
      case 'disconnected':
        return 'Template: Disconnected';
      case 'error':
        return `Template Error: ${templateData.error || 'Unknown error'}`;
      default:
        return 'Template: Unknown status';
    }
  }, [templateData, isAdmin]);

  // Example admin action handler
  const handleAdminAction = useCallback(async () => {
    if (!isAdmin) return Promise.resolve(false);
    
    try {
      // Example API call - this is a placeholder since the actual endpoint doesn't exist
      // In a real implementation, you would add this endpoint to API_ENDPOINTS
      const response = await fetch('/api/status/template/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to perform admin action');
      }
      
      return Promise.resolve(true);
    } catch (error) {
      console.error('Admin action failed:', error);
      setError('Admin action failed');
      return Promise.resolve(false);
    }
  }, [isAdmin]);

  return {
    templateData,
    templateDataRef,
    error,
    getStatusColor,
    getTooltipMessage,
    handleAdminAction
  };
}

/**
 * Template indicator component.
 * Shows real-time status and provides admin controls.
 * Use this as a starting point for new indicators.
 */
export const TemplateIndicator: React.FC = React.memo(() => {
  const { isAdmin } = useStore(state => ({
    isAdmin: state.isAdmin
  }));
  const toast = useToast();

  // Use our custom hook to get template data and actions
  const {
    templateData,
    templateDataRef,
    error,
    getStatusColor,
    getTooltipMessage,
    handleAdminAction
  } = useTemplateStatus();

  // Create refs to store latest state
  const isAdminRef = useRef(isAdmin);

  // Loading state for admin actions
  const { isLoading: isActionLoading, withLoading } = useLoading({
    timeout: 10000,
    minDuration: 500
  });

  // Keep refs updated
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // Use the responsive tooltip hook
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  // Handle admin action with loading state
  const handleAction = useCallback(async () => {
    try {
      const success = await withLoading(handleAdminAction());
      if (success) {
        toast.success('Admin action completed successfully');
      } else {
        toast.error('Admin action failed');
      }
    } catch (error) {
      console.error('Action error:', error);
      toast.error('An error occurred during the admin action');
    }
  }, [withLoading, handleAdminAction, toast]);

  // Modal content renderer
  const renderModalContent = useCallback(() => {
    // Get latest state from refs
    const currentTemplateData = templateDataRef.current;
    const currentIsAdmin = isAdminRef.current;

    // Handle loading state
    if (!currentTemplateData || currentTemplateData.status === 'loading') {
      return (
        <div className="template-status-modal">
          <div className="status-section">
            <p className="status-text loading">
              <FontAwesomeIcon icon={faSpinner} spin /> LOADING...
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="template-status-modal">
        <div className="status-section">
          <p className={`status-text ${currentTemplateData.status}`}>
            {currentTemplateData.status.toString() === 'loading' ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> CHECKING...
              </>
            ) : (
              <>
                {currentTemplateData.status.toUpperCase()}
                {currentIsAdmin && currentTemplateData.details && ` (${currentTemplateData.details})`}
              </>
            )}
          </p>
        </div>

        {currentIsAdmin && (
          <div className="controls-section">
            <h3>Admin Controls</h3>
            <div className="admin-buttons">
              <button
                className="primary-button"
                onClick={handleAction}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Processing...
                  </>
                ) : (
                  'Admin Action'
                )}
              </button>
            </div>
            
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
            
            <div className="template-info">
              <p>This is a template indicator. Replace this content with actual information and controls relevant to your specific indicator.</p>
            </div>
          </div>
        )}
      </div>
    );
  }, [isActionLoading, handleAction, error]);

  // Click handler
  const handleClick = useCallback(() => {
    showModal({
      title: 'Template Configuration',
      children: renderModalContent,
      hideActions: true
    });
  }, [renderModalContent]);

  // Create the indicator element
  const indicator = (
    <div onClick={handleClick} className="indicator">
      {!templateData || templateData.status === 'loading' ? (
        <FontAwesomeIcon
          icon={faSpinner}
          spin
          size="lg"
          style={{ color: getStatusColor() }}
          aria-label="Checking Template Status"
        />
      ) : (
        <FontAwesomeIcon
          icon={faPlug}
          size="lg"
          style={{ color: getStatusColor() }}
          aria-label="Template Status"
        />
      )}
    </div>
  );

  // Return the indicator wrapped in a tooltip (which will be disabled on mobile)
  return wrapWithTooltip(indicator);
});

// Add display name
TemplateIndicator.displayName = 'TemplateIndicator'; 