import React, { useEffect, useCallback, useRef, useState } from 'react';
import './Toast.css';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  id: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onClose?: (id: string) => void;
  pauseOnHover?: boolean;
  dismissOnClick?: boolean;
  extensionCount?: number; // Counter for how many times this toast has been extended
}

const variantIcons = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  variant = 'info',
  duration = 3000,
  onClose,
  pauseOnHover = true,
  dismissOnClick = true,
  extensionCount = 0,
}) => {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const remainingTimeRef = useRef(duration);
  const startTimeRef = useRef<number>();

  // State to indicate when the toast is in the process of exiting
  const [exiting, setExiting] = useState(false);

  const clearToastTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // New function to trigger the exit animation instead of immediate close
  const triggerClose = useCallback(() => {
    if (!exiting) {
      setExiting(true);
      clearToastTimeout();
    }
  }, [exiting, clearToastTimeout]);

  // Start the timeout which now triggers the exit animation
  const startToastTimeout = useCallback((timeoutDuration: number) => {
    clearToastTimeout();
    if (timeoutDuration > 0 && onClose) {
      startTimeRef.current = Date.now();
      timeoutRef.current = setTimeout(() => {
        triggerClose();
      }, timeoutDuration);
    }
  }, [clearToastTimeout, triggerClose, onClose]);

  // Initial timeout setup
  useEffect(() => {
    startToastTimeout(duration);
    return clearToastTimeout;
  }, [duration, startToastTimeout, clearToastTimeout]);

  // Reset timer when duration changes (for extending toast lifetime)
  useEffect(() => {
    // Reset the remaining time to the new duration
    remainingTimeRef.current = duration;
    
    // Restart the timer with the new duration
    startToastTimeout(duration);
    
    // Clear the timeout when component unmounts
    return clearToastTimeout;
  }, [duration, startToastTimeout, clearToastTimeout]);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover && timeoutRef.current) {
      clearToastTimeout();
      remainingTimeRef.current = Math.max(
        0,
        remainingTimeRef.current - (Date.now() - (startTimeRef.current || Date.now()))
      );
    }
  }, [pauseOnHover, clearToastTimeout]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) {
      startToastTimeout(remainingTimeRef.current);
    }
  }, [pauseOnHover, startToastTimeout]);

  // Modified handleClick: trigger the exit animation on click instead of immediate removal.
  const handleClick = useCallback(() => {
    if (dismissOnClick && onClose) {
      clearToastTimeout();
      triggerClose();
    }
  }, [dismissOnClick, onClose, clearToastTimeout, triggerClose]);

  // On exit animation end, call parent's onClose to remove the toast.
  const handleAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
      // Check if the exit animation just finished
      if (exiting && e.animationName === 'toast-slide-out') {
         if (onClose) onClose(id);
      }
  }, [exiting, onClose, id]);

  // Only show the extension count if it's greater than 0
  const showExtensionCount = extensionCount > 0;

  return (
    <div
      className={`toast ${variant} ${exiting ? 'toast-exit' : ''}`}
      role="alert"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onAnimationEnd={handleAnimationEnd} // Add listener for the exit animation finish
      style={{ 
        cursor: dismissOnClick ? 'pointer' : 'default',
      }}
    >
      <span className="toast-icon">{variantIcons[variant]}</span>
      <span className="toast-message">
        {showExtensionCount && <span className="toast-extension-count">(×{extensionCount + 1}) </span>}
        {message}
      </span>
    </div>
  );
};