import React, { useEffect, useState, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showModal } from '../Popup/PopupManager';
import { useStore, useBroadcastData } from '../../store';
import { PowerStatus } from '../WebSocket/types';
import { useResponsiveTooltip } from '../../hooks/useTooltip';

// Conversion factor used for display consistency
const CONVERSION_FACTOR = 1.6;

/**
 * Custom hook for processing power status data
 * Follows the pattern from the subscription README
 */
export function usePowerStatus() {
  const [powerData, setPowerData] = useState<PowerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const powerDataRef = useRef(powerData);
  const isAdmin = useStore(state => state.isAdmin);
  
  // Use the broadcast data hook to access power status data
  const { getBroadcastData } = useBroadcastData();
  
  // Update local state when broadcast data changes
  useEffect(() => {
    // Get the latest power data from the broadcast store
    const latestPowerData = getBroadcastData('power_status', isAdmin);
    
    if (latestPowerData) {
      setPowerData(latestPowerData);
      setError(null);
    }
    
    // Set up a polling interval to continually check for updated data
    const interval = setInterval(() => {
      const updatedData = getBroadcastData('power_status', isAdmin);
      if (updatedData && 
          (!powerData || 
           updatedData.timestamp !== powerData.timestamp || 
           updatedData.current !== powerData.current)) {
        setPowerData(updatedData);
        setError(null);
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [getBroadcastData, isAdmin, powerData]);
  
  // Update the ref whenever powerData changes
  useEffect(() => {
    powerDataRef.current = powerData;
  }, [powerData]);
  
  // Convert watts to milliwatts for better readability
  const formatPower = useCallback((watts: number) => {
    const mw = watts * 1000;  // Convert to milliwatts
    return mw.toFixed(2);
  }, []);
  
  // Determine color based on power consumption
  const getPowerColor = useCallback(() => {
    if (!powerData) return 'var(--statusUnknown)';
    
    const watts = powerData.current;  // Already in watts
    if (watts < 1) return 'var(--statusUp)';
    if (watts < 5) return 'var(--statusPartial)';
    return 'var(--statusDown)';
  }, [powerData]);
  
  // Calculate trend based on historical data
  const getTrend = useCallback(() => {
    if (!powerData?.historical.length) return 'stable';
    const recent = powerData.historical.slice(-5);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const diff = powerData.current - avg;
    if (Math.abs(diff) < 0.1) return 'stable';  // Adjusted threshold for watts
    return diff > 0 ? 'up' : 'down';
  }, [powerData]);
  
  // Calculate average power over a time period
  const computeAverage = useCallback((seconds: number): number => {
    const currentPowerData = powerDataRef.current;
    if (!currentPowerData || !currentPowerData.historical.length) return 0;
    const count = Math.min(seconds, currentPowerData.historical.length);
    const values = currentPowerData.historical.slice(-count);
    return values.reduce((sum, val) => sum + val, 0) / count;
  }, []);
  
  return {
    powerData,
    powerDataRef,
    error,
    formatPower,
    getPowerColor,
    getTrend,
    computeAverage,
    conversionFactor: CONVERSION_FACTOR
  };
}

/**
 * Power consumption indicator component.
 * Shows real-time power usage and historical trends.
 */
export const PowerMeterIndicator: React.FC = () => {
  const {
    powerData,
    powerDataRef,
    error,
    getPowerColor,
    getTrend,
    computeAverage,
    conversionFactor
  } = usePowerStatus();

  // Convert to useCallback to optimize for useResponsiveTooltip
  const getTooltipMessage = useCallback(() => {
    if (error) return `Error: ${error}`;
    if (!powerData) return 'Measuring power usage...';
    const trend = getTrend();
    return `Power: ${(powerData.current * conversionFactor).toFixed(2)}W (${trend})`;
  }, [error, powerData, getTrend, conversionFactor]);

  // Use the responsive tooltip hook
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  const openModal = useCallback(() => {
    if (!powerData) return;
    
    showModal({
      title: 'Power Consumption',
      children: () => {
        // Use the ref to get the latest powerData
        const currentPowerData = powerDataRef.current;
        if (!currentPowerData) return null;

        return (
          <div className="power-meter-modal">
            <div className="power-usage-display">
              <div className="power-value" style={{ color: getPowerColor() }}>
                <span className="power-value-number">{(currentPowerData.current * conversionFactor).toFixed(2)}</span>
                <span className="power-value-unit">Watts</span>
              </div>
            </div>

            {currentPowerData.historical.length > 0 && (
              <div className="power-history-section">
                <div className="power-averages">
                  <div className="power-average-row">
                    <div className="power-average-label">5s average:</div>
                    <div className="power-average-value">{(computeAverage(5) * conversionFactor).toFixed(2)}W</div>
                  </div>
                  <div className="power-average-row">
                    <div className="power-average-label">30s average:</div>
                    <div className="power-average-value">{(computeAverage(30) * conversionFactor).toFixed(2)}W</div>
                  </div>
                  <div className="power-average-row">
                    <div className="power-average-label">60s average:</div>
                    <div className="power-average-value">{(computeAverage(60) * conversionFactor).toFixed(2)}W</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      },
      hideActions: true,
    });
  }, [powerData, powerDataRef, getPowerColor, computeAverage, conversionFactor]);

  // Create the indicator element
  const indicator = (
    <div onClick={openModal} className="indicator power-indicator">
      {!powerData ? (  // Show spinner until first data arrives
        <FontAwesomeIcon 
          icon={faSpinner} 
          spin
          size="lg" 
          style={{ color: "var(--text)" }} 
          aria-label="Measuring Power Usage" 
        />
      ) : (
        <>
          <FontAwesomeIcon 
            icon={faBolt} 
            size="lg" 
            style={{ color: getPowerColor() }} 
            aria-label="Power Usage" 
          />
          <span className="power-value-small" style={{ color: getPowerColor() }}>
            <span className="power-value-small-number">{(powerData.current * conversionFactor).toFixed(1)}</span>
            <span className="power-value-small-unit">W</span>
          </span>
        </>
      )}
    </div>
  );

  // Return the indicator wrapped in a tooltip (which will be disabled on mobile)
  return wrapWithTooltip(indicator);
}; 