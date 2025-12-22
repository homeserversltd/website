/**
 * HOMESERVER Backup Overview Tab Component
 * Providers and backup files management
 */

import React, { useState, useEffect } from 'react';
import { BackupConfig, ScheduleInfo, HeaderStats } from '../types';
import { StatusHeaderBar } from './StatusHeaderBar';
import { InstallationManager } from './InstallationManager';
import { getFileEmoji } from '../utils/fileIcons';
import { Card, Badge } from '../../../components/ui';

interface OverviewTabProps {
  config: BackupConfig | null;
  scheduleInfo: ScheduleInfo | null;
  onConfigChange: (config: Partial<BackupConfig>) => Promise<boolean>;
  headerStats?: HeaderStats | null;
  installationStatus?: any;
  onStatusChange?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  config,
  scheduleInfo,
  onConfigChange,
  headerStats,
  installationStatus,
  onStatusChange
}) => {
  const [clickedProvider, setClickedProvider] = useState<string | null>(null);
  const [chunkStats, setChunkStats] = useState<any>(null);
  const [loadingChunkStats, setLoadingChunkStats] = useState(false);

  useEffect(() => {
    const fetchChunkStats = async () => {
      try {
        setLoadingChunkStats(true);
        const response = await fetch('/api/backup/statistics');
        const data = await response.json();
        if (data.success && data.data?.chunked_backup) {
          setChunkStats(data.data.chunked_backup);
        }
      } catch (error) {
        console.error('Failed to fetch chunk statistics:', error);
      } finally {
        setLoadingChunkStats(false);
      }
    };

    fetchChunkStats();
  }, []);

  const handleProviderClick = (providerKey: string) => {
    setClickedProvider(providerKey);
    // Reset the animation state after 300ms
    setTimeout(() => {
      setClickedProvider(null);
    }, 300);
  };

  const formatNextBackup = (nextRun: string | null): string => {
    if (!nextRun || nextRun === 'Not scheduled') return 'Not scheduled';
    
    try {
      const date = new Date(nextRun);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      
      if (diffMs < 0) return 'Overdue';
      if (diffDays > 0) return `In ${diffDays} day${diffDays > 1 ? 's' : ''}`;
      if (diffHours > 0) return `In ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
      if (diffMinutes > 0) return `In ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
      return 'Very soon';
    } catch {
      return nextRun; // Return the original string if it's not a valid date
    }
  };

  const getBackupTypeInfo = () => {
    const backupType = scheduleInfo?.schedule_config?.backupType || 'incremental';
    const backupTypeLabels = {
      'full': 'Full Backup',
      'incremental': 'Incremental',
      'differential': 'Differential'
    };
    const backupTypeDescriptions = {
      'full': 'Complete system backup',
      'incremental': 'Only changed files since last backup',
      'differential': 'All changes since last full backup'
    };
    
    return {
      type: backupType,
      label: backupTypeLabels[backupType as keyof typeof backupTypeLabels] || 'Unknown',
      description: backupTypeDescriptions[backupType as keyof typeof backupTypeDescriptions] || 'Unknown backup type'
    };
  };

  return (
    <div className="overview-layout overview-container">
      {/* Status Header Bar */}
      <StatusHeaderBar headerStats={headerStats || null} />

      {/* Main Content Area */}
      <div className="overview-content">
        {/* Left Column - Providers */}
        <div className="providers-panel">
        <div className="panel-header">
          <h3>Storage Providers</h3>
          <p className="panel-description">
            Configured backup storage providers
          </p>
        </div>
        
        <div className="provider-list">
          {config?.providers ? Object.entries(config.providers)
            .sort(([a], [b]) => {
              // Apply stable sort order to prevent providers from jumping around
              const sortOrder = ['local', 'backblaze', 'aws_s3', 'google_cloud_storage'];
              const aIndex = sortOrder.indexOf(a);
              const bIndex = sortOrder.indexOf(b);
              
              if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
              }
              
              if (aIndex !== -1) return -1;
              if (bIndex !== -1) return 1;
              
              return a.localeCompare(b);
            })
            .map(([key, provider]) => (
            <Card
              key={key}
              variant={provider.enabled ? 'active' : 'inactive'}
              onClick={() => handleProviderClick(key)}
              className={clickedProvider === key ? 'clicked' : ''}
            >
              <div className="provider-icon">💾</div>
              <div className="provider-info">
                <div className="provider-name">{key}</div>
                <div className="provider-description">
                  {provider.container_type === 'local' ? 'Local NAS Storage' : 
                   provider.container_type === 'aws_s3' ? 'AWS S3' :
                   provider.container_type === 'google_cloud_storage' ? 'Google Cloud Storage' : 
                   provider.container_type === 'backblaze' ? 'Backblaze B2' :
                   provider.container_type || 'Cloud Storage'}
                </div>
                <Badge variant={provider.enabled ? 'success' : 'secondary'} size="small">
                  {provider.enabled ? 'ENABLED' : 'DISABLED'}
                </Badge>
              </div>
            </Card>
          )) : (
            <div className="empty-state">
              <p>No providers configured</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Backup Files */}
      <div className="files-panel">
        <div className="panel-header">
          <h3>Files to Backup</h3>
          <p className="panel-description">
            Files and directories to include in backups
          </p>
        </div>

        <div className="file-list">
          {config?.backup_items && config.backup_items.length > 0 ? (
            config.backup_items.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-info">
                  <span className="file-icon">{getFileEmoji(file)}</span>
                  <div className="file-path">{file}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No files configured for backup</p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Chunk Statistics Section */}
      {chunkStats && chunkStats.enabled && (
        <div className="chunk-stats-section" style={{ marginTop: '2rem', padding: '1rem', background: 'var(--card-background)', borderRadius: '8px' }}>
          <div className="panel-header">
            <h3>Chunked Backup Statistics</h3>
            <p className="panel-description">
              Incremental backup efficiency metrics
            </p>
          </div>
          {loadingChunkStats ? (
            <div>Loading statistics...</div>
          ) : chunkStats.error ? (
            <div style={{ color: 'var(--error-color)' }}>Error loading statistics: {chunkStats.error}</div>
          ) : chunkStats.latest_backup_id ? (
            <div className="chunk-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Chunks</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{chunkStats.total_chunks || 0}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Reused Chunks</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem', color: 'var(--success-color)' }}>{chunkStats.reused_chunks || 0}</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Uploaded</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{chunkStats.uploaded_mb || 0} MB</div>
              </div>
              <div className="metric-card" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Size</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{chunkStats.total_mb || 0} MB</div>
              </div>
              {chunkStats.savings_percent > 0 && (
                <div className="metric-card" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Cost Savings</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem', color: 'var(--success-color)' }}>
                    {chunkStats.savings_percent}%
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No chunked backups yet. Run your first backup to see statistics.
            </div>
          )}
        </div>
      )}

      {/* Installation Manager Section */}
      {installationStatus && onStatusChange && (
        <div className="installation-section">
          <InstallationManager 
            installationStatus={installationStatus} 
            onStatusChange={onStatusChange} 
          />
        </div>
      )}

    </div>
  );
};

export default OverviewTab;
