import React from 'react';
import { useState } from 'react';
import { api } from '../../../api';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { useToast } from '../../../hooks/useToast';
import { showModal } from '../../../components/Popup/PopupManager';
import { ServiceStatusModal } from '../components/ServiceStatusModal';
import { PortalService } from '../types';
import { ApiResponse, ApiError } from '../../../api/interceptors';
import { debug, createComponentLogger } from '../../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('useServiceControls');

type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'status';

interface ServiceControlsHook {
  isProcessing: boolean;
  executeServiceAction: (services: string[], action: ServiceAction) => Promise<boolean>;
  showServiceStatus: (services: string[]) => Promise<void>;
}

interface ServiceControlResponse {
  success: boolean;
  message?: string;
  error?: string;
  output?: string;
  active?: boolean;
}

export const useServiceControls = (): ServiceControlsHook => {
  const [isProcessing, setIsProcessing] = useState(false);
  const toast = useToast();

  const executeServiceAction = async (services: string[], action: ServiceAction): Promise<boolean> => {
    if (!services.length) {
      debug('No services specified for action:', action);
      toast.error('No services specified');
      return false;
    }

    debug(`Executing ${action} on services:`, services);
    setIsProcessing(true);
    
    try {
      // Execute actions sequentially for each service
      for (const service of services) {
        debug(`Sending ${action} request for service: ${service}`);
        
        try {
          debug(`Making API call for ${action} on ${service}...`);
          const response = await api.post<ServiceControlResponse>(API_ENDPOINTS.services.control, {
            service,
            action
          });
          
          debug(`Response for ${service} ${action}:`, response);
          
          if (response.success) {
            debug(`Service ${service} ${action} successful:`, response.message);
            toast.success(response.message || `Successfully ${action}ed ${service}`);
          } else {
            debug(`Service ${service} ${action} failed:`, response.error);
            throw new ApiError(500, response.error || `Failed to ${action} ${service}`, response.output);
          }
        } catch (error) {
          logger.error(`Error executing ${action} on ${service}:`, error);
          setIsProcessing(false);
          
          if (error instanceof ApiError) {
            toast.error(error.message);
          } else {
            toast.error(`Failed to ${action} ${service}`);
          }
          
          return false;
        }
      }
      
      setIsProcessing(false);
      return true;
    } catch (e) {
      logger.error(`Error in executeServiceAction:`, e);
      setIsProcessing(false);
      return false;
    }
  };

  const showServiceStatus = async (services: string[]): Promise<void> => {
    if (!services.length) {
      toast.error('No services specified');
      return;
    }

    try {
      debug('Fetching status for services:', services);
      
      const statusPromises = services.map(async (service) => {
        debug(`Requesting status for service: ${service}`);
        
        try {
          const response = await api.post<ServiceControlResponse>(API_ENDPOINTS.services.control, {
            service,
            action: 'status'
          });
          
          debug(`Status for ${service}:`, response);
          
          // Check if the service is active using the new 'active' property
          // If not present (for backward compatibility), fall back to checking success
          const isActive = response.active !== undefined ? response.active : response.success;
          
          return { 
            service, 
            status: response.output || response.message || 'No status available',
            isError: false, // Status requests now always return success: true
            isActive: isActive // Add the active state
          };
        } catch (error) {
          logger.error(`Error getting status for ${service}:`, error);
          
          if (error instanceof ApiError) {
            return { 
              service, 
              status: error.details || error.message,
              isError: true,
              isActive: false
            };
          }
          
          return { 
            service, 
            status: `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true,
            isActive: false
          };
        }
      });

      const results = await Promise.all(statusPromises);
      debug('All status results:', results);
      
      // Format the status text
      const statusText = results
        .map(({ service, status, isError, isActive }) => {
          const header = `=== ${service} ===`;
          if (isError) {
            return `${header}\n⚠️ Error State:\n${status}`;
          }
          // Add an indicator for inactive services
          const statusPrefix = !isActive ? '⚠️ Service Inactive/Failed:\n' : '';
          return `${header}\n${statusPrefix}${status}`;
        })
        .join('\n\n');

      // Make sure we're passing the correct props to showModal
      showModal({
        title: 'Service Status',
        children: React.createElement(ServiceStatusModal, {
          statusText,
          onCopy: () => {
            navigator.clipboard.writeText(statusText);
            toast.success('Status copied to clipboard');
          }
        }),
        hideActions: true
      });

    } catch (error) {
      logger.error('Error in showServiceStatus:', error);
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error('Failed to get service status');
      }
    }
  };

  return {
    isProcessing,
    executeServiceAction,
    showServiceStatus
  };
}; 