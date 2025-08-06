import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSpinner, 
  faDownload, 
  faCheckCircle, 
  faExclamationTriangle,
  faInfoCircle,
  faCog,
  faList,
  faSync,
  faToggleOn,
  faToggleOff,
  faClock,
  faCalendarAlt,
  faPlay,
  faStop,
  faCalendarDay,
  faCalendarWeek,
  faCalendar,
  faEye,
  faSave
} from '@fortawesome/free-solid-svg-icons';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../hooks/useToast';
import { useLoading } from '../../../../hooks/useLoading';
import { debug, createComponentLogger } from '../../../../utils/debug';
import './UpdateManagerModal.css';

// Create component-specific logger
const logger = createComponentLogger('UpdateManagerModal');

interface UpdateManagerModalProps {
  onClose: () => void;
}

interface ModuleInfo {
  name: string;
  enabled: boolean;
  version?: string;
  description?: string;
  lastUpdated?: string;
}

interface UpdateCheckResponse {
  status: string;
  message: string;
  details?: {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    updateInfo: any;
    checkTime: number;
    operationTime: string;
  };
  error?: string;
}

interface ModuleExecutionResult {
  status: 'success' | 'warning' | 'error';
  updated: boolean;
  restored?: boolean;
  message: string;
}

interface UpdateApplyResponse {
  status: string;
  message: string;
  details?: {
    mode: string;
    force: boolean;
    updateResult: {
      success: boolean;
      summary: {
        total_modules_detected: number;
        schema_updated: number;
        schema_failed: number;
        system_successful: number;
        system_failed: number;
        actually_updated: number;
        failed_but_restored: number;
      };
      modules: {
        detected: string[];
        schema_updated: string[];
        schema_failed: string[];
        executed: Record<string, ModuleExecutionResult>;
        actually_updated: string[];
        failed_executions: string[];
        restored_executions: string[];
      };
      errors: string[];
    };
    appliedAt: number;
    operationTime: string;
  };
  error?: string;
}

interface ModulesListResponse {
  status: string;
  message: string;
  details?: {
    modules: ModuleInfo[];
    totalModules: number;
    enabledModules: number;
    disabledModules: number;
    listTime: number;
    operationTime: string;
  };
  error?: string;
}

interface SystemInfoResponse {
  status: string;
  message: string;
  details?: {
    systemInfo: any;
    homeserverVersion: {
      generation?: number;
      buildId?: string;
      lastUpdated?: string;
    };
    retrievalTime: number;
    operationTime: string;
  };
  error?: string;
}

interface UpdateSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
}

interface ScheduleResponse {
  status: string;
  message: string;
  details?: {
    schedule: UpdateSchedule;
    cronData: any;
    retrievalTime: number;
    operationTime: string;
  };
  error?: string;
}

type ViewMode = 'overview' | 'modules' | 'schedule' | 'updating';

