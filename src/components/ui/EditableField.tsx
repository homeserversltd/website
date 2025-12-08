import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons';
import { BaseComponentProps } from './types';
import '../../styles/common/ui/_editable-field.css';

export interface EditableFieldProps extends BaseComponentProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  'aria-label'?: string;
}

export const EditableField: React.FC<EditableFieldProps> = ({
  value,
  onSave,
  placeholder = 'Click to edit',
  size = 'medium',
  disabled = false,
  className = '',
  showIcon = true,
  'aria-label': ariaLabel,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    if (!disabled && !isEditing) {
      setIsEditing(true);
      setEditValue(value);
    }
  };

  const handleBlur = async () => {
    if (isEditing && !isSaving) {
      await handleSave();
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setEditValue(value);
    }
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      // On error, revert to original value
      setEditValue(value);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClasses = [
    'ui-editable-field',
    `ui-editable-field--${size}`,
    isEditing ? 'ui-editable-field--editing' : '',
    disabled ? 'ui-editable-field--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (isEditing) {
    return (
      <div className={fieldClasses}>
        <input
          ref={inputRef}
          type="text"
          className="ui-editable-field__input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isSaving || disabled}
          placeholder={placeholder}
          aria-label={ariaLabel || 'Edit field'}
        />
        {isSaving && (
          <span className="ui-editable-field__saving" aria-label="Saving">
            ...
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={fieldClasses}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={ariaLabel || 'Click to edit'}
    >
      <span className="ui-editable-field__value">
        {value || <span className="ui-editable-field__placeholder">{placeholder}</span>}
      </span>
      {showIcon && !disabled && (
        <span className="ui-editable-field__icon">
          <FontAwesomeIcon icon={faPencilAlt} />
        </span>
      )}
    </div>
  );
};
