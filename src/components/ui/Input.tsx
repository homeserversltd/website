import React from 'react';
import { InputProps } from './types';
import '../../styles/common/ui/_input.css';

export const Input: React.FC<InputProps> = ({
  type = 'text',
  value,
  defaultValue,
  onChange,
  placeholder,
  label,
  error,
  size = 'medium',
  variant = 'default',
  disabled = false,
  readOnly = false,
  className = '',
  name,
  id,
  required = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const inputId = id || React.useId();
  const labelId = label ? `${inputId}-label` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const inputClasses = [
    'ui-input',
    variant !== 'default' ? `ui-input--${variant}` : '',
    `ui-input--${size}`,
    error ? 'ui-input--error' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ui-input-wrapper">
      {label && (
        <label
          id={labelId}
          htmlFor={inputId}
          className={`ui-input-label ${required ? 'ui-input-label--required' : ''}`}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        className={inputClasses}
        aria-label={ariaLabel || label}
        aria-labelledby={labelId || ariaLabelledBy}
        aria-invalid={!!error}
        aria-describedby={errorId}
        aria-required={required}
      />
      {error && (
        <span id={errorId} className="ui-input-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
