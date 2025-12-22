import { useState, useCallback, useEffect } from 'react';
import { UploadProgress, UploadConfig } from '../types';
import { useApi } from '../../../hooks/useApi';
import { useStore } from '../../../store';
import { showToast } from '../../../components/Popup/PopupManager';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { isOfflineApiError } from '../../../api/interceptors';

export const useUpload = () => {
  const api = useApi();
  const [activeUploads, setActiveUploads] = useState<Map<string, UploadProgress>>(
    new Map()
  );
  const [config, setConfig] = useState<UploadConfig>({
    maxFileSize: 1024 * 1024 * 1024, // 1GB
    allowedExtensions: ['*'],
    maxConcurrentUploads: 3,
    defaultPath: '/mnt/nas',
    blacklist: [],
  });

  const { isAdmin } = useStore();

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await api.get<UploadConfig>(
          API_ENDPOINTS.upload.setDefaultDirectory
        );
        setConfig({
          ...config,
          defaultPath: response.defaultPath || '/mnt/nas'
        });
      } catch (error) {
        if (!isOfflineApiError(error)) {
          console.error('Failed to load upload config', error);
        }
      }
    };
    
    loadConfig();
  }, [api]);

  const logUploadEvent = async (message: string, level: 'info' | 'error' | 'warn' = 'info') => {
    try {
      await api.post(API_ENDPOINTS.system.log, {
        tablet: 'upload',
        message,
        level
      });
    } catch (error) {
      if (!isOfflineApiError(error)) {
        console.error('Failed to log upload event:', error);
      }
    }
  };

  const updateProgress = useCallback((filename: string, update: Partial<UploadProgress>) => {
    setActiveUploads(prev => {
      const next = new Map(prev);
      const current = next.get(filename);
      if (current) {
        next.set(filename, { ...current, ...update });
      } else {
        // Initialize new upload if it doesn't exist
        next.set(filename, {
          filename,
          progress: 0,
          speed: 0,
          uploaded: 0,
          total: 0,
          status: 'pending',
          ...update
        });
      }
      return next;
    });
  }, []);

  const uploadFile = useCallback(async (file: File, path: string) => {
    // Check file size
    if (file.size > config.maxFileSize) {
      const message = `File size exceeds limit of ${config.maxFileSize / 1024 / 1024}MB`;
      showToast({
        message,
        variant: 'error'
      });
      await logUploadEvent(message, 'error');
      throw new Error(message);
    }

    // Check file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (config.allowedExtensions[0] !== '*' && ext && !config.allowedExtensions.includes(ext)) {
      const message = `File type .${ext} is not allowed`;
      showToast({
        message,
        variant: 'error'
      });
      await logUploadEvent(message, 'error');
      throw new Error(message);
    }

    // Initialize upload progress
    updateProgress(file.name, {
      filename: file.name,
      progress: 0,
      speed: 0,
      uploaded: 0,
      total: file.size,
      status: 'pending',
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);

      // Use XMLHttpRequest for upload progress
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          const elapsedTime = Date.now() - startTime;
          const speed = event.loaded / (elapsedTime / 1000); // bytes per second

          updateProgress(file.name, {
            progress,
            speed,
            uploaded: event.loaded,
            status: 'uploading',
          });
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = async () => {
          if (xhr.status === 200) {
            updateProgress(file.name, {
              progress: 100,
              status: 'completed',
            });
            resolve();
          } else {
            let errorMsg = `Upload failed with status ${xhr.status}`;
            
            // Try to parse the response to get more specific error information
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.error) {
                errorMsg = response.error;
                
                // Add specific context for different error types
                if (response.nas_unavailable) {
                  errorMsg = `⚠️ NAS Storage Unavailable: ${errorMsg}`;
                  showToast({
                    message: 'NAS storage is not mounted or accessible',
                    variant: 'error'
                  });
                } else if (response.type === 'permission_denied') {
                  errorMsg = `${errorMsg}.`;
                } else if (response.type === 'insufficient_space') {
                  // Make disk space errors more user-friendly
                  errorMsg = `Cannot upload ${file.name}: ${errorMsg}`;
                }
              }
            } catch (e) {
              // If we can't parse the response, use the default error message
            }
            
            updateProgress(file.name, {
              status: 'error',
              error: errorMsg,
            });
            await logUploadEvent(errorMsg, 'error');
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = async () => {
          const errorMsg = 'Network error occurred during upload';
          updateProgress(file.name, {
            status: 'error',
            error: errorMsg,
          });
          await logUploadEvent(errorMsg, 'error');
          reject(new Error(errorMsg));
        };

        xhr.open('POST', `/api${API_ENDPOINTS.files.upload}`);
        xhr.send(formData);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      updateProgress(file.name, {
        status: 'error',
        error: errorMsg,
      });
      await logUploadEvent(`Upload failed for ${file.name}: ${errorMsg}`, 'error');
      throw error;
    }
  }, [config.maxFileSize, config.allowedExtensions, updateProgress]);

  const removeUpload = useCallback((filename: string) => {
    setActiveUploads(prev => {
      const next = new Map(prev);
      next.delete(filename);
      return next;
    });
  }, []);

  return {
    activeUploads,
    uploadFile,
    removeUpload,
    config,
    setConfig: isAdmin ? setConfig : undefined,
  };
};