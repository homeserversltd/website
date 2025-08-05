import React, { useState } from 'react';
import { useDev } from '../useDev';
import { useToast } from '../../../hooks/useToast';
import './ThermalTest.css';

export default function ThermalTest() {
  const [isTesting, setIsTesting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { startThermalTest } = useDev();
  const { success, error, warning } = useToast();

  const handleStartTest = async () => {
    try {
      // Show confirmation dialog
      const confirmed = window.confirm(
        'This will start a thermal abuse test that will:\n\n' +
        '• Pin CPU at 90% load for 10 minutes\n' +
        '• Monitor all temperature sensors\n' +
        '• Fail if any component exceeds 100°C\n\n' +
        'The test cannot be interrupted once started. Continue?'
      );

      if (!confirmed) return;

      setIsTesting(true);
      setShowModal(true);
      warning('Starting thermal abuse test - this will take 10 minutes...');
      
      const response = await startThermalTest();
      
      if (response) {
        success('Thermal test completed successfully! System passed thermal stress test.');
      }
    } catch (err: any) {
      console.error('Error starting thermal test:', err);
      error('Failed to start thermal test');
    } finally {
      setIsTesting(false);
      setShowModal(false);
    }
  };

  const handleCloseModal = () => {
    if (!isTesting) {
      setShowModal(false);
    }
  };

  return (
    <>
      <div className="dev-file-card thermal-test-card">
        <div className="dev-file-card-header">
          <div className="dev-file-icon thermal-test-icon">
            <i className="fas fa-thermometer-half" />
          </div>
          <div>
            <h3 className="dev-file-title">Thermal Abuse Test</h3>
            <div className="dev-file-path">Path: /usr/local/sbin/thermalTest.sh</div>
          </div>
        </div>

        <div className="dev-file-content">
          <div className="thermal-test-content">
            <div className="thermal-test-description">
              <p>
                The <strong>Thermal Abuse Test</strong> validates system thermal management under sustained high load. 
                This test pins the CPU at 90% utilization for 10 minutes while monitoring all temperature sensors.
              </p>
              
              <div className="thermal-test-warning">
                <i className="fas fa-exclamation-triangle" />
                <div className="thermal-test-warning-text">
                  <strong>Test Parameters:</strong>
                  <ul style={{ margin: '0.5rem 0 0 1rem', paddingLeft: '1rem' }}>
                    <li>Duration: 10 minutes (600 seconds)</li>
                    <li>CPU Load: 90% across all cores</li>
                    <li>Temperature Limit: 100°C (hard failure)</li>
                    <li>Monitoring Interval: Every 5 seconds</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dev-file-actions">
          <button
            onClick={handleStartTest}
            disabled={isTesting}
            className="dev-file-action-btn thermal-test-btn"
          >
            {isTesting ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                Testing...
              </>
            ) : (
              <>
                <i className="fas fa-fire" />
                Start Thermal Test
              </>
            )}
          </button>
        </div>
      </div>

      {showModal && (
        <div className="thermal-test-modal" onClick={handleCloseModal}>
          <div className="thermal-test-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="thermal-test-modal-header">
              <div className="thermal-test-modal-icon">
                <i className="fas fa-thermometer-half" />
              </div>
              <h3 className="thermal-test-modal-title">Thermal Abuse Test in Progress</h3>
            </div>

            <div className="thermal-test-modal-body">
              <div className="thermal-test-progress">
                <i className="fas fa-fire fa-spin" />
                <span className="thermal-test-progress-text">
                  Running thermal stress test...
                </span>
              </div>

              <p>
                The system is currently under thermal stress testing. The CPU is running at 90% load 
                while temperature sensors are monitored every 5 seconds.
              </p>

              <p>
                <strong>Test will automatically complete in 10 minutes or fail immediately if any 
                component exceeds 100°C.</strong>
              </p>

              <div style={{ 
                background: 'rgba(255, 165, 0, 0.1)', 
                border: '1px solid var(--warning)', 
                borderRadius: '6px', 
                padding: '0.75rem',
                marginTop: '1rem'
              }}>
                <strong style={{ color: 'var(--warning)' }}>Note:</strong> This test cannot be interrupted 
                once started. Please wait for completion or automatic failure detection.
              </div>
            </div>

            <div className="thermal-test-modal-actions">
              <button
                className="thermal-test-modal-btn secondary"
                onClick={handleCloseModal}
                disabled={isTesting}
              >
                {isTesting ? 'Test Running...' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 