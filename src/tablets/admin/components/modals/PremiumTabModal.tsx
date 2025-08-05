import React, { useState, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPlus, faTrash, faDownload, faUpload, faExclamationTriangle, 
  faCheckCircle, faTimesCircle, faSpinner, faEye, faCodeBranch,
  faStar, faWarning, faInfoCircle, faArrowLeft, faFileText, faQuestionCircle,
  faSync, faCopy
} from '@fortawesome/free-solid-svg-icons';
import { useApi } from '../../../../hooks/useApi';
import { useLoading } from '../../../../hooks/useLoading';
import { useToast } from '../../../../hooks/useToast';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { api } from '../../../../api/client';
import { fallbackManager } from '../../../../utils/fallbackManager';
import { useStore } from '../../../../store';
import { 
  PremiumTabModalProps, 
  PremiumTabStatusResponse, 
  PremiumTabValidateCloneRequest,
  PremiumTabValidateCloneResponse,
  PremiumTabOperationResponse,
  PremiumTabLogsResponse,
  PremiumTab,
  PremiumTabAutoUpdateStatusResponse,
  PremiumTabAutoUpdate,
  PremiumTabToggleAutoUpdateRequest,
  PremiumTabToggleAutoUpdateResponse
} from '../../types';
import './PremiumTabModal.css';

