import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate, faPowerOff, faDownload, faLock, faLockOpen, faRefresh, faServer, faPlay, faStop, faShareAlt, faUser, faKey, faFileAlt, faHdd, faCertificate, faStar } from '@fortawesome/free-solid-svg-icons';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { useAuth } from '../../../hooks/useAuth';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { useSystemControls, SystemControlsState, SystemControlsActions } from '../hooks/useSystemControls';
import { UpdateProgressModal, SystemActionModal } from './modals/SystemModals';
import { useTooltip } from '../../../hooks/useTooltip';
import './SystemControls.css';
import { SystemButton } from '../types';

// Update SYSTEM_BUTTONS type
const SYSTEM_BUTTONS: SystemButton[] = [
  {
    variant: 'primary',
    label: 'Hard Drive Test',
    icon: faHdd,
    action: 'harddrive',
    confirmTitle: '',
    confirmMessage: '',
    successMessage: '',
    progressMessage: '',
    endpoint: API_ENDPOINTS.status.hardDriveTest.start,
    tooltip: 'Test hard drive health and performance'
  },
  {
    variant: 'primary',
    label: 'Update',
    icon: faDownload,
    action: 'update',
    confirmTitle: 'Confirm System Update',
    confirmMessage: 'Are you sure you want to update the system? This will update all system packages and may require service restarts. A full system restart may be required after the update completes.',
    successMessage: 'System update initiated',
    progressMessage: 'Updating system packages...',
    endpoint: API_ENDPOINTS.system.update,
    tooltip: 'Update system software and packages'
  },
  {
    variant: 'warning',
    label: 'Restart',
    icon: faRotate,
    action: 'restart',
    confirmTitle: 'Confirm System Restart',
    confirmMessage: 'Are you sure you want to restart the system? This will terminate all active connections and temporarily disable services. You will need to reconnect after the system comes back online.',
    successMessage: 'System restart initiated',
    progressMessage: 'Initiating system restart...',
    endpoint: API_ENDPOINTS.system.restart,
    tooltip: 'Restart the entire system'
  },
  {
    variant: 'danger',
    label: 'Shutdown',
    icon: faPowerOff,
    action: 'shutdown',
    confirmTitle: 'Confirm System Shutdown',
    confirmMessage: 'Are you sure you want to shutdown the system? This will stop all services and make the server completely inaccessible. A manual restart at the physical machine will be required to regain access. This action cannot be undone remotely!',
    successMessage: 'System shutdown initiated',
    progressMessage: 'Initiating system shutdown...',
    endpoint: API_ENDPOINTS.system.shutdown,
    tooltip: 'Shutdown the entire system'
  },
  {
    variant: 'warning',
    label: 'Restart Website',
    icon: faRefresh,
    action: 'hardreset',
    confirmTitle: 'Confirm UI Reset',
    confirmMessage: 'This will restart the web interface services (gunicorn and nginx). All current connections will be terminated and you will need to reload the page. You may need to log in again after the reset completes.',
    successMessage: 'Web interface reset initiated',
    progressMessage: 'Restarting web interface services...',
    endpoint: API_ENDPOINTS.status.hardReset,
    tooltip: 'Restart web interface services (gunicorn & nginx)'
  },
  {
    variant: 'primary',
    label: 'View Logs',
    icon: faFileAlt,
    action: 'viewlogs',
    confirmTitle: '',
    confirmMessage: '',
    successMessage: '',
    progressMessage: '',
    endpoint: API_ENDPOINTS.admin.logs.homeserver,
    tooltip: 'View homeserver system logs'
  },
  {
    variant: 'primary',
    label: 'Install Certificate',
    icon: faCertificate,
    action: 'rootca',
    confirmTitle: '',
    confirmMessage: '',
    successMessage: '',
    progressMessage: '',
    endpoint: '', // No direct API call, handled by modal
    tooltip: 'Install the HomeServer SSL certificate to trust all subdomains and avoid HTTPS warnings.'
  },

];

