import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faKey, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './PasswordInputModal.css';

interface PasswordInputModalProps {
  message?: string;
  placeholder?: string;
  isLoading?: boolean;
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
}

export const PasswordInputModal: React.FC<PasswordInputModalProps> = ({
  message = "Please enter the password to proceed:",
  placeholder = "Password",
  isLoading = false,
  onSubmit,
  onCancel
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(password);
    } catch (error) {
      console.error('[PasswordInputModal] Error during submit:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const isDisabled = isLoading || isSubmitting || !password.trim();

  return (
    <form className="modal-form" onSubmit={handleSubmit}>
      <div className="password-input-modal-body">
        <p className="password-input-modal-message">{message}</p>
        
        <div className="password-input-field">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="password-input"
            autoComplete="current-password"
            autoFocus
            disabled={isLoading || isSubmitting}
          />
          <button
            type="button"
            className="password-toggle-button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading || isSubmitting}
            tabIndex={-1}
          >
            <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
          </button>
        </div>
        
        <div className="password-input-modal-actions">
          <button
            type="button"
            className="password-input-modal-button cancel"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="password-input-modal-button submit"
            disabled={isDisabled}
          >
            {isSubmitting ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                Unlocking...
              </>
            ) : (
              'Unlock'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}; 