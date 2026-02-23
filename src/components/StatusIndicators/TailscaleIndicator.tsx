import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faNetworkWired, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showModal } from '../Popup/PopupManager';
import { useAuth } from '../../hooks/useAuth';
import { API_ENDPOINTS } from '../../api/endpoints';
import { api } from '../../api/client';
import { useLoading } from '../../hooks/useLoading';
import { useToast } from '../../hooks/useToast';
import { TailscaleStatus } from '../WebSocket/types';
import { socketClient } from '../WebSocket/client';
import { useStore, useBroadcastData } from '../../store';
import { useResponsiveTooltip } from '../../hooks/useTooltip';

interface TailscaleConfig {
  tailnet: string;
}

interface TailscaleConfigFormProps {
  currentConfig: TailscaleConfig;
  isUpdatingConfig: boolean;
  onUpdate: (tailnet: string) => Promise<void>;
  initialTailnet: string;
  pendingTailnet: string | null;
  isOperationInProgress: boolean;
}

/**
 * Custom hook for processing tailscale status data
 * Follows the pattern from the subscription README
 */
export function useTailscaleStatus() {
  const [status, setStatus] = useState<TailscaleStatus>({
    status: 'loading',
    interface: false,
    timestamp: Date.now()
  });
  const [config, setConfig] = useState<TailscaleConfig>({ tailnet: '' });
  const [error, setError] = useState<string | null>(null);
  const [pendingTailnet, setPendingTailnet] = useState<string | null>(null);
  
  // Add refs to track pending service operations
  const pendingServiceOperation = useRef<{ enable: boolean } | null>(null);
  
  // Add refs to track pending connect/disconnect operations
  const pendingConnectionOperation = useRef<'connect' | 'disconnect' | null>(null);
  
  // Add ref to track manually set loginUrl to prevent it from being lost
  const manuallySetLoginUrl = useRef<string | null>(null);
  
  // Create refs to store latest state
  const statusRef = useRef(status);
  const configRef = useRef(config);
  const pendingTailnetRef = useRef<string | null>(null);
  
  // Get auth and store state
  const { isAdmin, updateActivity } = useAuth();
  const isAdminRef = useRef(isAdmin);
  
  // Use the broadcast data hook to access tailscale status data
  const { getBroadcastData } = useBroadcastData();
  
  // Get toast for service status notifications
  const toast = useToast();
  
  // Loading states for different operations
  const { isLoading: isConnecting, withLoading: withConnectLoading } = useLoading();
  const { isLoading: isDisconnecting, withLoading: withDisconnectLoading } = useLoading();
  const { isLoading: isUpdatingConfig, withLoading: withConfigLoading } = useLoading();
  const { isLoading: isEnablingService, withLoading: withEnableLoading } = useLoading();
  const { isLoading: isDisablingService, withLoading: withDisableLoading } = useLoading();
  const { isLoading: isAuthenticating, withLoading: withAuthLoading } = useLoading();
  
  // Keep refs updated
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);
  
  useEffect(() => {
    pendingTailnetRef.current = pendingTailnet;
  }, [pendingTailnet]);
  
  // Update local state when broadcast data changes
  useEffect(() => {
    // Get the latest tailscale status data from the broadcast store
    const latestStatusData = getBroadcastData('tailscale_status', isAdmin);
    
    if (latestStatusData) {
      // Check if service state changed and we have a pending operation
      if (pendingServiceOperation.current !== null && 
          statusRef.current.isEnabled !== latestStatusData.isEnabled) {
        
        // Show toast based on the operation result
        if (latestStatusData.isEnabled === pendingServiceOperation.current.enable) {
          toast.success(`Tailscale service ${latestStatusData.isEnabled ? 'enabled' : 'disabled'} successfully`);
        } else {
          toast.error(`Failed to ${pendingServiceOperation.current.enable ? 'enable' : 'disable'} Tailscale service`);
        }
        
        // Clear the pending operation
        pendingServiceOperation.current = null;
      }
      
      // Check if connection state changed and we have a pending connection operation
      if (pendingConnectionOperation.current !== null && 
          statusRef.current.status !== latestStatusData.status) {
        
        // Clear the pending operation when status changes
        pendingConnectionOperation.current = null;
        
        // If we're now connected, clear the manually set loginUrl
        if (latestStatusData.status === 'connected') {
          console.log('[TAIL] Connection successful, clearing manually set loginUrl');
          manuallySetLoginUrl.current = null;
        }
        
        // Also clear if we have a loginUrl in the broadcast data (means auth was successful)
        if (latestStatusData.loginUrl && latestStatusData.status === 'connected') {
          console.log('[TAIL] Connection successful with loginUrl, clearing manually set loginUrl');
          manuallySetLoginUrl.current = null;
        }
      }
      
      // Preserve manually set loginUrl when updating from broadcast data
      setStatus(prevStatus => {
        const newStatus = { ...latestStatusData };
        
        // If we have a manually set loginUrl and the broadcast data doesn't have one,
        // preserve the manual one (this prevents the flash/disappear issue)
        if (prevStatus.loginUrl && !newStatus.loginUrl && 
            pendingConnectionOperation.current === 'connect') {
          console.log('[TAIL] Preserving manually set loginUrl:', prevStatus.loginUrl);
          newStatus.loginUrl = prevStatus.loginUrl;
        }
        
        // Also check if we have a manually set loginUrl in the ref that should be preserved
        if (manuallySetLoginUrl.current && !newStatus.loginUrl && 
            pendingConnectionOperation.current === 'connect') {
          console.log('[TAIL] Preserving manually set loginUrl from ref:', manuallySetLoginUrl.current);
          newStatus.loginUrl = manuallySetLoginUrl.current;
        }
        
        return newStatus;
      });
      
      setError(null);
      
      if (latestStatusData.tailnet) {
        setConfig(prev => {
          if (prev.tailnet === latestStatusData.tailnet) return prev;
          return { ...prev, tailnet: latestStatusData.tailnet! };
        });
        
        // If there's a pending tailnet and it matches the current tailnet, clear it
        if (pendingTailnet && pendingTailnet === latestStatusData.tailnet) {
          setPendingTailnet(null);
        }
      }
    }
    
    // Set up a polling interval to continually check for updated data
    const interval = setInterval(() => {
      const updatedData = getBroadcastData('tailscale_status', isAdmin);
      if (updatedData && 
          (!statusRef.current || 
           updatedData.timestamp !== statusRef.current.timestamp)) {
        
        // Check if service state changed and we have a pending operation
        if (pendingServiceOperation.current !== null && 
            statusRef.current.isEnabled !== updatedData.isEnabled) {
          
          // Show toast based on the operation result
          if (updatedData.isEnabled === pendingServiceOperation.current.enable) {
            toast.success(`Tailscale service ${updatedData.isEnabled ? 'enabled' : 'disabled'} successfully`);
          } else {
            toast.error(`Failed to ${updatedData.isEnabled ? 'enable' : 'disable'} Tailscale service`);
          }
          
          // Clear the pending operation
          pendingServiceOperation.current = null;
        }
        
        // Check if connection state changed and we have a pending connection operation
        if (pendingConnectionOperation.current !== null && 
            statusRef.current.status !== updatedData.status) {
          
          // Clear the pending operation when status changes
          pendingConnectionOperation.current = null;
          
          // If we're now connected, clear the manually set loginUrl
          if (updatedData.status === 'connected') {
            console.log('[TAIL] Connection successful in polling, clearing manually set loginUrl');
            manuallySetLoginUrl.current = null;
          }
          
          // Also clear if we have a loginUrl in the broadcast data (means auth was successful)
          if (updatedData.loginUrl && updatedData.status === 'connected') {
            console.log('[TAIL] Connection successful with loginUrl in polling, clearing manually set loginUrl');
            manuallySetLoginUrl.current = null;
          }
        }
        
        // Preserve manually set loginUrl when updating from broadcast data
        setStatus(prevStatus => {
          const newStatus = { ...updatedData };
          
          // If we have a manually set loginUrl and the broadcast data doesn't have one,
          // preserve the manual one (this prevents the flash/disappear issue)
          if (prevStatus.loginUrl && !newStatus.loginUrl && 
              pendingConnectionOperation.current === 'connect') {
            console.log('[TAIL] Preserving manually set loginUrl in polling:', prevStatus.loginUrl);
            newStatus.loginUrl = prevStatus.loginUrl;
          }
          
          // Also check if we have a manually set loginUrl in the ref that should be preserved
          if (manuallySetLoginUrl.current && !newStatus.loginUrl && 
              pendingConnectionOperation.current === 'connect') {
            console.log('[TAIL] Preserving manually set loginUrl from ref in polling:', manuallySetLoginUrl.current);
            newStatus.loginUrl = manuallySetLoginUrl.current;
          }
          
          return newStatus;
        });
        
        setError(null);
        
        if (updatedData.tailnet) {
          setConfig(prev => {
            if (prev.tailnet === updatedData.tailnet) return prev;
            return { ...prev, tailnet: updatedData.tailnet! };
          });
          
          // If there's a pending tailnet and it matches the current tailnet, clear it
          if (pendingTailnetRef.current && pendingTailnetRef.current === updatedData.tailnet) {
            setPendingTailnet(null);
          }
        }
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [getBroadcastData, isAdmin, pendingTailnet]);
  
  // Cleanup effect for manually set loginUrl
  useEffect(() => {
    return () => {
      // Clear manually set loginUrl on unmount
      if (manuallySetLoginUrl.current) {
        console.log('[TAIL] Component unmounting, clearing manually set loginUrl');
        manuallySetLoginUrl.current = null;
      }
    };
  }, []);
  
  // Fetch initial config when in admin mode
  useEffect(() => {
    if (isAdmin) {
      api.get<TailscaleConfig>(API_ENDPOINTS.status.tailscale.config)
        .then(data => setConfig(data))
        .catch(err => {
          console.error('Failed to load Tailscale config:', err);
          setError('Failed to load Tailscale config');
        });
    }
  }, [isAdmin]);
  
  // Handle service toggle
  const handleServiceToggle = useCallback(async (enable: boolean) => {
    updateActivity();
    
    try {
      // Set the pending operation
      pendingServiceOperation.current = { enable };
      
      const endpoint = enable ? API_ENDPOINTS.status.tailscale.enable : API_ENDPOINTS.status.tailscale.disable;
      const loadingFunction = enable ? withEnableLoading : withDisableLoading;
      await loadingFunction(api.post<void>(endpoint));
    } catch (error) {
      console.error('Failed to toggle Tailscale service:', error);
      setError(`Failed to ${enable ? 'enable' : 'disable'} Tailscale service`);
      
      // Clear the pending operation on error
      pendingServiceOperation.current = null;
    }
  }, [updateActivity, withEnableLoading, withDisableLoading, api]);

  const connect = useCallback(async () => {
    updateActivity();
    pendingConnectionOperation.current = 'connect';
    try {
      const response: any = await withConnectLoading(api.post(API_ENDPOINTS.status.tailscale.connect));
      // If backend returns an authUrl, surface it immediately so the modal shows yellow state with link
      const authUrl = response?.authUrl || response?.url;
      if (authUrl) {
        console.log('[TAIL] Connect button returned authUrl:', authUrl);
        // Track the manually set loginUrl to prevent it from being lost
        manuallySetLoginUrl.current = authUrl;
        setStatus(prev => {
          const newStatus = {
            ...prev,
            status: 'disconnected' as const,
            loginUrl: authUrl,
            timestamp: Date.now()
          };
          console.log('[TAIL] Setting status with loginUrl:', newStatus);
          return newStatus;
        });
      }
    } catch (error: any) {
      console.error('Failed to connect Tailscale:', error);
      const message = error?.response?.data?.error || error?.message || 'Failed to connect Tailscale';
      toast.error(message);
      pendingConnectionOperation.current = null;
    }
  }, [updateActivity, withConnectLoading, toast]);

  const disconnect = useCallback(async () => {
    updateActivity();
    pendingConnectionOperation.current = 'disconnect';
    try {
      await withDisconnectLoading(api.post(API_ENDPOINTS.status.tailscale.disconnect));
    } catch (error: any) {
      console.error('Failed to disconnect Tailscale:', error);
      const message = error?.response?.data?.error || error?.message || 'Failed to disconnect Tailscale';
      toast.error(message);
      pendingConnectionOperation.current = null;
    }
  }, [updateActivity, withDisconnectLoading, toast]);

  const updateConfig = useCallback(async (tailnet: string) => {
    updateActivity();
    setPendingTailnet(tailnet);
    try {
      await withConfigLoading(api.post(API_ENDPOINTS.status.tailscale.updateTailnet, { tailnetName: tailnet }));
      toast.success('Tailscale config update initiated. Please wait for status change.');
    } catch (error: any) {
      console.error('Failed to update Tailscale config:', error);
      const message = error?.response?.data?.error || error?.message || 'Failed to update Tailscale config';
      toast.error(message);
      setPendingTailnet(null);
    }
  }, [updateActivity, withConfigLoading, toast]);

  const authenticateWithAuthKey = useCallback(async (authKey: string) => {
    updateActivity();
    try {
      await withAuthLoading(api.post(API_ENDPOINTS.status.tailscale.authkey, { authKey }));
      toast.success('Authentication successful! Tailscale should connect shortly.');
    } catch (error: any) {
      console.error('Failed to authenticate with auth key:', error);
      const message = error?.response?.data?.error || error?.message || 'Failed to authenticate with auth key';
      toast.error(message);
    }
  }, [updateActivity, withAuthLoading, toast]);

  // Get color based on status
  const getStatusColor = useCallback(() => {
    if (status.status === 'loading') {
      return 'var(--text)';
    }

    // Special handling for login needed state
    if (status.status === 'disconnected' && status.loginUrl) {
      return 'var(--warning)';
    }

    switch (status.status) {
      case 'connected':
        return 'var(--success)';
      case 'disconnected':
        return 'var(--error)';
      case 'error':
        return 'var(--error)';
      default:
        return 'var(--text)';
    }
  }, [status.status, status.isEnabled, status.loginUrl]);

  // Get tooltip message based on status
  const getTooltipMessage = useCallback(() => {
    // Special handling for login needed state
    if (status.status === 'disconnected' && status.loginUrl) {
      return 'Tailscale: needs login - click to authenticate';
    }
    
    switch (status.status) {
      case 'loading':
        return 'Checking Tailscale connection...';
      case 'connected':
        return `Tailscale: connected${isAdmin && status.ip ? ` (${status.ip})` : ''}${isAdmin && status.tailnet ? ` - Tailnet: ${status.tailnet}` : ''}`;
      case 'disconnected':
        return 'Tailscale: disconnected';
      case 'error':
        return `Tailscale Error: ${status.error || 'Unknown error'}`;
      default:
        return 'Tailscale: unknown status';
    }
  }, [status, isAdmin]);
  
  return {
    status,
    statusRef,
    config,
    configRef,
    error,
    isConnecting,
    isDisconnecting,
    isUpdatingConfig,
    isEnablingService,
    isDisablingService,
    isAuthenticating,
    pendingTailnet,
    pendingServiceOperation,
    pendingConnectionOperation,
    manuallySetLoginUrl,
    isAdmin,
    isAdminRef,
    getStatusColor,
    getTooltipMessage,
    handleConnect: connect,
    handleDisconnect: disconnect,
    handleServiceToggle,
    handleConfigUpdate: updateConfig,
    handleAuthKeyAuth: authenticateWithAuthKey
  };
}

// Move the config form component outside
const TailscaleConfigForm = React.memo(({ 
  currentConfig,
  isUpdatingConfig,
  onUpdate,
  initialTailnet,
  pendingTailnet,
  isOperationInProgress
}: TailscaleConfigFormProps) => {
  const [tailnetValue, setTailnetValue] = useState(initialTailnet);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSubmittedValue = useRef<string | null>(null);
  const isUserEditing = useRef(false);
  const updateInProgress = useRef(false);
  const reconnectionCount = useRef(0);

  // Add effect to sync with prop changes
  useEffect(() => {
    console.log('InitialTailnet prop updated:', initialTailnet);
    // Only update if we're not in the middle of an update
    if (!updateInProgress.current) {
      setTailnetValue(initialTailnet);
    }
  }, [initialTailnet]);

  // Handle WebSocket updates through currentConfig changes
  useEffect(() => {
    console.log('Config updated:', {
      current: currentConfig.tailnet,
      lastSubmitted: lastSubmittedValue.current,
      isSubmitting,
      updateInProgress: updateInProgress.current,
      reconnectionCount: reconnectionCount.current
    });
    
    // If we have a lastSubmittedValue and it matches the new config
    // this means our update was successful
    if (lastSubmittedValue.current && lastSubmittedValue.current === currentConfig.tailnet) {
      console.log('Update confirmed successful, resetting state');
      setIsSubmitting(false);
      lastSubmittedValue.current = null;
      updateInProgress.current = false;
      isUserEditing.current = false;
      reconnectionCount.current = 0;
    }
  }, [currentConfig.tailnet]);

  // Handle WebSocket reconnections
  useEffect(() => {
    if (isSubmitting && lastSubmittedValue.current) {
      reconnectionCount.current++;
      console.log('WebSocket reconnected during update:', {
        lastSubmitted: lastSubmittedValue.current,
        current: currentConfig.tailnet,
        reconnectionCount: reconnectionCount.current
      });

      // If we've reconnected and the values match, consider it a success
      if (lastSubmittedValue.current === currentConfig.tailnet) {
        console.log('Update confirmed after reconnection');
        setIsSubmitting(false);
        lastSubmittedValue.current = null;
        updateInProgress.current = false;
        isUserEditing.current = false;
        reconnectionCount.current = 0;
      }
      // If we've reconnected too many times, reset the form
      else if (reconnectionCount.current > 3) {
        console.log('Too many reconnection attempts, resetting form');
        setIsSubmitting(false);
        lastSubmittedValue.current = null;
        updateInProgress.current = false;
        isUserEditing.current = false;
        reconnectionCount.current = 0;
        setTailnetValue(currentConfig.tailnet);
      }
    }
  }, [currentConfig.tailnet, isSubmitting]);

  const handleUpdate = useCallback(async () => {
    if (tailnetValue && tailnetValue !== currentConfig.tailnet) {
      console.log('Update tailnet button pressed:', {
        value: tailnetValue,
        current: currentConfig.tailnet
      });
      
      setIsSubmitting(true);
      lastSubmittedValue.current = tailnetValue;
      updateInProgress.current = true;
      reconnectionCount.current = 0;
      
      try {
        await onUpdate(tailnetValue);
      } catch (error) {
        // Reset submission state on error
        console.error('Update failed:', error);
        setIsSubmitting(false);
        lastSubmittedValue.current = null;
        updateInProgress.current = false;
        isUserEditing.current = false;
        reconnectionCount.current = 0;
      }
    }
  }, [tailnetValue, currentConfig.tailnet, onUpdate]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    console.log('Input changed:', {
      newValue,
      current: currentConfig.tailnet,
      lastSubmitted: lastSubmittedValue.current,
      updateInProgress: updateInProgress.current
    });
    
    isUserEditing.current = true;
    setTailnetValue(newValue);
    
    // Only reset states if we're not in the middle of an update
    if (!updateInProgress.current) {
      setIsSubmitting(false);
      lastSubmittedValue.current = null;
    }
  }, [currentConfig.tailnet]);

  const handleInputBlur = useCallback(() => {
    // Only reset user editing if we're not in the middle of an update
    if (!updateInProgress.current) {
      console.log('Input blur, resetting user editing state');
      isUserEditing.current = false;
    }
  }, []);

  // Update disabled state
  const isButtonDisabled = isUpdatingConfig || 
    tailnetValue === currentConfig.tailnet || 
    isSubmitting ||
    updateInProgress.current ||
    isOperationInProgress;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      updateInProgress.current = false;
      isUserEditing.current = false;
      lastSubmittedValue.current = null;
      reconnectionCount.current = 0;
    };
  }, []);

  return (
    <div className="config-section">
      <div className="current-tailnet">
        <span className="label">Current Tailnet:</span>
        <span className="value">
          {currentConfig.tailnet ? (
            currentConfig.tailnet
          ) : (
            <>
              <FontAwesomeIcon icon={faSpinner} spin style={{ marginRight: '8px' }} />
              Loading...
            </>
          )}
        </span>
      </div>
      <div className="config-form">
        <input
          type="text"
          value={tailnetValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isButtonDisabled) {
              e.preventDefault();
              handleUpdate();
            }
          }}
          placeholder="Enter Tailnet name"
          disabled={isSubmitting || updateInProgress.current || isOperationInProgress}
        />
        <button
          className="primary-button"
          onClick={handleUpdate}
          disabled={isButtonDisabled}
        >
          {isSubmitting || updateInProgress.current ? (
            <FontAwesomeIcon icon={faSpinner} spin />
          ) : 'Update Tailnet'}
        </button>
        <div className="tooltip-text">
          {`Unique name used for DNS entries and TLS certificates.
          You can find this name on the DNS page of your tailscale dashboard.
          This change will reboot the website and tailscale service. 
          Please wait and refresh the page after submitting changes.

          Note: HOMESERVER will automatically regenerate the HTTPS self-signed
          certificate to reference your new tailnet. If you previously
          installed the certificate on any device, open the site in a
          private/incognito window and re-download the certificate before
          returning to normal browsing. Until the new certificate is
          installed, browsers may report a certificate name mismatch for both
          local and remote access.`}
        </div>
      </div>
    </div>
  );
});

