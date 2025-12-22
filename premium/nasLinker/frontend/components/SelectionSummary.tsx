import React from 'react';
import './SelectionSummary.css';

interface SelectionSummaryProps {
  selectedCount: number;
  onClear: () => void;
  onDeploy: () => void;
}

export const SelectionSummary: React.FC<SelectionSummaryProps> = ({
  selectedCount,
  onClear,
  onDeploy
}) => {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="selection-summary">
      <div className="selection-summary-content">
        <span className="selection-count">
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <div className="selection-actions">
          <button
            className="selection-btn clear-btn"
            onClick={onClear}
            type="button"
          >
            Clear Selection
          </button>
          <button
            className="selection-btn deploy-btn"
            onClick={onDeploy}
            type="button"
          >
            Deploy (Hardlink)
          </button>
        </div>
      </div>
    </div>
  );
};

