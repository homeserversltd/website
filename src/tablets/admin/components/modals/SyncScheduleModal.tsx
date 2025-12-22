import React, { useState, useEffect } from 'react';
import { SyncScheduleConfig } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faClock } from '@fortawesome/free-solid-svg-icons';
import './SyncScheduleModal.css';

interface SyncScheduleModalProps {
  currentSchedule: SyncScheduleConfig | null;
  onSave: (schedule: SyncScheduleConfig) => void;
  onCancel: () => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const SyncScheduleModal: React.FC<SyncScheduleModalProps> = ({ 
  currentSchedule, 
  onSave, 
  onCancel 
}) => {
  // Initialize state with current schedule or defaults
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(
    currentSchedule?.frequency || 'daily'
  );
  const [day, setDay] = useState<number>(
    currentSchedule?.day !== undefined ? currentSchedule.day : 1
  );
  const [hour, setHour] = useState<number>(
    currentSchedule?.hour !== undefined ? currentSchedule.hour : 2
  );
  const [minute, setMinute] = useState<number>(
    currentSchedule?.minute !== undefined ? currentSchedule.minute : 0
  );
  const [enabled, setEnabled] = useState<boolean>(
    currentSchedule?.enabled || false
  );

  // Generate time options
  const hourOptions = Array.from({ length: 24 }, (_, i) => {
    const hourValue = i;
    const amPm = hourValue < 12 ? 'AM' : 'PM';
    const hour12 = hourValue === 0 ? 12 : hourValue > 12 ? hourValue - 12 : hourValue;
    return {
      value: hourValue,
      label: `${hour12} ${amPm}`
    };
  });

  const minuteOptions = Array.from({ length: 60 }, (_, i) => ({
    value: i,
    label: i < 10 ? `0${i}` : `${i}`
  }));

  const handleSave = () => {
    const schedule: SyncScheduleConfig = {
      enabled,
      frequency,
      hour,
      minute
    };
    
    if (frequency === 'weekly') {
      schedule.day = day;
    }
    
    onSave(schedule);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="sync-schedule-modal">
      
      <div className="setup-instructions">
        <p>Toggle the switch below to enable or disable scheduled sync. When enabled, you can configure the frequency and time.</p>
      </div>
      
      <div className="sync-schedule-form">
        <div className="form-group toggle-group">
          <label className="switch-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="schedule-toggle"
            />
            <span className="switch-slider"></span>
            <span className="switch-text">Enable Scheduled Sync</span>
          </label>
        </div>
        
        <div className={`sync-modal-schedule-options ${!enabled ? 'sync-modal-disabled' : ''}`}>
          <div className="form-group">
            <label>
              <FontAwesomeIcon icon={faCalendarAlt} />
              Frequency
            </label>
            <div className="sync-modal-radio-group">
              <label className={`sync-modal-radio-label${frequency === 'daily' ? ' sync-modal-selected' : ''}`}>
                <input
                  type="radio"
                  name="frequency"
                  value="daily"
                  checked={frequency === 'daily'}
                  onChange={() => setFrequency('daily')}
                  disabled={!enabled}
                />
                <span className="sync-modal-radio-label-content">Daily</span>
              </label>
              <label className={`sync-modal-radio-label${frequency === 'weekly' ? ' sync-modal-selected' : ''}`}>
                <input
                  type="radio"
                  name="frequency"
                  value="weekly"
                  checked={frequency === 'weekly'}
                  onChange={() => setFrequency('weekly')}
                  disabled={!enabled}
                />
                <span className="sync-modal-radio-label-content">Weekly</span>
              </label>
            </div>
          </div>
          
          {frequency === 'weekly' && (
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCalendarAlt} />
                Day of Week
              </label>
              <select
                value={day}
                onChange={(e) => setDay(parseInt(e.target.value))}
                disabled={!enabled}
                className="sync-modal-schedule-select"
              >
                {DAYS_OF_WEEK.map(dayOption => (
                  <option key={dayOption.value} value={dayOption.value}>
                    {dayOption.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="form-group time-group">
            <label>
              <FontAwesomeIcon icon={faClock} />
              Time
            </label>
            <div className="time-selects">
              <select
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value))}
                disabled={!enabled}
                className="schedule-select hour-select"
              >
                {hourOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="time-separator">:</span>
              <select
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value))}
                disabled={!enabled}
                className="schedule-select minute-select"
              >
                {minuteOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="schedule-summary">
          {enabled ? (
            <p>
              <strong>Summary:</strong> {frequency === 'daily' ? 'Daily sync' : `Sync every ${DAYS_OF_WEEK.find(d => d.value === day)?.label}`} at {
                (() => {
                  const hourValue = hour;
                  const minuteValue = minute < 10 ? `0${minute}` : `${minute}`;
                  const amPm = hourValue < 12 ? 'AM' : 'PM';
                  const hour12 = hourValue === 0 ? 12 : hourValue > 12 ? hourValue - 12 : hourValue;
                  return `${hour12}:${minuteValue} ${amPm}`;
                })()
              }
            </p>
          ) : (
            <p><strong>Status:</strong> Automatic sync is disabled. You can still perform manual syncs using the &quot;Sync Now&quot; button.</p>
          )}
        </div>
      </div>
      
      <div className="sync-schedule-actions">
        <button className="cancel-button" onClick={handleCancel}>
          Cancel
        </button>
        <button className="save-button" onClick={handleSave}>
          Save Schedule
        </button>
      </div>
    </div>
  );
};

// Add a displayName to ensure we can find this component in the PopupManager
SyncScheduleModal.displayName = 'SyncScheduleModal';

export default SyncScheduleModal; 