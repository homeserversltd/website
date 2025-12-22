import React, { useCallback, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../hooks/useAuth';
import { showModal, closeModal } from '../Popup/PopupManager';
import { PremiumTabModal } from './modals/PremiumTabModal';
import './PremiumTabButton.css';

export const PremiumTabButton: React.FC = () => {
  const { isAdmin } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = useCallback(() => {
    console.log('[PremiumTabButton] Opening premium tab modal');
    
    // Check authentication status
    const adminToken = localStorage.getItem('adminToken');
    console.log('[PremiumTabButton] Authentication status:', {
      hasAdminToken: !!adminToken,
      tokenPreview: adminToken ? `${adminToken.substring(0, 8)}...` : 'none',
      isAdmin
    });
    
    if (!adminToken) {
      console.warn('[PremiumTabButton] No admin token found - premium tab access may fail');
    }
    
    setIsModalOpen(true);
    
    showModal({
      title: 'Premium Tab Management',
      hideActions: true,
      initialFocus: -1,
      children: React.createElement(PremiumTabModal, { 
        onClose: () => {
          console.log('[PremiumTabButton] Premium tab modal closing');
          setIsModalOpen(false);
          closeModal();
        }
      })
    });
  }, [isAdmin]);

  // Only show in admin mode
  if (!isAdmin) {
    return null;
  }

  return (
    <div
      className="premium-tab-button"
      onClick={handleOpenModal}
      title="Add Premium Tab"
    >
      <div className="premium-tab-button-content">
        <FontAwesomeIcon icon={faPlus} className="premium-tab-button-icon" />
      </div>
    </div>
  );
}; 