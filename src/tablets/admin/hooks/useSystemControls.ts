import { useState, useCallback, useRef, useEffect } from 'react';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { useConfirmModal } from '../../../hooks/useModal';
import { useToast } from '../../../hooks/useToast';
import { useLoading } from '../../../hooks/useLoading';
import { useAuth } from '../../../hooks/useAuth';
import { useApi } from '../../../hooks/useApi';
import { useSimpleRequest, createRequestKey } from '../../../hooks/useSimpleRequest';
import { showModal, closeModal } from '../../../components/Popup/PopupManager';
import React from 'react';
import { debug, createComponentLogger } from '../../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('useSystemControls');
import { SystemButton, UpdateProgressModalProps, SSHStatus, SSHServiceStatus, SSHToggleResponse, SSHServiceToggleResponse, HardResetResponse, SystemRestartResponse, SystemShutdownResponse, SystemControlResponse, SambaServiceStatus, SambaServiceToggleResponse } from '../types';
import { UpdateProgressModal, SystemActionModal, LogViewerModal } from '../components/modals/SystemModals';
import { AdminPasswordModal } from '../components/modals/AdminPasswordModal';
import { encryptDataSync } from '../../../utils/secureTransmission';
import HardDriveTestModal from '../components/modals/HardDriveTestModal';
import { RootCAModal } from '../components/modals/RootCAModal';

import { UpdateManagerModal } from '../components/modals/UpdateManagerModal';
import { fallbackManager } from '../../../utils/fallbackManager';
import { ApiError, isOfflineApiError } from '../../../api/interceptors';

// Base64 encoding function (browser standard)
const base64Encode = (str: string): string => {
  try {
    return btoa(str);
  } catch (e) {
    logger.error('Base64 encoding failed:', e);
    return 'encoding_error';
  }
};

// Interface for the crypto test response from the backend
interface CryptoTestResponse {
  results: Record<string, string>; // e.g., { base64_encoded: 'decoded_value' or 'error: description' }
}

// --- End AES Encryption Helper ---

export interface SystemControlsState {
  sshStatus: SSHStatus | null;
  sshServiceStatus: SSHServiceStatus | null;
  sambaServiceStatus: SambaServiceStatus | null;
  isFetchingSSHStatus: boolean;
  isFetchingSSHServiceStatus: boolean;
  isFetchingSambaServiceStatus: boolean;
  isTogglingSSH: boolean;
  isTogglingSSHService: boolean;
  isTogglingSambaService: boolean;
  isUpdating: boolean;
  isRestarting: boolean;
  isShuttingDown: boolean;
  isHardResetting: boolean;
  updateOutput: string[];
  isTestingCrypto: boolean;
  cryptoTestResult: CryptoTestResponse | null;
  isUpdatingAdminPassword: boolean;
  isViewingLogs: boolean;
  isTestingHardDrive: boolean;
  isViewingRootCAModal: boolean;
  isViewingUpdateManager: boolean;
}

export interface SystemControlsActions {
  fetchSSHStatus: (force?: boolean) => Promise<void>;
  fetchSSHServiceStatus: (force?: boolean) => Promise<void>;
  fetchSambaServiceStatus: (force?: boolean) => Promise<void>;
  toggleSSHAuth: () => Promise<void>;
  toggleSSHService: () => Promise<void>;
  toggleSambaService: () => Promise<void>;
  handleSystemUpdate: () => Promise<void>;
  handleSystemRestart: () => Promise<void>;
  handleSystemShutdown: () => Promise<void>;
  handleHardReset: () => Promise<void>;
  handleCryptoTest: () => Promise<void>;
  handleAdminPasswordUpdate: () => void;
  handleViewLogs: () => void;
  handleHardDriveTest: () => void;
  handleRootCAModal: () => void;
  handleUpdateManager: () => void;
}

