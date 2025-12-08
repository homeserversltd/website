import React from 'react';
import { TabGroupProps } from './types';
import '../../styles/common/ui/_tabs.css';

export const TabGroup: React.FC<TabGroupProps> = ({
  children,
  className = '',
}) => {
  const groupClasses = [
    'ui-tab-group',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={groupClasses} role="tablist">
      {children}
    </div>
  );
};
