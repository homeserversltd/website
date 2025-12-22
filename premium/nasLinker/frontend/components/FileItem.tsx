import React from 'react';
import { FileEntry } from '../types';
import './FileItem.css';

interface FileItemProps {
  entry: FileEntry;
  isSelected: boolean;
  onSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  entry,
  isSelected,
  onSelect,
  onDoubleClick,
  onDelete,
  onRename
}) => {
  const handleClick = (e: React.MouseEvent) => {
    // Don't handle clicks on checkbox, actions, or icon/name (they have their own handlers)
    const target = e.target as HTMLElement;
    if (target.closest('.file-item-checkbox') || 
        target.closest('.file-item-actions') ||
        target.closest('.file-item-icon') ||
        target.closest('.file-item-name')) {
      return;
    }
    
    if (e.detail === 2) {
      // Double click - navigate for directories
      if (entry.is_dir) {
        onDoubleClick(entry.path);
      }
    } else {
      // Single click - toggle selection
      onSelect(entry.path);
    }
  };

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.is_dir) {
      onDoubleClick(entry.path);
    }
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.is_dir) {
      onDoubleClick(entry.path);
    } else {
      // For files, clicking name selects it
      onSelect(entry.path);
    }
  };

  const formatSize = (bytes: number | null): string => {
    if (bytes === null) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getIcon = (): string => {
    if (entry.is_dir) {
      return '📁';
    }
    if (entry.is_hardlink) {
      return '🔗';
    }
    return '📄';
  };

  return (
    <div
      className={`file-item ${isSelected ? 'selected' : ''} ${entry.is_dir ? 'directory' : 'file'} ${entry.is_hardlink ? 'hardlink' : ''}`}
      onClick={handleClick}
      onDoubleClick={() => entry.is_dir && onDoubleClick(entry.path)}
    >
      <div className="file-item-checkbox">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(entry.path)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="file-item-icon" onClick={handleIconClick} style={{ cursor: entry.is_dir ? 'pointer' : 'default' }}>
        {getIcon()}
      </div>
      <div className="file-item-content">
        <div className="file-item-name" title={entry.name} onClick={handleNameClick} style={{ cursor: entry.is_dir ? 'pointer' : 'default' }}>
          {entry.name}
        </div>
        <div className="file-item-meta">
          {entry.is_hardlink && (
            <span className="file-item-badge hardlink-badge">
              Hardlink ({entry.nlink} links)
            </span>
          )}
          {entry.is_dir && (
            <span className="file-item-badge directory-badge">Directory</span>
          )}
        </div>
        <div className="file-item-details">
          {!entry.is_dir && (
            <span className="file-item-size">{formatSize(entry.size)}</span>
          )}
          <span className="file-item-date">{formatDate(entry.modified)}</span>
        </div>
      </div>
      {(onDelete || onRename) && (
        <div className="file-item-actions" onClick={(e) => e.stopPropagation()}>
          {onRename && entry.is_dir && (
            <button
              className="file-item-action-btn"
              onClick={() => onRename(entry.path)}
              title="Rename"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              className="file-item-action-btn"
              onClick={() => onDelete(entry.path)}
              title="Delete"
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  );
};