// Add display name
TailscaleConfigForm.displayName = 'TailscaleConfigForm';

interface AuthKeyFormProps {
  isAuthenticating: boolean;
  onAuthenticate: (authKey: string) => Promise<void>;
  isOperationInProgress: boolean;
}

/**
 * Component for auth key authentication
 */
const AuthKeyForm = React.memo(({
  isAuthenticating,
  onAuthenticate,
  isOperationInProgress
}: AuthKeyFormProps) => {
  const [authKey, setAuthKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateActivity } = useAuth();

  const handleSubmit = useCallback(async () => {
    if (!authKey.trim()) return;
    
    updateActivity();
    setIsSubmitting(true);
    try {
      await onAuthenticate(authKey.trim());
      setAuthKey(''); // Clear the input on success
    } catch (error) {
      // Error handling is done in the parent component
      console.error('Auth key authentication failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [authKey, onAuthenticate, updateActivity]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthKey(e.target.value);
  }, []);

  const isButtonDisabled = !authKey.trim() || isAuthenticating || isSubmitting || isOperationInProgress;

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isButtonDisabled) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, isButtonDisabled]);

  return (
    <div className="authkey-section">
      <div className="authkey-alternative">
        <p className="alternative-text">
          <strong>Alternative:</strong> If the login link isn&apos;t working, you can use an auth key instead.
        </p>
      </div>
      <div className="authkey-form">
        <input
          type="text"
          value={authKey}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter your tskey-auth-... or tskey-client-... key"
          disabled={isSubmitting || isOperationInProgress}
          className="authkey-input"
        />
        <button
          className="primary-button"
          onClick={handleSubmit}
          disabled={isButtonDisabled}
        >
          {isSubmitting || isAuthenticating ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              {' Authenticating...'}
            </>
          ) : (
            'Authenticate'
          )}
        </button>
      </div>
      <div className="authkey-help">
        <p>Get your auth key from the Tailscale admin console under Settings → Keys.</p>
      </div>
    </div>
  );
});

