import React, { useState, useEffect } from 'react';
import { DhcpStatistics } from '../types';

interface ReservationSliderProps {
  statistics: DhcpStatistics | null;
  currentReservations: number;
  currentHosts: number;
  currentBoundary?: number;
  onBoundaryUpdate: (maxReservations: number) => Promise<void>;
  isLoading?: boolean;
}

export const ReservationSlider: React.FC<ReservationSliderProps> = ({
  statistics,
  currentReservations,
  currentHosts,
  currentBoundary,
  onBoundaryUpdate,
  isLoading = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  // Initialize with current boundary if available, otherwise use current reservations
  const initialValue = currentBoundary !== undefined ? currentBoundary : currentReservations;
  const [sliderValue, setSliderValue] = useState(initialValue);
  const [isUpdating, setIsUpdating] = useState(false);

  // Total IPs available: 192.168.123.2 to 192.168.123.250 = 249 IPs
  const TOTAL_IPS = 249;
  
  // Calculate constraints
  // Min value: can't go below current reservation count
  // If there are no reservations, we can go down to 0 (full pool range 2-250)
  const minValue = currentReservations;
  
  // Constraint logic:
  // - If there are 0 active hosts (leases), we can set all IPs to reservations (max = TOTAL_IPS, leaving 0 leases capacity)
  // - If there are active hosts, we must ensure at least that many leases can be accommodated
  //   So max reservations = TOTAL_IPS - active_hosts_count
  const maxValue = currentHosts === 0 ? TOTAL_IPS : TOTAL_IPS - currentHosts;

  // Calculate recommended value: 20% reservations, 80% leases
  const recommendedValue = Math.max(minValue, Math.min(maxValue, Math.round(TOTAL_IPS * 0.20)));

  useEffect(() => {
    // Update slider value when current boundary or reservations change
    const newValue = currentBoundary !== undefined ? currentBoundary : currentReservations;
    setSliderValue(newValue);
  }, [currentBoundary, currentReservations]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setSliderValue(value);
  };

  const handleSliderRelease = async () => {
    const previousValue = currentBoundary !== undefined ? currentBoundary : currentReservations;
    if (sliderValue === previousValue) {
      return; // No change
    }

    setIsUpdating(true);
    try {
      await onBoundaryUpdate(sliderValue);
    } catch (err) {
      console.error('Failed to update boundary:', err);
      // Reset slider on error
      setSliderValue(previousValue);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApplyRecommended = async () => {
    if (recommendedValue === sliderValue) {
      return; // Already at recommended value
    }

    setIsUpdating(true);
    try {
      setSliderValue(recommendedValue);
      await onBoundaryUpdate(recommendedValue);
    } catch (err) {
      console.error('Failed to apply recommended value:', err);
    } finally {
      setIsUpdating(false);
    }
  };


  // Calculate reserved and pool ranges based on slider value
  // If sliderValue = 0, no reserved range, pool is full (2-250)
  // If sliderValue = N (N > 0), we can have up to N reservations
  // Reserved range: 192.168.123.2 to 192.168.123.(N+1) gives us N IPs (2, 3, ..., N+1)
  // Pool range: 192.168.123.(N+2) to 192.168.123.250
  let reservedRange: string;
  let poolRange: string;
  
  if (sliderValue === 0) {
    // No reserved range, pool is full (2-250)
    reservedRange = "None (full pool)";
    poolRange = "192.168.123.2 - 192.168.123.250";
  } else {
    const reservedEnd = sliderValue + 1; // Last IP in reserved range
    const poolStart = reservedEnd + 1; // First IP in pool range
    const poolEnd = 250; // Last IP in pool range
    reservedRange = `192.168.123.2 - 192.168.123.${reservedEnd}`;
    poolRange = `192.168.123.${poolStart} - 192.168.123.${poolEnd}`;
  }


  if (!isVisible) {
    return (
      <div className="reservation-slider-container">
        <button
          onClick={() => setIsVisible(true)}
          className="dhcp-action-button"
          disabled={isLoading}
        >
          Configure Reservations vs Leases
        </button>
      </div>
    );
  }

  return (
    <div className="reservation-slider-container expanded">
      <div className="reservation-slider-header">
        <h3>Reservations vs Leases</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="slider-close-button"
          disabled={isUpdating}
        >
          ×
        </button>
      </div>

      <div className="reservation-slider-content">
        <div className="slider-info">
          <div className="slider-info-item recommended-item">
            <div className="recommended-content">
              <span className="slider-info-label">Recommended:</span>
              <span className="slider-info-value">{recommendedValue} reservations ({TOTAL_IPS - recommendedValue} leases)</span>
            </div>
            <button
              onClick={handleApplyRecommended}
              className="apply-recommended-button"
              disabled={isUpdating || isLoading || recommendedValue === sliderValue}
              title="Apply recommended: 20% reservations, 80% leases"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="slider-control">
          <div className="slider-labels">
            <span className="slider-label-left">More Leases</span>
            <span className="slider-label-right">More Reservations</span>
          </div>
          <input
            type="range"
            min={minValue}
            max={maxValue}
            value={sliderValue}
            onChange={handleSliderChange}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            className="reservation-slider"
            disabled={isUpdating || isLoading}
          />
          <div className="slider-constraints">
            <span className="slider-constraint">Min: {minValue} (current reservations)</span>
            <span className="slider-constraint">
              Max: {maxValue} {currentHosts === 0 ? '(0 active hosts, can set to 0 leases)' : `(ensuring ${currentHosts} active hosts minimum)`}
            </span>
          </div>
        </div>

        <div className="slider-ranges">
          <div className="range-display">
            <span className="range-label">Reserved Range:</span>
            <span className="range-value">{reservedRange}</span>
          </div>
          <div className="range-display">
            <span className="range-label">Pool Range:</span>
            <span className="range-value">{poolRange}</span>
          </div>
        </div>

        {isUpdating && (
          <div className="slider-updating">
            Updating Kea configuration...
          </div>
        )}
      </div>
    </div>
  );
};

