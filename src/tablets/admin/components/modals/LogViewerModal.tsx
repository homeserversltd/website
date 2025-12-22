import React, { useState, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faArrowDown, faArrowUp, faSyncAlt, faDownload, faCopy, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useApi } from '../../../../hooks/useApi';
import { useLoading } from '../../../../hooks/useLoading';
import { useToast } from '../../../../hooks/useToast';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import './LogViewerModal.css';

interface LogViewerModalProps {
  onClose: () => void;
}

interface LogResponse {
  status: 'success' | 'error';
  logs: string[];
  metadata?: {
    offset: number;
    limit: number;
    returned_lines: number;
    total_lines: number;
    file_size: number;
    file_path: string;
  };
  message?: string;
}

interface ClearLogsResponse {
  status: 'success' | 'error';
  message: string;
}

export const LogViewerModal: React.FC<LogViewerModalProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<LogResponse['metadata'] | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(1000);
  
  const logContentRef = useRef<HTMLDivElement>(null);
  const api = useApi();
  const { isLoading, withLoading } = useLoading();
  const { success, error } = useToast();
  
  // Fetch logs from the server - memoized with minimal dependencies
  const fetchLogs = useCallback(async (requestedOffset = 0) => {
    try {
      await withLoading((async () => {
        const response = await api.get<LogResponse>(
          `${API_ENDPOINTS.admin.logs.homeserver}?offset=${requestedOffset}&limit=${limit}`
        );
        
        if (response.status === 'success') {
          setLogs(response.logs);
          setMetadata(response.metadata || null);
          setOffset(response.metadata?.offset || 0);
          
          if (logContentRef.current) {
            logContentRef.current.scrollTop = 0;
          }
        } else {
          error(response.message || 'Failed to fetch logs');
        }
      })());
    } catch (err: any) {
      error(`Error fetching logs: ${err.message || 'Unknown error'}`);
      console.error('Error fetching logs:', err);
    }
  }, [api, withLoading, error, limit]); // Minimal stable dependencies
  
  // Load logs ONCE on initial mount
  React.useEffect(() => {
    fetchLogs(0);
  }, []); // Empty dependency array - only run once
  
  // Handlers for navigation and actions
  const handlePrevPage = () => {
    if (metadata && offset > 0) {
      fetchLogs(Math.max(0, offset - limit));
    }
  };
  
  const handleNextPage = () => {
    if (metadata && metadata.total_lines > offset + metadata.returned_lines) {
      fetchLogs(offset + limit);
    }
  };
  
  const handleRefresh = () => {
    fetchLogs(offset);
  };
  
  const handleCopy = () => {
    const logText = logs.join('\n');
    navigator.clipboard.writeText(logText)
      .then(() => success('Logs copied to clipboard'))
      .catch(() => error('Failed to copy logs to clipboard'));
  };
  
  const handleDownload = () => {
    const logText = logs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'homeserver.log';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Log file downloaded');
  };
  
  const handleClearLogs = useCallback(async () => {
    try {
      await withLoading((async () => {
        const response = await api.post<ClearLogsResponse>(API_ENDPOINTS.admin.logs.clear);
        
        if (response.status === 'success') {
          success('Logs cleared successfully');
          // Refresh the logs after clearing
          await fetchLogs(0);
        } else {
          error(response.message || 'Failed to clear logs');
        }
      })());
    } catch (err: any) {
      error(`Error clearing logs: ${err.message || 'Unknown error'}`);
      console.error('Error clearing logs:', err);
    }
  }, [api, withLoading, error, success, fetchLogs]);
  
  return (
    <div className="log-viewer-modal">
      {metadata && (
        <div className="log-viewer-pagination">
          <div className="log-viewer-controls">
            <button onClick={handleRefresh} title="Refresh logs">
              <FontAwesomeIcon icon={faSyncAlt} />
            </button>
            <button onClick={handleCopy} title="Copy logs to clipboard">
              <FontAwesomeIcon icon={faCopy} />
            </button>
            <button onClick={handleDownload} title="Download logs">
              <FontAwesomeIcon icon={faDownload} />
            </button>
            <button 
              onClick={handleClearLogs} 
              title="Clear logs"
              className="clear-button"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
          
          <span className="log-viewer-pagination-info">
            Showing lines {offset + 1} to {offset + metadata.returned_lines} of {metadata.total_lines}
          </span>

          <div className="log-viewer-controls">
            <button
              onClick={handlePrevPage}
              disabled={isLoading || offset === 0}
              title="Previous page"
            >
              <FontAwesomeIcon icon={faArrowUp} /> Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={isLoading || (metadata.total_lines <= offset + metadata.returned_lines)}
              title="Next page"
            >
              Next <FontAwesomeIcon icon={faArrowDown} />
            </button>
          </div>
        </div>
      )}

      <div className="log-viewer-content" ref={logContentRef}>
        {isLoading ? (
          <div className="log-viewer-loading">
            <LoadingSpinner size="large" />
            <span>Loading logs...</span>
          </div>
        ) : logs.length > 0 ? (
          <pre>
            {logs.map((line, index) => (
              <div key={`${offset}-${index}`} className="log-line">
                {line}
              </div>
            ))}
          </pre>
        ) : (
          <div className="log-viewer-empty">
            <p>No log data available</p>
          </div>
        )}
      </div>
    </div>
  );
}; 