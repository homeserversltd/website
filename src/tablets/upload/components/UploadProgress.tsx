import React from 'react';
import { UploadProgress as UploadProgressType } from '../types';
import '../upload.css';

interface UploadProgressProps {
  upload: UploadProgressType;
  onRemove: (filename: string) => void;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  upload,
  onRemove,
}) => {
  const formatSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return `${formatSize(bytesPerSecond)}/s`;
  };

  const getStatusIcon = () => {
    switch (upload.status) {
      case 'pending':
        return '⏳';
      case 'uploading':
        return '📤';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '❓';
    }
  };

  const getStatusColor = () => {
    switch (upload.status) {
      case 'pending':
        return '#f59e0b'; // Amber
      case 'uploading':
        return '#3b82f6'; // Blue
      case 'completed':
        return '#10b981'; // Green
      case 'error':
        return '#ef4444'; // Red
      default:
        return '#6b7280'; // Gray
    }
  };

  return (
    <div className={`upload-progress ${upload.status}`}>
      <div className="upload-header">
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="filename">{upload.filename}</span>
        <button
          className="remove-button"
          onClick={() => onRemove(upload.filename)}
          aria-label="Remove upload"
        >
          ×
        </button>
      </div>

      <div className="progress-section">
        <div className="progress-bar-container">
          <div 
            className="progress-bar"
            style={{ 
              width: `${upload.progress}%`,
              backgroundColor: getStatusColor(),
              transition: 'width 0.3s ease-in-out'
            }}
          >
            <span className="progress-text">
              {upload.progress.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="upload-stats">
          <span className="size">
            {formatSize(upload.uploaded)} / {formatSize(upload.total)}
          </span>
          {upload.status === 'uploading' && (
            <span className="speed">
              {formatSpeed(upload.speed)}
            </span>
          )}
        </div>

        {upload.status === 'error' && (
          <div className="error-message">
            {upload.error}
          </div>
        )}
      </div>
    </div>
  );
};