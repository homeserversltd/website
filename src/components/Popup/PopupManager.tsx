import React from 'react';
import { create } from 'zustand';
import { Modal } from '../Modal';
import { ToastContainer } from '../Toast/ToastContainer';
import { FloatingPortal } from '@floating-ui/react';

// Define all possible popup types
type PopupType = 'modal' | 'toast';

// Base interface for all popups
interface BasePopupItem {
  id: string;
  type: PopupType;
}

// Type-specific interfaces
interface ModalPopupItem extends BasePopupItem {
  type: 'modal';
  title?: string;
  children: React.ReactNode | (() => React.ReactNode);
  onConfirm?: () => Promise<boolean>;
  hideActions?: boolean;
  onClose?: () => void;
  initialFocus?: number;
  submitOnEnter?: boolean;  // Controls whether Enter key triggers confirmation
}

interface ToastPopupItem extends BasePopupItem {
  type: 'toast';
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  pauseOnHover?: boolean;
  dismissOnClick?: boolean;
  priority?: number;
  extensionCount?: number; // Counter for how many times this toast has been extended
}

// Union type of all popup items
type PopupItem = ModalPopupItem | ToastPopupItem;

// Store interface
interface PopupStore {
  popups: PopupItem[];
  addPopup: (popup: Omit<PopupItem, 'id'>) => string;
  updateToast: (id: string, updates: Partial<Omit<ToastPopupItem, 'id' | 'type'>>) => void;
  removePopup: (id: string) => void;
  removeAllToasts: () => void;
}

// Create the store
// Export the usePopupStore for usage in other files
export const usePopupStore = create<PopupStore>((set, get) => ({
  popups: [],
  addPopup: (popup) => {
    const id = Math.random().toString(36).substr(2, 9);
    set((state) => {
      // For toasts, sort by priority
      if (popup.type === 'toast') {
        const newPopups = [...state.popups];
        const insertIndex = newPopups.findIndex(
          (p) => p.type === 'toast' && (p as ToastPopupItem).priority! < (popup as ToastPopupItem).priority!
        );
        
        // Create the toast item with proper typing
        const toastItem: ToastPopupItem = {
          ...popup as Omit<ToastPopupItem, 'id'>,
          id,
          extensionCount: (popup as any).extensionCount !== undefined ? (popup as any).extensionCount : 0
        };
        
        if (insertIndex === -1) {
          newPopups.push(toastItem);
        } else {
          newPopups.splice(insertIndex, 0, toastItem);
        }
        return { popups: newPopups };
      }
      // For other types, just append
      return {
        popups: [...state.popups, { ...popup, id } as PopupItem],
      };
    });
    return id;
  },
  updateToast: (id: string, updates: Partial<Omit<ToastPopupItem, 'id' | 'type'>>) => {
    set((state) => ({
      popups: state.popups.map((popup) => 
        popup.id === id && popup.type === 'toast'
          ? { ...popup, ...updates } as PopupItem
          : popup
      ),
    }));
  },
  removePopup: (id) => {
    set((state) => ({
      popups: state.popups.filter((popup) => popup.id !== id),
    }));
  },
  removeAllToasts: () => {
    set((state) => ({
      popups: state.popups.filter((popup) => popup.type !== 'toast'),
    }));
  },
}));

// Function to find an existing toast with the same message
const findExistingToast = (message: string, variant?: string): string | null => {
  const state = usePopupStore.getState();
  const existingToast = state.popups.find(
    (popup) => 
      popup.type === 'toast' && 
      (popup as ToastPopupItem).message === message &&
      (variant === undefined || (popup as ToastPopupItem).variant === variant)
  );
  return existingToast ? existingToast.id : null;
};

// Function to update an existing toast
export const updateToast = (id: string, updates: Partial<Omit<ToastPopupItem, 'id' | 'type'>>) => {
  usePopupStore.getState().updateToast(id, updates as Partial<Omit<ToastPopupItem, 'id' | 'type'>>);
  return id;
};

// Export helper functions for showing popups
export const showModal = (modalProps: Omit<ModalPopupItem, 'id' | 'type'>) => {
  return usePopupStore.getState().addPopup({
    type: 'modal',
    ...modalProps,
    submitOnEnter: modalProps.submitOnEnter ?? false // Provide default value
  } as ModalPopupItem);
};

export const showToast = (toastProps: Omit<ToastPopupItem, 'id' | 'type'>) => {
  // Check if a toast with the same message already exists
  const existingToastId = findExistingToast(toastProps.message, toastProps.variant);
  
  if (existingToastId) {
    // Get the existing toast to access its current extension count
    const state = usePopupStore.getState();
    const existingToast = state.popups.find(popup => popup.id === existingToastId) as ToastPopupItem | undefined;
    
    // If it exists, update it with the new duration and increment the extension count
    return updateToast(existingToastId, {
      ...toastProps,
      // Reset the toast's timer by updating its duration
      duration: toastProps.duration,
      // Increment the extension count
      extensionCount: (existingToast?.extensionCount || 0) + 1
    });
  }
  
  // If no existing toast, create a new one with extension count of 0
  return usePopupStore.getState().addPopup({
    type: 'toast',
    ...toastProps,
    extensionCount: 0
  } as Omit<ToastPopupItem, 'id'> & { extensionCount: number });
};

export const dismissToast = (id: string) => {
  usePopupStore.getState().removePopup(id);
};

export const dismissAllToasts = () => {
  usePopupStore.getState().removeAllToasts();
};

export const closeModal = () => {
  const state = usePopupStore.getState();
  const modalPopups = state.popups.filter(p => p.type === 'modal');
  if (modalPopups.length > 0) {
    state.removePopup(modalPopups[modalPopups.length - 1].id);
  }
};

