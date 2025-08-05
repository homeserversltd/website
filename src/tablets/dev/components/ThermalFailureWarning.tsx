import React, { useState, useEffect } from 'react';
import { useDev } from '../useDev';
import { useToast } from '../../../hooks/useToast';
import { DevThermalTestResultsResponse } from '../types';
import './ThermalFailureWarning.css';

export default function ThermalFailureWarning() {
  const [thermalResults, setThermalResults] = useState<DevThermalTestResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const { getThermalTestResults, clearThermalTestResults } = useDev();
  const { success, error } = useToast();

  const loadThermalResults = async () => {
    setIsLoading(true);
    try {
      const data = await getThermalTestResults();
      setThermalResults(data);
    } catch (err) {
      console.error('Error loading thermal test results:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadThermalResults();
    
    // Poll for results every 30 seconds to catch new failures
    const interval = setInterval(loadThermalResults, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyContent = async () => {
    if (thermalResults?.results.content) {
      try {
        await navigator.clipboard.writeText(thermalResults.results.content);
        success('Thermal failure log copied to clipboard');
      } catch (err) {
        error('Failed to copy content to clipboard');
      }
    }
  };

  const handleClearResults = async () => {
    try {
      const confirmed = window.confirm(
        'Are you sure you want to clear the thermal failure log?\n\n' +
        'This will permanently delete the thermal test failure information.'
      );

      if (!confirmed) return;

      setIsClearing(true);
      const cleared = await clearThermalTestResults();
      
      if (cleared) {
        // Reload results to update the UI
        await loadThermalResults();
      }
    } catch (err) {
      error('Failed to clear thermal test results');
    } finally {
      setIsClearing(false);
    }
  };

  // Don't render if still loading or no thermal failure exists
  if (isLoading || !thermalResults?.results.exists || !thermalResults?.results.content) {
    return null;
  }

  return (
    <div className="thermal-failure-warning">
      <div className="thermal-failure-header">
        <div className="thermal-failure-icon">
          <i className="fas fa-exclamation-triangle" />
        </div>
        <div className="thermal-failure-title-section">
          <h2 className="thermal-failure-title">Thermal Test Failed</h2>
          <p className="thermal-failure-subtitle">System exceeded temperature limits during stress testing</p>
        </div>
        <div className="thermal-failure-actions">
          <button
            className="thermal-failure-btn copy"
            onClick={handleCopyContent}
            title="Copy failure log to clipboard"
          >
            <i className="fas fa-copy" /> Copy Log
          </button>
          <button
            className="thermal-failure-btn clear"
            onClick={handleClearResults}
            disabled={isClearing}
            title="Clear thermal failure log"
          >
            {isClearing ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Clearing...
              </>
            ) : (
              <>
                <i className="fas fa-trash" /> Clear Log
              </>
            )}
          </button>
        </div>
      </div>

      <div className="thermal-failure-summary">
        <i className="fas fa-thermometer-full" />
        <div className="thermal-failure-summary-text">
          <strong>Critical thermal failure detected.</strong> The system was unable to maintain safe 
          operating temperatures during the thermal abuse test. Review the detailed log below for 
          specific temperature readings and failure conditions.
        </div>
      </div>

      <div className="thermal-failure-content">
        {thermalResults.results.content}
      </div>
    </div>
  );
} 