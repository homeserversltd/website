import React, { useState, useEffect } from 'react';

interface LogsViewProps {
  onGetLogs: () => Promise<string>;
  isLoading?: boolean;
}

export const LogsView: React.FC<LogsViewProps> = ({
  onGetLogs,
  isLoading = false
}) => {
  const [logs, setLogs] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    setError(null);
    try {
      const logContent = await onGetLogs();
      setLogs(logContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="logs-view">
      <div className="logs-header">
        <h3>Download Logs</h3>
        <button
          onClick={loadLogs}
          disabled={isLoadingLogs || isLoading}
          className="refresh-logs-button"
        >
          {isLoadingLogs ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="logs-content">
        <pre className="logs-text">{logs || 'No logs available'}</pre>
      </div>
    </div>
  );
};