// Add display name
AuthKeyForm.displayName = 'AuthKeyForm';

/**
 * TailscaleIndicator component for displaying Tailscale VPN status
 * and providing admin controls for connection management.
 */
export const TailscaleIndicator: React.FC = React.memo(() => {
  const toast = useToast();
  const {
    status,
    statusRef,
    config,
    configRef,
    error,
    isConnecting,
    isDisconnecting,
    isUpdatingConfig,
    isEnablingService,
    isDisablingService,
    isAuthenticating,
    pendingTailnet,
    pendingServiceOperation,
    pendingConnectionOperation,
    manuallySetLoginUrl,
    isAdmin,
    isAdminRef,
    getStatusColor,
    getTooltipMessage,
    handleConnect,
    handleDisconnect,
    handleServiceToggle,
    handleConfigUpdate,
    handleAuthKeyAuth
  } = useTailscaleStatus();
  
  const { updateActivity } = useAuth();

  // Use the responsive tooltip hook with the getTooltipMessage function
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  // Modify renderModalContent to use refs and be more robust
  const renderModalContent = useCallback(() => {
    // Get latest state from refs
    const currentStatus = statusRef.current;
    const currentConfig = configRef.current;
    const currentIsAdmin = isAdminRef.current;
    const currentPendingTailnet = pendingTailnet;

    // Track if any operation is in progress to disable all buttons
    const isOperationInProgress = isConnecting || isDisconnecting || isEnablingService || isDisablingService || isUpdatingConfig || isAuthenticating;

    // Handle disconnected WebSocket state
    if (status.status === 'loading') {
      return (
        <div className="tailscale-status-modal">
          <div className="status-section">
            <p className="status-text loading">
              <FontAwesomeIcon icon={faSpinner} spin /> LOADING...
            </p>
          </div>
        </div>
      );
    }

    // Early return if no status
    if (!currentStatus) {
      return (
        <div className="tailscale-status-modal">
          <div className="status-section">
            <p className="status-text loading">
              <FontAwesomeIcon icon={faSpinner} spin /> LOADING...
            </p>
          </div>
        </div>
      );
    }



    return (
      <div className="tailscale-status-modal">
        <div className="status-section">
          <p className={`status-text ${currentStatus.status}`}>
            {currentStatus.status === 'loading' ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> CHECKING...
              </>
            ) : (
              <>
                {currentStatus.status.toUpperCase()}
                {currentIsAdmin && currentStatus.ip && ` (${currentStatus.ip})`}
              </>
            )}
          </p>
          
          {/* Display login URL if available */}
          {currentIsAdmin && currentStatus.loginUrl && currentStatus.status === 'disconnected' && (
            <div className="login-required-section">
              <div className="login-message">
                <strong>Authentication Required</strong>
                <p>Tailscale service is running but needs authentication. Click the link below to complete login:</p>
              </div>
              <div className="login-url-container">
                <a 
                  href={currentStatus.loginUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="login-url-link"
                >
                  {currentStatus.loginUrl}
                </a>
                <button
                  className="copy-url-button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentStatus.loginUrl!);
                    toast.success('Login URL copied to clipboard');
                  }}
                  title="Copy URL to clipboard"
                >
                  Copy URL
                </button>
              </div>
              <div className="login-instructions">
                <p><strong>Instructions:</strong></p>
                <ol>
                  <li>Click the authentication link above (opens in new tab)</li>
                  <li>Sign in to your Tailscale account</li>
                  <li>Authorize this device</li>
                  <li>Return here - the status should update automatically</li>
                </ol>
              </div>
              
              <AuthKeyForm
                isAuthenticating={isAuthenticating}
                onAuthenticate={handleAuthKeyAuth}
                isOperationInProgress={isOperationInProgress}
              />
            </div>
          )}
        </div>

        {currentIsAdmin && (
          <>
            <div className="controls-section">
              <div className="connection-buttons">
                <button
                  className={`primary-button ${pendingConnectionOperation.current === 'connect' ? 'pending-operation' : ''}`}
                  onClick={handleConnect}
                  disabled={currentStatus.status === 'connected' || isOperationInProgress}
                >
                  {isConnecting ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Connecting...'}
                    </>
                  ) : pendingConnectionOperation.current === 'connect' ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Connecting...'}
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>
                <button
                  className={`primary-button ${pendingConnectionOperation.current === 'disconnect' ? 'pending-operation' : ''}`}
                  onClick={handleDisconnect}
                  disabled={currentStatus.status === 'disconnected' || isOperationInProgress}
                >
                  {isDisconnecting ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Disconnecting...'}
                    </>
                  ) : pendingConnectionOperation.current === 'disconnect' ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Disconnecting...'}
                    </>
                  ) : (
                    'Disconnect'
                  )}
                </button>
              </div>

              <div className="service-controls">
                <button
                  className={`primary-button ${pendingServiceOperation.current?.enable === true ? 'pending-operation' : ''}`}
                  onClick={() => handleServiceToggle(true)}
                  disabled={currentStatus.isEnabled === true || isOperationInProgress}
                >
                  {isEnablingService ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Enabling...'}
                    </>
                  ) : pendingServiceOperation.current?.enable === true ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Enabling...'}
                    </>
                  ) : (
                    'Enable Service'
                  )}
                </button>
                <button
                  className={`primary-button ${pendingServiceOperation.current?.enable === false ? 'pending-operation' : ''}`}
                  onClick={() => handleServiceToggle(false)}
                  disabled={currentStatus.isEnabled === false || isOperationInProgress}
                >
                  {isDisablingService ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Disabling...'}
                    </>
                  ) : pendingServiceOperation.current?.enable === false ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      {' Disabling...'}
                    </>
                  ) : (
                    'Disable Service'
                  )}
                </button>
              </div>
            </div>

            <TailscaleConfigForm
              currentConfig={currentConfig}
              isUpdatingConfig={isUpdatingConfig}
              onUpdate={handleConfigUpdate}
              initialTailnet={currentConfig.tailnet}
              pendingTailnet={currentPendingTailnet}
              isOperationInProgress={isOperationInProgress}
            />
          </>
        )}
      </div>
    );
  }, [status.status, isConnecting, isDisconnecting, isUpdatingConfig, isEnablingService, isDisablingService, pendingServiceOperation, pendingConnectionOperation, handleConnect, handleDisconnect, handleServiceToggle, handleConfigUpdate, toast]);

  // Modify handleClick to include cleanup
  const handleClick = useCallback(() => {
    updateActivity();
    
    showModal({
      title: 'Tailscale Configuration',
      children: renderModalContent,
      hideActions: true,
      // Add onClose handler to reset state
      onClose: () => {
        // No need to reset pending tailnet as it's handled in the hook
        // Clear any pending service operations
        if (pendingServiceOperation.current) {
          pendingServiceOperation.current = null;
        }
        // Clear any pending connection operations
        if (pendingConnectionOperation.current) {
          pendingConnectionOperation.current = null;
        }
        // Clear manually set loginUrl when modal is closed
        if (manuallySetLoginUrl.current) {
          console.log('[TAIL] Modal closed, clearing manually set loginUrl');
          manuallySetLoginUrl.current = null;
        }
      }
    });
  }, [renderModalContent, updateActivity, pendingServiceOperation, pendingConnectionOperation]);

  // Create the indicator element
  const indicator = (
    <div onClick={handleClick} className="indicator">
      {status.status === 'loading' ? (
        <FontAwesomeIcon 
          icon={faSpinner} 
          spin
          size="lg" 
          style={{ color: getStatusColor() }} 
          aria-label="Checking Tailscale Status" 
        />
      ) : (
        <FontAwesomeIcon 
          icon={faNetworkWired} 
          size="lg" 
          style={{ color: getStatusColor() }} 
          aria-label="Tailscale Status" 
        />
      )}
    </div>
  );

  // Return the indicator wrapped in a tooltip (which will be disabled on mobile)
  return wrapWithTooltip(indicator);
});

// Add display name
TailscaleIndicator.displayName = 'TailscaleIndicator'; 