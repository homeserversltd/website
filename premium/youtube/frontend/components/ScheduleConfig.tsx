import React, { useState, useEffect } from 'react';
import { YoutubeSchedule } from '../types';

interface ScheduleConfigProps {
  schedule: YoutubeSchedule;
  onUpdate: (enabled: boolean, hour: number, minute: number) => Promise<void>;
  isLoading?: boolean;
}

export const ScheduleConfig: React.FC<ScheduleConfigProps> = ({
  schedule,
  onUpdate,
  isLoading = false
}) => {
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [hour, setHour] = useState(schedule.hour);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(schedule.enabled);
    setHour(schedule.hour);
  }, [schedule]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    if (hour < 0 || hour > 23) {
      setError('Hour must be between 0 and 23');
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate(enabled, hour, 0);
      setSuccess('Schedule updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:00 ${period}`;
  };

  return (
    <div className="schedule-config">
      <div className="schedule-controls">
        <div className="schedule-controls-row">
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={isSaving || isLoading}
              />
              <span>Enable automatic subscription checks</span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="schedule-hour">Check Hour</label>
            <select
              id="schedule-hour"
              value={hour}
              onChange={(e) => setHour(parseInt(e.target.value))}
              disabled={isSaving || isLoading}
            >
              {Array.from({ length: 24 }, (_, i) => {
                const period = i >= 12 ? 'PM' : 'AM';
                const displayHour = i % 12 || 12;
                return (
                  <option key={i} value={i}>
                    {displayHour}:00 {period} ({i.toString().padStart(2, '0')}:00)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {enabled && (
          <div className="schedule-preview">
            <p>Next check will run daily at <strong>{formatTime(hour)}</strong></p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="save-button"
        >
          {isSaving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>
    </div>
  );
};

