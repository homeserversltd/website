import React from 'react';
import { BaseComponentProps } from './types';
import '../../styles/common/ui/_checkbox.css';

export interface CheckboxProps extends BaseComponentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  'aria-label'?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  size = 'medium',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const checkboxId = React.useId();
  const labelId = label ? `${checkboxId}-label` : undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(e.target.checked);
    }
  };

  const checkboxClasses = [
    'ui-checkbox',
    `ui-checkbox--${size}`,
    disabled ? 'ui-checkbox--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={checkboxClasses} htmlFor={checkboxId}>
      <div className="ui-checkbox__wrapper">
        <input
          id={checkboxId}
          type="checkbox"
          className="ui-checkbox__input"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-labelledby={labelId}
        />
        <span className="ui-checkbox__checkmark">
          <svg
            className="ui-checkbox__icon"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 3L4.5 8.5L2 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      {label && (
        <span id={labelId} className="ui-checkbox__label">
          {label}
        </span>
      )}
    </label>
  );
};
