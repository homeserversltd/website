import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { BaseComponentProps } from './types';
import '../../styles/common/ui/_visibility-toggle.css';

export interface VisibilityToggleProps extends BaseComponentProps {
  visible: boolean;
  onChange: (visible: boolean) => void;
  'aria-label'?: string;
  size?: 'small' | 'medium' | 'large';
}

export const VisibilityToggle: React.FC<VisibilityToggleProps> = ({
  visible,
  onChange,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  size = 'medium',
}) => {
  const handleClick = () => {
    if (!disabled) {
      onChange(!visible);
    }
  };

  const toggleClasses = [
    'ui-visibility-toggle',
    `ui-visibility-toggle--${size}`,
    visible ? 'ui-visibility-toggle--visible' : 'ui-visibility-toggle--hidden',
    disabled ? 'ui-visibility-toggle--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={toggleClasses}
      onClick={handleClick}
      disabled={disabled}
      data-visible={visible}
      aria-label={ariaLabel || `${visible ? 'Hide' : 'Show'}`}
      aria-pressed={visible}
    >
      <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
    </button>
  );
};
