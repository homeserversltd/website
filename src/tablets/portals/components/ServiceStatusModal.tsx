import React from 'react';

interface ServiceStatusModalProps {
  statusText: string;
  onCopy: () => void;
}

export const ServiceStatusModal: React.FC<ServiceStatusModalProps> = ({ statusText, onCopy }) => (
  <div className="service-status-modal">
    <pre className="service-status-content">{statusText}</pre>
    <button className="copy-button" onClick={onCopy}>
      Copy to Clipboard
    </button>
  </div>
); 