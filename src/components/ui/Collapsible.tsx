import React, { useState } from 'react';
import { CollapsibleProps } from './types';
import '../../styles/common/ui/_collapsible.css';

export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  defaultCollapsed = false,
  children,
  className = '',
  headerContent,
  variant = 'default',
  size = 'medium',
  onToggle,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onToggle?.(!newCollapsed); // Pass expanded state (inverse of collapsed)
  };

  const collapsibleClasses = [
    'ui-collapsible',
    `ui-collapsible--${variant}`,
    `ui-collapsible--${size}`,
    collapsed ? 'ui-collapsible--collapsed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={collapsibleClasses} style={style}>
      <div 
        className="ui-collapsible__header"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-expanded={!collapsed}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        <div className="ui-collapsible__header-content">
          {title && <h4 className="ui-collapsible__title">{title}</h4>}
          {headerContent}
        </div>
        <span className={`ui-collapsible__icon ${collapsed ? 'ui-collapsible__icon--collapsed' : ''}`}>
          ▼
        </span>
      </div>
      
      {!collapsed && (
        <div className="ui-collapsible__content">
          {children}
        </div>
      )}
    </div>
  );
};
