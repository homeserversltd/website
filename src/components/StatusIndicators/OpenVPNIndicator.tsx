import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showModal } from '../Popup/PopupManager';
import { useStore } from '../../store';
import { useLoading } from '../../hooks/useLoading';
import { API_ENDPOINTS } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { VPNStatus } from '../WebSocket/types';
import { useResponsiveTooltip } from '../../hooks/useTooltip';
import { encryptData } from '../../utils/secureTransmission';
import { useEventDrivenStatus, getServiceEnabledState } from './utils';
import { useApi } from '../../hooks/useApi';

interface Credentials {
  piaUsername: string;
  piaPassword: string;
  transmissionUsername: string;
  transmissionPassword: string;
}

interface CredentialFormProps {
  currentConfig: {
    username: string;
    password: string;
  };
  isUpdating: boolean;
  onUpdate: (username: string, password: string) => Promise<void>;
  serviceName: string;
  initialUsername?: string;
  initialPassword?: string;
  keyExists?: boolean;
  pendingOperation: React.MutableRefObject<boolean>;
}

// Move the credential form to a separate component
const CredentialForm = React.memo(({ 
  currentConfig,
  isUpdating,
  onUpdate,
  serviceName,
  initialUsername = '',
  initialPassword = '',
  keyExists = false,
  pendingOperation
}: CredentialFormProps) => {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState(initialPassword);
  const lastSubmittedValue = useRef<{username: string, password: string} | null>(null);
  const isUserEditing = useRef(false);
  const updateInProgress = useRef(false);

  // Handle WebSocket updates through currentConfig changes
  useEffect(() => {
    // If we have a lastSubmittedValue and it matches the new config
    // this means our update was successful
    if (lastSubmittedValue.current && 
        lastSubmittedValue.current.username === currentConfig.username &&
        lastSubmittedValue.current.password === currentConfig.password) {
      lastSubmittedValue.current = null;
      updateInProgress.current = false;
      isUserEditing.current = false;
      pendingOperation.current = false;
    }
  }, [currentConfig, serviceName, isUpdating, pendingOperation]);

  const handleUpdate = useCallback(async () => {
    if (username && password && 
        (username !== currentConfig.username || password !== currentConfig.password)) {
      lastSubmittedValue.current = { username, password };
      updateInProgress.current = true;
      pendingOperation.current = true;
      
      try {
        await onUpdate(username, password);
      } catch (error) {
        // Reset submission state on error
        console.error('[VPN_STATUS] Update failed:', error);
        lastSubmittedValue.current = null;
        updateInProgress.current = false;
        isUserEditing.current = false;
        pendingOperation.current = false;
      }
    }
  }, [username, password, currentConfig, serviceName, onUpdate, pendingOperation]);

  const handleInputChange = useCallback((setter: (value: string) => void) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newValue = e.target.value;
    isUserEditing.current = true;
    setter(newValue);
    
    // Only reset states if we're not in the middle of an update
    if (!updateInProgress.current) {
      lastSubmittedValue.current = null;
    }
  }, []);

  const handleInputBlur = useCallback(() => {
    // Only reset user editing if we're not in the middle of an update
    if (!updateInProgress.current) {
      isUserEditing.current = false;
    }
  }, []);

  // Update disabled state
  const isButtonDisabled = isUpdating || 
    (!username || !password) ||
    (username === currentConfig.username && password === currentConfig.password) ||
    updateInProgress.current ||
    pendingOperation.current;

  return (
    <div className="credential-group">
      <div className="credential-fields">
        <input
          type="text"
          value={username}
          onChange={handleInputChange(setUsername)}
          onBlur={handleInputBlur}
          placeholder={`${serviceName} Username`}
          disabled={isUpdating || updateInProgress.current || pendingOperation.current}
          autoFocus={false}
          tabIndex={-1}
        />
        <input
          type="password"
          value={password}
          onChange={handleInputChange(setPassword)}
          onBlur={handleInputBlur}
          placeholder={`${serviceName} Password`}
          disabled={isUpdating || updateInProgress.current || pendingOperation.current}
          autoFocus={false}
          tabIndex={-1}
        />
      </div>
      <button
        className={`primary-button ${pendingOperation.current ? 'pending-operation' : ''}`}
        onClick={handleUpdate}
        disabled={isButtonDisabled}
      >
        {isUpdating || pendingOperation.current ? (
          <>
            <FontAwesomeIcon icon={faSpinner} spin /> {pendingOperation.current ? 'Loading...' : 'Updating...'}
          </>
        ) : keyExists ? (
          serviceName === "Transmission" ? 
            "Update\nTransmission" : 
            "Update\nPIA Key"
        ) : (
          serviceName === "Transmission" ? 
            "Create\nTransmission" : 
            "Create\nPIA Key"
        )}
      </button>
    </div>
  );
});