// Confirmation state interface
interface ConfirmationState {
  isConfirming: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmAction: () => Promise<void>;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export const PremiumTabModal: React.FC<PremiumTabModalProps> = ({ onClose }) => {

  
  // State management
  const [tabs, setTabs] = useState<PremiumTab[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [logs, setLogs] = useState<any>({});
  const [lastOperation, setLastOperation] = useState<string>('none');
  const [showLogs, setShowLogs] = useState(false);
  const [showLogsFullscreen, setShowLogsFullscreen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddRepoContent, setShowAddRepoContent] = useState(false);
  
  // Security disclaimer state
  const [securityDisclaimerAccepted, setSecurityDisclaimerAccepted] = useState(false);
  
  // Auto-update state
  const [autoUpdateTabs, setAutoUpdateTabs] = useState<PremiumTabAutoUpdate[]>([]);
  const [autoUpdateSummary, setAutoUpdateSummary] = useState<any>(null);
  const [togglingAutoUpdate, setTogglingAutoUpdate] = useState<Set<string>>(new Set());
  
  // Individual loading states for each tab operation
  const [deletingTabs, setDeletingTabs] = useState<Set<string>>(new Set());
  const [installingTabs, setInstallingTabs] = useState<Set<string>>(new Set());
  const [uninstallingTabs, setUninstallingTabs] = useState<Set<string>>(new Set());
  
  // Confirmation state
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  // Loading states
  const { isLoading: isLoadingStatus, withLoading: withStatusLoading } = useLoading();
  const { isLoading: isLoadingOperation, withLoading: withOperationLoading } = useLoading({
    timeout: 120000, // 2 minutes timeout for premium tab operations
  });
  const { isLoading: isLoadingLogs, withLoading: withLogsLoading } = useLoading();
  const { isLoading: isLoadingAutoUpdate, withLoading: withAutoUpdateLoading } = useLoading();

  // Hooks
  const api = useApi();
  const { success, error, info } = useToast();

  // Helper function to show confirmation
  const showConfirmation = useCallback((confirmState: ConfirmationState) => {
    setConfirmation(confirmState);
  }, []);

  // Helper function to cancel confirmation
  const cancelConfirmation = useCallback(() => {
    setConfirmation(null);
  }, []);

  // Helper function to proceed with confirmation
  const proceedConfirmation = useCallback(async () => {
    if (!confirmation) return;
    
    // Set loading state on confirmation
    setConfirmation(prev => prev ? { ...prev, isLoading: true } : null);
    
    try {
      await confirmation.confirmAction();
    } catch (error) {
      // Reset loading state on error
      setConfirmation(prev => prev ? { ...prev, isLoading: false } : null);
      throw error;
    }
    // Note: confirmation will be cleared by the confirmAction itself
  }, [confirmation]);



  // Fetch tab status
  const fetchStatus = useCallback(async () => {
    try {
      await withStatusLoading((async () => {
        const response = await api.get<PremiumTabStatusResponse>(API_ENDPOINTS.premium.status);
        
        if (response.success) {
          setTabs(response.tabs);
          setSummary(response.summary);
        } else {
          console.error('[PremiumTabModal] API returned error:', response.error);
          error(response.error || 'Failed to fetch premium tab status');
        }
      })());
    } catch (err: any) {
      console.error('[PremiumTabModal] Exception in fetchStatus:', {
        error: err,
        message: err.message,
        status: err.status,
        stack: err.stack
      });
      error(`Error fetching status: ${err.message || 'Unknown error'}`);
    }
  }, [api, withStatusLoading, error]);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      await withLogsLoading((async () => {
        const response = await api.get<PremiumTabLogsResponse>(API_ENDPOINTS.premium.logs);
        
        if (response.success) {
          setLogs(response.logs);
          setLastOperation(response.lastOperation);
        } else {
          console.error('[PremiumTabModal] Logs API returned error:', response.error);
          error(response.error || 'Failed to fetch logs');
        }
      })());
    } catch (err: any) {
      console.error('[PremiumTabModal] Exception in fetchLogs:', {
        error: err,
        message: err.message,
        status: err.status,
        stack: err.stack
      });
      error(`Error fetching logs: ${err.message || 'Unknown error'}`);
    }
  }, [api, withLogsLoading, error]);

  // Fetch auto-update status
  const fetchAutoUpdateStatus = useCallback(async () => {
    try {
      await withAutoUpdateLoading((async () => {
        const response = await api.get<PremiumTabAutoUpdateStatusResponse>(API_ENDPOINTS.premium.autoUpdateStatus);
        
        if (response.success) {
          setAutoUpdateTabs(response.tabs);
          setAutoUpdateSummary(response.summary);
        } else {
          console.error('[PremiumTabModal] Auto-update status API returned error:', response.error);
          error(response.error || 'Failed to fetch auto-update status');
        }
      })());
    } catch (err: any) {
      console.error('[PremiumTabModal] Exception in fetchAutoUpdateStatus:', {
        error: err,
        message: err.message,
        status: err.status,
        stack: err.stack
      });
      error(`Error fetching auto-update status: ${err.message || 'Unknown error'}`);
    }
  }, [api, withAutoUpdateLoading, error]);

  // Load initial data
  useEffect(() => {
    fetchStatus();
    fetchAutoUpdateStatus();
  }, [fetchStatus, fetchAutoUpdateStatus]);

  // Handle show add repository content
  const handleShowAddRepo = useCallback(() => {
    setShowAddRepoContent(true);
  }, []);

  // Handle return from add repository content
  const handleReturnFromAddRepo = useCallback(() => {
    setShowAddRepoContent(false);
    // Reset form when returning
    setGitUrl('');
    setBranch('main');
    setSecurityDisclaimerAccepted(false);
  }, []);

  // Handle validate and clone repository
  const handleValidateAndClone = useCallback(async () => {
    if (!gitUrl.trim()) {
      error('Please enter a Git repository URL');
      return;
    }

    if (!securityDisclaimerAccepted) {
      error('Please accept the security disclaimer before proceeding');
      return;
    }

    try {
      await withOperationLoading((async () => {
        const payload: PremiumTabValidateCloneRequest = {
          gitUrl: gitUrl.trim(),
          branch: branch.trim() || 'main'
        };
        
        const response = await api.post<PremiumTabValidateCloneResponse>(
          API_ENDPOINTS.premium.validateAndClone,
          payload
        );

        if (response.success) {
          success(`Repository validated and cloned successfully: ${response.tabName}`);
          setGitUrl('');
          setBranch('main');
          setSecurityDisclaimerAccepted(false);
          setShowAddForm(false);
          setShowAddRepoContent(false); // Return from content view
          await Promise.all([
            fetchStatus(), // Refresh status
            fetchAutoUpdateStatus() // Refresh auto-update status
          ]);
        } else {
          console.error('[PremiumTabModal] Validate-and-clone failed:', response.error);
          error(response.error || 'Failed to validate and clone repository');
        }
      })());
    } catch (err: any) {
      console.error('[PremiumTabModal] Exception in handleValidateAndClone:', err);
      error(`Error cloning repository: ${err.message || 'Unknown error'}`);
    }
  }, [api, gitUrl, branch, securityDisclaimerAccepted, withOperationLoading, success, error, fetchStatus, fetchAutoUpdateStatus]);

  // Handle install single tab
  const handleInstallTab = useCallback(async (tabName: string) => {
    // Use internal confirmation system instead of external confirm
    showConfirmation({
      isConfirming: true,
      title: 'Install Premium Tab',
      message: `Are you sure you want to install the "${tabName}" premium tab?`,
      confirmText: 'Install',
      confirmAction: async () => {
        // Set installing state for this specific tab
        setInstallingTabs(prev => new Set(prev).add(tabName));

        // Fire the API call immediately (truly fire and forget - no response handling)
        api.post<PremiumTabOperationResponse>(
          API_ENDPOINTS.premium.install(tabName)
        ).catch(() => {
          // Silently ignore errors since we're disconnected and don't want to handle responses
        });
        
        // IMMEDIATELY activate fallback mode and disconnect (after firing request)
        fallbackManager.activateFallback('premium_tab_installation_in_progress');
        useStore.getState().disconnect();
        useStore.getState().exitAdminMode();

        // Show installation messages immediately
        success(`${tabName} installation initiated! Please refresh your browser in 2-3 minutes to access the new tab.`, { duration: 10000 });
        info('The installation process is atomic and will revert all changes if any step fails.', { duration: 8000 });
        
        // Close modal immediately
        onClose();
        
        // No promise handling - truly fire and forget since we're disconnected
      }
    });
  }, [api, success, error, info, onClose, showConfirmation]);

  // Handle uninstall single tab
  const handleUninstallTab = useCallback(async (tabName: string) => {
    
    // Use internal confirmation system instead of external confirm
    showConfirmation({
      isConfirming: true,
      title: 'Uninstall Premium Tab',
      message: `Are you sure you want to uninstall the "${tabName}" premium tab?`,
      confirmText: 'Uninstall',
      isDestructive: true,
      confirmAction: async () => {
        // Set uninstalling state for this specific tab
        setUninstallingTabs(prev => new Set(prev).add(tabName));

        // Fire the API call immediately (truly fire and forget - no response handling)
        api.delete<PremiumTabOperationResponse>(
          API_ENDPOINTS.premium.uninstall(tabName)
        ).catch(() => {
          // Silently ignore errors since we're disconnected and don't want to handle responses
        });
        
        // IMMEDIATELY activate fallback mode and disconnect (after firing request)
        fallbackManager.activateFallback('premium_tab_uninstallation_in_progress');
        useStore.getState().disconnect();
        useStore.getState().exitAdminMode();

        // Show uninstallation messages immediately
        success(`${tabName} uninstallation initiated! Please refresh your browser in 2-3 minutes to see changes.`, { duration: 10000 });
        info('The uninstallation process is atomic and will revert all changes if any step fails.', { duration: 8000 });
        
        // Close modal immediately
        onClose();

        // No promise handling - truly fire and forget since we're disconnected
      }
    });
  }, [api, success, error, info, showConfirmation]);

  // Handle delete single tab permanently
  const handleDeleteTab = useCallback(async (tabName: string) => {
    
    // Use internal confirmation system instead of external confirm
    showConfirmation({
      isConfirming: true,
      title: 'Permanently Delete Premium Tab',
      message: `Are you sure you want to permanently delete the "${tabName}" premium tab folder? This action cannot be undone and will remove all tab files from the system.`,
      confirmText: 'Permanently Delete',
      isDestructive: true,
      confirmAction: async () => {
        // Set deleting state for this specific tab IMMEDIATELY
        setDeletingTabs(prev => new Set(prev).add(tabName));

        try {
          
          const response = await api.delete<PremiumTabOperationResponse>(
            API_ENDPOINTS.premium.delete(tabName)
          );



          if (response.success) {
            success(`${tabName} has been permanently deleted from the system.`, { duration: 8000 });
            // Clear confirmation first, then refresh status
            setConfirmation(null);
            await fetchStatus(); // Refresh status to update the list
          } else {
            console.error('[PremiumTabModal] Delete failed:', response.error);
            error(response.error || 'Failed to delete premium tab');
            // Clear confirmation on error
            setConfirmation(null);
          }
        } catch (err: any) {
          console.error('[PremiumTabModal] Exception in handleDeleteTab:', err);
          error(`Error deleting tab: ${err.message || 'Unknown error'}`);
          // Clear confirmation on error
          setConfirmation(null);
        } finally {
          // Clear deleting state for this specific tab
          setDeletingTabs(prev => {
            const newSet = new Set(prev);
            newSet.delete(tabName);
            return newSet;
          });
        }
      }
    });
  }, [api, success, error, fetchStatus, showConfirmation]);

  // Handle install all tabs
  const handleInstallAll = useCallback(async () => {
    
    // Use internal confirmation system instead of external confirm
    showConfirmation({
      isConfirming: true,
      title: 'Install All Premium Tabs',
      message: 'Are you sure you want to install all available premium tabs?',
      confirmText: 'Install All',
      confirmAction: async () => {
        // Fire the API call immediately (truly fire and forget - no response handling)
        api.post<PremiumTabOperationResponse>(
          API_ENDPOINTS.premium.installAll
        ).catch(() => {
          // Silently ignore errors since we're disconnected and don't want to handle responses
        });
        
        // IMMEDIATELY activate fallback mode and disconnect (after firing request)
        fallbackManager.activateFallback('premium_tab_bulk_installation_in_progress');
        useStore.getState().disconnect();
        useStore.getState().exitAdminMode();

        // Show installation messages immediately
        success('Bulk installation of all tabs initiated! Please refresh your browser in 2-3 minutes to see changes.', { duration: 10000 });
        info('The installation process is atomic and will revert all changes if any step fails.', { duration: 8000 });
        
        // Close modal immediately
        onClose();

        // No promise handling - truly fire and forget since we're disconnected
      }
    });
  }, [api, success, error, info, showConfirmation]);

  // Handle uninstall all tabs
  const handleUninstallAll = useCallback(async () => {
    
    // Use internal confirmation system instead of external confirm
    showConfirmation({
      isConfirming: true,
      title: 'Uninstall All Premium Tabs',
      message: 'Are you sure you want to uninstall all installed premium tabs?',
      confirmText: 'Uninstall All',
      isDestructive: true,
      confirmAction: async () => {
        // Fire the API call immediately (truly fire and forget - no response handling)
        api.post<PremiumTabOperationResponse>(
          API_ENDPOINTS.premium.uninstallAll
        ).catch(() => {
          // Silently ignore errors since we're disconnected and don't want to handle responses
        });
        
        // IMMEDIATELY activate fallback mode and disconnect (after firing request)
        fallbackManager.activateFallback('premium_tab_bulk_uninstallation_in_progress');
        useStore.getState().disconnect();
        useStore.getState().exitAdminMode();

        // Show uninstallation messages immediately
        success('Bulk uninstallation of all tabs initiated! Please refresh your browser in 2-3 minutes to see changes.', { duration: 10000 });
        info('The uninstallation process is atomic and will revert all changes if any step fails.', { duration: 8000 });
        
        // Close modal immediately
        onClose();

        // No promise handling - truly fire and forget since we're disconnected
      }
    });
  }, [api, success, error, info, showConfirmation]);

  // Handle view logs
  const handleViewLogs = useCallback(async () => {
    
    // Always fetch logs when showing them
    await fetchLogs();
    setShowLogsFullscreen(true);
  }, [fetchLogs]);

  // Handle return from full-screen logs
  const handleReturnFromLogs = useCallback(() => {
    setShowLogsFullscreen(false);
  }, []);

  // Handle toggle auto-update for a tab
  const handleToggleAutoUpdate = useCallback(async (tabName: string, enabled: boolean) => {
    
    // Set toggling state for this specific tab
    setTogglingAutoUpdate(prev => new Set(prev).add(tabName));
    
    try {
      const payload: PremiumTabToggleAutoUpdateRequest = { enabled };
      
      const response = await api.post<PremiumTabToggleAutoUpdateResponse>(
        API_ENDPOINTS.premium.autoUpdate(tabName),
        payload
      );
      
      if (response.success) {
        success(`Auto-update ${enabled ? 'enabled' : 'disabled'} for ${tabName}`);
        // Refresh auto-update status to get updated data
        await fetchAutoUpdateStatus();
      } else {
        console.error('[PremiumTabModal] Toggle auto-update failed:', response.error);
        error(response.error || 'Failed to toggle auto-update setting');
      }
    } catch (err: any) {
      console.error('[PremiumTabModal] Exception in handleToggleAutoUpdate:', err);
      error(`Error toggling auto-update: ${err.message || 'Unknown error'}`);
    } finally {
      // Clear toggling state for this specific tab
      setTogglingAutoUpdate(prev => {
        const newSet = new Set(prev);
        newSet.delete(tabName);
        return newSet;
      });
    }
  }, [api, success, error, fetchAutoUpdateStatus]);

  // Helper function to get auto-update data for a specific tab
  const getAutoUpdateDataForTab = useCallback((tabName: string): PremiumTabAutoUpdate | null => {
    return autoUpdateTabs.find(tab => tab.tabName === tabName) || null;
  }, [autoUpdateTabs]);

  // Handle refresh all data
  const handleRefreshAll = useCallback(async () => {
    await Promise.all([
      fetchStatus(),
      fetchAutoUpdateStatus()
    ]);
  }, [fetchStatus, fetchAutoUpdateStatus]);

  // Handle copy logs to clipboard
  const handleCopyLogs = useCallback(async () => {
    
    try {
      if (!logs || Object.keys(logs).length === 0) {
        error('No logs available to copy');
        return;
      }

      // Build the log content string
      let logContent = 'Premium Tab Installation Logs\n';
      logContent += '=====================================\n\n';

      Object.entries(logs).forEach(([category, categoryData]: [string, any]) => {
        if (categoryData.messages && categoryData.messages.length > 0) {
          logContent += `${category.charAt(0).toUpperCase() + category.slice(1)} Operations\n`;
          logContent += '-'.repeat(category.length + 11) + '\n';
          
          if (categoryData.last_updated) {
            logContent += `Last updated: ${new Date(categoryData.last_updated).toLocaleString()}\n\n`;
          }
          
          categoryData.messages.forEach((line: string) => {
            logContent += `${line}\n`;
          });
          
          logContent += '\n';
        }
      });

      // Copy to clipboard
      await navigator.clipboard.writeText(logContent);
      success('Logs copied to clipboard successfully');
      
    } catch (err: any) {
      console.error('[PremiumTabModal] Exception in handleCopyLogs:', err);
      error(`Failed to copy logs: ${err.message || 'Unknown error'}`);
    }
  }, [logs, success, error]);

  // Render normal-sized add repository view (content transformation only)
  const renderAddRepoContent = () => {
    return (
      <div className="premium-tab-add-repo-content-only">
        <div className="premium-tab-add-repo-header-normal">
          <h3>
            <FontAwesomeIcon icon={faCodeBranch} />
            Add Premium Tab Repository
          </h3>
          <button
            className="add-repo-return-btn-normal"
            onClick={handleReturnFromAddRepo}
            disabled={isLoadingOperation}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Back
          </button>
        </div>
        
        <div className="premium-tab-add-repo-scrollable-content">
          <div className="premium-tab-add-repo-form-normal">
            <div className="form-group">
              <label htmlFor="normal-gitUrl">Git Repository URL:</label>
              <input
                type="url"
                id="normal-gitUrl"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/username/premium-tab-repo.git"
                disabled={isLoadingOperation}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="normal-branch">Branch (optional):</label>
              <input
                type="text"
                id="normal-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                disabled={isLoadingOperation}
              />
            </div>
            
            {/* Security Warning Section */}
            <div className="premium-tab-security-warning">
              <div className="security-warning-header">
                <FontAwesomeIcon icon={faExclamationTriangle} className="security-warning-icon" />
                <h5>Security Warning</h5>
              </div>
              <div className="security-warning-content">
                <p>
                  <strong>CAUTION:</strong> Installing premium tabs from third-party repositories can pose significant security risks to your system.
                </p>
                <ul>
                  <li>Premium tabs have elevated system access and can execute arbitrary code</li>
                  <li>Malicious tabs can compromise your server, steal data, or damage your system</li>
                  <li>Only install tabs from sources you completely trust</li>
                  <li>If you didn&apos;t pay for this tab, you should be especially concerned about its contents</li>
                  <li>Review the repository code thoroughly before installation</li>
                </ul>
                <p>
                  <strong>HOMESERVER LLC is not liable for any damage, data loss, or security breaches 
                  resulting from the installation of third-party premium tabs.</strong>
                </p>
              </div>
              
              <div className="security-disclaimer-checkbox">
                <label className="security-disclaimer-label">
                  <input
                    type="checkbox"
                    checked={securityDisclaimerAccepted}
                    onChange={(e) => setSecurityDisclaimerAccepted(e.target.checked)}
                    disabled={isLoadingOperation}
                  />
                  <span className="security-disclaimer-text">
                    I am a system administrator who understands the security risks involved. 
                    I have reviewed the repository code and accept full responsibility for installing this software. 
                    HOMESERVER LLC is not liable for any consequences.
                  </span>
                </label>
              </div>
            </div>
            
            <div className="premium-tab-add-repo-actions-normal">
              <button
                className="premium-tab-btn secondary"
                onClick={handleReturnFromAddRepo}
                disabled={isLoadingOperation}
              >
                Cancel
              </button>
              <button
                className="premium-tab-btn primary"
                onClick={handleValidateAndClone}
                disabled={isLoadingOperation || !gitUrl.trim() || !securityDisclaimerAccepted}
              >
                {isLoadingOperation ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : (
                  <FontAwesomeIcon icon={faPlus} />
                )}
                Validate & Clone
              </button>
            </div>
          </div>
          
          <div className="premium-tab-add-repo-help-normal">
            <h5>
              <FontAwesomeIcon icon={faQuestionCircle} />
              Repository Requirements
            </h5>
            <ul>
              <li>Repository must contain a valid premium tab structure</li>
              <li>Must include proper configuration files and components</li>
              <li>Repository will be validated before installation</li>
              <li>Use HTTPS URLs for public repositories</li>
              <li>SSH URLs require proper key configuration</li>
              <li>Private repositories need authentication setup</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  // Render tab status icon
  const renderTabStatusIcon = (tab: PremiumTab) => {
    if (tab.installed) {
      return <FontAwesomeIcon icon={faCheckCircle} className="tab-status-icon installed" />;
    } else if (tab.hasConflicts) {
      return <FontAwesomeIcon icon={faExclamationTriangle} className="tab-status-icon conflict" />;
    } else {
      return <FontAwesomeIcon icon={faTimesCircle} className="tab-status-icon available" />;
    }
  };

  // Render tab status text
  const renderTabStatusText = (tab: PremiumTab) => {
    if (tab.installed) {
      return 'Installed';
    } else if (tab.hasConflicts) {
      return tab.conflictsWithCore ? 'Core Conflict' : 'Tab Conflict';
    } else {
      return 'Available';
    }
  };

  return (
    <div className={`premium-tab-modal ${showLogsFullscreen ? 'logs-fullscreen' : ''}`}>
      {showLogsFullscreen ? (
        // Full-screen logs view
        <div className="premium-tab-logs-fullscreen">
          <div className="premium-tab-logs-header">
            <h3>
              <FontAwesomeIcon icon={faFileText} />
              Installation Logs
            </h3>
            <div className="logs-header-actions">
              <button
                className="logs-return-btn"
                onClick={handleCopyLogs}
                disabled={isLoadingLogs || !logs || Object.keys(logs).length === 0}
                title="Copy logs to clipboard"
              >
                <FontAwesomeIcon icon={faCopy} />
              </button>
              <button
                className="logs-return-btn"
                onClick={fetchLogs}
                disabled={isLoadingLogs}
                title="Refresh logs"
              >
                <FontAwesomeIcon icon={faSpinner} spin={isLoadingLogs} />
              </button>
              <button
                className="logs-return-btn"
                onClick={handleReturnFromLogs}
                disabled={isLoadingLogs}
                title="Back to Premium Tabs"
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Back
              </button>
            </div>
          </div>
          
          <div className="premium-tab-logs-content-fullscreen">
            {isLoadingLogs ? (
              <div className="premium-tab-logs-loading-fullscreen">
                <LoadingSpinner size="large" />
                <span>Loading logs...</span>
              </div>
            ) : logs && Object.keys(logs).length > 0 ? (
              <div className="logs-by-category">
                {Object.entries(logs).map(([category, categoryData]: [string, any]) => {
                  if (!categoryData.messages || categoryData.messages.length === 0) {
                    return null; // Skip empty categories
                  }
                  
                  return (
                    <div key={category} className="log-category">
                      <div className="log-category-header">
                        <h4>{category.charAt(0).toUpperCase() + category.slice(1)} Operations</h4>
                        {categoryData.last_updated && (
                          <span className="log-timestamp">
                            Last updated: {new Date(categoryData.last_updated).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <pre className="log-category-content">
                        {categoryData.messages.map((line: string, index: number) => (
                          <div key={index} className="log-line">
                            {line}
                          </div>
                        ))}
                      </pre>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="premium-tab-logs-empty-fullscreen">
                <FontAwesomeIcon icon={faFileText} />
                <h3>No Logs Available</h3>
                <p>No installation logs have been recorded yet.</p>
                <p>Logs will appear here after running premium tab operations.</p>
              </div>
            )}
          </div>
        </div>
      ) : showAddRepoContent ? (
        // Add repository content view
        renderAddRepoContent()
      ) : confirmation ? (
        // Confirmation view
        <div className="premium-tab-confirmation">
          <div className="confirmation-header">
            <FontAwesomeIcon
              icon={confirmation.isDestructive ? faExclamationTriangle : faInfoCircle} 
              className={`confirmation-icon ${confirmation.isDestructive ? 'destructive' : 'info'}`}
            />
            <h3>{confirmation.title}</h3>
          </div>
          
          <div className="confirmation-message">
            <p>{confirmation.message}</p>
          </div>
          
          <div className="confirmation-actions">
            <button
              className="premium-tab-btn secondary"
              onClick={cancelConfirmation}
              disabled={confirmation.isLoading}
            >
              Cancel
            </button>
            <button
              className={`premium-tab-btn ${confirmation.isDestructive ? 'danger' : 'primary'}`}
              onClick={proceedConfirmation}
              disabled={confirmation.isLoading}
            >
              {confirmation.isLoading ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : null}
              {confirmation.confirmText}
            </button>
          </div>
        </div>
      ) : (
        // Main modal content
        <>
          {/* Header with summary */}
          <div className="premium-tab-header">
            <div className="premium-tab-summary">
              {summary && (
                <>
                  <h2 className="sr-only">Premium Tab Management</h2>
                  <div className="summary-item">
                    <FontAwesomeIcon icon={faStar} />
                    <span>Total: {summary.totalTabs}</span>
                  </div>
                  <div className="summary-item">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    <span>Installed: {summary.installedTabs}</span>
                  </div>
                  <div className="summary-item">
                    <FontAwesomeIcon icon={faDownload} />
                    <span>Available: {summary.availableTabs}</span>
                  </div>
                  {summary.hasAnyConflicts && (
                    <div className="summary-item conflict">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      <span>Conflicts Detected</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="premium-tab-actions">
            <button
              className="premium-tab-btn primary"
              onClick={handleShowAddRepo}
              disabled={isLoadingOperation}
            >
              <FontAwesomeIcon icon={faCodeBranch} />
              Add Repository
            </button>

            {summary?.canInstallAll && (
              <button
                className="premium-tab-btn success"
                onClick={handleInstallAll}
              >
                <FontAwesomeIcon icon={faDownload} />
                Install All
              </button>
            )}

            {summary?.canUninstallAll && (
              <button
                className="premium-tab-btn warning"
                onClick={handleUninstallAll}
              >
                <FontAwesomeIcon icon={faTrash} />
                Uninstall All
              </button>
            )}

            <button
              className="premium-tab-btn secondary"
              onClick={handleViewLogs}
              disabled={isLoadingLogs}
            >
              <FontAwesomeIcon icon={faEye} />
              View Logs
            </button>

            <button
              className="premium-tab-btn secondary"
              onClick={handleRefreshAll}
              disabled={isLoadingStatus || isLoadingAutoUpdate}
            >
              <FontAwesomeIcon icon={faSpinner} spin={isLoadingStatus || isLoadingAutoUpdate} />
              Refresh
            </button>
          </div>

          {/* Tabs list */}
          <div className="premium-tab-list">
            {isLoadingStatus ? (
              <div className="premium-tab-loading">
                <LoadingSpinner size="large" />
                <span>Loading premium tabs...</span>
              </div>
            ) : tabs.length > 0 ? (
              tabs.map((tab) => (
                <div key={tab.name} className={`premium-tab-item ${tab.installed ? 'installed' : 'available'} ${tab.hasConflicts ? 'conflict' : ''}`}>
                  <div className="tab-info">
                    {renderTabStatusIcon(tab)}
                    <div className="tab-details">
                      <h4>{tab.name}</h4>
                      <span className="tab-status">{renderTabStatusText(tab)}</span>
                      {tab.hasConflicts && (
                        <div className="tab-conflict-info">
                          <FontAwesomeIcon icon={faInfoCircle} />
                          {tab.conflictsWithCore 
                            ? 'Conflicts with core system files' 
                            : 'Conflicts with other premium tabs'}
                        </div>
                      )}
                      {/* Auto-update checkbox */}
                      {(() => {
                        const autoUpdateData = getAutoUpdateDataForTab(tab.name);
                        if (!autoUpdateData) return null;
                        
                        return (
                          <div className="tab-auto-update">
                            <label className={`auto-update-checkbox ${!autoUpdateData.autoUpdateEligible ? 'disabled' : ''}`}>
                              <input
                                type="checkbox"
                                checked={autoUpdateData.autoUpdateEnabled}
                                disabled={!autoUpdateData.autoUpdateEligible || togglingAutoUpdate.has(tab.name)}
                                onChange={(e) => handleToggleAutoUpdate(tab.name, e.target.checked)}
                              />
                              {togglingAutoUpdate.has(tab.name) ? (
                                <FontAwesomeIcon icon={faSpinner} spin className="auto-update-spinner" />
                              ) : (
                                <FontAwesomeIcon icon={faSync} className="auto-update-icon" />
                              )}
                              <span className="auto-update-label">
                                Auto-update
                                {!autoUpdateData.autoUpdateEligible && (
                                  <span className="auto-update-disabled-reason">
                                    (Not git-managed)
                                  </span>
                                )}
                              </span>
                            </label>
                            {autoUpdateData.autoUpdateEligible && autoUpdateData.gitRepository && (
                              <div className="auto-update-git-info">
                                <FontAwesomeIcon icon={faCodeBranch} />
                                <span className="git-repo-info">
                                  {autoUpdateData.gitRepository.replace('https://github.com/', '')}
                                  {autoUpdateData.gitBranch && autoUpdateData.gitBranch !== 'main' && (
                                    <span className="git-branch">:{autoUpdateData.gitBranch}</span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="tab-actions">
                    {tab.installed ? (
                      <>
                        <button
                          className="premium-tab-btn danger small"
                          onClick={() => handleUninstallTab(tab.name)}
                          disabled={uninstallingTabs.has(tab.name)}
                        >
                          {uninstallingTabs.has(tab.name) ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            <FontAwesomeIcon icon={faTrash} />
                          )}
                          Uninstall
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="premium-tab-btn success small"
                          onClick={() => handleInstallTab(tab.name)}
                          disabled={tab.hasConflicts || installingTabs.has(tab.name)}
                          title={tab.hasConflicts ? 'Cannot install due to conflicts' : 'Install this premium tab'}
                        >
                          {installingTabs.has(tab.name) ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            <FontAwesomeIcon icon={faDownload} />
                          )}
                          Install
                        </button>
                        <button
                          className="premium-tab-btn danger small"
                          onClick={() => handleDeleteTab(tab.name)}
                          disabled={deletingTabs.has(tab.name)}
                          title="Permanently delete this tab folder"
                        >
                          {deletingTabs.has(tab.name) ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            <FontAwesomeIcon icon={faTrash} />
                          )}
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="premium-tab-empty">
                <FontAwesomeIcon icon={faStar} />
                <h3>No Premium Tabs Available</h3>
                <p>Add a premium tab repository to get started.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}; 