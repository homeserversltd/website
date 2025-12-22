import React, { useState, useEffect } from 'react';
import { showToast } from '../../../components/Popup/PopupManager';

interface Backup {
  backup_id: string;
  created_at: string;
  total_chunks: number;
  uploaded_bytes: number;
  reused_chunks: number;
  status: string;
  total_size: number;
}

const RestoreTab: React.FC = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const [restorePaths, setRestorePaths] = useState<string>('');
  const [restoreLocation, setRestoreLocation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [chunkingEnabled, setChunkingEnabled] = useState(false);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/backup/backups/list');
      const data = await response.json();
      if (data.success) {
        setBackups(data.data.backups || []);
        setChunkingEnabled(data.data.chunking_enabled || false);
      } else {
        showToast({ message: 'Failed to load backups', variant: 'error' });
      }
    } catch (error) {
      console.error('Failed to load backups:', error);
      showToast({ message: 'Failed to load backups', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) {
      showToast({ message: 'Please select a backup', variant: 'error' });
      return;
    }

    const paths = restorePaths.split('\n').filter(p => p.trim());
    if (paths.length === 0) {
      showToast({ message: 'Please enter at least one path to restore', variant: 'error' });
      return;
    }

    try {
      setRestoring(true);
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backup_id: selectedBackup,
          paths: paths,
          location: restoreLocation || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        showToast({
          message: `Restore completed: ${data.data.files_restored} files restored, ${data.data.chunks_downloaded} chunks downloaded`,
          variant: 'success'
        });
        // Reset form
        setRestorePaths('');
        setRestoreLocation('');
      } else {
        showToast({ message: `Restore failed: ${data.error}`, variant: 'error' });
      }
    } catch (error) {
      console.error('Restore failed:', error);
      showToast({ message: 'Restore failed', variant: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (!chunkingEnabled) {
    return (
      <div className="restore-tab">
        <div className="restore-placeholder">
          <div className="placeholder-content">
            <h3>Restore System Unavailable</h3>
            <p>Selective restore requires the chunk database to be accessible. The database will be initialized automatically when you create your first backup.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="restore-tab" style={{ padding: '2rem' }}>
      <div className="restore-header">
        <h2>Selective Restore</h2>
        <p>Restore specific files or directories from chunked backups</p>
      </div>

      <div className="restore-content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Backup Selection */}
        <div className="restore-section" style={{ background: 'var(--card-background)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>Select Backup</h3>
          {loading ? (
            <div>Loading backups...</div>
          ) : backups.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>No backups available</div>
          ) : (
            <select
              value={selectedBackup}
              onChange={(e) => setSelectedBackup(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginTop: '1rem',
                fontSize: '1rem',
                background: 'var(--background)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px'
              }}
            >
              <option value="">-- Select a backup --</option>
              {backups.map((backup) => (
                <option key={backup.backup_id} value={backup.backup_id}>
                  {backup.backup_id} - {formatDate(backup.created_at)} ({formatBytes(backup.total_size)})
                </option>
              ))}
            </select>
          )}
          {selectedBackup && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
              {(() => {
                const backup = backups.find(b => b.backup_id === selectedBackup);
                return backup ? (
                  <div>
                    <div><strong>Created:</strong> {formatDate(backup.created_at)}</div>
                    <div><strong>Total Chunks:</strong> {backup.total_chunks}</div>
                    <div><strong>Reused Chunks:</strong> {backup.reused_chunks}</div>
                    <div><strong>Uploaded:</strong> {formatBytes(backup.uploaded_bytes)}</div>
                    <div><strong>Total Size:</strong> {formatBytes(backup.total_size)}</div>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>

        {/* Restore Paths */}
        <div className="restore-section" style={{ background: 'var(--card-background)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>Paths to Restore</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Enter one path per line. Examples: /opt/gogs, /etc/postgresql/15/main
          </p>
          <textarea
            value={restorePaths}
            onChange={(e) => setRestorePaths(e.target.value)}
            placeholder="/opt/gogs&#10;/etc/postgresql/15/main"
            rows={6}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              fontFamily: 'monospace',
              background: 'var(--background)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              resize: 'vertical'
            }}
          />
        </div>

        {/* Restore Location (Optional) */}
        <div className="restore-section" style={{ background: 'var(--card-background)', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>Restore Location (Optional)</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Leave empty to restore to original locations, or specify a directory to restore files there
          </p>
          <input
            type="text"
            value={restoreLocation}
            onChange={(e) => setRestoreLocation(e.target.value)}
            placeholder="/tmp/restored"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              background: 'var(--background)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px'
            }}
          />
        </div>

        {/* Restore Button */}
        <div className="restore-actions">
          <button
            onClick={handleRestore}
            disabled={!selectedBackup || restoring || restorePaths.trim().length === 0}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!selectedBackup || restoring || restorePaths.trim().length === 0) ? 'not-allowed' : 'pointer',
              opacity: (!selectedBackup || restoring || restorePaths.trim().length === 0) ? 0.5 : 1
            }}
          >
            {restoring ? 'Restoring...' : 'Restore Files'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestoreTab;
