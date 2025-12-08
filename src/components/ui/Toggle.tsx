import React from 'react';
import { ToggleProps } from './types';
import '../../styles/common/ui/_toggle.css';

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  size = 'medium',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const toggleId = React.useId();
  const labelId = label ? `${toggleId}-label` : undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  const toggleClasses = [
    'ui-toggle',
    `ui-toggle--${size}`,
    disabled ? 'ui-toggle--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={toggleClasses} htmlFor={toggleId}>
      <div className={`ui-toggle__switch ${disabled ? 'ui-toggle--disabled' : ''}`}>
        <input
          id={toggleId}
          type="checkbox"
          className="ui-toggle__input"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-labelledby={labelId}
        />
        <span className="ui-toggle__slider" />
      </div>
      {label && (
        <span id={labelId} className="ui-toggle__label">
          {label}
        </span>
      )}
    </label>
  );
};
