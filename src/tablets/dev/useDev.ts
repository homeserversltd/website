import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { API_ENDPOINTS } from '../../api/endpoints';
import { 
  DevFilesResponse, 
  DevWipeResponse, 
  DevFinaleResponse, 
  DevLogResponse,
  DevHardDriveDevicesResponse,
  DevHardDriveTestRequest,
  DevHardDriveTestResponse,
  DevHardDriveTestResultsResponse,
  DevThermalTestResponse,
  DevThermalTestResultsResponse
} from './types';

interface DevDisableResponse {
  status: string;
  message?: string;
}

export const useDev = () => {
  const { post, get } = useApi();
  const { success, error } = useToast();

  const disableDevTab = async (): Promise<boolean> => {
    try {
      const response = await post<DevDisableResponse>(API_ENDPOINTS.dev.disable);
      
      if (response.status === 'success') {
        success('Developer tab disabled successfully');
        return true;
      } else {
        error(response.message || 'Failed to disable developer tab');
        return false;
      }
    } catch (err: any) {
      console.error('Error disabling developer tab:', err);
      error(err.response?.data?.message || 'Failed to disable developer tab');
      return false;
    }
  };

  const getDevFiles = async (): Promise<DevFilesResponse | null> => {
    try {
      const response = await get<DevFilesResponse>(API_ENDPOINTS.dev.files);
      return response;
    } catch (err: any) {
      console.error('Error retrieving dev files:', err);
      error(err.response?.data?.message || 'Failed to retrieve dev files');
      return null;
    }
  };

  const wipeDeployPartition = async (): Promise<boolean> => {
    try {
      const response = await post<DevWipeResponse>(API_ENDPOINTS.dev.wipeDeployPartition);
      
      if (response.status === 'success') {
        success('Deploy partition wipe completed successfully');
        return true;
      } else {
        error(response.message || 'Failed to wipe deploy partition');
        return false;
      }
    } catch (err: any) {
      console.error('Error wiping deploy partition:', err);
      error(err.response?.data?.message || 'Failed to wipe deploy partition');
      return false;
    }
  };

  const finaleWrapup = async (): Promise<boolean> => {
    try {
      const response = await post<DevFinaleResponse>(API_ENDPOINTS.dev.finaleWrapup);
      
      if (response.status === 'success') {
        const deletedFiles = response.data?.deleted_files || [];
        if (deletedFiles.length > 0) {
          success(`Finale wrapup completed - deleted ${deletedFiles.length} file(s)`);
        } else {
          success('Finale wrapup completed - no files found to delete');
        }
        return true;
      } else {
        error(response.message || 'Failed to complete finale wrapup');
        return false;
      }
    } catch (err: any) {
      console.error('Error during finale wrapup:', err);
      error(err.response?.data?.message || 'Failed to complete finale wrapup');
      return false;
    }
  };

  const getDeploymentLog = async (): Promise<DevLogResponse | null> => {
    try {
      const response = await get<DevLogResponse>(API_ENDPOINTS.dev.deploymentLog);
      return response;
    } catch (err: any) {
      console.error('Error retrieving deployment log:', err);
      error(err.response?.data?.message || 'Failed to retrieve deployment log');
      return null;
    }
  };

  const getHardDriveDevices = async (): Promise<DevHardDriveDevicesResponse | null> => {
    try {
      const response = await get<DevHardDriveDevicesResponse>(API_ENDPOINTS.dev.hardDriveTest.devices);
      return response;
    } catch (err: any) {
      console.error('Error retrieving hard drive devices:', err);
      error(err.response?.data?.message || 'Failed to retrieve hard drive devices');
      return null;
    }
  };

  const startHardDriveTest = async (device: string, testType: 'quick' | 'full' | 'ultimate'): Promise<DevHardDriveTestResponse | null> => {
    try {
      const request: DevHardDriveTestRequest = {
        device,
        test_type: testType
      };
      
      const response = await post<DevHardDriveTestResponse>(API_ENDPOINTS.dev.hardDriveTest.start, request);
      
      if (response.status === 'success') {
        success(`Hard drive test started successfully on ${device}`);
        return response;
      } else {
        error(response.message || 'Failed to start hard drive test');
        return null;
      }
    } catch (err: any) {
      console.error('Error starting hard drive test:', err);
      error(err.response?.data?.message || 'Failed to start hard drive test');
      return null;
    }
  };

  const getHardDriveTestResults = async (): Promise<DevHardDriveTestResultsResponse | null> => {
    try {
      const response = await get<DevHardDriveTestResultsResponse>(API_ENDPOINTS.dev.hardDriveTest.results);
      return response;
    } catch (err: any) {
      console.error('Error retrieving hard drive test results:', err);
      error(err.response?.data?.message || 'Failed to retrieve hard drive test results');
      return null;
    }
  };

  const getThermalTestResults = async (): Promise<DevThermalTestResultsResponse | null> => {
    try {
      const response = await get<DevThermalTestResultsResponse>(API_ENDPOINTS.dev.thermalTest.results);
      return response;
    } catch (err: any) {
      console.error('Error retrieving thermal test results:', err);
      error(err.response?.data?.message || 'Failed to retrieve thermal test results');
      return null;
    }
  };

  const startThermalTest = async (): Promise<DevThermalTestResponse | null> => {
    try {
      const response = await post<DevThermalTestResponse>(API_ENDPOINTS.dev.thermalTest.start);
      
      if (response.status === 'success') {
        success('Thermal test started successfully');
        return response;
      } else {
        error(response.message || 'Failed to start thermal test');
        return null;
      }
    } catch (err: any) {
      console.error('Error starting thermal test:', err);
      error(err.response?.data?.message || 'Failed to start thermal test');
      return null;
    }
  };

  const clearThermalTestResults = async (): Promise<boolean> => {
    try {
      const response = await post<{ status: string; message?: string }>(API_ENDPOINTS.dev.thermalTest.clearResults);
      
      if (response.status === 'success') {
        success('Thermal test results cleared successfully');
        return true;
      } else {
        error(response.message || 'Failed to clear thermal test results');
        return false;
      }
    } catch (err: any) {
      console.error('Error clearing thermal test results:', err);
      error(err.response?.data?.message || 'Failed to clear thermal test results');
      return false;
    }
  };

  const unlockDeployPartition = async (): Promise<boolean> => {
    try {
      const response = await post<{ status: string; message?: string; data?: any }>(API_ENDPOINTS.dev.unlockDeploy);
      
      if (response.status === 'success') {
        success(response.message || 'Deploy partition unlocked and mounted successfully');
        return true;
      } else {
        error(response.message || 'Failed to unlock deploy partition');
        return false;
      }
    } catch (err: any) {
      console.error('Error unlocking deploy partition:', err);
      error(err.response?.data?.message || 'Failed to unlock deploy partition');
      return false;
    }
  };

  return {
    disableDevTab,
    getDevFiles,
    wipeDeployPartition,
    finaleWrapup,
    getDeploymentLog,
    unlockDeployPartition,
    getHardDriveDevices,
    startHardDriveTest,
    getHardDriveTestResults,
    getThermalTestResults,
    startThermalTest,
    clearThermalTestResults
  };
};