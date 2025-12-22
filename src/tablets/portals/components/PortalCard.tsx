import React from 'react';
import { PortalService } from '../types';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { useAuth } from '../../../hooks/useAuth';
import { useTooltip } from '../../../hooks/useTooltip';
import { useLoading } from '../../../hooks/useLoading';
import { useServiceControls } from '../hooks/useServiceControls';
import { useToast } from '../../../hooks/useToast';
import { api } from '../../../api/client';
import { debug, createComponentLogger } from '../../../utils/debug';

import type { ServiceAction } from '../types';

// Create component-specific logger
const logger = createComponentLogger('PortalCard');

interface PortalCardProps {
  service: PortalService;
  onPortalDeleted?: () => void;
  isCustomPortal: (portalName: string) => boolean;
}

const isRemoteAccess = () => {
  const hostname = window.location.hostname;
  return hostname.includes('.ts.net') || (!hostname.includes('.home.arpa') && hostname !== 'home.arpa');
};

const constructDynamicRemoteUrl = (service: PortalService): string => {
  const hostname = window.location.hostname;
  
  // For link-only portals, use the localURL directly if it's a full URL
  if (service.type === 'link') {
    // If localURL is already a full URL (external link), return it as-is
    if (service.localURL.startsWith('http://') || service.localURL.startsWith('https://')) {
      // Check if it's an external URL (not home.arpa or ts.net)
      if (!service.localURL.includes('.home.arpa') && !service.localURL.includes('.ts.net')) {
        return service.localURL; // External link, return as-is
      }
      // It's a local URL, extract path and reconstruct
      try {
        const url = new URL(service.localURL);
        if (hostname.includes('.ts.net')) {
          const tailnetMatch = hostname.match(/home\.([^.]+)\.ts\.net/);
          if (tailnetMatch) {
            const tailnetName = tailnetMatch[1];
            return `https://home.${tailnetName}.ts.net${url.pathname}${url.search}${url.hash}`;
          }
        }
      } catch (e) {
        // If URL parsing fails, fall through to return localURL
      }
    }
    // For local URLs without full protocol, construct from current hostname
    if (hostname.includes('.ts.net')) {
      const tailnetMatch = hostname.match(/home\.([^.]+)\.ts\.net/);
      if (tailnetMatch) {
        const tailnetName = tailnetMatch[1];
        // Extract path from localURL (remove protocol and domain)
        const path = service.localURL.replace(/^https?:\/\/[^\/]+/, '');
        return `https://home.${tailnetName}.ts.net${path}`;
      }
    }
    // Fallback to localURL if we can't construct remote URL
    return service.localURL;
  }
  
  // Check if accessing via home.*.ts.net pattern
  if (hostname.includes('.ts.net')) {
    // Extract the tailnet name from current hostname
    const tailnetMatch = hostname.match(/home\.([^.]+)\.ts\.net/);
    if (tailnetMatch) {
      const tailnetName = tailnetMatch[1];
      // Apply "1" prefix to port number (only if port exists)
      if (service.port) {
        const remotePort = `1${service.port}`;
        return `https://home.${tailnetName}.ts.net:${remotePort}/`;
      }
    }
  }
  
  // No fallback - if not Tailscale pattern, return empty string or handle appropriately
  // This forces the portal to be inaccessible if not on proper Tailscale domain
  return '';
};