CredentialForm.displayName = 'CredentialForm';

// Add this memoized component for the service status display
const ServiceStatusContent = React.memo(({ 
  status, 
  isAdmin 
}: { 
  status: VPNStatus, 
  isAdmin: boolean
}) => {
  const isServiceEnabled = status.isEnabled;

  return (
    <div className="service-statuses">
      <div className={`status-item ${status.vpnStatus}`}>
        <span>VPN Status:</span>
        <span className="status-value">
          {status.vpnStatus === 'loading' ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> LOADING
            </>
          ) : (
            status.vpnStatus.toUpperCase()
          )}
        </span>
      </div>
      <div className={`status-item ${status.transmissionStatus}`}>
        <span>Transmission Status:</span>
        <span className="status-value">
          {status.transmissionStatus === 'loading' ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> LOADING
            </>
          ) : (
            status.transmissionStatus.toUpperCase()
          )}
        </span>
      </div>
      {isAdmin && (
        <div className="status-item">
          <span>Systemd Service:</span>
          <span className="status-value">
            {isServiceEnabled === null || isServiceEnabled === undefined ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> LOADING
              </>
            ) : (
              isServiceEnabled ? 'ENABLED' : 'DISABLED'
            )}
          </span>
        </div>
      )}
    </div>
  );
});

ServiceStatusContent.displayName = 'ServiceStatusContent';

// Add this memoized component for the control buttons
const ServiceControlButtons = React.memo(({ 
  onEnable, 
  onDisable, 
  isServiceEnabled,
  isEnabling, 
  isDisabling,
  pendingEnable,
  pendingDisable
}: { 
  onEnable: () => void, 
  onDisable: () => void, 
  isServiceEnabled: boolean | null | undefined,
  isEnabling: boolean,
  isDisabling: boolean,
  pendingEnable: React.MutableRefObject<boolean>,
  pendingDisable: React.MutableRefObject<boolean>
}) => (
  <div className="control-buttons">
    <button
      className={`primary-button ${pendingEnable.current ? 'pending-operation' : ''}`}
      onClick={onEnable}
      disabled={isEnabling || isDisabling || isServiceEnabled === true || pendingEnable.current || pendingDisable.current}
    >
      {isEnabling ? (
        <>
          <FontAwesomeIcon icon={faSpinner} spin /> Enabling Services...
        </>
      ) : pendingEnable.current ? (
        <>
          <FontAwesomeIcon icon={faSpinner} spin /> Loading...
        </>
      ) : (
        'Enable Transmission over PIA VPN'
      )}
    </button>
    <button
      className={`primary-button ${pendingDisable.current ? 'pending-operation' : ''}`}
      onClick={onDisable}
      disabled={isEnabling || isDisabling || isServiceEnabled === false || pendingEnable.current || pendingDisable.current}
    >
      {isDisabling ? (
        <>
          <FontAwesomeIcon icon={faSpinner} spin /> Disabling Services...
        </>
      ) : pendingDisable.current ? (
        <>
          <FontAwesomeIcon icon={faSpinner} spin /> Loading...
        </>
      ) : (
        'Disable Transmission over PIA VPN'
      )}
    </button>
  </div>
));

ServiceControlButtons.displayName = 'ServiceControlButtons';

