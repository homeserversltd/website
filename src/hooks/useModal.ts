import { useCallback } from 'react';
import { showModal, closeModal, closeAllModals } from '../components/Popup/PopupManager';
import React from 'react';

/**
 * Configuration options for modal display and behavior
 */
export interface UseModalOptions {
  /** Optional title to display in the modal header */
  title?: string;
  /** 
   * Optional confirmation handler that returns a boolean 
   * Determines whether the modal should close based on the return value
   */
  onConfirm?: () => Promise<boolean>;
  /** 
   * Flag to hide default modal action buttons 
   * Useful for custom modal content with inline actions
   */
  hideActions?: boolean;
  /**
   * Flag to enable Enter key submission
   * When true, pressing Enter will trigger the confirm action
   * Defaults to false
   */
  submitOnEnter?: boolean;
  /**
   * Optional index of the element to focus initially
   * Set to -1 to disable initial focus
   */
  initialFocus?: number;
}

/**
 * Configuration options for confirmation modals
 */
export interface ConfirmModalOptions extends UseModalOptions {
  promptForInput?: boolean;
  inputType?: 'text' | 'password';
  inputLabel?: string;
}

/**
 * Result from a confirmation modal that may include input
 */
export interface ConfirmModalResult {
  confirmed: boolean;
  input?: string;
}

/**
 * Wrapper component to standardize modal content
 * This ensures that the content is passed directly to the PopupManager
 * rather than being wrapped in additional elements that can affect styling
 */
const ModalContentWrapper = (props: {
  children: React.ReactNode;
  onClose: () => void;
}) => props.children;

/**
 * Hook for creating and managing modal dialogs with flexible configuration
 * @param options - Configuration options for the modal
 * @returns An object with methods to display and close modals
 */
export const useModal = (options: UseModalOptions = {}) => {
  /**
   * Opens a modal with the specified content and configured options
   * @param content - React node to render inside the modal
   * @param modalOptions - Additional options for this specific modal
   * @returns A promise that resolves when the modal is closed
   */
  const open = useCallback((content: React.ReactNode, modalOptions?: UseModalOptions) => {
    const mergedOptions = { ...options, ...modalOptions };
    
    // Provide default accessibility title if none specified
    const title = mergedOptions.title || 'Dialog';
    
    // Direct pass-through to showModal without any wrapping
    // This ensures the Modal component receives the content directly
    // and can position the close button properly outside the content area
    return showModal({
      title,
      children: content,
      onConfirm: mergedOptions.onConfirm,
      hideActions: mergedOptions.hideActions,
      submitOnEnter: mergedOptions.submitOnEnter,
      initialFocus: mergedOptions.initialFocus
    });
  }, [options]);

  const close = useCallback(() => {
    closeModal();
  }, []);
  
  const closeAll = useCallback(() => {
    closeAllModals();
  }, []);

  return { open, close, closeAll };
};

/**
 * Hook for creating simple confirmation modals with a predefined pattern
 * @param options - Additional configuration options for the confirmation modal
 * @returns An object with a confirm method to show a confirmation dialog
 */
export const useConfirmModal = (options: ConfirmModalOptions = {}) => {
  // Use the base useModal hook with default actions visible
  const { open } = useModal({
    ...options,
    hideActions: false
  });

  /**
   * Displays a confirmation modal with a specified message
   * @param message - The message to display in the confirmation modal
   * @param confirmOptions - Additional options for this specific confirmation
   * @returns A promise that resolves with the confirmation result
   */
  const confirm = useCallback((message: string, confirmOptions?: ConfirmModalOptions): Promise<ConfirmModalResult> => {
    const mergedOptions = { ...options, ...confirmOptions };
    
    return new Promise<ConfirmModalResult>((resolve) => {
      let inputValue = '';
      
      // Create the modal content
      const content = React.createElement(
        'div',
        {
          style: {
            padding: '4px 8px',
            maxWidth: '100%',
            wordBreak: 'break-word'
          }
        },
        [
          // Message
          React.createElement('div', { key: 'message' }, message),
          
          // Optional input field
          mergedOptions.promptForInput && React.createElement('input', {
            key: 'input',
            type: mergedOptions.inputType || 'text',
            placeholder: mergedOptions.inputLabel || '',
            className: 'modal-input',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              inputValue = e.target.value;
            },
            style: {
              marginTop: '1rem',
              width: '100%',
              padding: '0.5rem'
            }
          })
        ]
      );

      showModal({
        title: mergedOptions.title,
        children: content,
        onConfirm: async () => {
          resolve({ confirmed: true, input: inputValue });
          return true;
        },
        hideActions: false,
        initialFocus: mergedOptions.initialFocus,
        submitOnEnter: mergedOptions.submitOnEnter
      });

      // Handle cancel/close
      const handleCancel = () => {
        resolve({ confirmed: false });
      };
    });
  }, [options]);

  return { confirm };
};