/**
 * Closes all open modal dialogs
 * Useful for system events like fallback activation or critical errors
 */
export const closeAllModals = () => {
  const state = usePopupStore.getState();
  const modalPopups = state.popups.filter(p => p.type === 'modal');
  
  modalPopups.forEach(popup => {
    try {
      if (popup.type === 'modal') {
        const content = popup.children;
        
        // If the content is a React element
        if (React.isValidElement(content)) {
          const componentType = content.type as any;
          
          // First, check if it's the SyncResultsModal by display name
          if (componentType && 
              ((typeof componentType === 'function' && componentType.name === 'SyncResultsModal') ||
               (componentType.displayName === 'SyncResultsModal'))) {
            return; // Skip removing this popup
          }
          
          // Then check for data-stay-open attribute using type assertion
          const props = content.props as Record<string, any>;
          if (props && props['data-stay-open'] === 'true') {
            return; // Skip removing this popup
          }
          
          // Check for stayOpenOnFallback prop
          if (props && props.stayOpenOnFallback === true) {
            return; // Skip removing this popup
          }
        }
      }
    } catch (error) {
      console.error('[PopupManager] Error checking for stay-open flags:', error);
    }
    
    // Remove the popup if no stayOpenOnFallback flag was found
    state.removePopup(popup.id);
  });
};

// LiveModalContent Component to throttle live updates for modal children.
interface LiveModalContentProps {
  render: () => React.ReactNode;
  tick: number;
  popupId: string;
}

const LiveModalContent: React.FC<LiveModalContentProps> = ({ render, tick, popupId }) => {
  const [content, setContent] = React.useState(render());

  React.useEffect(() => {
    if (tick % 1 === 0) {
      const newContent = render();
      setContent(newContent);
    }
  }, [tick, render, popupId]);

  return <>{content}</>;
};

// The PopupManager component
export const PopupManager: React.FC = () => {
  const popups = usePopupStore((state) => state.popups);
  const removePopup = usePopupStore((state) => state.removePopup);
  
  // Tick counter state – incremented every second.
  // The LiveModalContent component updates its displayed content only when tick % 2 === 0.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000); // tick every 1 second (adjust if necessary)
    return () => clearInterval(interval);
  }, []);

  // Listen for fallback activation events and close all modals
  React.useEffect(() => {
    // The closeAllModals function is defined above and already handles
    // checking for modals that should stay open, so we can use it directly
    const handleFallbackActivate = () => {
      closeAllModals();
    };
    
    const handleFallbackDeactivate = () => {
      // console.log('[PopupManager] Fallback deactivated');
    };

    window.addEventListener('fallback-activate', handleFallbackActivate);
    window.addEventListener('fallback-deactivate', handleFallbackDeactivate);
    
    return () => {
      window.removeEventListener('fallback-activate', handleFallbackActivate);
      window.removeEventListener('fallback-deactivate', handleFallbackDeactivate);
    };
  }, []);

  // Memoize the filtered arrays to prevent unnecessary re-renders
  const modalPopups = React.useMemo(
    () => popups.filter((p): p is ModalPopupItem => p.type === 'modal'),
    [popups]
  );

  const toastPopups = React.useMemo(
    () => popups.filter((p): p is ToastPopupItem => p.type === 'toast'),
    [popups]
  );

  // Memoize the close handler
  const handleClose = React.useCallback((id: string) => {
    const popup = popups.find(p => p.id === id);
    if (popup?.type === 'modal' && popup.onClose) {
      popup.onClose();
    }
    removePopup(id);
  }, [popups, removePopup]);

  return (
    <FloatingPortal>
      {/* Only render modals if they exist */}
      {modalPopups.map((popup) => {
        // Check for SyncResultsModal and add data-stay-open attribute for direct DOM access
        let shouldAddStayOpenAttr = false;
        
        if (React.isValidElement(popup.children)) {
          const element = popup.children as React.ReactElement;
          const componentType = element.type as any;
          
          // Check if this is a SyncResultsModal
          if (componentType && 
              ((typeof componentType === 'function' && componentType.name === 'SyncResultsModal') || 
               (componentType.displayName === 'SyncResultsModal'))) {
            shouldAddStayOpenAttr = true;
          }
          
          // Also check props for stayOpenOnFallback flag
          const props = element.props as Record<string, any>;
          if (props && props.stayOpenOnFallback === true) {
            shouldAddStayOpenAttr = true;
          }
        }
        
        return (
          <Modal
            key={popup.id}
            isOpen={true}
            onClose={() => handleClose(popup.id)}
            title={popup.title}
            onConfirm={popup.onConfirm}
            hideActions={popup.hideActions}
            initialFocus={popup.initialFocus}
            data-popup-id={popup.id}
            data-stay-open={shouldAddStayOpenAttr ? 'true' : 'false'}
            stayOpenOnFallback={shouldAddStayOpenAttr}
            submitOnEnter={popup.submitOnEnter}
          >
            {typeof popup.children === 'function'
              ? <LiveModalContent render={popup.children} tick={tick} popupId={popup.id} />
              : popup.children}
          </Modal>
        );
      })}

      {/* Render all toasts in the container */}
      {toastPopups.length > 0 && (
        <ToastContainer
          toasts={toastPopups.map(popup => ({
            id: popup.id,
            message: popup.message,
            variant: popup.variant,
            duration: popup.duration,
            extensionCount: popup.extensionCount || 0,
            pauseOnHover: popup.pauseOnHover,
            dismissOnClick: popup.dismissOnClick,
            priority: popup.priority
          }))}
          onClose={handleClose}
        />
      )}
    </FloatingPortal>
  );
};