export const UpdateManagerModal: React.FC<UpdateManagerModalProps> = ({ onClose }) => {
  // State management
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResponse | null>(null);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [homeserverVersion, setHomeserverVersion] = useState<any>(null);
  const [lastUpdateResult, setLastUpdateResult] = useState<UpdateApplyResponse | null>(null);
  const [updateSchedule, setUpdateSchedule] = useState<UpdateSchedule>({
    enabled: false,
    frequency: 'weekly',
    time: '03:00',
    dayOfWeek: 0
  });
  
  // Loading states
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingModules, setIsLoadingModules] = useState(false);
  const [isTogglingModule, setIsTogglingModule] = useState<string | null>(null);
  
  // Update progress tracking
  const [updateOutput, setUpdateOutput] = useState<string[]>([]);
  const [updateStartTime, setUpdateStartTime] = useState<number | null>(null);
  const [updateDuration, setUpdateDuration] = useState<string>('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const updateStartTimeRef = useRef<number | null>(null);
  
  // Hooks
  const api = useApi();
  const toast = useToast();
  const { isLoading, withLoading } = useLoading();

  // Helper function to calculate duration
  const calculateDuration = useCallback((startTime: number): string => {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Helper function for logging API activity
  const logApiActivity = useCallback((
    operation: string, 
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    requestData?: any,
    response?: any,
    error?: any
  ) => {
    const timestamp = new Date().toISOString();
    const logPrefix = `[${timestamp}] UpdateManager API`;
    
    debug(`${logPrefix} - ${operation}`);
    debug(`Method: ${method}`);
    debug(`Endpoint: ${endpoint}`);
    
    if (requestData) {
      debug('Request Data:', requestData);
    }
    
    if (response) {
      debug('Response:', response);
      debug('Response Success:', response.success);
      if (response.details) {
        debug('Response Details:', response.details);
      }
      if (response.error) {
        logger.error('Response Error:', response.error);
      }
    }
    
    if (error) {
      logger.error('Request Error:', error);
      logger.error('Error Stack:', error.stack);
    }
  }, []);

  // Scroll to bottom of log when new messages are added
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updateOutput]);

  // Update timer effect
  useEffect(() => {
    if (updateStartTime && isApplying) {
      updateTimerRef.current = setInterval(() => {
        const duration = calculateDuration(updateStartTime);
        setUpdateDuration(duration);
      }, 1000);
    } else {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    }

    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [updateStartTime, isApplying, calculateDuration]);

  // Load initial data
  useEffect(() => {
    loadSystemInfo();
    loadModules();
    handleCheckUpdates();
    loadSchedule();
  }, []);

  // Load system information
  const loadSystemInfo = useCallback(async () => {
    const endpoint = API_ENDPOINTS.admin.updates.systemInfo;
    
    try {
      logApiActivity('Load System Info - Request', endpoint, 'GET');
      
      const response = await api.get<SystemInfoResponse>(endpoint);
      
      logApiActivity('Load System Info - Response', endpoint, 'GET', undefined, response);
      
      if (response.status === 'success' && response.details) {
        setSystemInfo(response.details.systemInfo);
        setHomeserverVersion(response.details.homeserverVersion);
      } else {
        logger.warn('System info load failed:', response.error);
      }
    } catch (error) {
      logApiActivity('Load System Info - Error', endpoint, 'GET', undefined, undefined, error);
      logger.error('Error loading system info:', error);
    }
  }, [api, logApiActivity]);

  // Load update schedule
  const loadSchedule = useCallback(async () => {
    const endpoint = API_ENDPOINTS.admin.updates.schedule;
    
    try {
      logApiActivity('Load Schedule - Request', endpoint, 'GET');
      
      const response = await api.get<ScheduleResponse>(endpoint);
      
      logApiActivity('Load Schedule - Response', endpoint, 'GET', undefined, response);
      
      if (response.status === 'success' && response.details) {
        setUpdateSchedule(response.details.schedule);
      } else {
        logger.warn('Schedule load failed:', response.error);
        // Set default schedule if load fails
        setUpdateSchedule({
          enabled: false,
          frequency: 'weekly',
          time: '03:00',
          dayOfWeek: 0
        });
      }
    } catch (error) {
      logApiActivity('Load Schedule - Error', endpoint, 'GET', undefined, undefined, error);
      logger.error('Error loading schedule:', error);
      // Set default schedule on error
      setUpdateSchedule({
        enabled: false,
        frequency: 'weekly',
        time: '03:00',
        dayOfWeek: 0
      });
    }
  }, [api, logApiActivity]);

  // Load modules list
  const loadModules = useCallback(async () => {
    const endpoint = API_ENDPOINTS.admin.updates.modules;
    
    setIsLoadingModules(true);
    try {
      logApiActivity('Load Modules - Request', endpoint, 'GET');
      
      const response = await api.get<ModulesListResponse>(endpoint);
      
      logApiActivity('Load Modules - Response', endpoint, 'GET', undefined, response);
      
      if (response.status === 'success' && response.details) {
        setModules(response.details.modules);
      } else {
        logger.error('Modules load failed:', response.error);
        toast.error(response.error || 'Failed to load modules');
      }
    } catch (error) {
      logApiActivity('Load Modules - Error', endpoint, 'GET', undefined, undefined, error);
      logger.error('Error loading modules:', error);
      toast.error('Failed to load modules');
    } finally {
      setIsLoadingModules(false);
    }
  }, [api, toast, logApiActivity]);

  // Check for updates
  const handleCheckUpdates = useCallback(async () => {
    const endpoint = API_ENDPOINTS.admin.updates.check;
    
    setIsChecking(true);
    try {
      logApiActivity('Check Updates - Request', endpoint, 'GET');
      
      const response = await api.get<UpdateCheckResponse>(endpoint);
      
      logApiActivity('Check Updates - Response', endpoint, 'GET', undefined, response);
      
      setUpdateStatus(response);
      
      if (response.status === 'success') {
        if (response.details?.updateAvailable) {
          toast.success('Updates are available!');
        } else {
          toast.info('System is up to date');
        }
      } else {
        logger.error('Update check failed:', response.error);
        toast.error(response.error || 'Failed to check for updates');
      }
    } catch (error) {
      logApiActivity('Check Updates - Error', endpoint, 'GET', undefined, undefined, error);
      logger.error('Error checking updates:', error);
      toast.error('Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  }, [api, toast, logApiActivity]);

  // Toggle module enabled/disabled
  const handleToggleModule = useCallback(async (moduleName: string, enabled: boolean) => {
    const endpoint = API_ENDPOINTS.admin.updates.moduleToggle(moduleName);
    const requestData = { enabled };
    
    setIsTogglingModule(moduleName);
    try {
      logApiActivity(`Toggle Module ${moduleName} - Request`, endpoint, 'POST', requestData);
      
      const response = await api.post<{ status: string; error?: string }>(endpoint, requestData);
      
      logApiActivity(`Toggle Module ${moduleName} - Response`, endpoint, 'POST', requestData, response);
      
      if (response.status === 'success') {
        toast.success(`Module ${moduleName} ${enabled ? 'enabled' : 'disabled'} successfully`);
        // Reload modules to get updated state
        await loadModules();
      } else {
        logger.error(`Failed to ${enabled ? 'enable' : 'disable'} module ${moduleName}:`, response.error);
        toast.error(response.error || `Failed to ${enabled ? 'enable' : 'disable'} module`);
      }
    } catch (error) {
      logApiActivity(`Toggle Module ${moduleName} - Error`, endpoint, 'POST', requestData, undefined, error);
      logger.error(`Error toggling module ${moduleName}:`, error);
      toast.error(`Failed to ${enabled ? 'enable' : 'disable'} module`);
    } finally {
      setIsTogglingModule(null);
    }
  }, [api, toast, loadModules, logApiActivity]);

  // Apply updates with progress tracking
  const handleApplyUpdates = useCallback(async () => {
    if (!updateStatus?.details?.updateAvailable) {
      return;
    }
    
    // Show warning about potential disruption
    const confirmed = window.confirm(
      'Update Warning\n\n' +
      'This update process can take up to 30 minutes and some services may be temporarily disrupted as they update individually.\n\n' +
      'Please avoid powering off your home server during updates to prevent potential issues.\n\n' +
      'Continue with the update process?'
    );
    
    if (!confirmed) {
      return;
    }
    
    const endpoint = API_ENDPOINTS.admin.updates.apply;
    const requestData = { mode: 'full', force: false };
    
    const startTime = Date.now();
    setViewMode('updating');
    setIsApplying(true);
    setUpdateStartTime(startTime);
    updateStartTimeRef.current = startTime; // Store in ref for reliable access
    setUpdateDuration('0:00');
    setUpdateOutput(['Starting system update...']);
    
    try {
      logApiActivity('Apply Updates - Request', endpoint, 'POST', requestData);
      
      const response = await api.post<UpdateApplyResponse>(endpoint, requestData);
      
      logApiActivity('Apply Updates - Response', endpoint, 'POST', requestData, response);
      
      if (response.status === 'success') {
        const startTimeToUse = updateStartTimeRef.current || updateStartTime;
        const finalDuration = startTimeToUse ? calculateDuration(startTimeToUse) : updateDuration || '0:00';
        
        // Store detailed update results
        setLastUpdateResult(response);
        
        // Generate detailed success message with module information
        let successMessage = `✅ Update completed successfully!\nDuration: ${finalDuration}`;
        
        if (response.details?.updateResult?.modules?.actually_updated?.length > 0) {
          const updatedModules = response.details.updateResult.modules.actually_updated;
          successMessage += `\n\nModules Updated (${updatedModules.length}):`;
          updatedModules.forEach(module => {
            successMessage += `\n  ✓ ${module}`;
          });
        }
        
        if (response.details?.updateResult?.modules?.executed) {
          const executedModules = Object.entries(response.details.updateResult.modules.executed);
          const successfulNoUpdate = executedModules.filter(([_, result]) => 
            result.status === 'success' && !result.updated
          );
          const warnings = executedModules.filter(([_, result]) => 
            result.status === 'warning'
          );
          
          if (successfulNoUpdate.length > 0) {
            successMessage += `\n\nModules Executed (${successfulNoUpdate.length}):`;
            successfulNoUpdate.forEach(([module, _]) => {
              successMessage += `\n  ✓ ${module} (no update needed)`;
            });
          }
          
          if (warnings.length > 0) {
            successMessage += `\n\nWarnings (${warnings.length}):`;
            warnings.forEach(([module, result]) => {
              successMessage += `\n  ⚠ ${module}: ${result.message}`;
            });
          }
        }
        
        setUpdateOutput(prev => [...prev, '', '='.repeat(50), successMessage, '='.repeat(50)]);
        toast.success('Updates applied successfully!');
        
        // Refresh all data
        await Promise.all([
          handleCheckUpdates(),
          loadModules(),
          loadSystemInfo()
        ]);
      } else {
        logger.error('Update failed:', response.error);
        const startTimeToUse = updateStartTimeRef.current || updateStartTime;
        const finalDuration = startTimeToUse ? calculateDuration(startTimeToUse) : updateDuration || '0:00';
        setUpdateOutput(prev => [...prev, '', '='.repeat(50), `❌ Update failed!\nError: ${response.error || 'Update failed'}\nDuration: ${finalDuration}`, '='.repeat(50)]);
        toast.error(response.error || 'Failed to apply updates');
      }
    } catch (error) {
      logApiActivity('Apply Updates - Error', endpoint, 'POST', requestData, undefined, error);
      logger.error('Error applying updates:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const startTimeToUse = updateStartTimeRef.current || updateStartTime;
      const finalDuration = startTimeToUse ? calculateDuration(startTimeToUse) : updateDuration || '0:00';
      setUpdateOutput(prev => [...prev, '', '='.repeat(50), `❌ Update failed!\nError: ${errorMessage}\nDuration: ${finalDuration}`, '='.repeat(50)]);
      toast.error('Failed to apply updates');
    } finally {
      setIsApplying(false);
      updateStartTimeRef.current = null; // Clear the ref when done
    }
  }, [api, toast, updateStatus, handleCheckUpdates, loadModules, loadSystemInfo, logApiActivity]);

  // Save update schedule
  const handleSaveSchedule = useCallback(async () => {
    const endpoint = API_ENDPOINTS.admin.updates.schedule;
    
    try {
      logApiActivity('Save Schedule - Request', endpoint, 'POST', updateSchedule);
      
      const response = await withLoading(
        api.post<ScheduleResponse>(endpoint, updateSchedule)
      );
      
      logApiActivity('Save Schedule - Response', endpoint, 'POST', updateSchedule, response);
      
      if (response.status === 'success') {
        toast.success(updateSchedule.enabled 
          ? 'Automatic updates enabled successfully!' 
          : 'Automatic updates disabled successfully!'
        );
        
        // Reload schedule to confirm changes
        await loadSchedule();
      } else {
        logger.error('Schedule save failed:', response.error);
        toast.error(response.error || 'Failed to save schedule');
      }
    } catch (error) {
      logApiActivity('Save Schedule - Error', endpoint, 'POST', updateSchedule, undefined, error);
      logger.error('Error saving schedule:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to save schedule: ${errorMessage}`);
    }
  }, [api, toast, updateSchedule, withLoading, logApiActivity, loadSchedule]);

  // Refresh overview data (force fresh check)
  const refreshOverviewData = useCallback(async () => {
    await Promise.all([
      handleCheckUpdates(),
      loadSystemInfo(),
      loadModules()
    ]);
  }, [handleCheckUpdates, loadSystemInfo, loadModules]);

  // Handle view mode changes
  const handleViewModeChange = useCallback(async (newMode: ViewMode) => {
    if (isApplying) return; // Don't allow switching during updates
    
    setViewMode(newMode);
    
    // If switching to overview, refresh data to ensure we have latest info
    if (newMode === 'overview') {
      await refreshOverviewData();
    }
  }, [isApplying, refreshOverviewData]);

  // Render overview section
  const renderOverview = () => (
    <div className="update-overview">
      <div className="updates-available-section">
        <div className={`update-status-container ${updateStatus?.details?.updateAvailable ? 'available' : updateStatus ? 'none' : 'unknown'}`}>
          <FontAwesomeIcon 
            icon={updateStatus?.details?.updateAvailable ? faExclamationTriangle : updateStatus ? faCheckCircle : faInfoCircle} 
          />
          <span className="update-status-text">
            {updateStatus ? (
              updateStatus.details?.updateAvailable ? 'Updates Available' : 'System Up to Date'
            ) : (
              'Check for Updates'
            )}
          </span>
        </div>
      </div>

      <div className="system-summary-section">
        <div className="system-summary-grid">
          <div className="info-item">
            <label>Last Updated:</label>
            <span className="last-updated-text">{homeserverVersion?.lastUpdated || 'Unknown'}</span>
          </div>
        </div>
      </div>

      <div className="modules-summary">
        <h4>
          <FontAwesomeIcon icon={faList} />
          Modules Summary
        </h4>
        <div className="summary-stats">
          <div className="stat-item">
            <span className="stat-value">{modules.length}</span>
            <span className="stat-label">Total Modules</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{modules.filter(m => m.enabled).length}</span>
            <span className="stat-label">Enabled</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{modules.filter(m => !m.enabled).length}</span>
            <span className="stat-label">Disabled</span>
          </div>
        </div>
      </div>

      {lastUpdateResult?.details?.updateResult && (
        <div className="last-update-summary">
          <h4>
            <FontAwesomeIcon icon={faCheckCircle} />
            Last Update Results
          </h4>
          <div className="update-summary-stats">
            <div className="stat-item">
              <span className="stat-value">
                {lastUpdateResult.details.updateResult.summary.actually_updated}
              </span>
              <span className="stat-label">Modules Updated</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">
                {lastUpdateResult.details.updateResult.summary.system_successful}
              </span>
              <span className="stat-label">System Successful</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">
                {lastUpdateResult.details.updateResult.summary.failed_but_restored}
              </span>
              <span className="stat-label">Restored</span>
            </div>
          </div>
          
          {lastUpdateResult.details.updateResult.modules.actually_updated.length > 0 && (
            <div className="updated-modules-list">
              <h5>Recently Updated Modules:</h5>
              <div className="module-tags">
                {lastUpdateResult.details.updateResult.modules.actually_updated.map(module => (
                  <span key={module} className="module-tag updated">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    {module}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {lastUpdateResult.details.updateResult.modules.restored_executions.length > 0 && (
            <div className="restored-modules-list">
              <h5>Restored Modules:</h5>
              <div className="module-tags">
                {lastUpdateResult.details.updateResult.modules.restored_executions.map(module => (
                  <span key={module} className="module-tag warning">
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    {module}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Render modules management section
  const renderModules = () => (
    <div className="modules-management">
      <div className="modules-header">
        <h4>
          <FontAwesomeIcon icon={faList} />
          Module Management
        </h4>
        <button
          type="button"
          className="refresh-button"
          onClick={loadModules}
          disabled={isLoadingModules}
        >
          <FontAwesomeIcon icon={isLoadingModules ? faSpinner : faSync} spin={isLoadingModules} />
          Refresh
        </button>
      </div>

      <div className="modules-list">
        {modules.map((module) => (
          <div key={module.name} className="module-item">
            <div className="module-info">
              <h5>{module.name}</h5>
              {module.description && <p>{module.description}</p>}
              {module.version && <span className="module-version">v{module.version}</span>}
            </div>
            <button
              type="button"
              className={`toggle-button ${module.enabled ? 'enabled' : 'disabled'}`}
              onClick={() => handleToggleModule(module.name, !module.enabled)}
              disabled={isTogglingModule === module.name || isLoadingModules}
              style={{ pointerEvents: 'auto' }}
            >
              {isTogglingModule === module.name ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <FontAwesomeIcon icon={module.enabled ? faToggleOn : faToggleOff} />
              )}
              {module.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // Helper function to format schedule preview
  const getSchedulePreview = useCallback(() => {
    if (!updateSchedule.enabled) return null;
    
    const timeFormatted = new Date(`2000-01-01T${updateSchedule.time}`).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    switch (updateSchedule.frequency) {
      case 'daily':
        return `Updates will run daily at ${timeFormatted}`;
      case 'weekly': {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[updateSchedule.dayOfWeek || 0];
        return `Updates will run every ${dayName} at ${timeFormatted}`;
      }
      case 'monthly': {
        const dayOfMonth = updateSchedule.dayOfMonth || 1;
        const suffix = dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
        return `Updates will run on the ${dayOfMonth}${suffix} of each month at ${timeFormatted}`;
      }
      default:
        return '';
    }
  }, [updateSchedule]);

      // Render schedule section
  const renderSchedule = () => (
    <div className="update-schedule">

      <div className="schedule-form">
        {/* Toggle Switch */}
        <div 
          className={`update-schedule-toggle ${updateSchedule.enabled ? 'enabled' : ''}`}
          onClick={() => setUpdateSchedule(prev => ({ ...prev, enabled: !prev.enabled }))}
        >
          <div className={`schedule-toggle-switch ${updateSchedule.enabled ? 'enabled' : ''}`} />
          <div className="schedule-toggle-label">
            <h5 className="schedule-toggle-title">Automatic Updates</h5>
            <p className="schedule-toggle-description">
              {updateSchedule.enabled 
                ? 'Automatic updates are enabled and will run according to your schedule'
                : 'Enable automatic updates to keep your system current with the latest features and security patches'
              }
            </p>
          </div>
        </div>
        
        {/* Schedule Options */}
        <div className={`schedule-options ${updateSchedule.enabled ? 'visible' : ''}`}>
          {/* Frequency Selection */}
          <div className="form-group">
            <div className="frequency-selector">
              <div 
                className={`frequency-option ${updateSchedule.frequency === 'daily' ? 'active' : ''}`}
                onClick={() => setUpdateSchedule(prev => ({ ...prev, frequency: 'daily' }))}
              >
                <FontAwesomeIcon icon={faCalendarDay} className="icon" />
                <span>Daily</span>
              </div>
              <div 
                className={`frequency-option ${updateSchedule.frequency === 'weekly' ? 'active' : ''}`}
                onClick={() => setUpdateSchedule(prev => ({ ...prev, frequency: 'weekly' }))}
              >
                <FontAwesomeIcon icon={faCalendarWeek} className="icon" />
                <span>Weekly</span>
              </div>
              <div 
                className={`frequency-option ${updateSchedule.frequency === 'monthly' ? 'active' : ''}`}
                onClick={() => setUpdateSchedule(prev => ({ ...prev, frequency: 'monthly' }))}
              >
                <FontAwesomeIcon icon={faCalendar} className="icon" />
                <span>Monthly</span>
              </div>
            </div>
          </div>
          
          {/* Time and Day Selection */}
          <div className="form-row">
            <div className="form-group">
              <div className="time-input-group">
                <input
                  type="time"
                  className="form-control"
                  value={updateSchedule.time}
                  onChange={(e) => setUpdateSchedule(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>
            </div>
            
            {updateSchedule.frequency === 'weekly' && (
              <div className="form-group">
                <div className="day-selector">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <div
                      key={day}
                      className={`day-option ${updateSchedule.dayOfWeek === index ? 'active' : ''}`}
                      onClick={() => setUpdateSchedule(prev => ({ ...prev, dayOfWeek: index }))}
                    >
                      {day}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {updateSchedule.frequency === 'monthly' && (
              <div className="form-group">
                <label>
                  <FontAwesomeIcon icon={faCalendar} className="icon" />
                  Day of Month
                </label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  max="31"
                  value={updateSchedule.dayOfMonth || 1}
                  onChange={(e) => setUpdateSchedule(prev => ({ 
                    ...prev, 
                    dayOfMonth: parseInt(e.target.value) 
                  }))}
                />
              </div>
            )}
          </div>
          
          {/* Schedule Preview */}
          {updateSchedule.enabled && (
            <div className="schedule-preview">
              <h5>
                <FontAwesomeIcon icon={faEye} />
                Schedule Preview
              </h5>
              <div className="schedule-preview-text">
                <strong>{getSchedulePreview()}</strong>
              </div>
            </div>
          )}
        </div>
        
        <button
          type="button"
          className="save-schedule-button"
          onClick={handleSaveSchedule}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              Saving...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faSave} />
              Save Schedule
            </>
          )}
        </button>
      </div>
    </div>
  );

  // Render update progress section
  const renderUpdating = () => (
    <div className="update-progress">
      {isApplying && (
        <div className="progress-info">
          <div className="update-warning">
            <div className="warning-header">
              <FontAwesomeIcon icon={faInfoCircle} />
              <strong>Update in Progress</strong>
            </div>
            <p className="warning-text">
              Please avoid powering off your home server during updates
            </p>
          </div>
          <p>Please keep this window open. Updates can take up to 30 minutes.</p>
          <div className="progress-indicator">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Updating system... ({updateDuration})</span>
          </div>
        </div>
      )}
      <div className="update-log">
        {updateOutput.map((log, index) => (
          <div key={index} className="log-entry">{log}</div>
        ))}
        <div ref={logEndRef} />
      </div>
      {!isApplying && (
        <button
          type="button"
          className="back-button"
          onClick={() => handleViewModeChange('overview')}
        >
          Back to Overview
        </button>
      )}
    </div>
  );

  return (
    <form className="modal-form update-manager-modal" onSubmit={(e) => e.preventDefault()}>
      <div className="update-manager-header">
        <div className="view-tabs">
          <button
            type="button"
            className={`tab-button ${viewMode === 'overview' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('overview')}
            disabled={isApplying}
          >
            Overview
          </button>
          <button
            type="button"
            className={`tab-button ${viewMode === 'modules' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('modules')}
            disabled={isApplying}
          >
            Modules
          </button>
          <button
            type="button"
            className={`tab-button ${viewMode === 'schedule' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('schedule')}
            disabled={isApplying}
          >
            Schedule
          </button>
        </div>
      </div>

      <div className="update-manager-content">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'modules' && renderModules()}
        {viewMode === 'schedule' && renderSchedule()}
        {viewMode === 'updating' && renderUpdating()}
      </div>

      {viewMode !== 'updating' && (
        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button-secondary"
            onClick={onClose}
            disabled={isChecking || isApplying}
          >
            Close
          </button>
          
          <button
            type="button"
            className="modal-button modal-button-primary"
            onClick={handleCheckUpdates}
            disabled={isChecking || isApplying}
          >
            {isChecking ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                Checking...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSync} />
                Check for Updates
              </>
            )}
          </button>

          {updateStatus?.details?.updateAvailable && (
            <button
              type="button"
              className="modal-button modal-button-primary update-button"
              onClick={handleApplyUpdates}
              disabled={isChecking || isApplying}
            >
              {isApplying ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Applying Updates...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faDownload} />
                  Apply Updates
                </>
              )}
            </button>
          )}
        </div>
      )}
    </form>
  );
}; 