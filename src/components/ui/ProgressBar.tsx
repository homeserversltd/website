import React from 'react';
import { ProgressBarProps } from './types';
import '../../styles/common/ui/_progress-bar.css';

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  variant = 'default',
  size = 'medium',
  showPercentage = true,
  label,
  leftLabel,
  rightLabel,
  className = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));
  
  const barClasses = [
    'ui-progress-bar',
    `ui-progress-bar--${variant}`,
    `ui-progress-bar--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const fillClasses = [
    'ui-progress-bar__fill',
    `ui-progress-bar__fill--${variant}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={barClasses}>
      {(label || leftLabel || rightLabel) && (
        <div className="ui-progress-bar__labels">
          {label && <div className="ui-progress-bar__label">{label}</div>}
          {leftLabel && <div className="ui-progress-bar__label-left">{leftLabel}</div>}
          {rightLabel && <div className="ui-progress-bar__label-right">{rightLabel}</div>}
        </div>
      )}
      <div 
        className="ui-progress-bar__container"
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        <div 
          className={fillClasses}
          style={{ width: `${clampedValue}%` }}
        >
          {showPercentage && (
            <span className="ui-progress-bar__text">
              {clampedValue.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
