/**
 * HOMESERVER Repository Card Component
 * Individual repository management card
 */

import React from 'react';
import { Repository } from '../types';
import { Card, Badge, Button, Checkbox } from '../../../components/ui';

interface RepositoryCardProps {
  repository: Repository;
  selected: boolean;
  onToggle: (repository: Repository) => void;
  className?: string;
}

export const RepositoryCard: React.FC<RepositoryCardProps> = ({ 
  repository, 
  selected,
  onToggle,
  className = '' 
}) => {
  const getStatusVariant = (status: string): 'success' | 'warning' | 'info' => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'warning';
      default: return 'info';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '✓';
      case 'inactive': return '⚠';
      default: return '?';
    }
  };

  const formatSize = (size?: number) => {
    if (!size) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let sizeValue = size;
    
    while (sizeValue >= 1024 && unitIndex < units.length - 1) {
      sizeValue /= 1024;
      unitIndex++;
    }
    
    return `${sizeValue.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatLastCommit = (lastCommit?: string) => {
    if (!lastCommit) return 'Unknown';
    
    const date = new Date(lastCommit);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <Card 
      variant={selected ? 'active' : 'default'}
      onClick={() => onToggle(repository)}
      className={className}
    >
      <div className="repository-card-header">
        <div className="repository-card-title">
          <h4>{repository.name}</h4>
          <Badge variant={getStatusVariant(repository.status)} size="small">
            {getStatusIcon(repository.status)} {repository.status}
          </Badge>
        </div>
        <div className="repository-checkbox" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onChange={() => onToggle(repository)}
            size="medium"
          />
        </div>
      </div>

      <div className="repository-card-content">
        <div className="repository-path">
          <strong>Path:</strong> {repository.path}
        </div>
        
        <div className="repository-meta">
          <div className="repository-size">
            <strong>Size:</strong> {formatSize(repository.size)}
          </div>
          <div className="repository-last-commit">
            <strong>Last Commit:</strong> {formatLastCommit(repository.last_commit)}
          </div>
        </div>
      </div>

      <div className="repository-actions">
        <Button 
          variant="secondary"
          size="medium"
          onClick={(e) => {
            e.stopPropagation();
            // TODO: Implement repository details view
          }}
        >
          View Details
        </Button>
      </div>
    </Card>
  );
};