export const useSystemControls = (): [SystemControlsState, SystemControlsActions] => {
  const [sshStatus, setSSHStatus] = useState<SSHStatus | null>(null);
  const [updateOutput, setUpdateOutput] = useState<string[]>([]);
  const [cryptoTestResult, setCryptoTestResult] = useState<CryptoTestResponse | null>(null); // Init crypto result state
  
  // Use loading hook for each operation with proper configuration
  const sshAuthLoading = useLoading({ minDuration: 300 });
  const sshServiceLoading = useLoading({ minDuration: 300 });
  const sambaServiceLoading = useLoading({ minDuration: 300 });
  const updateLoading = useLoading();
  const restartLoading = useLoading();
  const shutdownLoading = useLoading();
  const hardResetLoading = useLoading();
  const cryptoTestLoading = useLoading(); // Loading hook for crypto test
  const adminPasswordLoading = useLoading(); // Loading hook for admin password update
  const hardDriveTestLoading = useLoading();
  
  const { isAdmin } = useAuth();
  const { error, success, info } = useToast();
  const { confirm } = useConfirmModal({
    submitOnEnter: false
  });
  const api = useApi();

  // Reduce the debug logging to once per instance
  const hasLoggedRef = useRef(false);
  if (!hasLoggedRef.current) {
    // debug('Initializing useSystemControls hook, isAdmin =', isAdmin);
    hasLoggedRef.current = true;
  }

  // Use the simpleRequest hook for SSH status with better caching settings
  const sshStatusRequest = useSimpleRequest(
    async () => {
      if (!isAdmin) return null;
      // debug('Fetching SSH status from API');
      const response = await api.get<SSHStatus>(API_ENDPOINTS.status.ssh.status);
      //  debug('SSH Status Response:', {
      //   endpoint: API_ENDPOINTS.status.ssh.status,
      //   response: JSON.stringify(response),
      //   timestamp: new Date().toISOString()
      // });
      return response;
    },
    {
      key: 'ssh-status',
      cacheDuration: 300000, // 5 minutes cache
      executeOnMount: false,
      refreshInterval: 60000, // 1 minute refresh
      onError: (err: Error & { handled?: boolean }) => {
        if (isOfflineApiError(err)) {
          return;
        }
        if (!err.handled) {
          logger.error('Error fetching SSH status:', err);
          error('Failed to fetch SSH status');
          err.handled = true;
        }
      },
      debug: false // Enable detailed logging
    }
  );

  // Use the simpleRequest hook for SSH service status
  const sshServiceRequest = useSimpleRequest(
    async () => {
      if (!isAdmin) return null;
      // debug('Fetching SSH service status from API');
      const response = await api.get<SSHServiceStatus>(API_ENDPOINTS.status.ssh.serviceStatus);
      // debug('SSH Service Response:', {
      //   endpoint: API_ENDPOINTS.status.ssh.serviceStatus,
      //   response: JSON.stringify(response),
      //   timestamp: new Date().toISOString()
      // });
      return response;
    },
    {
      key: 'ssh-service-status',
      cacheDuration: 300000, // 5 minutes cache
      executeOnMount: false,
      refreshInterval: 60000, // 1 minute refresh
      onError: (err: Error & { handled?: boolean }) => {
        if (isOfflineApiError(err)) {
          return;
        }
        if (!err.handled) {
          logger.error('Error fetching SSH service status:', err);
          error('Failed to fetch SSH service status');
          err.handled = true;
        }
      },
      debug: false // Enable detailed logging
    }
  );

  // Use the simpleRequest hook for Samba service status
  const sambaServiceRequest = useSimpleRequest(
    async () => {
      if (!isAdmin) return null;
      // debug('Fetching Samba service status from API');
      const response = await api.get<SambaServiceStatus>(API_ENDPOINTS.status.samba.serviceStatus);
      // debug('Samba Service Response:', {
      //   endpoint: API_ENDPOINTS.status.samba.serviceStatus,
      //   response: JSON.stringify(response),
      //   timestamp: new Date().toISOString()
      // });
      return response;
    },
    {
      key: 'samba-service-status',
      cacheDuration: 300000, // 5 minutes cache
      executeOnMount: false,
      refreshInterval: 60000, // 1 minute refresh
      onError: (err: Error & { handled?: boolean }) => {
        if (isOfflineApiError(err)) {
          return;
        }
        if (!err.handled) {
          logger.error('Error fetching Samba service status:', err);
          error('Failed to fetch Samba service status');
          err.handled = true;
        }
      },
      debug: false // Enable detailed logging
    }
  );

  // Track initial fetch
  const initialFetchRef = useRef(false);

  // Handle initial fetch after admin authentication
  useEffect(() => {
    if (isAdmin && !initialFetchRef.current) {
      initialFetchRef.current = true;
      // debug('Initial fetch triggered, isAdmin =', isAdmin);
      
      // Initial request should be silent and not trigger loading indicators
      sshStatusRequest.execute(false);
      sshServiceRequest.execute(false);
      sambaServiceRequest.execute(false);
    }
  }, [isAdmin, sshStatusRequest, sshServiceRequest, sambaServiceRequest]);

  // Update SSH status state when the simpleRequest returns data
  useEffect(() => {
    if (sshStatusRequest.data) {
      // debug('SSH Status Update - Setting state from request data:', JSON.stringify(sshStatusRequest.data));
      setSSHStatus(sshStatusRequest.data);
    }
  }, [sshStatusRequest.lastUpdated]);

  // Log when service status is updated
  useEffect(() => {
    if (sshServiceRequest.data) {
      // debug('SSH Service Status Update - Request data updated:', JSON.stringify(sshServiceRequest.data));
    }
  }, [sshServiceRequest.lastUpdated]);

  // Log when Samba service status is updated
  useEffect(() => {
    if (sambaServiceRequest.data) {
      // debug('Samba Service Status Update - Request data updated:', JSON.stringify(sambaServiceRequest.data));
    }
  }, [sambaServiceRequest.lastUpdated]);

  // Memoize the fetch functions to prevent unnecessary re-renders
  const fetchSSHStatus = useCallback(async (force = false): Promise<void> => {
    if (!isAdmin) return;
    
    // debug(`fetchSSHStatus called with force=${force}, isLoading=${sshStatusRequest.isLoading}`);
    
    try {
      if (force || !sshStatusRequest.isLoading) {
        // debug('SSH Status - Executing request');
        const result = await sshStatusRequest.execute(force);
        // debug('SSH Status - Request completed, result:', result ? 'received' : 'null');
      } else {
        // debug('SSH Status - Skipping request - already in progress');
      }
    } catch (err) {
      // logger.error('SSH Status - Error in fetchSSHStatus:', err);
    }
  }, [sshStatusRequest, isAdmin]);
  
  const fetchSSHServiceStatus = useCallback(async (force = false): Promise<void> => {
    if (!isAdmin) return;
    
    debug(`fetchSSHServiceStatus called with force=${force}, isLoading=${sshServiceRequest.isLoading}`);
    
    try {
      if (force || !sshServiceRequest.isLoading) {
        // debug('SSH Service - Executing request');
        const result = await sshServiceRequest.execute(force);
        // debug('SSH Service - Request completed, result:', result ? 'received' : 'null');
      } else {
        // debug('SSH Service - Skipping request - already in progress');
      }
    } catch (err) {
      logger.error('SSH Service - Error in fetchSSHServiceStatus:', err);
    }
  }, [sshServiceRequest, isAdmin]);
  
  const fetchSambaServiceStatus = useCallback(async (force = false): Promise<void> => {
    if (!isAdmin) return;
    
    debug(`fetchSambaServiceStatus called with force=${force}, isLoading=${sambaServiceRequest.isLoading}`);
    
    try {
      if (force || !sambaServiceRequest.isLoading) {
        // debug('Samba Service - Executing request');
        const result = await sambaServiceRequest.execute(force);
        // debug('Samba Service - Request completed, result:', result ? 'received' : 'null');
      } else {
        // debug('Samba Service - Skipping request - already in progress');
      }
    } catch (err) {
      logger.error('Samba Service - Error in fetchSambaServiceStatus:', err);
    }
  }, [sambaServiceRequest, isAdmin]);
  
  const toggleSSHAuth = async (): Promise<void> => {
    if (!isAdmin || !sshStatus) return;
    
    try {
      await sshAuthLoading.withLoading(
        (async () => {
          // Toggle to opposite of current state
          const payload = { enable: !sshStatus.password_auth_enabled };
          const response = await api.post<SSHToggleResponse>(API_ENDPOINTS.status.ssh.toggle, payload);
          
          if (response.success) {
            // Force fetch after toggle - this is a write operation that changes state
            await fetchSSHStatus(true);
            success(response.message || 'SSH authentication toggled successfully');
          } else {
            error(response.error || 'Failed to toggle SSH authentication');
          }
        })()
      );
    } catch (err) {
      error('Failed to toggle SSH authentication');
      logger.error('Error toggling SSH auth:', err);
    }
  };
  
  const toggleSSHService = async (): Promise<void> => {
    const sshServiceStatus = sshServiceRequest.data;
    if (!isAdmin || !sshServiceStatus) return;
    
    try {
      await sshServiceLoading.withLoading(
        (async () => {
          // Toggle to opposite of current state (both enabled and running)
          const isCurrentlyActive = sshServiceStatus.is_enabled && sshServiceStatus.is_running;
          const payload = { enable: !isCurrentlyActive };
          
          const response = await api.post<SSHServiceToggleResponse>(API_ENDPOINTS.status.ssh.serviceToggle, payload);
          
          if (response.success) {
            // Force fetch after toggle to ensure server state
            await fetchSSHServiceStatus(true);
            const defaultMessage = `SSH service ${payload.enable ? 'enabled and started' : 'disabled and stopped'} successfully`;
            success(response.message || defaultMessage);
          } else {
            error(response.error || 'Failed to toggle SSH service');
          }
        })()
      );
    } catch (err) {
      error('Failed to toggle SSH service');
      logger.error('Error toggling SSH service:', err);
    }
  };

  const toggleSambaService = async (): Promise<void> => {
    const sambaServiceStatus = sambaServiceRequest.data;
    if (!isAdmin || !sambaServiceStatus) return;
    
    try {
      await sambaServiceLoading.withLoading(
        (async () => {
          // Toggle to opposite of current state (using all_enabled and all_running)
          const isCurrentlyActive = sambaServiceStatus.all_enabled && sambaServiceStatus.all_running;
          const payload = { enable: !isCurrentlyActive };
          
          const response = await api.post<SambaServiceToggleResponse>(API_ENDPOINTS.status.samba.serviceToggle, payload);
          
          if (response.success) {
            // Force fetch after toggle to ensure server state
            await fetchSambaServiceStatus(true);
            const defaultMessage = `Samba services ${payload.enable ? 'enabled and started' : 'disabled and stopped'} successfully`;
            success(response.message || defaultMessage);
          } else {
            error(response.error || 'Failed to toggle Samba services');
          }
        })()
      );
    } catch (err) {
      error('Failed to toggle Samba services');
      logger.error('Error toggling Samba services:', err);
    }
  };

  const handleSystemUpdate = async (): Promise<void> => {
    const confirmed = await confirm('Are you sure you want to update the system?');
    if (!confirmed) return;

    try {
      await updateLoading.withLoading(
        (async () => {
          setUpdateOutput([]);

          const eventSource = new EventSource(API_ENDPOINTS.system.update);
          
          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setUpdateOutput(prev => [...prev, data.message]);
            
            if (data.complete) {
              eventSource.close();
              success('System update completed successfully');
            }
          };
          
          eventSource.onerror = () => {
            eventSource.close();
            error('Error during system update');
          };
        })()
      );
    } catch (err) {
      error('Failed to perform system update');
      logger.error('System update failed:', err);
    }
  };

  const handleSystemRestart = async (): Promise<void> => {
    const confirmed = await confirm('Are you sure you want to restart the system?');
    if (!confirmed) return;

    try {
      await restartLoading.withLoading(
        (async () => {
          // Show progress modal
          const response = await api.post<SystemRestartResponse>(API_ENDPOINTS.system.restart);
          
          if (response.success) {
            success(response.message || 'System restart initiated');
            // Reload page after delay to allow services to restart
            setTimeout(() => {
              window.location.reload();
            }, 30000); // Give services 30 seconds to restart
          } else {
            error(response.error || 'Failed to restart system');
          }
        })()
      );
    } catch (err) {
      error('Failed to restart system');
      logger.error('System restart failed:', err);
    }
  };

  const handleSystemShutdown = async (): Promise<void> => {
    const confirmed = await confirm('Are you sure you want to shutdown the system?');
    if (!confirmed) return;

    try {
      await shutdownLoading.withLoading(
        (async () => {
          // Show initial progress modal
          const response = await api.post<SystemShutdownResponse>(API_ENDPOINTS.system.shutdown);
          
          if (response.success) {
            success(response.message || 'System shutdown initiated');
            // Reload page after delay to show offline state
            setTimeout(() => {
              window.location.reload();
            }, 30000); // Give services 30 seconds to shutdown
          } else {
            error(response.error || 'Failed to shutdown system');
          }
        })()
      );
    } catch (err) {
      error('Failed to shutdown system');
      logger.error('System shutdown failed:', err);
    }
  };

  const handleHardReset = async (): Promise<void> => {
    const confirmed = await confirm('Are you sure you want to perform a hard reset? This will restart the web interface services (Nginx and Gunicorn) to fix any issues with the site without performing a full system reboot.');
    if (!confirmed) return;

    try {
      await hardResetLoading.withLoading(
        (async () => {
          // Activate fallback mode with specific reason before initiating reset
          fallbackManager.activateFallback('ui_reset_in_progress');
          
          // Show progress modal
          const response = await api.post<HardResetResponse>(API_ENDPOINTS.status.hardReset);
          
          if (response.success) {
            success(response.message || 'Hard reset initiated');
            // Reload page after delay to allow services to restart
            setTimeout(() => {
              window.location.reload();
            }, 5000); // Give services 5 seconds to restart
          } else {
            error(response.error || 'Failed to perform hard reset');
            // Deactivate fallback if reset failed
            fallbackManager.deactivateFallback();
          }
        })()
      );
    } catch (err) {
      // This error is expected as the server will terminate the connection
      // debug('Hard reset connection terminated as expected');
    }
  };

  // New function to handle the cryptography test
  const handleCryptoTest = async (): Promise<void> => {
    if (!isAdmin) {
      error('Admin privileges required for this operation.');
      return;
    }

    const secret = 'our secret';
    info(`Sending crypto test with secret: "${secret}"`);
    setCryptoTestResult(null); // Clear previous results

    try {
      await cryptoTestLoading.withLoading(
        (async () => {
          const payload = {
            base64_encoded: base64Encode(secret),
            url_encoded: encodeURIComponent(secret),
            raw_string: secret,
            // Add more methods here if needed later
            // Example: simple shift cipher (very insecure, just for testing)
            simple_shift: secret.split('').map(char => String.fromCharCode(char.charCodeAt(0) + 1)).join(''),
            // Add AES encrypted data
            aes_cbc_pkcs7: encryptDataSync(secret) // Send IV and ciphertext or error
          };
          
          debug('Crypto Test - Sending payload:', JSON.stringify(payload, null, 2));
          
          const response = await api.post<CryptoTestResponse>(API_ENDPOINTS.crypto.test, payload);
          
          debug('Crypto Test - Received response:', response);
          setCryptoTestResult(response);
          
          // Log the results clearly
          if (response && response.results) {
            debug('--- Crypto Test Results ---');
            Object.entries(response.results).forEach(([key, value]) => {
              const outcome = value === secret ? 'SUCCESS' : 'FAILURE';
              debug(`[${outcome}] ${key}: Decoded to -> ${value}`);
            });
            debug('---------------------------');
            success('Crypto test completed. Check browser console for detailed results.');
          } else {
            error('Crypto test failed or returned invalid data.');
          }
        })()
      );
    } catch (err: any) {
      error(`Crypto test failed: ${err.message || 'Unknown error'}`);
      logger.error('Crypto test failed:', err);
    }
  };

  // New function to handle opening the admin password modal
  const handleAdminPasswordUpdate = useCallback(() => {
    if (!isAdmin) return;
    
    showModal({
      title: 'Update Admin Password',
      hideActions: true, // Hide default modal actions since our component has its own
      initialFocus: -1, // Prevent autofocus on any element
      children: React.createElement(AdminPasswordModal, { onClose: closeModal })
    });
  }, [isAdmin]);

  // New function to handle opening the log viewer modal
  const handleViewLogs = useCallback(() => {
    if (!isAdmin) return;
    
    showModal({
      title: 'Homeserver Logs',
      hideActions: true,
      initialFocus: -1,
      children: React.createElement(LogViewerModal, { onClose: closeModal }) // No need for render function since it's static
    });
  }, [isAdmin]);

  // Add hard drive test handler
  const handleHardDriveTest = useCallback(() => {
    if (!isAdmin) return;
    
    showModal({
      title: 'Hard Drive Test',
      hideActions: true,
      initialFocus: -1,
      children: () => {
        // Return fresh instance of modal component on each render
        return React.createElement(HardDriveTestModal, {
          onClose: closeModal,
          stayOpenOnFallback: true
        });
      }
    });
  }, [isAdmin]);

  // Add state for root CA modal (optional, for completeness)
  const [isViewingRootCAModal, setViewingRootCAModal] = useState(false);

  // New function to handle opening the Root CA modal
  const handleRootCAModal = useCallback(() => {
    setViewingRootCAModal(true);
    // debug('Opening Root CA modal');
    showModal({
      title: 'Install HomeServer SSL Certificate',
      hideActions: true,
      initialFocus: -1,
      children: React.createElement(RootCAModal, { onClose: () => { debug('Closing Root CA modal'); closeModal(); } })
    });
  }, []);



  // Add state for update manager modal
  const [isViewingUpdateManager, setViewingUpdateManager] = useState(false);



  // Handle update manager modal
  const handleUpdateManager = useCallback(() => {
    if (!isAdmin) return;
    
    setViewingUpdateManager(true);
    showModal({
      title: 'System Update Manager',
      hideActions: true,
      initialFocus: -1,
      children: React.createElement(UpdateManagerModal, { 
        onClose: () => {
          setViewingUpdateManager(false);
          closeModal();
        }
      })
    });
  }, [isAdmin, showModal]);

  // Log current state on every render
  const currentState = {
    sshStatus,
    sshServiceStatus: sshServiceRequest.data,
    sambaServiceStatus: sambaServiceRequest.data,
    isFetchingSSHStatus: sshStatusRequest.isLoading,
    isFetchingSSHServiceStatus: sshServiceRequest.isLoading,
    isFetchingSambaServiceStatus: sambaServiceRequest.isLoading,
    isTogglingSSH: sshAuthLoading.isLoading,
    isTogglingSSHService: sshServiceLoading.isLoading,
    isTogglingSambaService: sambaServiceLoading.isLoading,
    isUpdating: updateLoading.isLoading,
    isRestarting: restartLoading.isLoading,
    isShuttingDown: shutdownLoading.isLoading,
    isHardResetting: hardResetLoading.isLoading,
    updateOutput,
    isTestingCrypto: cryptoTestLoading.isLoading,
    cryptoTestResult,
    isUpdatingAdminPassword: adminPasswordLoading.isLoading,
    isViewingLogs: false, // This doesn't need to track state as it's handled by modal system
          isTestingHardDrive: hardDriveTestLoading.isLoading,
      isViewingRootCAModal,
      isViewingUpdateManager,
  };
  
  // Create a ref to prevent re-logging on every render
  const prevStateRef = useRef<string>('');
  const currentStateString = JSON.stringify(currentState);
  
  if (prevStateRef.current !== currentStateString) {
    // debug('State updated:', currentState);
    prevStateRef.current = currentStateString;
  }

  return [
    {
      sshStatus,
      sshServiceStatus: sshServiceRequest.data,
      sambaServiceStatus: sambaServiceRequest.data,
      isFetchingSSHStatus: sshStatusRequest.isLoading,
      isFetchingSSHServiceStatus: sshServiceRequest.isLoading,
      isFetchingSambaServiceStatus: sambaServiceRequest.isLoading,
      isTogglingSSH: sshAuthLoading.isLoading,
      isTogglingSSHService: sshServiceLoading.isLoading,
      isTogglingSambaService: sambaServiceLoading.isLoading,
      isUpdating: updateLoading.isLoading,
      isRestarting: restartLoading.isLoading,
      isShuttingDown: shutdownLoading.isLoading,
      isHardResetting: hardResetLoading.isLoading,
      updateOutput,
      isTestingCrypto: cryptoTestLoading.isLoading,
      cryptoTestResult,
      isUpdatingAdminPassword: adminPasswordLoading.isLoading,
      isViewingLogs: false, 
      isTestingHardDrive: hardDriveTestLoading.isLoading,
      isViewingRootCAModal,
      isViewingUpdateManager,
    },
    {
      fetchSSHStatus,
      fetchSSHServiceStatus,
      fetchSambaServiceStatus,
      toggleSSHAuth,
      toggleSSHService,
      toggleSambaService,
      handleSystemUpdate,
      handleSystemRestart,
      handleSystemShutdown,
      handleHardReset,
      handleCryptoTest,
      handleAdminPasswordUpdate,
      handleViewLogs,
      handleHardDriveTest,
      handleRootCAModal,
      handleUpdateManager,
    }
  ];
};
