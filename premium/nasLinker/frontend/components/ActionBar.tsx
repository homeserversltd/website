import React from 'react';
import './ActionBar.css';

interface ActionBarProps {
  currentPath: string;
  basePath: string;
  onNewDirectory: () => void;
  onRefresh: () => void;
  canGoUp: boolean;
  onGoUp: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  currentPath,
  basePath,
  onNewDirectory,
  onRefresh,
  canGoUp,
  onGoUp
}) => {
  return (
    <div className="action-bar">
      <div className="action-bar-left">
        {canGoUp && (
          <button
            className="action-btn"
            onClick={onGoUp}
            type="button"
            title="Go up one directory"
          >
            ⬆️ Up
          </button>
        )}
        <button
          className="action-btn"
          onClick={onRefresh}
          type="button"
          title="Refresh directory"
        >
          🔄 Refresh
        </button>
      </div>
      <div className="action-bar-right">
        <button
          className="action-btn primary"
          onClick={onNewDirectory}
          type="button"
          title="Create new directory"
        >
          ➕ New Directory
        </button>
      </div>
    </div>
  );
};

