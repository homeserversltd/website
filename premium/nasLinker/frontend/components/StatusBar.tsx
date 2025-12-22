import React from 'react';
import './StatusBar.css';

interface StatusBarProps {
  selectedCount: number;
  onRename: () => void;
  onClearSelection: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  selectedCount,
  onRename,
  onClearSelection
}) => {
  return (
    <div className="status-bar">
      <div className="status-bar-status">
        {selectedCount > 0 ? `${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected` : 'No items selected'}
      </div>
      <div className="status-bar-actions">
        <button
          className="status-bar-btn rename-btn"
          onClick={onRename}
          disabled={selectedCount === 0}
          type="button"
        >
          Rename
        </button>
        {selectedCount > 0 && (
          <button
            className="status-bar-btn clear-btn"
            onClick={onClearSelection}
            type="button"
          >
            Clear Selection
          </button>
        )}
      </div>
    </div>
  );
};