export const PortalCard: React.FC<PortalCardProps> = ({
  service,
  onPortalDeleted,
  isCustomPortal,
}) => {
  const { isAdmin } = useAuth();
  const { show: renderTooltip } = useTooltip();
  const { isLoading, startLoading, stopLoading, withLoading } = useLoading();
  const { executeServiceAction, showServiceStatus } = useServiceControls();
  const { success, error } = useToast();

  // Early return if this portal shouldn't be shown on remote access
  if (isRemoteAccess()) {
    const dynamicUrl = constructDynamicRemoteUrl(service);
    if (!dynamicUrl) {
      return null;
    }
  }

  const handleClick = () => {
    const targetUrl = isRemoteAccess()
      ? constructDynamicRemoteUrl(service)
      : service.localURL;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete the portal "${service.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await withLoading(api.delete(API_ENDPOINTS.portals.delete(service.name)));
      success(`Portal "${service.name}" deleted successfully`);
      onPortalDeleted?.();
    } catch (err: any) {
      error(err.message || `Failed to delete portal "${service.name}"`);
    }
  };

  const handleServiceAction = async (action: ServiceAction) => {
    debug(`Button pressed: ${action} for service ${service.name}`);
    try {
      startLoading();
      debug(`Starting ${action} action for service ${service.name}...`);
      await executeServiceAction(service.services, action);
      debug(`Successfully completed ${action} action for service ${service.name}`);
    } catch (err) {
      debug(`Failed ${action} action for service ${service.name}:`, err);
      error(`Failed to ${action} service ${service.name}`);
      logger.error(`Service ${action} error:`, err);
    } finally {
      stopLoading();
      debug(`Finished ${action} action for service ${service.name}`);
    }
  };

  const handleStatusCheck = async () => {
    try {
      startLoading();
      await showServiceStatus(service.services);
    } catch (err) {
      error(`Failed to check status for ${service.name}`);
      logger.error('Status check error:', err);
    } finally {
      stopLoading();
    }
  };

  const renderAdminControls = (): JSX.Element | null => {
    if (!isAdmin) return null;

    // Link-only portals don't show admin controls
    if (service.type === 'link') {
      return null;
    }

    // Determine if service is script-managed
    const isScriptManaged = service.type === 'script';
    
    return (
      <div className="admin-controls">
        {isScriptManaged ? (
          <div className="script-management-notice">
            {renderTooltip(
              "System restart required for changes to take effect. Script-managed services are controlled through system scripts rather than direct service commands.",
              <div className="script-notice-text">
                Script-managed Service
              </div>
            )}
          </div>
        ) : (
          <div className="admin-controls-row">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleServiceAction('start');
              }}
              disabled={isLoading}
              title="Start service"
            >
              {isLoading ? <i className="fas fa-spinner fa-spin" /> : 'Start'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleServiceAction('stop');
              }}
              disabled={isLoading}
              title="Stop service"
            >
              {isLoading ? <i className="fas fa-spinner fa-spin" /> : 'Stop'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleServiceAction('restart');
              }}
              disabled={isLoading}
              title="Restart service"
            >
              {isLoading ? <i className="fas fa-spinner fa-spin" /> : 'Restart'}
            </button>
          </div>
        )}
        
        <div className="admin-controls-row">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleServiceAction('enable');
            }}
            disabled={isLoading}
            title="Enable service at boot"
          >
            {isLoading ? <i className="fas fa-spinner fa-spin" /> : 'Enable'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleServiceAction('disable');
            }}
            disabled={isLoading}
            title="Disable service at boot"
          >
            {isLoading ? <i className="fas fa-spinner fa-spin" /> : 'Disable'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStatusCheck();
            }}
            disabled={isLoading}
            title="Check service status"
          >
            {isLoading ? <i className="fas fa-spinner fa-spin" /> : 'Status'}
          </button>
        </div>
      </div>
    );
  };

  const getDestinationUrl = () => {
    return isRemoteAccess()
      ? constructDynamicRemoteUrl(service)
      : service.localURL;
  };

  const showDeleteButton = isAdmin && isCustomPortal(service.name);

  return (
    <div 
      className={`portal-card ${service.status}`}
      onClick={handleClick}
      role="link"
      tabIndex={0}
    >
      {showDeleteButton && (
        <button
          className="delete-portal-button"
          onClick={handleDelete}
          disabled={isLoading}
          title={`Delete portal "${service.name}"`}
          aria-label={`Delete portal "${service.name}"`}
        >
          <i className="fas fa-times" />
        </button>
      )}
      
      <div className="portal-card-header">
        {renderTooltip(getDestinationUrl(),
          <div>
            <img
              src={API_ENDPOINTS.portals.image(`${service.name}.png`)}
              alt={`${service.name} icon`}
              className="portal-icon"
              onError={(e) => {
                (e.target as HTMLImageElement).src = API_ENDPOINTS.portals.image('default.png');
              }}
            />
          </div>
        )}
        
        {!isAdmin && (
          <h3 className="portal-name">{service.name}</h3>
        )}
        
        {service.description && (
          <p className="portal-description">{service.description}</p>
        )}
      </div>

      <div className="portal-meta">
        {renderAdminControls()}
      </div>
    </div>
  );
};