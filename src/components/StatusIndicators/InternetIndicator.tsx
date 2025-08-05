import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlug, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showModal } from '../Popup/PopupManager';
import { useAuth } from '../../hooks/useAuth';
import { API_ENDPOINTS } from '../../api/endpoints';
import { InternetStatus } from '../WebSocket/types';
import { useLoading } from '../../hooks/useLoading';
import { useStore, useBroadcastData } from '../../store';
import { useResponsiveTooltip } from '../../hooks/useTooltip';
import { useApi } from '../../hooks/useApi';

// Define the expected response type for the speed test
interface SpeedTestResponse {
  download?: number;
  upload?: number;
  latency?: number;
  error?: string; // For API-level errors returned in the response body
}

/**
 * Custom hook for processing internet status data
 * Follows the pattern from the subscription README
 */
export function useInternetStatus() {
  const [internetData, setInternetData] = useState<InternetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const internetDataRef = useRef(internetData);
  const isAdmin = useStore(state => state.isAdmin);
  
  // Use the broadcast data hook to access internet status data
  const { getBroadcastData } = useBroadcastData();
  
  // Removed useSingleCoreEvent - core subscriptions are now handled by the initialization system
  
  // Update local state when broadcast data changes
  useEffect(() => {
    // Get the latest internet data from the broadcast store
    const latestInternetData = getBroadcastData('internet_status', isAdmin);
    
    if (latestInternetData) {
      setInternetData(latestInternetData);
      setError(null);
    }
    
    // Set up a polling interval to continually check for updated data
    const interval = setInterval(() => {
      const updatedData = getBroadcastData('internet_status', isAdmin);
      if (updatedData && 
          (!internetData || 
           updatedData.timestamp !== internetData.timestamp)) {
        setInternetData(updatedData);
        setError(null);
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [getBroadcastData, isAdmin, internetData]);
  
  // Update the ref whenever internetData changes
  useEffect(() => {
    internetDataRef.current = internetData;
  }, [internetData]);

  return {
    internetData,
    internetDataRef,
    error,
    // Removed status from return value as we no longer track it
  };
}

/**
 * Internet status indicator component.
 * Shows connection status and provides admin tools for network diagnostics.
 */
export const InternetIndicator: React.FC = () => {
  const { isAdmin, updateActivity } = useAuth();
  const { internetData, internetDataRef, error } = useInternetStatus();
  const [speedTestResults, setSpeedTestResults] = useState<{
    download?: number;
    upload?: number;
    latency?: number;
  } | null>(null);
  const api = useApi();

  // Default status when no data is available yet
  const status: InternetStatus = internetData || {
    status: 'loading',
    timestamp: Date.now(),
    publicIp: undefined,
    ipDetails: undefined
  };

  // Create refs to store latest state
  const speedTestResultsRef = useRef(speedTestResults);
  const speedTestErrorRef = useRef<Error | null>(null);
  const isSpeedTestingRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isAdminRef = useRef(isAdmin);

  // Update refs when states change
  useEffect(() => {
    speedTestResultsRef.current = speedTestResults;
  }, [speedTestResults]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  const { isLoading: isSpeedTesting, error: speedTestError, withLoading } = useLoading({
    timeout: 60000, // Speed tests can take longer, set to 60 seconds
    minDuration: 1000 // Minimum 1 second to show loading state
  });

  // Update speed test related refs
  useEffect(() => {
    isSpeedTestingRef.current = isSpeedTesting;
    speedTestErrorRef.current = speedTestError;
  }, [isSpeedTesting, speedTestError]);

  // Get color based on status
  const getStatusColor = () => {
    switch (status.status) {
      case 'connected':
        return 'var(--success)';
      case 'disconnected':
        return 'var(--error)';
      case 'loading':
      default:
        return 'var(--text)';
    }
  };

  // Get tooltip message based on status
  const getTooltipMessage = useCallback(() => {
    switch (status.status) {
      case 'loading':
        return 'Checking internet connection...';
      default:
        // Show public IP in tooltip if admin and IP is available
        if (isAdmin && status.publicIp) {
          return `Internet: ${status.status} (${status.publicIp})`;
        }
        return `Internet: ${status.status}`;
    }
  }, [status.status, isAdmin, status.publicIp]);

  // Use the responsive tooltip hook with the tooltip message function
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  const handleSpeedTest = useCallback(async () => {
    // Update activity timestamp when running speed test
    updateActivity();
    
    // Immediately disable button and show loading state
    if (buttonRef.current) {
      buttonRef.current.disabled = true;
    }
    setSpeedTestResults(null); // Clear previous results
    
    try {
      const data = await withLoading(
        api.post<SpeedTestResponse>(API_ENDPOINTS.status.speedtest) // Specify type for api.post
      );
      
      // Check for error property in the response data first
      if (data?.error) { 
        throw new Error(data.error);
      }
      
      setSpeedTestResults({
        download: data?.download,
        upload: data?.upload,
        latency: data?.latency
      });
    } catch (error: any) { 
      console.error('Speed test failed:', error);
      const message = error?.response?.data?.error || // Axios error structure
                      error?.message || // Standard JS error or error thrown from data.error
                      'Speed test failed unexpectedly.';
      console.error("Speed test error to display:", message);
      setSpeedTestResults(null); 
    }
  }, [withLoading, updateActivity, api]);

  const handleClick = useCallback(() => {
    // Update activity timestamp when opening modal
    updateActivity();
    
    showModal({
      title: 'Internet Status',
      children: () => {
        // Access current state through refs
        const currentStatus = internetDataRef.current || status;
        const currentSpeedTestResults = speedTestResultsRef.current;
        const currentSpeedTestError = speedTestErrorRef.current;
        const currentIsSpeedTesting = isSpeedTestingRef.current;
        const currentIsAdmin = isAdminRef.current;

        return (
          <div className="internet-status-modal">
            <div className="status-section">
              <p className={`status-text ${currentStatus.status}`}>
                {currentStatus.status === 'loading' ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> CHECKING...
                  </>
                ) : (
                  <>
                    {currentStatus.status.toUpperCase()}
                    {currentIsAdmin && currentStatus.publicIp && ` (${currentStatus.publicIp})`}
                  </>
                )}
              </p>
            </div>

            {/* Display admin-enhanced information */}
            {currentIsAdmin && currentStatus.ipDetails && (
              <div className="admin-details-section">
                <div className="ip-details">
                  {currentStatus.ipDetails.city && currentStatus.ipDetails.region && (
                    <p>
                      <strong>Location:</strong> {currentStatus.ipDetails.city}, {currentStatus.ipDetails.region}, {currentStatus.ipDetails.country}
                    </p>
                  )}
                  {currentStatus.ipDetails.org && (
                    <p>
                      <strong>ISP:</strong> {currentStatus.ipDetails.org}
                    </p>
                  )}
                  {currentStatus.ipDetails.timezone && (
                    <p>
                      <strong>Timezone:</strong> {currentStatus.ipDetails.timezone}
                    </p>
                  )}
                </div>
              </div>
            )}

            {currentIsAdmin && (
              <div className="speed-test-section">
                <button 
                  ref={buttonRef}
                  className="primary-button"
                  onClick={handleSpeedTest}
                  disabled={currentIsSpeedTesting || currentStatus.status === 'loading'}
                >
                  {currentIsSpeedTesting ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin /> Running Speed Test...
                    </>
                  ) : (
                    'Run Speed Test'
                  )}
                </button>

                {currentSpeedTestError && (
                  <div className="error-message">
                    {currentSpeedTestError.message}
                  </div>
                )}

                {currentSpeedTestResults && (
                  <div className="speed-results">
                    <p>Download: {currentSpeedTestResults.download} Mbps</p>
                    <p>Upload: {currentSpeedTestResults.upload} Mbps</p>
                    <p>Latency: {currentSpeedTestResults.latency} ms</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      },
      hideActions: true
    });
  }, [updateActivity, handleSpeedTest, internetDataRef, status]);

  // Create the indicator element
  const indicator = (
    <div onClick={handleClick} className="indicator">
      {status.status === 'loading' ? (
        <FontAwesomeIcon 
          icon={faSpinner} 
          spin
          size="lg" 
          style={{ color: getStatusColor() }} 
          aria-label="Checking Internet Status" 
        />
      ) : (
        <FontAwesomeIcon 
          icon={faPlug} 
          size="lg" 
          style={{ color: getStatusColor() }} 
          aria-label="Internet Status" 
        />
      )}
    </div>
  );

  // Return the indicator wrapped in a tooltip (which will be disabled on mobile)
  return wrapWithTooltip(indicator);
}; 