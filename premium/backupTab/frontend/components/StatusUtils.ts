/**
 * HOMESERVER Backup Status Utilities
 * Shared utility functions for status handling
 */

export const getStatusColor = (systemStatus: string): string => {
  switch (systemStatus) {
    case 'configured': return 'success';
    case 'partial': return 'warning';
    case 'not_configured': return 'error';
    default: return 'info';
  }
};

export const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'completed': return '✓';
    case 'failed': return '✗';
    case 'running': return '⟳';
    case 'active': return '✓';
    case 'inactive': return '⚠';
    default: return '?';
  }
};

export const formatDuration = (startTime: string, endTime?: string): string => {
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

export const formatSize = (size?: number): string => {
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

export const formatLastCommit = (lastCommit?: string): string => {
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