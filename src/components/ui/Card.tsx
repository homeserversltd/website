import React from 'react';
import { CardProps } from './types';
import '../../styles/common/ui/_card.css';

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  header,
  footer,
  onClick,
  disabled = false,
  className = '',
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const isClickable = variant === 'clickable' && onClick && !disabled;

  const cardClasses = [
    'ui-card',
    `ui-card--${variant}`,
    isClickable ? 'ui-card--clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const cardContent = (
    <>
      {header && <div className="ui-card__header">{header}</div>}
      <div className="ui-card__body">{children}</div>
      {footer && <div className="ui-card__footer">{footer}</div>}
    </>
  );

  if (isClickable) {
    return (
      <div
        className={cardClasses}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-disabled={disabled}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      className={cardClasses}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {cardContent}
    </div>
  );
};
