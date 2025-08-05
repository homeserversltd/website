import React, { useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faKey, faExclamationTriangle, faLock } from '@fortawesome/free-solid-svg-icons';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../hooks/useToast';
import { useLoading } from '../../../../hooks/useLoading';
import { AdminPasswordUpdateResponse } from '../../types';
import { encryptData } from '../../../../utils/secureTransmission';
import './AdminPasswordModal.css';

interface AdminPasswordModalProps {
  onClose: () => void;
}

export const AdminPasswordModal: React.FC<AdminPasswordModalProps> = ({ onClose }) => {
  // State for password fields
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Validation errors state - only shown on submit attempt
  const [validationErrors, setValidationErrors] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Has form been submitted at least once
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Loading state
  const { isLoading, withLoading } = useLoading();
  
  // API and toast hooks
  const api = useApi();
  const toast = useToast();

  // Password validation
  // Check if password contains only allowed special characters: "-._~"
  const isSpecialCharValid = (password: string) => /[-._~]/.test(password);
  
  // Password validation functions - current password only needs to exist
  const isOldPasswordValid = oldPassword.length >= 1;
  const isNewPasswordValid = newPassword.length >= 8 && 
                            /[A-Z]/.test(newPassword) && 
                            /[a-z]/.test(newPassword) && 
                            /[0-9]/.test(newPassword) && 
                            isSpecialCharValid(newPassword);
  const doPasswordsMatch = newPassword === confirmPassword;
  
  // Validation for current UI state
  const canSubmit = !isLoading; // We'll do full validation on submit

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark form as submitted for validation display
    setHasSubmitted(true);
    
    // Validate all fields
    const errors = {
      oldPassword: isOldPasswordValid ? '' : 'Please enter your current admin password',
      newPassword: isNewPasswordValid ? '' : 'Password must meet all requirements below',
      confirmPassword: doPasswordsMatch ? '' : 'Passwords do not match'
    };
    
    setValidationErrors(errors);
    
    // If any errors, stop here
    if (!isOldPasswordValid || !isNewPasswordValid || !doPasswordsMatch) {
      return;
    }
    
    try {
      await withLoading((async () => {
        // Encrypt the passwords for secure transmission
        const encryptedOldPassword = encryptData(oldPassword);
        const encryptedNewPassword = encryptData(newPassword);
        
        if (!encryptedOldPassword || !encryptedNewPassword) {
          throw new Error('Encryption failed. Please try again.');
        }
        
        const response = await api.post<AdminPasswordUpdateResponse>(
          API_ENDPOINTS.admin.updatePassword, 
          {
            oldPassword: encryptedOldPassword,
            newPassword: encryptedNewPassword
          }
        );
        
        if (response.success) {
          toast.success('Admin password updated successfully');
          if (response.details?.serviceKeyUpdated) {
            toast.info('Service suite key was also updated');
          }
          onClose();
        } else {
          toast.error(response.error || 'Failed to update admin password');
        }
      })());
    } catch (error) {
      console.error('Error updating admin password:', error);
      toast.error('An unexpected error occurred while updating the admin password');
    }
  }, [api, oldPassword, newPassword, confirmPassword, isOldPasswordValid, isNewPasswordValid, doPasswordsMatch, withLoading, toast, onClose]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <form className="modal-form" onSubmit={handleSubmit}>
      <div className="warning-message">
        <FontAwesomeIcon icon={faExclamationTriangle} />
        <div>
          <strong>WARNING: Changing the admin password is a critical operation!</strong>
          <p>
            This password is used for system-level access including SSH password authentication. If you lose this password, 
            you will need physical access to the server to reset it using the factory access key (FAK), or root password.
          </p>
          <p>
            The FAK is the root password to your device. Beneath the FAK or root password is the admin password, which manages the onboard admin account.
          </p>
          <p>
            <strong>Note:</strong> Updating the admin password will also update the Samba (NAS file sharing) owner credentials. This ensures your new admin password is synchronized for both system and network file access.
          </p>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="oldPassword">
          <FontAwesomeIcon icon={faLock} /> Current Admin Password:
        </label>
        <input
          type="password"
          id="oldPassword"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="current-password"
        />
        
        {/* No validation requirements for current password */}
      </div>

      <div className="form-group">
        <label htmlFor="newPassword">
          <FontAwesomeIcon icon={faLock} /> New Admin Password:
        </label>
        <input
          type="password"
          id="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="new-password"
        />
        <div className="password-requirements">
          New password must:
          <ul>
            <li className={newPassword.length >= 8 ? 'valid' : 'invalid'}>Be at least 8 characters long</li>
            <li className={/[A-Z]/.test(newPassword) ? 'valid' : 'invalid'}>Include uppercase letters</li>
            <li className={/[a-z]/.test(newPassword) ? 'valid' : 'invalid'}>Include lowercase letters</li>
            <li className={/[0-9]/.test(newPassword) ? 'valid' : 'invalid'}>Include numbers</li>
            <li className={isSpecialCharValid(newPassword) ? 'valid' : 'invalid'}>Include special characters (only: - . _ ~)</li>
          </ul>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="confirmPassword">Confirm New Password:</label>
        <input
          type="password"
          id="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="new-password"
        />

        {/* Password validation indicator - always present to reserve space */}
        <div className={`password-validation-indicator ${newPassword && confirmPassword ? (doPasswordsMatch && isNewPasswordValid ? 'valid' : 'invalid') : ''}`}>
          {newPassword && confirmPassword ? (
            doPasswordsMatch && isNewPasswordValid ? 
              <span>✓ Password is valid and matches</span> : 
              doPasswordsMatch ? 
                <span>✗ Password matches but doesn&apos;t meet requirements</span> :
                <span>✗ Passwords do not match</span>
          ) : (
            <span>&nbsp;</span> // Empty space to reserve height
          )}
        </div>
      </div>

      <div className="modal-actions">
        <button
          type="button"
          className="modal-button modal-button-secondary"
          onClick={handleCancel}
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="modal-button modal-button-primary"
          disabled={!canSubmit}
        >
          {isLoading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> Updating...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faKey} /> Update Password
            </>
          )}
        </button>
      </div>
    </form>
  );
}; 