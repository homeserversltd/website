import React from 'react';
import { HeaderStats } from '../types';

interface StatusHeaderBarProps {
  headerStats: HeaderStats | null;
  loading?: boolean;
}

export const StatusHeaderBar: React.FC<StatusHeaderBarProps> = ({ headerStats, loading = false }) => {
  // Default values for when headerStats is null or missing data
  const defaultStats = {
    last_backup: "Never",
    next_backup: "Not scheduled", 
    backup_items_count: 0,
    last_backup_size: "Unknown"
  };

  const stats = headerStats || defaultStats;

  if (loading) {
    return (
      <div className="status-header-bar">
        <div className="status-metrics">
          <div className="metric-item loading">
            <div className="metric-label">Loading...</div>
            <div className="metric-value">⟳</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="status-header-bar">
      <div className="status-metrics">
        <div className="metric-item">
          <div className="metric-label">Last Backup</div>
          <div className="metric-value">
            {stats.last_backup}
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-label">Next Backup</div>
          <div className="metric-value">
            {stats.next_backup}
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-label">Items</div>
          <div className="metric-value">
            {stats.backup_items_count}
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-label">Size</div>
          <div className="metric-value">
            {stats.last_backup_size}
          </div>
        </div>

      </div>
    </div>
  );
};

export default StatusHeaderBar;
