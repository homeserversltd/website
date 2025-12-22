import { useCallback } from 'react';
import { showToast, dismissToast, dismissAllToasts } from '../components/Popup/PopupManager';
import type { ToastVariant } from '../components/Toast';

/**
 * Configuration options for toast notifications
 */
export interface ToastOptions {
  /** 
   * Duration in milliseconds for which the toast will be displayed
   * @default 3000 (3 seconds)
   */
  duration?: number;

  /**
   * Whether to pause the toast timer when hovering over it
   * @default true
   */
  pauseOnHover?: boolean;

  /**
   * Whether to dismiss the toast when clicking on it
   * @default true
   */
  dismissOnClick?: boolean;

  /**
   * Position in the toast stack (higher numbers appear on top)
   * @default 0
   */
  priority?: number;
  
  /**
   * Whether to extend an existing toast with the same message instead of creating a new one
   * @default true
   */
  extendExisting?: boolean;
}

/**
 * Default options for toast notifications
 */
const DEFAULT_OPTIONS: Required<ToastOptions> = {
  duration: 3000,
  pauseOnHover: true,
  dismissOnClick: true,
  priority: 0,
  extendExisting: true,
};

/**
 * Hook for displaying toast notifications with different variants
 * 
 * Provides a simple and consistent way to show user notifications
 * across the application with various severity levels
 * 
 * @returns Object with methods for different toast notification types
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const toast = useToast();
 * 
 *   const handleSuccess = () => {
 *     // Show a success toast
 *     const toastId = toast.success('Operation completed successfully');
 *     
 *     // Later, if needed:
 *     toast.dismiss(toastId);
 *   };
 * 
 *   const handleError = () => {
 *     // Show an error toast with custom options
 *     toast.error('Something went wrong', {
 *       duration: 5000,
 *       dismissOnClick: false,
 *       priority: 1 // Higher priority toasts appear on top
 *     });
 *   };
 * 
 *   const handleMultiple = () => {
 *     // Show multiple toasts
 *     toast.info('Saving changes...');
 *     setTimeout(() => {
 *       toast.success('Changes saved!', { priority: 1 });
 *     }, 1000);
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handleSuccess}>Trigger Success</button>
 *       <button onClick={handleError}>Trigger Error</button>
 *       <button onClick={handleMultiple}>Multiple Toasts</button>
 *       <button onClick={toast.dismissAll}>Clear All</button>
 *     </div>
 *   );
 * };
 * ```
 */
export const useToast = () => {
  /**
   * Show a toast notification with the specified variant and options
   */
  const show = useCallback((message: string, variant: ToastVariant, options?: ToastOptions) => {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    return showToast({
      message,
      variant,
      ...mergedOptions,
    });
  }, []);

  /**
   * Display a success toast notification
   * 
   * @param message - The message to display in the toast
   * @param options - Optional configuration for the toast
   * @returns The ID of the created toast
   */
  const success = useCallback((message: string, options?: ToastOptions | number) => {
    const toastOptions = typeof options === 'number' ? { duration: options } : options;
    return show(message, 'success', toastOptions);
  }, [show]);

  /**
   * Display an error toast notification
   * 
   * @param message - The error message to display in the toast
   * @param options - Optional configuration for the toast
   * @returns The ID of the created toast
   */
  const error = useCallback((message: string, options?: ToastOptions | number) => {
    const toastOptions = typeof options === 'number' ? { duration: options } : options;
    return show(message, 'error', toastOptions);
  }, [show]);

  /**
   * Display an informational toast notification
   * 
   * @param message - The informational message to display in the toast
   * @param options - Optional configuration for the toast
   * @returns The ID of the created toast
   */
  const info = useCallback((message: string, options?: ToastOptions | number) => {
    const toastOptions = typeof options === 'number' ? { duration: options } : options;
    return show(message, 'info', toastOptions);
  }, [show]);

  /**
   * Display a warning toast notification
   * 
   * @param message - The warning message to display in the toast
   * @param options - Optional configuration for the toast
   * @returns The ID of the created toast
   */
  const warning = useCallback((message: string, options?: ToastOptions | number) => {
    const toastOptions = typeof options === 'number' ? { duration: options } : options;
    return show(message, 'warning', toastOptions);
  }, [show]);

  /**
   * Dismiss a specific toast by its ID
   * 
   * @param id - The ID of the toast to dismiss
   */
  const dismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  /**
   * Dismiss all currently visible toasts
   */
  const dismissAll = useCallback(() => {
    dismissAllToasts();
  }, []);

  return {
    show,
    success,
    error,
    info,
    warning,
    dismiss,
    dismissAll
  };
};