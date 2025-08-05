import React from 'react';
import { UpdateProgressModalProps, SystemActionModalProps } from '../../types';

export const UpdateProgressModal: React.FC<UpdateProgressModalProps> = ({ output, onCopy }) => {
  return (
    <div className="update-progress-modal">
      <div className="update-logs">
        {output.map((line, index) => (
          <div key={index} className="update-log-line">{line}</div>
        ))}
      </div>
      <button onClick={onCopy} className="copy-button">Copy Logs</button>
    </div>
  );
};

export const SystemActionModal: React.FC<SystemActionModalProps> = ({ action }) => {
  return (
    <div className="system-action-modal">
      <div className="system-action-message">
        {action === 'restart' && 'Restarting the system...'}
        {action === 'shutdown' && 'Shutting down the system...'}
        {action === 'hardreset' && 'Resetting web services...'}
      </div>
    </div>
  );
};

// Export LogViewerModal
export { LogViewerModal } from './LogViewerModal';
export { UpdateManagerModal } from './UpdateManagerModal'; 