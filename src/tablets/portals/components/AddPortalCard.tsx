import React from 'react';
import { useAuth } from '../../../hooks/useAuth';

interface AddPortalCardProps {
  onClick: () => void;
}

export const AddPortalCard: React.FC<AddPortalCardProps> = ({ onClick }) => {
  const { isAdmin } = useAuth();

  // Only show for admins
  if (!isAdmin) return null;

  return (
    <div 
      className="portal-card add-portal-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label="Add new portal"
    >
      <div className="add-portal-content">
        <div className="add-portal-icon">
          <i className="fas fa-plus" />
        </div>
        <h3 className="add-portal-title">Add Portal</h3>
        <p className="add-portal-description">
          Create a new portal for your services
        </p>
      </div>
    </div>
  );
}; 