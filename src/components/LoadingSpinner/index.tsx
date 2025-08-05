import React from 'react';
import './loadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  className = '',
}) => {
  const sizeMap = {
    small: '16px',
    medium: '32px',
    large: '48px',
  };

  return (
    <div
      className={`loading-spinner ${size} ${className}`}
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        borderColor: 'var(--secondary)',
        borderTopColor: 'var(--background)'
      }}
      role="progressbar"
      aria-label="Loading"
    />
  );
};