// SSH Password Authentication Toggle Component
const SSHControl: React.FC<{
  state: SystemControlsState;
  actions: SystemControlsActions;
}> = ({ state, actions }) => {
  const { isAdmin } = useAuth();
  const { show: showTooltip } = useTooltip({ delay: 400 });
  
  // Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const componentId = useRef(`ssh-control-${Date.now()}`);
  
  useEffect(() => {
    // Fetch SSH data once when component mounts and admin state changes
    if (isAdmin) {
      // Initial fetch - these requests are cached so repeated calls won't hit backend
      actions.fetchSSHStatus(false);
      actions.fetchSSHServiceStatus(false);
    }
    
    // Cleanup function
    return () => {
      isMountedRef.current = false;
    };
  }, [isAdmin]); // Only depend on isAdmin state
  
  // Skip rendering if not admin
  if (!isAdmin) {
    return null;
  }
  
  return (
    <div className="ssh-controls">
      <div className="ssh-control">
        <div className="ssh-status">
          <h3>SSH Password Authentication</h3>
          {state.isFetchingSSHStatus ? (
            <LoadingSpinner size="small" />
          ) : (
            showTooltip(
              `SSH (Secure Shell) allows secure remote access to your server's command line.
              Password authentication lets you log in with your username and password.
              
              ${state.sshStatus?.password_auth_enabled 
                ? 'Disabling will require using SSH keys for access, which is more secure but requires setup.'
                : 'Enabling will allow password-based logins, which is easier to use but less secure.'}
              
              Note: SSH key authentication will still work regardless of this setting.`,
              <div className="ssh-toggle">
                {state.isTogglingSSH ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={state.sshStatus?.password_auth_enabled || false}
                        onChange={actions.toggleSSHAuth}
                        disabled={!isAdmin || state.isTogglingSSH}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="toggle-label">
                      {state.sshStatus?.password_auth_enabled 
                        ? 'Enabled' 
                        : 'Disabled'}
                    </span>
                    <FontAwesomeIcon 
                      icon={state.sshStatus?.password_auth_enabled ? faLockOpen : faLock}
                      className={`ssh-icon ${state.sshStatus?.password_auth_enabled ? 'enabled' : 'disabled'}`} 
                    />
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>

      <div className="ssh-control">
        <div className="ssh-status">
          <h3>SSH Service</h3>
          {state.isFetchingSSHServiceStatus ? (
            <LoadingSpinner size="small" />
          ) : (
            showTooltip(
              `The SSH service allows remote access to your server's command line.
              
              ${(state.sshServiceStatus?.is_enabled && state.sshServiceStatus?.is_running)
                ? 'Disabling will stop all new remote SSH connections to your server.'
                : 'Enabling will allow remote SSH access to your server.'}
              
              Note: This controls the SSH service itself.`,
              <div className="ssh-toggle">
                {state.isTogglingSSHService ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={(state.sshServiceStatus?.is_enabled && state.sshServiceStatus?.is_running) || false}
                        onChange={actions.toggleSSHService}
                        disabled={!isAdmin || state.isTogglingSSHService}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="toggle-label">
                      {(state.sshServiceStatus?.is_enabled && state.sshServiceStatus?.is_running)
                        ? 'Running' 
                        : 'Stopped'}
                    </span>
                    <FontAwesomeIcon 
                      icon={(state.sshServiceStatus?.is_enabled && state.sshServiceStatus?.is_running) ? faPlay : faStop}
                      className={`ssh-icon ${(state.sshServiceStatus?.is_enabled && state.sshServiceStatus?.is_running) ? 'enabled' : 'disabled'}`} 
                    />
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

// Samba Services Toggle Component
const SambaControl: React.FC<{
  state: SystemControlsState;
  actions: SystemControlsActions;
}> = ({ state, actions }) => {
  const { isAdmin } = useAuth();
  const { show: showTooltip } = useTooltip({ delay: 400 });
  
  // Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const componentId = useRef(`samba-control-${Date.now()}`);
  
  useEffect(() => {
    // Fetch Samba data once when component mounts and admin state changes
    if (isAdmin) {
      actions.fetchSambaServiceStatus(false);
    }
    
    // Cleanup function
    return () => {
      isMountedRef.current = false;
    };
  }, [isAdmin]); // Only depend on isAdmin state
  
  // Skip rendering if not admin
  if (!isAdmin) {
    return null;
  }
  
  return (
    <div className="samba-control">
      <div className="samba-status">
        <h3>Samba File Sharing</h3>
        {state.isFetchingSambaServiceStatus ? (
          <LoadingSpinner size="small" />
        ) : (
          showTooltip(
            `Samba allows you to directly access your NAS from any device's native file explorer. 
            When enabled, you can access your server's files from:
            - Windows: Using File Explorer (\\\\home.arpa)
            - Mac: Using Finder (smb://home.arpa)
            - Linux: Using File Manager (smb://home.arpa)
            
            ${state.sambaServiceStatus?.all_enabled && state.sambaServiceStatus?.all_running
              ? 'Disabling will stop file sharing and make your files inaccessible from other devices. This does not impact any portals or web services.'
              : 'Enabling will start file sharing and make your files accessible from other devices. This does not impact any portals or web services.'
            }`,
            <div className="samba-toggle">
              {state.isTogglingSambaService ? (
                <LoadingSpinner size="small" />
              ) : (
                <>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={(state.sambaServiceStatus?.all_enabled && state.sambaServiceStatus?.all_running) || false}
                      onChange={actions.toggleSambaService}
                      disabled={!isAdmin || state.isTogglingSambaService}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label">
                    {(state.sambaServiceStatus?.all_enabled && state.sambaServiceStatus?.all_running)
                      ? 'Running' 
                      : 'Stopped'}
                  </span>
                  <FontAwesomeIcon 
                    icon={(state.sambaServiceStatus?.all_enabled && state.sambaServiceStatus?.all_running) ? faShareAlt : faStop}
                    className={`samba-icon ${(state.sambaServiceStatus?.all_enabled && state.sambaServiceStatus?.all_running) ? 'enabled' : 'disabled'}`} 
                  />
                </>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export const SystemControls: React.FC = () => {
  const { isAdmin } = useAuth();
  const [state, actions] = useSystemControls(); // Only call useSystemControls once
  const { show: showTooltip } = useTooltip({ delay: 400 });
  
  const componentId = useRef(`system-controls-${Date.now()}`);
  
  useEffect(() => {
    // Component lifecycle tracking removed for production
  }, [isAdmin]);

  // Map system button actions to hook methods
  const getActionHandler = (action: string) => {
    switch (action) {
      case 'harddrive':
        return actions.handleHardDriveTest;
      case 'update':
        return actions.handleUpdateManager;
      case 'restart':
        return actions.handleSystemRestart;
      case 'shutdown':
        return actions.handleSystemShutdown;
      case 'hardreset':
        return actions.handleHardReset;
      case 'viewlogs':
        return actions.handleViewLogs;
      case 'rootca':
        return actions.handleRootCAModal;
      default:
        return () => { /* no-op */ }; // Add comment to satisfy ESLint
    }
  };

  // Update the system buttons to use the new handlers
  const updatedSystemButtons = SYSTEM_BUTTONS.map(button => ({
    ...button,
    onClick: () => {
      return getActionHandler(button.action)();
    }
  }));

  return (
    <div className="system-controls-container">
      <div className="system-controls">
        {updatedSystemButtons.map((button) => {
          return showTooltip(
            button.tooltip,
            <button
              key={button.action}
              className="system-controls-btn"
              data-variant={button.variant}
              onClick={button.onClick}
              disabled={
                !isAdmin || 
                state.isUpdating || 
                state.isRestarting || 
                state.isShuttingDown ||
                state.isHardResetting ||
                state.isTestingCrypto
              }
            >
              <FontAwesomeIcon icon={button.icon} />
              <span>{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="system-service-controls">
        <SSHControl state={state} actions={actions} />
        <SambaControl state={state} actions={actions} />
      </div>
    </div>
  );
}; 