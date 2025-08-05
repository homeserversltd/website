import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../../hooks/useToast';
import { useLoading } from '../../../hooks/useLoading';
import { useApi } from '../../../hooks/useApi';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { isOfflineApiError } from '../../../api/interceptors';
import '../upload.css';

interface BlacklistManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onBlacklistUpdated?: () => void;
}

export const BlacklistManager: React.FC<BlacklistManagerProps> = ({
  isOpen,
  onClose,
  onBlacklistUpdated,
}) => {
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const toast = useToast();
  const { isLoading, withLoading } = useLoading();
  const [isInitialized, setIsInitialized] = useState(false);
  const api = useApi();

  const loadBlacklist = useCallback(async () => {
    try {
      const response = await api.get<{ blacklist: string[] }>(API_ENDPOINTS.upload.blacklist);
      setBlacklist(response.blacklist);
      setIsInitialized(true);
    } catch (error) {
      if (!isOfflineApiError(error)) {
        toast.error('Failed to load blacklist');
      }
      setIsInitialized(true);
    }
  }, [api, toast]);

  useEffect(() => {
    if (isOpen && !isInitialized) {
      void withLoading(loadBlacklist());
    }
  }, [isOpen, isInitialized, loadBlacklist, withLoading]);

  const handleRemove = useCallback((index: number) => {
    setBlacklist(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleAdd = useCallback((e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!newEntry.trim()) {
      toast.warning('Please enter a path');
      return;
    }
    
    const normalizedEntry = newEntry.trim();
    
    if (blacklist.some(entry => entry === normalizedEntry)) {
      toast.warning('This entry is already in the blacklist');
      return;
    }
    
    console.log('[directory] Adding to blacklist:', normalizedEntry);
    setBlacklist(prev => [...prev, normalizedEntry]);
    setNewEntry('');
  }, [newEntry, blacklist, toast]);

  const handleSubmit = useCallback(async () => {
    console.log('[directory] Submitting updated blacklist:', blacklist);
    const submitBlacklist = async () => {
      try {
        console.log('[directory] Sending blacklist update to API');
        
        await api.put(API_ENDPOINTS.upload.blacklistUpdate, { blacklist });
        console.log('[directory] Blacklist update successful');
        
        try {
          await api.post(API_ENDPOINTS.system.log, {
            tablet: 'upload',
            message: `Blacklist updated: ${blacklist.join(', ')}`,
            level: 'info'
          });
        } catch (logError) {
          if (!isOfflineApiError(logError)) {
            console.error('Failed to log blacklist update event:', logError);
          }
        }
        
        toast.success('Blacklist updated successfully');
        
        if (onBlacklistUpdated) {
          console.log('[directory] Calling onBlacklistUpdated callback');
          onBlacklistUpdated();
        }
        
        onClose();
      } catch (error) {
        console.error('[directory] Failed to update blacklist:', error);
        if (!isOfflineApiError(error)) {
          toast.error('Failed to update blacklist');
        }
      }
    };

    await withLoading(submitBlacklist());
  }, [api, blacklist, onClose, toast, withLoading, onBlacklistUpdated]);

  return (
    <div className="blacklist-manager">
      <div className="blacklist-entries">
        {blacklist.map((entry, index) => (
          <div key={index} className="blacklist-entry">
            <span className="entry-path">{entry}</span>
            <button
              className="remove-entry"
              onClick={() => handleRemove(index)}
              aria-label="Remove entry"
              disabled={isLoading}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="blacklist-controls">
        <form 
          className="add-entry"
          onSubmit={(e) => {
            handleAdd(e);
            return false;
          }}
        >
          <input
            type="text"
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            placeholder="Enter path to blacklist"
            className="entry-input"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleAdd();
              }
            }}
          />
          <button 
            type="button"
            className="add-button"
            disabled={isLoading}
            onClick={handleAdd}
          >
            New
          </button>
        </form>
        <button 
          type="button"
          onClick={handleSubmit} 
          className="submit-button"
          disabled={isLoading}
        >
          Submit
        </button>
      </div>
    </div>
  );
}; 