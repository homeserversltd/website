import React, { useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faKey,
  faPlus,
  faSync,
  faShieldAlt,
  faQuestionCircle
} from '@fortawesome/free-solid-svg-icons';
import { useModal } from '../../../hooks/useModal';
import { useDiskMan } from '../hooks/useDiskMan';
import { useSystemControls } from '../hooks/useSystemControls';
import { useTooltip } from '../../../hooks/useTooltip';
import { CreateKeyModal } from './modals/CreateKeyModal';
import { UpdateKeyModal } from './modals/UpdateKeyModal';
import { KeyManagementInfoModal } from './modals/KeyManagementInfoModal';

import './KeyManager.css';

export const KeyManager: React.FC = () => {
  // Get disk management state
  const [{ selectedDevice }] = useDiskMan();
  const [, systemActions] = useSystemControls();
  const { show: showTooltip } = useTooltip({ delay: 200 });
  const { open: openModal, close: closeModal } = useModal();

  // Memoized close handler
  const handleCloseModal = useCallback(() => {
    closeModal();
  }, [closeModal]);

  // Handle opening create key modal
  const handleOpenCreateKeyModal = useCallback((e: React.MouseEvent) => {
    // Prevent event bubbling
    e.preventDefault();
    e.stopPropagation();
    
    // Define the content for the modal
    const modalContent = (
        <CreateKeyModal 
          onClose={handleCloseModal}
        />
    );

    // Open the modal using the hook
    openModal(modalContent, {
       title: 'Create New Key',
       hideActions: true,
    });

  }, [openModal, handleCloseModal]);
  
  // Handle opening update key modal
  const handleOpenUpdateKeyModal = useCallback((e: React.MouseEvent) => {
    // Prevent event bubbling
    e.preventDefault();
    e.stopPropagation();

    // Define the content
     const modalContent = (
        <UpdateKeyModal 
          initialDevice={selectedDevice}
          onClose={handleCloseModal}
        />
      );
      
    // Open the modal using the hook
    openModal(modalContent, {
        title: 'Update Key on Drive',
        hideActions: true,
    });

  }, [openModal, handleCloseModal, selectedDevice]);

  // Handler for the new information modal
  const handleOpenInfoModal = useCallback(() => {
    const modalContent = <KeyManagementInfoModal onClose={handleCloseModal} />;
    openModal(modalContent, {
      title: 'Key Management Guide',
      hideActions: true,
    });
  }, [openModal, handleCloseModal]);

  return (
    <div className="key-manager">
      <h3>
        <FontAwesomeIcon icon={faKey} />
        Key Management
      </h3>
      
      <div className="key-manager-content">
        <div className="key-manager-left">
          <div className="security-status">
            <div className="status-item">
              <FontAwesomeIcon icon={faShieldAlt} className="status-icon secure" />
              <div className="status-details">
                <p>
                  This is the key to your vault. When you boot your HOMESERVER and visit home.arpa, 
                  this is what unlocks your encrypted storage system - just like unlocking your smartphone.
                  Your /vault partition contains the sensitive keys stored on the device. Unlock the vault 
                  and everything HOMESERVER specifically stores is accessible. This is the device&#39;s master key.
                  <button 
                    onClick={handleOpenInfoModal} 
                    className="action-button info-button"
                    aria-label="View Full Guide & Critical Warnings"
                    style={{ marginTop: '10px', display: 'block', width: '100%' }}
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} /> View Full Guide & Critical Warnings
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="key-manager-right">
          <div className="key-actions">
            {showTooltip(
              "Create or manage keys for NAS drives, system vault, or both. Advanced options allow replacing specific keys or adding additional keys.",
              <button 
                className="action-button create-button"
                onClick={handleOpenCreateKeyModal}
              >
                <FontAwesomeIcon icon={faPlus} />
                Create New Key
              </button>
            )}
            
            {showTooltip(
              "Apply the current Service Suite Key from the vault to external encrypted drives.",
              <button 
                className="action-button update-button"
                onClick={handleOpenUpdateKeyModal}
              >
                <FontAwesomeIcon icon={faSync} />
                Update Key on Drive
              </button>
            )}

            {showTooltip(
              "Update the system administrator password",
              <button 
                className="action-button admin-password-button"
                onClick={systemActions.handleAdminPasswordUpdate}
              >
                <FontAwesomeIcon icon={faKey} />
                Admin Password
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 