/**
 * OpenVPNIndicator component for displaying VPN status
 * and providing admin controls for connection management.
 * This component ONLY uses event-driven data from WebSocket broadcasts
 * and never directly polls the backend for status.
 */
export const OpenVPNIndicator: React.FC = React.memo(() => {
  const { isAdmin, updateLastActivity } = useStore(state => ({ isAdmin: state.isAdmin, updateLastActivity: state.updateLastActivity }));
  const toast = useToast();
  const api = useApi();

  // Use the event-driven hook to get VPN status data from WebSocket broadcasts
  const { data: vpnData, isLoading } = useEventDrivenStatus('vpn_status');
  
  // Create a reference to the VPN data for other components
  const vpnDataRef = useRef<VPNStatus | undefined>(vpnData);
  
  // Keep the ref updated when vpnData changes
  useEffect(() => {
    if (vpnData) {
      vpnDataRef.current = vpnData;
    }
  }, [vpnData]);
  
  // Create a default status object for when we're loading
  const defaultStatus: VPNStatus = {
    vpnStatus: 'loading',
    transmissionStatus: 'loading',
    timestamp: Date.now()
  };
  
  // Use the actual data or the default loading state - memoize to prevent unnecessary recalculations
  const status = useMemo(() => vpnData || defaultStatus, [vpnData, defaultStatus]);

  const isServiceEnabled = status?.isEnabled;

  const [credentials, setCredentials] = useState<Credentials>({
    piaUsername: '',
    piaPassword: '',
    transmissionUsername: '',
    transmissionPassword: ''
  });

  // Loading states
  const { isLoading: isUpdatingPIA, withLoading: withPIALoading } = useLoading();
  const { isLoading: isUpdatingTransmission, withLoading: withTransmissionLoading } = useLoading();
  const { 
    isLoading: isEnablingService, 
    withLoading: withEnableService,
    error: enableError 
  } = useLoading({
    minDuration: 1000 // Ensure minimum loading state duration to prevent rapid re-clicks
  });
  const { 
    isLoading: isDisablingService, 
    withLoading: withDisableService,
    error: disableError 
  } = useLoading({
    minDuration: 1000 // Ensure minimum loading state duration to prevent rapid re-clicks
  });

  // Create refs to store latest state
  const isAdminRef = useRef(isAdmin);
  const credentialsRef = useRef(credentials);
  const isEnablingServiceRef = useRef(isEnablingService);
  const isDisablingServiceRef = useRef(isDisablingService);

  // Keep refs updated
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);
  
  useEffect(() => {
    isEnablingServiceRef.current = isEnablingService;
  }, [isEnablingService]);

  useEffect(() => {
    isDisablingServiceRef.current = isDisablingService;
  }, [isDisablingService]);

  // Add new state for PIA key existence
  const [piaKeyExists, setPiaKeyExists] = useState(false);
  
  // Add state for Transmission key (even though we don't have backend check yet)
  const [transmissionKeyExists, setTransmissionKeyExists] = useState(false);
  
  // Create a ref to store the latest piaKeyExists value
  const piaKeyExistsRef = useRef(piaKeyExists);
  
  // Create a ref for transmissionKeyExists
  const transmissionKeyExistsRef = useRef(transmissionKeyExists);
  
  // Keep refs updated
  useEffect(() => {
    piaKeyExistsRef.current = piaKeyExists;
  }, [piaKeyExists]);

  useEffect(() => {
    transmissionKeyExistsRef.current = transmissionKeyExists;
  }, [transmissionKeyExists]);

  // Add these new refs for the pending requests
  const pendingEnableRequestRef = useRef(false);
  const pendingDisableRequestRef = useRef(false);
  const pendingPIAUpdateRef = useRef(false);
  const pendingTransmissionUpdateRef = useRef(false);

  // Update the handleServiceToggle function to refresh enabled state
  const handleServiceToggle = useCallback(async (enable: boolean) => {
    // Immediately check if there's already a pending request
    if (enable && pendingEnableRequestRef.current) return;
    if (!enable && pendingDisableRequestRef.current) return;
    
    // Set the corresponding ref to true immediately
    if (enable) {
      pendingEnableRequestRef.current = true;
    } else {
      pendingDisableRequestRef.current = true;
    }
    
    try {
      console.debug(`[VPN_STATUS] Toggling service: ${enable ? 'enable' : 'disable'}`);
      // const adminToken = localStorage.getItem('adminToken') || ''; // No longer needed here, interceptor handles it
      
      const endpoint = enable ? API_ENDPOINTS.status.vpn.enable : API_ENDPOINTS.status.vpn.disable;
      const action = enable ? withEnableService : withDisableService;

      // Assuming the enable/disable endpoints don't require a body and don't return a specific typed response
      await action(
        api.post<void>(endpoint) // Pass undefined or no second arg if no body; Interceptor adds X-Admin-Token
      );
      
      toast.success(`VPN services ${enable ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error(`[VPN_STATUS] Failed to ${enable ? 'enable' : 'disable'} VPN services:`, error);
      toast.error(`Failed to ${enable ? 'enable' : 'disable'} VPN services`);
    }
  }, [isAdmin, withEnableService, withDisableService, toast, api]); // api added as dependency

  // Effect to reset pending state refs based on WebSocket updates
  useEffect(() => {
    // If we were waiting for enable and the status is now enabled, reset the ref
    if (pendingEnableRequestRef.current && vpnData?.isEnabled === true) {
      pendingEnableRequestRef.current = false;
    }
    // If we were waiting for disable and the status is now disabled, reset the ref
    if (pendingDisableRequestRef.current && vpnData?.isEnabled === false) {
      pendingDisableRequestRef.current = false;
    }
  }, [vpnData]); // Dependency: run when vpnData changes

  // Function to check if PIA key exists
  const checkPiaKeyExists = useCallback(async () => {
    if (!isAdmin) {
      // Only check if user is admin
      setPiaKeyExists(false);
      return false;
    }
    
    try {
      const response = await api.get<{ exists: boolean }>(API_ENDPOINTS.status.vpn.piaKeyExists);
      setPiaKeyExists(response.exists);
      return response.exists;
    } catch (error: any) { 
      // error from useApi is expected to have status and message properties
      if (error && error.status === 401) {
        console.warn('[VPN_STATUS] Admin authentication required for PIA key check');
      } else {
        console.error('[VPN_STATUS] Failed to check PIA key existence:', error);
      }
      setPiaKeyExists(false);
      return false;
    }
  }, [isAdmin, api]); // api added as dependency

  const checkTransmissionKeyExists = useCallback(async () => {
    if (!isAdmin) {
      setTransmissionKeyExists(false);
      return false;
    }
    
    try {
      const response = await api.get<{ exists: boolean }>(API_ENDPOINTS.status.vpn.transmissionKeyExists);
      setTransmissionKeyExists(response.exists);
      return response.exists;
    } catch (error: any) { 
      // error from useApi is expected to have status and message properties
      if (error && error.status === 401) {
        console.warn('[VPN_STATUS] Admin authentication required for Transmission key check');
      } else {
        console.error('[VPN_STATUS] Failed Transmission key check:', error);
      }
      setTransmissionKeyExists(false);
      return false;
    }
  }, [isAdmin, api]); // api added as dependency

  // Update submit handlers to encrypt data
  const handlePIASubmit = async (username: string, password: string) => {
    if (!username || !password) return;

    try {
      const currentKeyExists = piaKeyExistsRef.current;
      
      // Prepare and encrypt the payload
      const payload = JSON.stringify({ username, password });
      const encryptedPayload = encryptData(payload);

      if (!encryptedPayload) {
        toast.error('Failed to encrypt PIA credentials locally.');
        console.error('[VPN_STATUS] Failed to encrypt PIA payload');
        return;
      }
      
      pendingPIAUpdateRef.current = true;
      
      // Assuming updatePIA endpoint doesn't return a specific typed response or its response isn't used
      await withPIALoading(
        api.post<void>(API_ENDPOINTS.status.vpn.updatePIA, { encryptedPayload })
      );
      
      // Update key exists state and credentials after successful submit
      setPiaKeyExists(true);
      setCredentials(prev => ({
        ...prev,
        piaUsername: username, // Still store raw username for display if needed (password isn't stored)
        piaPassword: '' // Clear password field after successful update
      }));
      
      toast.success(currentKeyExists ? 'PIA credentials updated successfully' : 'PIA credentials created successfully');
    } catch (error) {
      console.error('[VPN_STATUS] Failed to update PIA credentials:', error);
      // Skip showing toast here as we've already shown a more specific one above
    } finally {
      pendingPIAUpdateRef.current = false;
    }
  };

  const handleTransmissionSubmit = async (username: string, password: string) => {
    if (!username || !password) return;

    try {
      const currentKeyExists = transmissionKeyExistsRef.current;
      
      // Prepare and encrypt the payload
      const payload = JSON.stringify({ username, password });
      const encryptedPayload = encryptData(payload);

      if (!encryptedPayload) {
        console.error('[PIAVPN] Failed to encrypt Transmission credentials locally');
        toast.error('Failed to encrypt Transmission credentials locally.');
        return;
      }

      pendingTransmissionUpdateRef.current = true;
      
      // Assuming updateTransmission endpoint doesn't return a specific typed response or its response isn't used
      await withTransmissionLoading(
        api.post<void>(API_ENDPOINTS.status.vpn.updateTransmission, { encryptedPayload })
      );

      // Only update main state after successful submit
      setTransmissionKeyExists(true);
      setCredentials(prev => ({
        ...prev,
        transmissionUsername: username,
        transmissionPassword: ''
      }));
      toast.success(currentKeyExists ? 'Transmission credentials updated successfully' : 'Transmission credentials created successfully');
    } catch (error) {
      console.error('[PIAVPN] Failed to update Transmission credentials:', error);
      toast.error('Failed to update Transmission credentials');
    } finally {
      pendingTransmissionUpdateRef.current = false;
    }
  };

  // Get status color based on both services - memoize to prevent recalculations
  const getStatusColor = useCallback(() => {
    if (!vpnData || status.vpnStatus === 'loading') return 'var(--text)';
    
    if (status.vpnStatus === 'running' && status.transmissionStatus === 'running') {
      return 'var(--success)';
    } else if (status.vpnStatus === 'running' || status.transmissionStatus === 'running') {
      return 'var(--warning)';
    }
    return 'var(--error)';
  }, [vpnData, status.vpnStatus, status.transmissionStatus]);

  // Convert to useCallback to optimize for useResponsiveTooltip
  const getTooltipMessage = useCallback(() => {
    if (!vpnData || status.vpnStatus === 'loading') {
      return 'Loading VPN status...';
    }
    
    const statusMessage = `VPN Status: ${status.vpnStatus}\nTransmission Status: ${status.transmissionStatus}`;
    
    if (isAdmin && status.isEnabled !== null && status.isEnabled !== undefined) {
      return `VPN service is ${status.isEnabled ? 'enabled' : 'disabled'}\n${statusMessage}`;
    }
    
    return statusMessage;
  }, [vpnData, isAdmin, status.vpnStatus, status.transmissionStatus, status.isEnabled]);

  // Use the responsive tooltip hook
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  const renderModalContent = useCallback(() => {
    const currentStatus = vpnDataRef.current;
    const currentIsAdmin = isAdminRef.current;
    const currentCredentials = credentialsRef.current;
    const currentPiaKeyExists = piaKeyExistsRef.current;
    const currentIsEnablingService = isEnablingServiceRef.current;
    const currentIsDisablingService = isDisablingServiceRef.current;

    if (!vpnData || isLoading) {
      return (
        <div className="vpn-status-modal">
          <div className="status-section">
            <p className="status-text disconnected">
              <FontAwesomeIcon icon={faSpinner} spin /> LOADING STATUS
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="vpn-status-modal">
        <div className="status-section">
          <ServiceStatusContent 
            status={currentStatus || defaultStatus} 
            isAdmin={currentIsAdmin}
          />
        </div>

        {currentIsAdmin && (
          <>
            <div className="credentials-section">
              {currentPiaKeyExists ? (
                <div className="key-exists-message">
                  <p>A key is already configured. Entering new credentials will overwrite the existing configuration.</p>
                </div>
              ) : null}
              <CredentialForm
                currentConfig={{
                  username: currentCredentials.piaUsername,
                  password: currentCredentials.piaPassword
                }}
                isUpdating={isUpdatingPIA}
                onUpdate={handlePIASubmit}
                serviceName="PIA"
                initialUsername=""
                initialPassword=""
                keyExists={currentPiaKeyExists}
                pendingOperation={pendingPIAUpdateRef}
              />

              {/* For Transmission, we don't have a backend check yet, but we'll structure it the same way */}
              {transmissionKeyExistsRef.current ? (
                <div className="key-exists-message">
                  <p>Configuration exists. Entering new credentials will update the BitTorrent client when running over the Private Internet Access VPN.</p>
                </div>
              ) : (
                <div className="mb-3">
                  <p>Transmission credentials are used for the BitTorrent client when running over the Private Internet Access VPN.</p>
                </div>
              )}
              <CredentialForm
                currentConfig={{
                  username: currentCredentials.transmissionUsername,
                  password: currentCredentials.transmissionPassword
                }}
                isUpdating={isUpdatingTransmission}
                onUpdate={handleTransmissionSubmit}
                serviceName="Transmission"
                initialUsername=""
                initialPassword=""
                keyExists={transmissionKeyExistsRef.current}
                pendingOperation={pendingTransmissionUpdateRef}
              />
            </div>

            <div className="service-controls">
              <ServiceControlButtons 
                onEnable={() => handleServiceToggle(true)}
                onDisable={() => handleServiceToggle(false)}
                isServiceEnabled={currentStatus?.isEnabled}
                isEnabling={currentIsEnablingService}
                isDisabling={currentIsDisablingService}
                pendingEnable={pendingEnableRequestRef}
                pendingDisable={pendingDisableRequestRef}
              />
            </div>

            <div className="restart-notice">
              <p>Note: Service changes require a restart to take effect.</p>
            </div>
          </>
        )}
      </div>
    );
  }, [
    vpnData,
    isLoading,
    isEnablingService,
    isDisablingService,
    isUpdatingPIA, 
    isUpdatingTransmission, 
    handleServiceToggle,
    handlePIASubmit, 
    handleTransmissionSubmit,
    defaultStatus,
    isServiceEnabled
  ]);

  const handleClick = useCallback(async () => {
    if (isAdmin) {
      await Promise.all([
        checkPiaKeyExists(), 
        checkTransmissionKeyExists()
      ]);
    }
    
    showModal({
      title: 'VPN & Transmission Configuration',
      children: renderModalContent,
      hideActions: true,
      initialFocus: -1,
      // Add onClose handler to reset state
      onClose: () => {
        // Clear any pending operations
        pendingEnableRequestRef.current = false;
        pendingDisableRequestRef.current = false;
        pendingPIAUpdateRef.current = false;
        pendingTransmissionUpdateRef.current = false;
      }
    });
  }, [renderModalContent, checkPiaKeyExists, checkTransmissionKeyExists, isAdmin]);

  // Create the indicator element
  const indicator = (
    <div onClick={handleClick} className="indicator">
      {isLoading || !vpnData || vpnData.isEnabled === undefined || status.vpnStatus === 'loading' || status.transmissionStatus === 'loading' ? (
        <FontAwesomeIcon
          icon={faSpinner}
          spin
          size="lg"
          style={{ color: 'var(--text)' }}
          aria-label="Checking VPN Status"
        />
      ) : (
        <FontAwesomeIcon
          icon={faLock}
          size="lg"
          style={{ color: getStatusColor() }}
          aria-label="VPN Status"
        />
      )}
    </div>
  );

  // Return the indicator wrapped in a tooltip (which will be disabled on mobile)
  return wrapWithTooltip(indicator);
});

OpenVPNIndicator.displayName = 'OpenVPNIndicator'; 