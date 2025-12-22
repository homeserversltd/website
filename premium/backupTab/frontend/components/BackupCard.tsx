/**
 * HOMESERVER Backup Card Component
 * Individual backup operation card
 */

import React from 'react';
import { BackupOperation, Repository } from '../types';
import { Card, Badge, Button, ProgressBar } from '../../../components/ui';

interface BackupCardProps {
  operation: BackupOperation;
  repositories: Repository[];
  onAction?: (operation: BackupOperation) => void;
  className?: string;
}

export const BackupCard: React.FC<BackupCardProps> = ({ 
  operation, 
  repositories,
  onAction, 
  className = '' 
}) => {
  const getStatusVariant = (status: string): 'success' | 'danger' | 'warning' | 'info' => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'running': return 'warning';
      default: return 'info';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'running': return '⟳';
      default: return '⏸';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = end.getTime() - start.getTime();
    
    if (duration < 60000) {
      return `${Math.round(duration / 1000)}s`;
    } else if (duration < 3600000) {
      return `${Math.round(duration / 60000)}m`;
    } else {
      return `${Math.round(duration / 3600000)}h`;
    }
  };

  const getRepositoryNames = () => {
    return repositories
      .filter(repo => operation.repositories.includes(repo.name))
      .map(repo => repo.name)
      .join(', ');
  };

  const cardVariant = operation.status === 'failed' ? 'error' : operation.status === 'completed' ? 'active' : 'default';

  return (
    <Card variant={cardVariant} className={className}>
      <div className="backup-card-header">
        <div className="backup-card-title">
          <h3>{operation.type.charAt(0).toUpperCase() + operation.type.slice(1)} Backup</h3>
          <Badge variant={getStatusVariant(operation.status)} size="small">
            {getStatusIcon(operation.status)} {operation.status}
          </Badge>
        </div>
        <div className="backup-card-meta">
          <span className="timestamp">
            {new Date(operation.start_time).toLocaleString()}
          </span>
          {operation.end_time && (
            <span className="duration">
              Duration: {formatDuration(operation.start_time, operation.end_time)}
            </span>
          )}
        </div>
      </div>

      <div className="backup-card-content">
        <div className="backup-repositories">
          <strong>Repositories:</strong> {getRepositoryNames()}
        </div>

        {operation.progress !== undefined && (
          <div className="backup-progress">
            <ProgressBar
              value={operation.progress}
              variant="default"
              size="medium"
              showPercentage={true}
            />
          </div>
        )}

        {operation.output && (
          <div className="backup-output">
            <details>
              <summary>Output</summary>
              <pre>{operation.output}</pre>
            </details>
          </div>
        )}

        {operation.error && (
          <div className="backup-error">
            <strong>Error:</strong> {operation.error}
          </div>
        )}
      </div>

      {onAction && (
        <div className="backup-actions">
          <Button 
            variant="primary"
            size="medium"
            onClick={() => onAction(operation)}
            disabled={operation.status === 'running'}
          >
            {operation.status === 'running' ? 'Running...' : 'View Details'}
          </Button>
        </div>
      )}
    </Card>
  );
};
