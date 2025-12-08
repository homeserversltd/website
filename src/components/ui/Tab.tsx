import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { TabProps } from './types';
import '../../styles/common/ui/_tabs.css';

export const Tab: React.FC<TabProps> = ({
  active = false,
  onClick,
  icon,
  disabled = false,
  className = '',
  children,
  visible = true,
  onVisibilityToggle,
  starred = false,
  onStarClick,
  adminMode = false,
  adminOnly = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const handleVisibilityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVisibilityToggle?.(e);
  };

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStarClick?.(e);
  };

  const tabClasses = [
    'ui-tab',
    active ? 'ui-tab--active' : '',
    !visible ? 'ui-tab--hidden' : '',
    starred ? 'ui-tab--starred' : '',
    adminMode ? 'ui-tab--admin-mode' : '',
    adminOnly ? 'ui-tab--admin-only' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const showVisibilityToggle = adminMode && !adminOnly;
  const showStarButton = visible && !adminOnly;

  return (
    <div
      className={tabClasses}
      onClick={onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-selected={active}
      data-visibility={visible ? 'visible' : 'hidden'}
      data-starred={starred}
    >
      {/* Visibility toggle column */}
      {showVisibilityToggle && (
        <div className="ui-tab__visibility-column">
          <button
            type="button"
            className="ui-tab__visibility-toggle"
            onClick={handleVisibilityClick}
            data-visible={visible}
            aria-label={visible ? 'Hide' : 'Show'}
          >
            <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
          </button>
        </div>
      )}

      {/* Tab content column */}
      <span className="ui-tab__content">
        {icon && <span className="ui-tab__icon">{icon}</span>}
        <span className="ui-tab__label">{children}</span>
      </span>

      {/* Star button column */}
      {showStarButton && (
        <div className="ui-tab__star-column">
          <button
            type="button"
            className={`ui-tab__star-button ${starred ? 'ui-tab__star-button--starred' : ''} ${starred ? 'fas' : 'far'} fa-star`}
            onClick={handleStarClick}
            title={starred ? 'Starred' : 'Star this tab'}
            aria-label={starred ? 'Unstar' : 'Star'}
          />
        </div>
      )}
    </div>
  );
};
