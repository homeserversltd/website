import React from 'react';
import { BreadcrumbsProps } from './types';
import '../../styles/common/ui/_breadcrumbs.css';

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  currentPath,
  onNavigate,
  separator = '/',
  className = '',
}) => {
  return (
    <div className={`ui-breadcrumbs ${className}`}>
      {items.map((item, index) => (
        <React.Fragment key={item.path}>
          <span
            className={`ui-breadcrumbs__item ${
              item.path === currentPath ? 'ui-breadcrumbs__item--current' : ''
            }`}
            onClick={() => {
              if (item.path !== currentPath) {
                onNavigate(item.path);
              }
            }}
            style={{
              cursor: item.path !== currentPath ? 'pointer' : 'default',
            }}
            role={item.path !== currentPath ? 'button' : undefined}
            tabIndex={item.path !== currentPath ? 0 : undefined}
            onKeyDown={(e) => {
              if (item.path !== currentPath && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onNavigate(item.path);
              }
            }}
            aria-label={item.path === currentPath ? `Current: ${item.name}` : `Navigate to ${item.name}`}
          >
            {item.name}
          </span>
          {index < items.length - 1 && (
            <span className="ui-breadcrumbs__separator" aria-hidden="true">
              {` ${separator} `}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
