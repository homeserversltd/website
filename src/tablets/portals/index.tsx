import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PortalCard } from './components/PortalCard';
import { AddPortalCard } from './components/AddPortalCard';
import { AddPortalModal } from './components/AddPortalModal';
import { PortalService } from './types';
import { useStore } from '../../store';
import './PortalCard.css';
import { api } from '../../api/client';
import { API_ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../hooks/useAuth';
import { useVisibility } from '../../hooks/useVisibility';
import { useToast } from '../../hooks/useToast';
import { useLoading } from '../../hooks/useLoading';
import { useFactoryPortals } from './hooks/useFactoryPortals';
import { debug, createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('PortalsTablet');

const isRemoteAccess = () => {
  const hostname = window.location.hostname;
  return hostname.includes('.ts.net') || (!hostname.includes('.home.arpa') && hostname !== 'home.arpa');
};

const constructDynamicRemoteUrl = (service: PortalService): string => {
  const hostname = window.location.hostname;
  
  // Check if accessing via home.*.ts.net pattern
  if (hostname.includes('.ts.net')) {
    // Extract the tailnet name from current hostname
    const tailnetMatch = hostname.match(/home\.([^.]+)\.ts\.net/);
    if (tailnetMatch) {
      const tailnetName = tailnetMatch[1];
      // Apply "1" prefix to port number
      const remotePort = `1${service.port}`;
      return `https://home.${tailnetName}.ts.net:${remotePort}/`;
    }
  }
  
  // No fallback - if not Tailscale pattern, return empty string
  return '';
};

const PortalElement: React.FC<{ 
  portal: PortalService; 
  onPortalDeleted: () => void;
  isCustomPortal: (portalName: string) => boolean;
}> = ({ portal, onPortalDeleted, isCustomPortal }) => {
  const { isAdmin } = useAuth();
  const { checkElementVisibility, setElementVisibility } = useVisibility();
  const { error } = useToast();
  const { isLoading, startLoading, stopLoading } = useLoading();

  const isVisible = checkElementVisibility('portals', portal.name);

  // Don't render if remote access and no dynamic URL available
  if (isRemoteAccess()) {
    const dynamicUrl = constructDynamicRemoteUrl(portal);
    if (!dynamicUrl) {
      return null;
    }
  }

  const toggleVisibility = async () => {
    try {
      startLoading();
      await api.put(API_ENDPOINTS.tabs.updateElementVisibility, {
        tabId: 'portals',
        elementId: portal.name,
        visibility: !isVisible
      });
      setElementVisibility('portals', portal.name, !isVisible);
    } catch (err) {
      error(`Failed to toggle visibility for portal ${portal.name}`);
      logger.error('Visibility toggle error:', err);
    } finally {
      stopLoading();
    }
  };

  if (!isAdmin && !isVisible) return null;

  return (
    <div className="portal-element" data-visible={isVisible} style={{ position: 'relative' }}>
      {isAdmin && (
        <button 
          className="visibility-toggle"
          onClick={toggleVisibility}
          data-visible={isVisible}
          aria-label={`${isVisible ? 'Hide' : 'Show'} ${portal.name}`}
          style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2 }}
          disabled={isLoading}
        >
          {isLoading ? (
            <i className="fas fa-spinner fa-spin" />
          ) : (
            <i className={`fas fa-eye${isVisible ? '' : '-slash'}`} />
          )}
        </button>
      )}
      <PortalCard service={portal} onPortalDeleted={onPortalDeleted} isCustomPortal={isCustomPortal} />
    </div>
  );
};

const PortalsTablet: React.FC = () => {
  const [portals, setPortals] = useState<PortalService[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const config = useStore(state => state.tabs.portals?.data);
  const { isAdmin } = useAuth();
  
  // Move useFactoryPortals hook to parent component to avoid multiple API calls
  const { isCustomPortal, isLoading: factoryLoading, error: factoryError } = useFactoryPortals();

  useEffect(() => {
    if (config?.portals) {
      setPortals(config.portals);
    }
  }, [config]);

  const handlePortalAdded = async () => {
    // Refresh the portals data after adding a new portal
    // Trigger a re-fetch of the tab configuration from the store
    try {
      const state = useStore.getState();
      await state.startCoreInitialization();
    } catch (error) {
      logger.error('Failed to refresh portal data:', error);
      // Fallback to page reload if store refresh fails
      window.location.reload();
    }
  };

  // Show loading state while factory portals are being fetched
  if (factoryLoading) {
    return (
      <ErrorBoundary>
        <div className="portals-tablet">
          <div className="portals-grid">
            <div className="loading-message">Loading portal configuration...</div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // Show error state if factory portals failed to load
  if (factoryError) {
    logger.warn('Factory portals failed to load:', factoryError);
    // Continue rendering but all portals will be considered custom
  }

  return (
    <ErrorBoundary>
      <div className="portals-tablet">
        <div className="portals-grid">
          {portals.map((portal) => (
            <PortalElement
              key={portal.name}
              portal={portal}
              onPortalDeleted={handlePortalAdded}
              isCustomPortal={isCustomPortal}
            />
          ))}
          
          {/* Add Portal Card - Always last (caboose) */}
          <AddPortalCard onClick={() => setShowAddModal(true)} />
        </div>

        {showAddModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <AddPortalModal
                onClose={() => setShowAddModal(false)}
                onPortalAdded={handlePortalAdded}
              />
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default PortalsTablet;