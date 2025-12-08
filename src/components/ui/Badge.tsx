import React from 'react';
import { BadgeProps } from './types';
import '../../styles/common/ui/_badge.css';

export const Badge: React.FC<BadgeProps> = ({
  variant = 'primary',
  size = 'medium',
  className = '',
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const badgeClasses = [
    'ui-badge',
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={badgeClasses}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </span>
  );
};
