import React from 'react';
import { SelectProps } from './types';
import '../../styles/common/ui/_select.css';

export const Select: React.FC<SelectProps> = ({
  value,
  defaultValue,
  onChange,
  options,
  placeholder,
  label,
  error,
  size = 'medium',
  disabled = false,
  className = '',
  name,
  id,
  required = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const selectId = id || React.useId();
  const labelId = label ? `${selectId}-label` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  const selectClasses = [
    'ui-select',
    `ui-select--${size}`,
    error ? 'ui-select--error' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="ui-select-wrapper">
      {label && (
        <label
          id={labelId}
          htmlFor={selectId}
          className={`ui-select-label ${required ? 'ui-select-label--required' : ''}`}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className={selectClasses}
        aria-label={ariaLabel || label}
        aria-labelledby={labelId || ariaLabelledBy}
        aria-invalid={!!error}
        aria-describedby={errorId}
        aria-required={required}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={errorId} className="ui-select-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
