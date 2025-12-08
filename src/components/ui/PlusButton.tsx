import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { BaseComponentProps } from './types';
import '../../styles/common/ui/_plus-button.css';

export interface PlusButtonProps extends BaseComponentProps {
  onClick?: () => void;
  'aria-label'?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'primary' | 'secondary';
}

export const PlusButton: React.FC<PlusButtonProps> = ({
  onClick,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  size = 'medium',
  variant = 'default',
}) => {
  const buttonClasses = [
    'ui-plus-button',
    `ui-plus-button--${size}`,
    `ui-plus-button--${variant}`,
    disabled ? 'ui-plus-button--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || 'Add'}
    >
      <FontAwesomeIcon icon={faPlus} />
    </button>
  );
};
