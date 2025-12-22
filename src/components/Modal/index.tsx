import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  useFloating,
  useInteractions,
  useRole,
  FloatingPortal,
  FloatingOverlay,
  FloatingFocusManager,
  shift,
  size,
  autoUpdate,
} from '@floating-ui/react';
import './Modal.css';
import { useWindowSize } from '../../hooks/useWindowSize';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  onConfirm?: () => Promise<boolean>;
  hideActions?: boolean;
  onCleanup?: () => void;
  initialFocus?: number;
  stayOpenOnFallback?: boolean;
  'data-stay-open'?: string;
  'data-popup-id'?: string;
  submitOnEnter?: boolean;
}

// Global focus management utilities
let previouslyFocusedElement: HTMLElement | null = null;
let modalCount = 0;

const storePreviousFocus = () => {
  // Only store the first modal's previous focus
  if (modalCount === 0) {
    previouslyFocusedElement = document.activeElement as HTMLElement;
  }
  modalCount++;
};

const restorePreviousFocus = () => {
  modalCount--;
  // Only restore focus when all modals are closed
  if (modalCount === 0 && previouslyFocusedElement) {
    try {
      // Ensure the element is still in the DOM and focusable
      if (document.contains(previouslyFocusedElement) && 
          typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    } catch (error) {
      // Silent error handling
    } finally {
      previouslyFocusedElement = null;
    }
  }
};

// Update the FormElement type with more specific typing
interface FormProps {
  onSubmit?: (e: React.FormEvent) => Promise<boolean> | Promise<void> | void;
  children?: React.ReactNode;
  [key: string]: any; // Allow other form props
}

type FormElement = React.ReactElement<FormProps, 'form'>;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  hideActions,
  onCleanup,
  initialFocus,
  stayOpenOnFallback,
  'data-stay-open': dataStayOpen,
  'data-popup-id': dataPopupId,
  submitOnEnter = false  // Default to false to change default behavior
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [modalDimensions, setModalDimensions] = useState({ width: 0, height: 0 });
  const [contentOverflows, setContentOverflows] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  
  // Global focus management - store focus when modal opens
  useEffect(() => {
    if (isOpen) {
      storePreviousFocus();
      
      // Force focus away from any background elements immediately
      // This prevents the ARIA warning about focused elements under aria-hidden
      if (document.activeElement && document.activeElement !== document.body) {
        (document.activeElement as HTMLElement).blur();
      }
      
      return () => {
        restorePreviousFocus();
      };
    }
  }, [isOpen]);
  
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) onClose();
  }, [onClose]);

  // Handle touch events for better mobile scrolling - moved up to top level
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (contentRef.current && contentOverflows) {
      // Allow propagation to handle scrolling naturally
    }
  }, [contentOverflows]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (contentRef.current && contentOverflows) {
      setIsScrolling(true);
    }
  }, [contentOverflows]);

  const handleTouchEnd = useCallback(() => {
    // Reset scrolling state after a delay
    setTimeout(() => {
      setIsScrolling(false);
    }, 100);
  }, []);

  const { refs, context, update } = useFloating({
    open: isOpen,
    onOpenChange: handleOpenChange,
    middleware: [
      shift({ padding: 8 }),
      size({
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.min(480, availableWidth - 16)}px`,
            maxHeight: `${availableHeight - 16}px`,
          });
        },
        padding: 8,
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Create a callback ref that combines both refs
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      // Set the floating ref
      refs.setFloating(node);
      // Set our local ref
      modalRef.current = node;
    },
    [refs.setFloating]
  );

  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([role]);

  const { width, height, zoom } = useWindowSize();
  const isMobile = width <= 480;

  // Check if content overflows and needs scrolling
  const checkContentOverflow = useCallback(() => {
    if (contentRef.current) {
      const { scrollHeight, clientHeight } = contentRef.current;
      setContentOverflows(scrollHeight > clientHeight);
    }
  }, []);

  // Update modal position and size when window size or zoom changes
  useEffect(() => {
    if (isOpen && update) {
      update();
      
      // Force recalculation of modal dimensions
      if (modalRef.current) {
        setModalDimensions({
          width: modalRef.current.offsetWidth,
          height: modalRef.current.offsetHeight,
        });
      }
      
      // Check if content needs scrolling
      checkContentOverflow();
    }
  }, [isOpen, update, width, height, zoom, checkContentOverflow]);

  // Measure modal dimensions on mount and when content changes
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (modalRef.current) {
          setModalDimensions({
            width: modalRef.current.offsetWidth,
            height: modalRef.current.offsetHeight,
          });
          update();
          checkContentOverflow();
        }
      });
      
      resizeObserver.observe(modalRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [isOpen, update, children, checkContentOverflow]);

  const handleConfirm = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (onConfirm) {
      const success = await onConfirm();
      if (success) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [onConfirm, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && submitOnEnter) {
        const activeElement = document.activeElement;
        
        // Only ignore Enter for multiline inputs
        if (activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        
        // For single-line inputs, allow Enter to submit
        e.preventDefault();
        handleConfirm();
      }
      
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isOpen, handleConfirm, onClose, submitOnEnter]);

  useEffect(() => {
    return () => {
      if (onCleanup) {
        onCleanup();
      }
    };
  }, [onCleanup]);

  // Enhanced close handler that ensures proper focus restoration
  const handleClose = useCallback(() => {
    if (onCleanup) {
      onCleanup();
    }
    onClose();
  }, [onClose, onCleanup]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Update the enhancedChildren logic to handle form submissions
  const enhancedChildren = React.Children.map(children, child => {
    if (React.isValidElement(child) && 
        typeof child.type === 'string' && 
        child.type === 'form') {
      
      const formElement = child as FormElement;
      
      if (!formElement.props.onSubmit) {
        return React.cloneElement(formElement, {
          onSubmit: async (e: React.FormEvent) => {
            e.preventDefault();
            await handleConfirm(e);
            return true;
          }
        });
      }
    }
    return child;
  });

  return (
    <FloatingPortal>
      <FloatingOverlay 
        className="modal-overlay"
        lockScroll
        onClick={!isScrolling ? handleOverlayClick : undefined}
      >
        <FloatingFocusManager context={context} initialFocus={initialFocus}>
          <div
            ref={setRefs}
            className={`modal ${isMobile ? 'mobile-modal' : ''} ${contentOverflows ? 'content-scrollable' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
            onClick={e => e.stopPropagation()}
            data-stay-open={dataStayOpen}
            data-popup-id={dataPopupId}
            style={{
              // Ensure the modal adjusts to zoom level
              transform: `scale(1)`,
              transformOrigin: 'center',
            }}
            {...getFloatingProps()}
          >
            {title && <div id="modal-title" className="modal-title">{title}</div>}
            <div 
              ref={contentRef}
              className="modal-content"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {enhancedChildren}
            </div>
            {!hideActions && (
              <div className="modal-buttons">
                <button 
                  onClick={() => handleConfirm()}
                  className="confirm-button"
                >
                  Confirm
                </button>
                <button 
                  onClick={handleClose}
                  className="cancel-button"
                >
                  Cancel
                </button>
              </div>
            )}
            <button 
              className="modal-close" 
              onClick={handleClose}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
};
