import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { IconButtonProps } from './types';
import '../../styles/common/ui/_icon-button.css';

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  size = 'medium',
  variant = 'default',
  disabled = false,
  'aria-label': ariaLabel,
  shape = 'square',
  className = '',
  type = 'button',
}) => {
  const buttonClasses = [
    'ui-icon-button',
    `ui-icon-button--${size}`,
    `ui-icon-button--${variant}`,
    `ui-icon-button--${shape}`,
    disabled ? 'ui-icon-button--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-disabled={disabled}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
};
