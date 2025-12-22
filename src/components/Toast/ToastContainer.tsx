import React from 'react';
import { Toast, ToastProps } from './index';
import './ToastContainer.css';

interface ToastContainerProps {
  toasts: (ToastProps & { extensionCount?: number })[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          extensionCount={toast.extensionCount || 0}
          onClose={onClose}
        />
      ))}
    </div>
  );
};