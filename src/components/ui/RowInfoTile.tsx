import React from 'react';
import { RowInfoTileProps } from './types';
import { Checkbox } from './Checkbox';
import { Badge } from './Badge';
import '../../styles/common/ui/_row-info-tile.css';

export const RowInfoTile: React.FC<RowInfoTileProps> = ({
  selected = false,
  onSelect,
  showCheckbox = false,
  icon,
  title,
  subtitle,
  badges = [],
  metadata,
  actions,
  onEdit,
  onDelete,
  onClick,
  onDoubleClick,
  variant = 'default',
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    
    // Don't handle clicks on checkbox, actions, or icon (they have their own handlers)
    const target = e.target as HTMLElement;
    if (
      target.closest('.ui-row-info-tile__checkbox') ||
      target.closest('.ui-row-info-tile__actions') ||
      target.closest('.ui-row-info-tile__icon')
    ) {
      return;
    }
    
    if (e.detail === 2 && onDoubleClick) {
      onDoubleClick();
    } else if (onClick) {
      onClick();
    }
  };

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDoubleClick) {
      onDoubleClick();
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (onSelect) {
      onSelect(checked);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  const tileClasses = [
    'ui-row-info-tile',
    selected ? 'ui-row-info-tile--selected' : '',
    variant !== 'default' ? `ui-row-info-tile--${variant}` : '',
    disabled ? 'ui-row-info-tile--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Render icon - support both string (emoji) and ReactNode
  const renderIcon = () => {
    if (!icon) return null;
    
    if (typeof icon === 'string') {
      return (
        <div 
          className="ui-row-info-tile__icon" 
          onClick={onDoubleClick ? handleIconClick : undefined}
          style={{ cursor: onDoubleClick ? 'pointer' : 'default' }}
        >
          {icon}
        </div>
      );
    }
    
    return (
      <div 
        className="ui-row-info-tile__icon" 
        onClick={onDoubleClick ? handleIconClick : undefined}
        style={{ cursor: onDoubleClick ? 'pointer' : 'default' }}
      >
        {icon}
      </div>
    );
  };

  // Build actions section
  const renderActions = () => {
    if (!actions && !onEdit && !onDelete) return null;

    const actionButtons: React.ReactNode[] = [];

    if (onEdit) {
      actionButtons.push(
        <button
          key="edit"
          className="ui-row-info-tile__action-btn"
          onClick={handleEdit}
          title="Edit"
          aria-label="Edit"
        >
          ✏️
        </button>
      );
    }

    if (onDelete) {
      actionButtons.push(
        <button
          key="delete"
          className="ui-row-info-tile__action-btn"
          onClick={handleDelete}
          title="Delete"
          aria-label="Delete"
        >
          🗑️
        </button>
      );
    }

    if (actions) {
      actionButtons.push(actions);
    }

    return (
      <div className="ui-row-info-tile__actions" onClick={(e) => e.stopPropagation()}>
        {actionButtons}
      </div>
    );
  };

  return (
    <div
      className={tileClasses}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled}
      role={onClick || onDoubleClick ? 'button' : undefined}
      tabIndex={onClick || onDoubleClick ? 0 : undefined}
    >
      {showCheckbox && (
        <div className="ui-row-info-tile__checkbox">
          <Checkbox
            checked={selected}
            onChange={handleCheckboxChange}
            size="small"
            disabled={disabled}
            aria-label={`Select ${title}`}
          />
        </div>
      )}

      {renderIcon()}

      <div className="ui-row-info-tile__content">
        <div className="ui-row-info-tile__title" title={title}>
          {title}
        </div>
        
        {subtitle && (
          <div className="ui-row-info-tile__subtitle">
            {subtitle}
          </div>
        )}

        {badges.length > 0 && (
          <div className="ui-row-info-tile__badges">
            {badges.map((badge, index) => (
              <Badge
                key={index}
                variant={badge.variant || 'primary'}
                size="small"
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        )}

        {metadata && (
          <div className="ui-row-info-tile__metadata">
            {metadata}
          </div>
        )}
      </div>

      {renderActions()}
    </div>
  );
};
