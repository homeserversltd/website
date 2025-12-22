/**
 * HOMESERVER Backup Schedule Tab Component
 * Professional backup scheduling and automation configuration
 */

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCalendarAlt, 
  faClock, 
  faPlay, 
  faPause,
  faCheckCircle,
  faSave,
  faSpinner,
  faCalendarDay,
  faCalendarWeek,
  faCalendar,
  faEye
} from '@fortawesome/free-solid-svg-icons';
import { BackupScheduleConfig, ScheduleInfo, BackupConfig } from '../types';
import { showToast } from '../../../components/Popup/PopupManager'; //donot touch this
import { useTooltip } from '../../../../src/hooks/useTooltip';
import { useBackupControls } from '../hooks/useBackupControls';
import { Calendar, TimePicker, Toggle, Button } from '../../../components/ui';
import './ScheduleTab.css';

interface ScheduleTabProps {
  schedules?: BackupScheduleConfig[];
  onScheduleChange?: () => void;
  onConfigRefresh?: () => void;
  onHeaderStatsRefresh?: () => void;
  config?: BackupConfig | null;
}

interface UpdateSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  activeBackupType?: string; // Current backup type
}


export const ScheduleTab: React.FC<ScheduleTabProps> = ({ 
  schedules = [], 
  onScheduleChange,
  onConfigRefresh,
  onHeaderStatsRefresh,
  config
}) => {
  const {
    getSchedule,
    setScheduleConfig,
    syncNow,
    isLoading: apiLoading,
    error: apiError,
    clearError
  } = useBackupControls();

  const tooltip = useTooltip();

  const [updateSchedule, setUpdateSchedule] = useState<UpdateSchedule>({
    enabled: false,
    frequency: 'weekly',
    time: '02:00',
    dayOfWeek: 0,
    dayOfMonth: 1,
    activeBackupType: 'full'
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);

  // Load current schedule configuration on mount
  useEffect(() => {
    loadScheduleConfig();
  }, []);

  // TODO: Add real-time status updates for backup progress
  // TODO: Implement backup history/logs integration
  // TODO: Add backup size and storage usage information
  // TODO: Add backup validation and health checks

  const loadScheduleConfig = async () => {
    try {
      setIsInitialLoading(true);
      const schedule = await getSchedule();
      setScheduleInfo(schedule);
      
      // Parse existing schedule configuration if available
      if (schedule.schedule_config) {
        const config = schedule.schedule_config;
        
        // Convert hour/minute to time string if needed
        let timeString = config.time;
        if (!timeString && typeof config.hour === 'number' && typeof config.minute === 'number') {
          timeString = `${config.hour.toString().padStart(2, '0')}:${config.minute.toString().padStart(2, '0')}`;
        }
        
        // Determine frequency - use existing or default to weekly
        const frequency = (config.frequency as 'daily' | 'weekly' | 'monthly') || 'weekly';
        
        setUpdateSchedule({
          enabled: Boolean(config.enabled),
          frequency: frequency,
          time: timeString || '02:00',
          dayOfWeek: typeof config.dayOfWeek === 'number' ? config.dayOfWeek : 0,
          dayOfMonth: typeof config.dayOfMonth === 'number' ? config.dayOfMonth : 1
        });
      } else {
        // No existing config - use defaults
        setUpdateSchedule({
          enabled: false,
          frequency: 'weekly',
          time: '02:00',
          dayOfWeek: 0,
          dayOfMonth: 1
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load schedule configuration';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    } finally {
      setIsInitialLoading(false);
    }
  };

  // Helper function to format schedule preview (what user is configuring)
  const getSchedulePreview = () => {
    if (!updateSchedule.enabled) return null;
    
    const timeFormatted = new Date(`2000-01-01T${updateSchedule.time}`).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Show the user-selected frequency
    switch (updateSchedule.frequency) {
      case 'daily':
        return `Backups will run daily at ${timeFormatted}`;
      case 'weekly': {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[updateSchedule.dayOfWeek || 0];
        return `Backups will run every ${dayName} at ${timeFormatted}`;
      }
      case 'monthly': {
        const dayOfMonth = updateSchedule.dayOfMonth || 1;
        const suffix = dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
        return `Backups will run on the ${dayOfMonth}${suffix} of each month at ${timeFormatted}`;
      }
      default:
        return '';
    }
  };

  // Helper function to format deployed schedule (what's actually in cron)
  const getDeployedSchedule = () => {
    if (!scheduleInfo?.schedule_config?.enabled) return 'Not scheduled';
    
    const config = scheduleInfo.schedule_config;
    
    // Convert hour/minute to time string if needed
    let timeString = config.time;
    if (!timeString && typeof config.hour === 'number' && typeof config.minute === 'number') {
      timeString = `${config.hour.toString().padStart(2, '0')}:${config.minute.toString().padStart(2, '0')}`;
    }
    
      // If we have the frontend configuration format, use it directly
      if (config.frequency && timeString) {
        const timeFormatted = new Date(`2000-01-01T${timeString}`).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        // Show the user-selected frequency
        switch (config.frequency) {
          case 'daily':
            return `Backups run daily at ${timeFormatted}`;
          case 'weekly': {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayIndex = typeof config.dayOfWeek === 'number' ? config.dayOfWeek : parseInt(String(config.dayOfWeek)) || 0;
            const dayName = days[dayIndex];
            return `Backups run every ${dayName} at ${timeFormatted}`;
          }
          case 'monthly': {
            const dayOfMonth = typeof config.dayOfMonth === 'number' ? config.dayOfMonth : parseInt(String(config.dayOfMonth)) || 1;
            const suffix = dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
            return `Backups run on the ${dayOfMonth}${suffix} of each month at ${timeFormatted}`;
          }
          default:
            return 'Schedule configured';
        }
      }
    
    // Fallback: parse cron schedule if available
    if (config.schedule) {
      const cronParts = config.schedule.split(' ');
      if (cronParts.length !== 5) return config.schedule; // Fallback to raw cron if can't parse
      
      const [minute, hour, day, month, weekday] = cronParts;
      
      // Convert 24-hour to 12-hour format
      const hourNum = parseInt(hour);
      const timeFormatted = new Date(`2000-01-01T${hourNum.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      // Determine frequency based on cron pattern
      if (weekday !== '*') {
        // Weekly schedule
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[parseInt(weekday)];
        return `Backups will run every ${dayName} at ${timeFormatted}`;
      } else if (day !== '*') {
        // Monthly schedule
        const dayOfMonth = parseInt(day);
        const suffix = dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th';
        return `Backups will run on the ${dayOfMonth}${suffix} of each month at ${timeFormatted}`;
      } else {
        // Daily schedule
        return `Backups will run daily at ${timeFormatted}`;
      }
    }
    
    return 'Not scheduled';
  };

  const saveSchedule = async () => {
    setIsLoading(true);
    try {
      // Convert UpdateSchedule to backend format
      const [hour, minute] = updateSchedule.time.split(':').map(Number);
      const scheduleConfig = {
        enabled: updateSchedule.enabled,
        frequency: updateSchedule.frequency,
        hour: hour || 2,
        minute: minute || 0,
        dayOfWeek: updateSchedule.frequency === 'weekly' ? updateSchedule.dayOfWeek : undefined,
        dayOfMonth: updateSchedule.frequency === 'monthly' ? updateSchedule.dayOfMonth : undefined,
        repositories: [],
        time: updateSchedule.time
      };
      
      // Save to backend
      await setScheduleConfig(scheduleConfig);
      
      onScheduleChange?.();
      
      showToast({
        message: `Schedule ${updateSchedule.enabled ? 'saved and enabled' : 'saved and disabled'} successfully`,
        variant: 'success',
        duration: 3000
      });
      
      // Reload schedule info to get updated status
      await loadScheduleConfig();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save schedule';
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runBackupNow = async () => {
    console.log('=== FRONTEND SYNC NOW STARTED ===');
    console.log('Setting loading state to true');
    setIsLoading(true);
    
    try {
      console.log('Calling syncNow() API...');
      const result = await syncNow();
      console.log('syncNow() API response:', result);
      
      console.log('Showing success toast');
      showToast({
        message: 'Backup initiated - running in background',
        variant: 'success',
        duration: 3000
      });
      
      console.log('Reloading schedule config...');
      // Reload schedule info to get updated last run time
      await loadScheduleConfig();
      console.log('Schedule config reloaded successfully');
      
      console.log('Reloading main config...');
      // Reload main config to get updated backup count
      if (onConfigRefresh) {
        await onConfigRefresh();
        console.log('Main config reloaded successfully');
      }
      
      console.log('Reloading header stats...');
      // Reload header stats to get updated Last Backup and Size
      if (onHeaderStatsRefresh) {
        await onHeaderStatsRefresh();
        console.log('Header stats reloaded successfully');
      }
    } catch (error) {
      console.error('=== FRONTEND SYNC NOW ERROR ===');
      console.error('Error type:', typeof error);
      console.error('Error instance of Error:', error instanceof Error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Full error object:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to run backup';
      console.log('Showing error toast with message:', errorMessage);
      showToast({
        message: errorMessage,
        variant: 'error',
        duration: 4000
      });
    } finally {
      console.log('Setting loading state to false');
      setIsLoading(false);
      console.log('=== FRONTEND SYNC NOW COMPLETED ===');
    }
  };


  // Show loading state while initial configuration is being loaded
  if (isInitialLoading) {
    return (
      <div className="update-schedule">
        <div className="schedule-form">
          <div className="loading-container">
            <FontAwesomeIcon icon={faSpinner} spin className="loading-spinner" />
            <p>Loading schedule configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="update-schedule">
      <div className="schedule-form">
        {/* Toggle Switch */}
        <div className="schedule-toggle-section">
          <div className="schedule-toggle-header">
            <h5 className="schedule-toggle-title">Automatic Backups</h5>
            <Toggle
              checked={updateSchedule.enabled}
              onChange={(checked) => setUpdateSchedule(prev => ({ ...prev, enabled: checked }))}
              size="medium"
            />
          </div>
          <p className="schedule-toggle-description">
            {updateSchedule.enabled 
              ? 'Automatic backups are enabled and will run according to your schedule'
              : 'Enable automatic backups to keep your data protected with scheduled backups'
            }
          </p>
        </div>
        
        {/* Schedule Options */}
        <div className={`schedule-options ${updateSchedule.enabled ? 'visible' : ''}`}>
          {/* Frequency Selection - all options available */}
          <div className="form-group">
            <div className="frequency-selector">
              {(['daily', 'weekly', 'monthly'] as const).map(frequency => {
                const isActive = updateSchedule.frequency === frequency;
                const icon = frequency === 'daily' ? faCalendarDay : frequency === 'weekly' ? faCalendarWeek : faCalendar;
                
                return (
                  <Button
                    key={frequency}
                    variant={isActive ? 'primary' : 'secondary'}
                    size="medium"
                    onClick={() => setUpdateSchedule(prev => ({ ...prev, frequency }))}
                    icon={<FontAwesomeIcon icon={icon} />}
                    iconPosition="left"
                  >
                    {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                  </Button>
                );
              })}
            </div>
          </div>
          
          {/* Time and Day Selection */}
          <div className="form-row">
            <div className="form-group">
              <TimePicker
                value={updateSchedule.time}
                onChange={(time) => setUpdateSchedule(prev => ({ ...prev, time }))}
                disabled={!updateSchedule.enabled}
              />
            </div>
            
            {updateSchedule.frequency === 'weekly' && (
              <div className="form-group">
                <div className="day-selector">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <Button
                      key={day}
                      variant={updateSchedule.dayOfWeek === index ? 'primary' : 'secondary'}
                      size="small"
                      onClick={() => setUpdateSchedule(prev => ({ ...prev, dayOfWeek: index }))}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            {updateSchedule.frequency === 'monthly' && (
              <div className="form-group">
                <Calendar
                  frequency="monthly"
                  value={updateSchedule.dayOfMonth 
                    ? new Date(new Date().getFullYear(), 0, updateSchedule.dayOfMonth).toISOString().split('T')[0]
                    : new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
                  }
                  onChange={(value) => {
                    const dayOfMonth = parseInt(value.split('-')[2]);
                    setUpdateSchedule(prev => ({ ...prev, dayOfMonth }));
                  }}
                  disabled={!updateSchedule.enabled}
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
        
        {/* Schedule Status */}
        <div className="schedule-status">
          <h5>
            <FontAwesomeIcon icon={faClock} />
            Backup Status
          </h5>
          <div className="status-info">
            <div className="status-item">
              <strong>Next Scheduled Backup:</strong> 
              <span className="status-value">
                {getDeployedSchedule()}
              </span>
            </div>
            {/* TODO: Hook up last run information from backup logs - integrate with backup service logs */}
            {scheduleInfo?.last_run && (
              <div className="status-item">
                <strong>Last Run:</strong> 
                <span className="status-value">{scheduleInfo.last_run}</span>
              </div>
            )}
          </div>
        </div>

        <div className="schedule-actions">
          <Button
            variant="primary"
            size="medium"
            onClick={runBackupNow}
            disabled={isLoading || apiLoading}
            loading={isLoading || apiLoading}
            icon={!isLoading && !apiLoading ? <FontAwesomeIcon icon={faPlay} /> : undefined}
            iconPosition="left"
          >
            {isLoading || apiLoading ? 'Running...' : 'Sync Now'}
          </Button>
          
          <Button
            variant="primary"
            size="medium"
            onClick={saveSchedule}
            disabled={isLoading || apiLoading}
            loading={isLoading || apiLoading}
            icon={!isLoading && !apiLoading ? <FontAwesomeIcon icon={faSave} /> : undefined}
            iconPosition="left"
          >
            {isLoading || apiLoading ? 'Saving...' : 'Save Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
};


export default ScheduleTab;
