import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { DirectoryBrowser } from './components/DirectoryBrowser';
import { UploadProgress } from './components/UploadProgress';
import { useUpload } from './hooks/useUpload';
import { API_ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../hooks/useAuth';
import { useVisibility } from '../../hooks/useVisibility';
import { useToast } from '../../hooks/useToast';
import { useLoading } from '../../hooks/useLoading';
import { useModal, UseModalOptions } from '../../hooks/useModal';
import { FileEntry } from './types';
import { BlacklistManager } from './components/BlacklistManager';
import './upload.css';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { isOfflineApiError } from '../../api/interceptors';
import { ApiError } from '../../api/interceptors';
import { debug, createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('UploadTablet');

// Add new component for upload history modal
const UploadHistoryModalContent: React.FC = () => {
  const [uploadHistory, setUploadHistory] = useState<string[]>([]);
  const { isLoading, withLoading } = useLoading();
  const toast = useToast();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const api = useApi();

  const loadHistory = useCallback(async () => {
    try {
      setLoadError(null);
      const response = await api.get<{ history: string[] }>(API_ENDPOINTS.upload.history);
      setUploadHistory(response.history);
      setHasAttemptedLoad(true);
    } catch (error) {
      const errorMessage = 'Failed to load upload history';
      setLoadError(errorMessage);
      if (!isOfflineApiError(error)) {
        toast.error(errorMessage);
      }
      setHasAttemptedLoad(true);
      try {
        await api.post(API_ENDPOINTS.system.log, {
          tablet: 'upload',
          message: `${errorMessage}: ${error}`,
          level: 'error'
        });
      } catch (logError) {
        if (!isOfflineApiError(logError)) {
          logger.error('Failed to log history load error:', logError);
        }
      }
    }
  }, [api, toast, withLoading]);

  // Load history data on mount
  useEffect(() => {
    if (!hasAttemptedLoad) {
      void withLoading(loadHistory());
    }
  }, [loadHistory, hasAttemptedLoad, withLoading]); // loadHistory is now stable due to useCallback

  const handleClearHistory = useCallback(async () => {
    try {
      await withLoading(api.post(API_ENDPOINTS.upload.clearHistory, {}));
      setUploadHistory([]);
      toast.success('Upload history cleared');
      try {
        await api.post(API_ENDPOINTS.system.log, {
          tablet: 'upload',
          message: 'Admin cleared upload history',
          level: 'info'
        });
      } catch (logError) {
        if (!isOfflineApiError(logError)) {
          logger.error('Failed to log history clear event:', logError);
        }
      }
    } catch (error) {
      const errorMessage = 'Failed to clear upload history';
      if (!isOfflineApiError(error)) {
        toast.error(errorMessage);
      }
      try {
        await api.post(API_ENDPOINTS.system.log, {
          tablet: 'upload',
          message: `${errorMessage}: ${error}`,
          level: 'error'
        });
      } catch (logError) {
        if (!isOfflineApiError(logError)) {
          logger.error('Failed to log history clear error:', logError);
        }
      }
    }
  }, [api, withLoading, toast]);

  if (isLoading) {
    return (
      <div className="upload-history-loading">
        <LoadingSpinner size="medium" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="upload-history-error">
        <p>{loadError}</p>
        <button onClick={() => void withLoading(loadHistory())}>Retry</button>
      </div>
    );
  }

  return (
    <div className="upload-history-modal-content">
      <div className={`uploadHistoryModal ${uploadHistory.length === 0 ? 'empty' : ''}`}>
        {uploadHistory.length === 0 ? (
          <div className="upload-history-empty-message">
            No upload history available
          </div>
        ) : (
          <div className="upload-history-list">
            {uploadHistory.map((line, index) => (
              <div
                key={index}
                className={`history-item ${line.includes('Successfully') ? 'success' : 'error'}`}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        className="clear-history-button"
        onClick={handleClearHistory}
        disabled={uploadHistory.length === 0 || isLoading}
      >
        Clear History
      </button>
    </div>
  );
};

const UploadTablet: React.FC = () => {
  const { activeUploads, uploadFile, config, removeUpload } = useUpload();
  const [currentPath, setCurrentPath] = useState<string>('/mnt/nas');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { isAdmin } = useAuth();
  const { checkTabVisibility } = useVisibility();
  const toast = useToast();
  const { isLoading, withLoading } = useLoading();
  const api = useApi();
  const { open: openPinModal, close: closePinModal } = useModal();
  
  // New state to track directory loading
  const [isDirectoryLoaded, setIsDirectoryLoaded] = useState(false);
  
  // Reference to the DirectoryBrowser component for refreshing
  const directoryBrowserRef = React.useRef<{ refreshTree: () => Promise<void> } | null>(null);
  
  // Configure modal options
  const historyModalOptions: UseModalOptions = {
    title: 'Upload History',
    hideActions: true
  };
  const blacklistModalOptions: UseModalOptions = {
    title: 'Manage Blacklist',
    hideActions: true
  };
  
  const historyModal = useModal(historyModalOptions);
  const blacklistModal = useModal(blacklistModalOptions);
  
  const isActive = isAdmin || checkTabVisibility('upload');

  const { error: showErrorToast, success: showSuccessToast } = toast;

  const [isPinRequiredForUpload, setIsPinRequiredForUpload] = useState<boolean>(false);
  const [isLoadingPinStatus, setIsLoadingPinStatus] = useState<boolean>(false);
  const [isSavingPinStatus, setIsSavingPinStatus] = useState<boolean>(false);
  const [pinStatusError, setPinStatusError] = useState<string | null>(null);

  const fetchPinRequiredStatus = useCallback(async () => {
    // Always fetch the status. isAdmin will control UI elements for changing it elsewhere.
    setIsLoadingPinStatus(true);
    setPinStatusError(null);
    try {
      const response = await api.get<{ isPinRequired: boolean }>(API_ENDPOINTS.upload.getPinRequiredStatus);
      debug('Response from /upload/pin-required-status:', JSON.stringify(response));
      if (response && typeof response.isPinRequired === 'boolean') {
        setIsPinRequiredForUpload(response.isPinRequired);
      } else {
        logger.error('Invalid or unexpected response structure for PIN status:', response);
        // Consider setting a default or an error state here
        setIsPinRequiredForUpload(false); // Default to false on invalid response
        throw new Error('Invalid response for PIN status');
      }
    } catch (err) {
      logger.error('Failed to fetch upload PIN status:', err);
      setPinStatusError('Failed to load PIN requirement settings.');
      showErrorToast('Failed to load upload PIN settings.');
      setIsPinRequiredForUpload(false); // Default to false on error
    } finally {
      setIsLoadingPinStatus(false);
    }
  }, [api, showErrorToast, setIsPinRequiredForUpload, setIsLoadingPinStatus, setPinStatusError]); // isAdmin removed from dependencies

  useEffect(() => {
    fetchPinRequiredStatus();
  }, [fetchPinRequiredStatus]); // This will now typically run once on mount as fetchPinRequiredStatus deps are stable

  // Handler for toggling PIN requirement
  const handlePinRequiredToggleChange = useCallback(async () => {
    if (!isAdmin) return;
    setIsSavingPinStatus(true);
    setPinStatusError(null);
    try {
      // Determine the new state by inverting the current state
      const newPinRequiredState = !isPinRequiredForUpload;
      await api.post(API_ENDPOINTS.upload.setPinRequiredStatus, { isPinRequired: newPinRequiredState });
      setIsPinRequiredForUpload(newPinRequiredState);
      showSuccessToast(`Upload PIN requirement ${newPinRequiredState ? 'enabled' : 'disabled'}.`);
    } catch (err: any) {
      logger.error('Failed to update upload PIN status:', err);
      setPinStatusError('Failed to save PIN requirement settings.');
      showErrorToast('Failed to update upload PIN settings.');
      setIsPinRequiredForUpload(isPinRequiredForUpload => !isPinRequiredForUpload);
    } finally {
      setIsSavingPinStatus(false);
    }
  }, [api, isAdmin, showErrorToast, showSuccessToast, isPinRequiredForUpload, setIsPinRequiredForUpload, setIsSavingPinStatus, setPinStatusError]);

  const handlePathChange = useCallback((path: string) => {
    debug('Directory changed to:', path);
    setCurrentPath(path);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
      debug('Selected files:', e.target.files);
    }
  };

  const handleFileSelect = useCallback((file: FileEntry) => {
    debug('Selected file:', file);
  }, []);

  const handleDirectoryLoaded = useCallback((loaded: boolean) => {
    setIsDirectoryLoaded(loaded);
  }, []);

  // Function to handle blacklist updates
  const handleBlacklistUpdated = useCallback(async () => {
    debug('Blacklist updated, refreshing directory tree');
    
    try {
      // Set loading state only once
      setIsDirectoryLoaded(false);
      
      // Ensure the browser is done with the blacklist update API call
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Trigger a single refresh
      if (directoryBrowserRef.current) {
        debug('Executing refresh after blacklist update');
        await directoryBrowserRef.current.refreshTree();
        debug('Blacklist update refresh completed');
      }
      
      // Restore loading state
      setIsDirectoryLoaded(true);
    } catch (error) {
      logger.error('Error refreshing after blacklist update:', error);
      toast.error('Error refreshing directory after blacklist update');
      setIsDirectoryLoaded(true);
    }
  }, [toast]);

  // Wrap blacklist modal opening in a callback for the prop
  const handleManageBlacklist = useCallback(() => {
    blacklistModal.open(
      <BlacklistManager 
        isOpen={true}
        onClose={() => blacklistModal.close()}
        onBlacklistUpdated={handleBlacklistUpdated}
      />
    );
  }, [blacklistModal, handleBlacklistUpdated]);

  // Add this helper function to call forceAllow with the current path
  const forcePermissions = (path: string) => {
    setCurrentPath(path);
    handleForceAllowUpload();
  };

  const verifyAdminPinAndProceed = useCallback(async (callback: () => void) => {
    let enteredPin = '';

    openPinModal(
      // Children for the modal
      <form onSubmit={(e) => e.preventDefault()} className="pin-modal-form">
        <p>Please enter the admin PIN to proceed with the upload.</p>
        {/* Visually hidden username field for accessibility and password managers */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
          tabIndex={-1} // Make it unfocusable
          aria-hidden="true" // Hide from screen readers as it's a dummy field for this context
        />
        <input
          type="password"
          placeholder="Admin PIN"
          autoFocus
          onChange={(e) => (enteredPin = e.target.value)}
          className="pin-input"
          autoComplete="new-password"
        />
      </form>,
      // Modal options
      {
        title: 'Admin PIN Required',
        hideActions: false, // Show default Confirm/Cancel buttons
        submitOnEnter: true, // Allow submitting with Enter key
        onConfirm: async () => {
          if (!enteredPin) {
            toast.error('PIN cannot be empty.');
            return false; // Keep modal open
          }
          try {
            // Import and use encryptDataAsync
            const { encryptDataAsync } = await import('../../utils/secureTransmission');
            const encryptedPin = await encryptDataAsync(enteredPin);

            if (!encryptedPin) {
              toast.error('Failed to encrypt PIN for verification.');
              logger.error('PIN encryption returned null or undefined.');
              return false; // Keep modal open
            }

            // Call /api/verifyPin with the encrypted PIN
            const response = await api.post<{ verified: boolean, error?: string }>(
              API_ENDPOINTS.auth.verifyPin, 
              { encryptedPin: encryptedPin }
            );

            if (response && response.verified) {
              toast.success('PIN Verified.');
              closePinModal();
              callback(); 
              return true; 
            } else {
              toast.error(response.error || 'Invalid PIN or verification failed.');
              return false; 
            }
          } catch (err) {
            logger.error('Error verifying PIN:', err);
            if (err instanceof ApiError) {
              toast.error(`Error verifying PIN: ${err.details || err.message}`);
            } else if (err instanceof Error) {
              toast.error(`Error verifying PIN: ${err.message}`);
            } else {
              toast.error('An unknown error occurred during PIN verification.');
            }
            return false;
          }
        },
      }
    );
  }, [api, openPinModal, closePinModal, toast]);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) {
      toast.error('No files selected for upload');
      return;
    }

    const uploadFiles = async () => {
      debug(`Starting upload of ${selectedFiles.length} files to ${currentPath}`);
      toast.info(`Starting upload of ${selectedFiles.length} files...`);

      let successCount = 0;
      let failureCount = 0;
      const filesToRemove: File[] = [];

      for (const file of selectedFiles) {
        try {
          debug(`Processing file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
          
          await uploadFile(file, currentPath);
          filesToRemove.push(file);
          successCount++;
          
        } catch (error) {
          logger.error('Upload error:', error);
          failureCount++;
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isPermissionError = errorMessage.toLowerCase().includes('permission denied');
          
          if (isPermissionError) {
            toast.error(`Permission denied uploading ${file.name}. Try using the Admin Mode "Force Allow Upload" button.`, 
              { duration: 8000 }
            );
            
            // Don't reset currentPath here, it might be confusing if an upload fails
            // and the path suddenly changes. Let user manage path via DirectoryBrowser.
            // setCurrentPath(currentPath); 
          } else {
            if (!isOfflineApiError(error)) {
              toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
            }
          }
          
          try {
            await api.post(API_ENDPOINTS.system.log, {
              tablet: 'upload',
              message: `Failed to upload ${file.name}: ${errorMessage}`,
              level: 'error'
            });
          } catch (logError) {
            if (!isOfflineApiError(logError)) {
              logger.error('Failed to log upload error:', logError);
            }
          }
        }
      }

      setSelectedFiles(prev => prev.filter(f => !filesToRemove.includes(f)));

      if (successCount > 0 && failureCount === 0) {
        toast.success(`Successfully uploaded ${successCount} file${successCount !== 1 ? 's' : ''}`);
      } else if (successCount > 0 && failureCount > 0) {
        toast.warning(`Uploaded ${successCount} file${successCount !== 1 ? 's' : ''}, ${failureCount} failed`);
      }
      // If failureCount > 0 and successCount === 0, individual errors were already toasted.
    };

    if (isPinRequiredForUpload) {
      verifyAdminPinAndProceed(() => {
        void withLoading(uploadFiles());
      });
    } else {
      void withLoading(uploadFiles());
    }
  }, [selectedFiles, currentPath, uploadFile, toast, withLoading, api, isPinRequiredForUpload, verifyAdminPinAndProceed]);

  const handleForceAllowUpload = useCallback(async () => {
    const confirmResult = window.confirm(
      `WARNING: This will override security settings for ${currentPath}. \nOnly continue if you understand the risks.`
    );
    if (!confirmResult) return;
    
    const forceAllow = async () => {
      try {
        const response = await api.post<{ success: boolean; error?: string }>(
          API_ENDPOINTS.upload.forceAllow,
          { directory: currentPath },
        );
        if (response.success) {
          toast.success('Directory permissions updated successfully');
          try {
            await api.post(API_ENDPOINTS.system.log, {
              tablet: 'upload',
              message: `Admin forced allow permissions for: ${currentPath}`,
              level: 'info'
            });
          } catch (logError) {
            if (!isOfflineApiError(logError)) {
              logger.error('Failed to log force allow event:', logError);
            }
          }
        } else {
          throw new Error(response.error || 'Failed to force allow permissions.');
        }
      } catch (error: any) {
        if (!isOfflineApiError(error)) {
          toast.error(`Error forcing allow: ${error.message || error}`);
        }
        try {
          await api.post(API_ENDPOINTS.system.log, {
            tablet: 'upload',
            message: `Error forcing allow for ${currentPath}: ${error.message || error}`,
            level: 'error'
          });
        } catch (logError) {
          if (!isOfflineApiError(logError)) {
            logger.error('Failed to log force allow error:', logError);
          }
        }
      }
    };

    void withLoading(forceAllow());
  }, [currentPath, toast, withLoading, api]);

  const handleSetDefaultDirectory = useCallback(async () => {
    const setDefault = async () => {
      try {
        const response = await api.post<{ success: boolean; directory: string; error?: string }>(
          API_ENDPOINTS.upload.setDefaultDirectory,
          { directory: currentPath }
        );
        
        if (response.success) {
          toast.success('Default directory updated successfully');
          try {
            await api.post(API_ENDPOINTS.system.log, {
              tablet: 'upload',
              message: `Admin set default directory to: ${currentPath}`,
              level: 'info'
            });
          } catch (logError) {
            if (!isOfflineApiError(logError)) {
              logger.error('Failed to log set default dir event:', logError);
            }
          }
        } else {
          throw new Error(response.error || 'Failed to set default directory');
        }
      } catch (error: any) {
        if (!isOfflineApiError(error)) {
          toast.error(`Error setting default directory: ${error.message || error}`);
        }
        try {
          await api.post(API_ENDPOINTS.system.log, {
            tablet: 'upload',
            message: `Error setting default directory to ${currentPath}: ${error.message || error}`,
            level: 'error'
          });
        } catch (logError) {
          if (!isOfflineApiError(logError)) {
            logger.error('Failed to log set default dir error:', logError);
          }
        }
      }
    };

    void withLoading(setDefault());
  }, [currentPath, toast, withLoading, api]);

  const handleViewHistory = useCallback(() => {
    historyModal.open(<UploadHistoryModalContent />);
  }, [historyModal]);

  const handleDirectoryRefresh = useCallback(() => {
    debug('Directory refresh triggered');
    Array.from(activeUploads.values()).forEach(upload => {
      if (upload.status === 'completed' || upload.status === 'error') {
        removeUpload(upload.filename);
      }
    });
  }, [activeUploads, removeUpload]);

  return (
    <ErrorBoundary>
      <div className="upload-tablet">
        {activeUploads.size > 0 && (
          <div className="upload-progress-list">
            {Array.from(activeUploads.values()).map((upload) => (
              <UploadProgress
                key={upload.filename}
                upload={upload}
                onRemove={() => removeUpload(upload.filename)}
              />
            ))}
          </div>
        )}

        <div className="upload-controls">
          <DirectoryBrowser 
            onPathChange={handlePathChange}
            isActive={isActive}
            onRefresh={handleDirectoryRefresh}
            onDirectoryLoaded={handleDirectoryLoaded}
            isAdmin={isAdmin}
            isAdminLoading={isLoading}
            onForceAllowUpload={handleForceAllowUpload}
            onSetDefaultDirectory={handleSetDefaultDirectory}
            onManageBlacklist={handleManageBlacklist}
            onViewHistory={handleViewHistory}
            isPinRequiredForUpload={isPinRequiredForUpload}
            onTogglePinRequirement={handlePinRequiredToggleChange}
            isSavingPinStatus={isSavingPinStatus}
            ref={directoryBrowserRef}
          />
          
          {/* Conditionally render file upload section */}
          {isDirectoryLoaded && (
            <div className="file-upload-section">
              <input 
                type="file" 
                multiple 
                onChange={handleFileInput}
                disabled={isLoading} 
              />
              <button 
                onClick={handleUpload} 
                disabled={selectedFiles.length === 0 || isLoading}
              >
                {isLoading ? 'Uploading...' : 'Upload Selected Files'}
              </button>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default UploadTablet;