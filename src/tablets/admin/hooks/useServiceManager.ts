import { useLoading } from '../../../hooks/useLoading';
import { useToast } from '../../../hooks/useToast';
import { useModal } from '../../../hooks/useModal';
import { useConfirmModal } from '../../../hooks/useModal';
import { CheckServicesResponse, ManageServicesResponse, ServiceStatus, ServiceActionResult } from '../types';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { api } from '../../../api/client';
import { TOAST_DURATION } from '../utils/diskUtils';
import ServiceResultsModal from '../components/modals/ServiceResultsModal';
import React from 'react';

export interface ServiceManagerState {
  isCheckingServices: boolean;
  isManagingServices: boolean;
}

export interface ServiceManagerActions {
  checkServices: (action: 'mount' | 'unmount', mountPoint: string) => Promise<CheckServicesResponse>;
  manageServices: (action: 'start' | 'stop', serviceNames: string[]) => Promise<ManageServicesResponse>;
  handleServiceManagement: (
    action: 'mount' | 'unmount',
    mountPoint: string,
    onConfirm?: (result: boolean) => Promise<void>
  ) => Promise<boolean>;
}

export const useServiceManager = (): [ServiceManagerState, ServiceManagerActions] => {
  // Toast notifications
  const toast = useToast();
  
  // Confirmation modal
  const { confirm } = useConfirmModal({ title: 'Confirm Action' });
  
  // Results modal
  const { open: openModal } = useModal({ title: 'Service Results' });
  
  // Loading states for service management
  const { isLoading: isCheckingServices, startLoading: startCheckingServices, stopLoading: stopCheckingServices } = useLoading();
  const { isLoading: isManagingServices, startLoading: startManagingServices, stopLoading: stopManagingServices } = useLoading();
  
  // Function to check services based on action
  const checkServices = async (action: 'mount' | 'unmount', mountPoint: string): Promise<CheckServicesResponse> => {
    try {
      startCheckingServices();
      const response = await api.get<CheckServicesResponse>(
        `${API_ENDPOINTS.diskman.checkServices}?action=${action}&mount_point=${encodeURIComponent(mountPoint)}`
      );
      return response;
    } catch (error) {
      console.error(`[ServiceManager] Error checking services for ${action}:`, error);
      throw error;
    } finally {
      stopCheckingServices();
    }
  };
  
  // Function to manage services
  const manageServices = async (action: 'start' | 'stop', serviceNames: string[]): Promise<ManageServicesResponse> => {
    try {
      startManagingServices();
      const response = await api.post<ManageServicesResponse>(
        API_ENDPOINTS.diskman.manageServices,
        {
          action,
          services: serviceNames
        }
      );
      return response;
    } catch (error) {
      console.error(`[ServiceManager] Error ${action}ing services:`, error);
      throw error;
    } finally {
      stopManagingServices();
    }
  };

  // Function to handle service management workflow
  const handleServiceManagement = async (
    action: 'mount' | 'unmount',
    mountPoint: string,
    onConfirm?: (result: boolean) => Promise<void>
  ): Promise<boolean> => {
    console.log(`[ServiceManager] handleServiceManagement called with action: ${action}, mountPoint: ${mountPoint}`);
    try {
      // We only handle services for /mnt/nas right now
      if (mountPoint !== '/mnt/nas') {
        console.log(`[ServiceManager] Mount point ${mountPoint} is not /mnt/nas, skipping service management`);
        // No services to check for other mount points
        if (onConfirm) {
          console.log(`[ServiceManager] Calling onConfirm callback with true`);
          await onConfirm(true);
        }
        return true;
      }

      console.log(`[ServiceManager] Checking for ${action === 'mount' ? 'stopped' : 'running'} services for ${mountPoint}`);
      
      const servicesResponse = await checkServices(action, mountPoint);
      console.log(`[ServiceManager] Service check response:`, servicesResponse);
      
      // For mount action, we check for stopped services that should be started
      if (action === 'mount') {
        if (servicesResponse.status === 'success' && 
            servicesResponse.details?.hasStoppedServices && 
            servicesResponse.details.stoppedServices && 
            servicesResponse.details.stoppedServices.length > 0) {
          
          // Format the service list for display
          const serviceNames = servicesResponse.details.stoppedServices.map(s => s.name);
          const serviceList = serviceNames.join(', ');
          
          // Ask user if they want to start the services
          const confirmed = await confirm(
            `The following applications use your NAS drive and are currently stopped: ${serviceList}. ` +
            `Would you like to start them now? You can start them manually later if you prefer.`
          );
          
          if (confirmed) {
            // Start the services
            const startResponse = await manageServices('start', serviceNames);
            
            if (startResponse.status === 'success' && startResponse.details?.serviceResults) {
              // Get service results
              const serviceResults = startResponse.details.serviceResults;
              const successful = serviceResults.results.filter((r: ServiceActionResult) => r.success).length;
              const failed = serviceResults.results.filter((r: ServiceActionResult) => !r.success).length;
              
              // Show service results modal
              openModal(
                React.createElement(ServiceResultsModal, {
                  results: serviceResults.results,
                  metadata: serviceResults.metadata,
                  action: "start"
                })
              );
              
              if (failed === 0) {
                toast.success(`Successfully started all ${successful} applications.`, { duration: TOAST_DURATION.NORMAL });
              } else if (successful === 0) {
                toast.error(`Failed to start all applications.`, { duration: TOAST_DURATION.NORMAL });
              } else {
                toast.warning(`Started ${successful} applications, but ${failed} couldn't be started.`, { duration: TOAST_DURATION.NORMAL });
              }
              
              // Log detailed results
              console.log('[ServiceManager] Service start results:', serviceResults.results);
            } else {
              toast.error(startResponse.message || 'Failed to start applications.', { duration: TOAST_DURATION.NORMAL });
            }
          } else {
            toast.info('Applications will remain stopped. You can start them later if needed.', { duration: TOAST_DURATION.NORMAL });
          }
        }
        
        // Mount operation is confirmed regardless of service status
        if (onConfirm) await onConfirm(true);
        return true;
      }
      
      // For unmount action, we check for running services that should be stopped
      if (action === 'unmount') {
        console.log(`[ServiceManager] Processing unmount service check`);
        if (servicesResponse.status === 'success' && 
            servicesResponse.details?.hasRunningServices && 
            servicesResponse.details.runningServices && 
            servicesResponse.details.runningServices.length > 0) {
          
          console.log(`[ServiceManager] Found running services that need to be stopped:`, 
                     servicesResponse.details.runningServices);
                     
          // Format the service list for display
          const runningServices = servicesResponse.details.runningServices;
          const serviceNames = runningServices.map(s => s.name);
          const serviceList = serviceNames.join('\n- ');
          
          // Check if there are any script-managed services
          const scriptManagedServices = runningServices.filter(s => s.isScriptManaged);
          const hasScriptManagedServices = scriptManagedServices.length > 0;
          const scriptManagedServiceNames = scriptManagedServices.map(s => s.name);
          
          // Create appropriate message based on whether script-managed services are present
          let confirmMessage = `The following applications are currently using your NAS drive and need to be stopped: ${serviceList}. ` +
            `This prevents potential data loss. Would you like to stop these applications and unmount the NAS drive?`;
          
          if (hasScriptManagedServices) {
            confirmMessage += `\n\nNOTE: Some of these services (${scriptManagedServiceNames.join(', ')}) are script-managed services that may require a system reboot for complete cleanup.`;
          }
          
          // Ask user if they want to stop the services before unmounting
          console.log(`[ServiceManager] Showing confirmation dialog for stopping services`);
          const confirmed = await confirm(confirmMessage);
          console.log(`[ServiceManager] User confirmation for stopping services: ${confirmed}`);
          
          if (confirmed) {
            try {
              // Stop the services
              const stopResponse = await manageServices('stop', serviceNames);
              
              if (stopResponse.status === 'success' && stopResponse.details?.serviceResults) {
                // Get service results
                const serviceResults = stopResponse.details.serviceResults;
                const successful = serviceResults.results.filter((r: ServiceActionResult) => r.success).length;
                const failed = serviceResults.results.filter((r: ServiceActionResult) => !r.success).length;
                
                // Check if any of the successfully stopped services are script-managed
                const stoppedScriptServices = serviceResults.results.filter((r: ServiceActionResult) => r.success && r.isScriptManaged);
                const hasStoppedScriptServices = stoppedScriptServices.length > 0;
                
                // Show service results modal
                openModal(
                  React.createElement(ServiceResultsModal, {
                    results: serviceResults.results,
                    metadata: serviceResults.metadata,
                    action: "stop"
                  })
                );
                
                if (failed === 0) {
                  // Show success message with additional reboot note for script-managed services
                  if (hasStoppedScriptServices && serviceResults.metadata?.rebootNote) {
                    toast.success(`Successfully stopped all applications. ${serviceResults.metadata.rebootNote}`, { duration: TOAST_DURATION.LONG });
                  } else {
                    toast.success(`Successfully stopped all applications.`, { duration: TOAST_DURATION.NORMAL });
                  }
                  
                  // Continue with unmount
                  if (onConfirm) await onConfirm(true);
                  return true;
                } else if (successful === 0) {
                  toast.error(`Failed to stop applications. Cannot safely unmount.`, { duration: TOAST_DURATION.NORMAL });
                  return false; // Don't proceed with unmount
                } else {
                  // Some services couldn't be stopped - ask if user wants to force unmount
                  let forceMessage = `We were able to stop ${successful} applications, but ${failed} could not be stopped. `;
                  if (hasStoppedScriptServices && serviceResults.metadata?.rebootNote) {
                    forceMessage += `\n\n${serviceResults.metadata.rebootNote}`;
                  }
                  forceMessage += `\n\nContinuing with the unmount might lead to data loss. Would you like to force unmount anyway?`;
                  
                  console.log(`[ServiceManager] Showing force unmount confirmation dialog`);
                  const forceConfirmed = await confirm(forceMessage);
                  console.log(`[ServiceManager] User force confirmation: ${forceConfirmed}`);
                  
                  if (forceConfirmed) {
                    // User confirmed force unmount
                    console.log(`[ServiceManager] User confirmed force unmount, calling onConfirm callback with true`);
                    if (onConfirm) await onConfirm(true);
                    return true;
                  } else {
                    console.log(`[ServiceManager] User cancelled force unmount`);
                    toast.info('Unmount cancelled.', { duration: TOAST_DURATION.NORMAL });
                    return false;
                  }
                }
              } else {
                console.log(`[ServiceManager] Failed to stop services: ${stopResponse.message || 'Unknown error'}`);
                toast.error(stopResponse.message || 'Failed to stop services.', { duration: TOAST_DURATION.NORMAL });
                return false;
              }
            } catch (error) {
              console.error('[ServiceManager] Error stopping services:', error);
              
              // Ask if user wants to force unmount when service stopping fails entirely
              console.log(`[ServiceManager] Showing force unmount confirmation after error`);
              const forceConfirmed = await confirm(
                `Unable to stop the applications using your NAS drive.

Forcing the unmount could lead to data loss. Do you want to proceed anyway?`
              );
              console.log(`[ServiceManager] User force confirmation after error: ${forceConfirmed}`);
              
              if (forceConfirmed) {
                // User confirmed force unmount after error
                console.log(`[ServiceManager] User confirmed force unmount after error, calling onConfirm callback with true`);
                if (onConfirm) await onConfirm(true);
                return true;
              } else {
                console.log(`[ServiceManager] User cancelled force unmount after error`);
                toast.info('Unmount cancelled.', { duration: TOAST_DURATION.NORMAL });
                return false;
              }
            }
          } else {
            toast.info('Unmount cancelled.', { duration: TOAST_DURATION.NORMAL });
            return false;
          }
        } else {
          // No running services to stop
          console.log(`[ServiceManager] No running services found that need to be stopped, calling onConfirm callback with true`);
          if (onConfirm) await onConfirm(true);
          return true;
        }
      }
      
      // If we reach here, there was no action-specific logic (should never happen)
      console.log(`[ServiceManager] No action-specific logic found, using default flow, calling onConfirm with true`);
      if (onConfirm) await onConfirm(true);
      return true;
    } catch (error) {
      console.error('[ServiceManager] Unhandled error in service management:', error);
      if (onConfirm) {
        console.log(`[ServiceManager] Error occurred, calling onConfirm with false`);
        await onConfirm(false);
      }
      return false;
    }
  };

  return [
    {
      isCheckingServices,
      isManagingServices
    },
    {
      checkServices,
      manageServices,
      handleServiceManagement
    }
  ];
}; 