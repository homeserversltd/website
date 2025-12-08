import React from 'react';
import { ButtonProps } from './types';
import { LoadingSpinner } from '../LoadingSpinner';
import '../../styles/common/ui/_button.css';

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  className = '',
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const buttonClasses = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    loading ? 'ui-button--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const iconElement = icon && (
    <span className={`ui-button__icon ui-button__icon--${iconPosition}`}>
      {icon}
    </span>
  );

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-busy={loading}
    >
      {loading ? (
        <LoadingSpinner size="small" />
      ) : (
        <>
          {iconPosition === 'left' && iconElement}
          <span>{children}</span>
          {iconPosition === 'right' && iconElement}
        </>
      )}
    </button>
  );
};
