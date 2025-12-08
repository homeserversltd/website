import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar } from '@fortawesome/free-solid-svg-icons';
import { showModal, closeModal } from '../Popup/PopupManager';
import { CalendarProps } from './types';
import '../../styles/common/ui/_calendar.css';

export const Calendar: React.FC<CalendarProps> = ({
  frequency,
  value,
  onChange,
  disabled = false,
  size = 'medium',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<string>('');

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Parse initial value
  useEffect(() => {
    if (frequency === 'weekly' && value) {
      setSelectedDayOfWeek(value);
    } else if (frequency === 'monthly' && value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date);
      }
    }
  }, [frequency, value]);

  const handleDateSelect = (dayNumber: number) => {
    const currentYear = new Date().getFullYear();
    const month = 0; // January (any month with 30 days)
    
    const date = new Date(currentYear, month, dayNumber);
    setSelectedDate(date);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    onChange(dateStr);
    closeModal();
  };

  const handleDayOfWeekSelect = (day: string) => {
    setSelectedDayOfWeek(day);
    onChange(day);
    closeModal();
  };

  const formatDisplayValue = () => {
    if (frequency === 'weekly') {
      return selectedDayOfWeek || 'Select day';
    } else {
      return selectedDate ? selectedDate.toLocaleDateString() : 'Select date';
    }
  };

  const isSelected = (dayNumber: number) => {
    if (!selectedDate) return false;
    return selectedDate.getDate() === dayNumber;
  };

  const openCalendarModal = () => {
    if (disabled) return;
    
    const modalContent = (
      <div className="ui-calendar-modal-content">
        <div className="ui-calendar-body">
          {frequency === 'weekly' ? (
            <div className="ui-calendar-weekly-selector">
              {weekDays.map(day => (
                <button
                  key={day}
                  className={`ui-calendar-day-of-week-btn ${selectedDayOfWeek === day ? 'selected' : ''}`}
                  onClick={() => handleDayOfWeekSelect(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          ) : (
            <div className="ui-calendar-monthly">
              <div className="ui-calendar-month">
                January {new Date().getFullYear()}
              </div>
              
              <div className="ui-calendar-date-grid">
                {Array.from({ length: 30 }, (_, i) => i + 1).map(dayNumber => (
                  <button
                    key={dayNumber}
                    className={`ui-calendar-date-btn ${isSelected(dayNumber) ? 'selected' : ''}`}
                    onClick={() => handleDateSelect(dayNumber)}
                    title={`Select day ${dayNumber}`}
                  >
                    {dayNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );

    showModal({
      title: frequency === 'weekly' ? 'Choose Day of Week' : 'Pick Monthly Date',
      children: modalContent,
      hideActions: true,
      onClose: () => closeModal()
    });
  };

  const containerClasses = [
    'ui-calendar-container',
    `ui-calendar-container--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inputClasses = [
    'ui-calendar-input',
    disabled ? 'ui-calendar-input--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses}>
      <div 
        className={inputClasses}
        onClick={openCalendarModal}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            openCalendarModal();
          }
        }}
        aria-label={ariaLabel || (frequency === 'weekly' ? 'Select day of week' : 'Select date')}
      >
        <span className="ui-calendar-display">{formatDisplayValue()}</span>
        <span className="ui-calendar-icon">
          <FontAwesomeIcon icon={faCalendar} />
        </span>
      </div>
    </div>
  );
};
