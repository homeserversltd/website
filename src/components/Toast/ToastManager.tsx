import React from 'react';
import { create } from 'zustand';
import { Toast, ToastProps, ToastVariant } from './index';

interface ToastState {
  toasts: ToastProps[];
  addToast: (message: string, options?: Partial<Omit<ToastProps, 'id' | 'message' | 'onClose'>>) => string;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, options = {}) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          message,
          variant: options.variant || 'info',
          duration: options.duration || 3000,
          onClose: (toastId: string) => useToastStore.getState().removeToast(toastId),
        },
      ],
    }));
    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));

export const ToastManager: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
};