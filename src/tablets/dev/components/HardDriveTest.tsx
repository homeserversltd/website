import React, { useState, useEffect } from 'react';
import { useDev } from '../useDev';
import { useToast } from '../../../hooks/useToast';
import { 
  DevHardDriveDevice, 
  DevHardDriveDevicesResponse, 
  DevHardDriveTestResultsResponse 
} from '../types';
import './HardDriveTest.css';

export default function HardDriveTest() {
  const [devices, setDevices] = useState<DevHardDriveDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [testType, setTestType] = useState<'quick' | 'full' | 'ultimate'>('full');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [testResults, setTestResults] = useState<DevHardDriveTestResultsResponse | null>(null);
  
  const { 
    getHardDriveDevices, 
    startHardDriveTest, 
    getHardDriveTestResults 
  } = useDev();
  const { success, error, warning } = useToast();

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const response = await getHardDriveDevices();
      if (response && response.status === 'success') {
        setDevices(response.devices);
        if (response.devices.length > 0 && !selectedDevice) {
          setSelectedDevice(response.devices[0].device);
        }
      }
    } catch (err) {
      error('Failed to load devices');
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const loadTestResults = async () => {
    try {
      const response = await getHardDriveTestResults();
      if (response) {
        setTestResults(response);
      }
    } catch (err) {
      console.error('Failed to load test results:', err);
    }
  };

  useEffect(() => {
    loadDevices();
    loadTestResults();
  }, []);

  const handleDeviceSelect = (device: string) => {
    setSelectedDevice(device);
  };

  const handleTestTypeChange = (type: 'quick' | 'full' | 'ultimate') => {
    setTestType(type);
  };

  const handleStartTest = async () => {
    if (!selectedDevice) {
      warning('Please select a device to test');
      return;
    }

    const selectedDeviceInfo = devices.find(d => d.device === selectedDevice);
    if (!selectedDeviceInfo) {
      error('Selected device not found');
      return;
    }

    // Special warning for USB devices and ultimate test
    if (selectedDeviceInfo.is_usb && testType === 'ultimate') {
      error('Ultimate test is not supported on USB devices');
      return;
    }

    // Confirmation dialog
    const testTypeNames = {
      quick: 'Quick Test (2-5 minutes)',
      full: 'Full Test (30-60 minutes)', 
      ultimate: 'Ultimate Test (DESTRUCTIVE - 60+ minutes)'
    };

    const confirmMessage = testType === 'ultimate' 
      ? `WARNING: This will perform a DESTRUCTIVE test on ${selectedDevice}.\n\nThis test will PERMANENTLY DESTROY ALL DATA on the drive and cannot be undone.\n\nAre you absolutely sure you want to continue?`
      : `This will start a ${testTypeNames[testType]} on ${selectedDevice}.\n\nThe test cannot be interrupted once started. Continue?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Additional confirmation for ultimate test
    if (testType === 'ultimate') {
      const finalConfirm = window.prompt(
        'Type "DESTROY ALL DATA" (exactly as shown) to confirm this destructive operation:'
      );
      if (finalConfirm !== 'DESTROY ALL DATA') {
        warning('Operation cancelled - confirmation text did not match');
        return;
      }
    }

    setIsTesting(true);
    try {
      const response = await startHardDriveTest(selectedDevice, testType);
      if (response && response.status === 'success') {
        success(`Hard drive test completed successfully`);
        // Reload results after test completion
        await loadTestResults();
      }
    } catch (err) {
      error('Hard drive test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyResults = async () => {
    if (testResults?.results.content) {
      try {
        await navigator.clipboard.writeText(testResults.results.content);
        success('Test results copied to clipboard');
      } catch (err) {
        error('Failed to copy results to clipboard');
      }
    }
  };

  const getTestTypeInfo = (type: 'quick' | 'full' | 'ultimate') => {
    switch (type) {
      case 'quick':
        return {
          name: 'Quick Test',
          description: 'SMART short test + filesystem check',
          duration: '2-5 minutes',
          destructive: false
        };
      case 'full':
        return {
          name: 'Full Test',
          description: 'SMART long test + badblocks scan + filesystem check',
          duration: '30-60 minutes',
          destructive: false
        };
      case 'ultimate':
        return {
          name: 'Ultimate Test',
          description: 'DESTRUCTIVE: Write-mode badblocks + SMART tests',
          duration: '60+ minutes',
          destructive: true
        };
    }
  };

  return (
    <div className="dev-file-card hard-drive-test-card">
      <div className="dev-file-card-header">
        <div className="dev-file-icon hard-drive-test-icon">
          <i className="fas fa-hard-drive" />
        </div>
        <div>
          <h3 className="dev-file-title">Hard Drive Test</h3>
          <div className="dev-file-path">Comprehensive drive testing and diagnostics</div>
        </div>
      </div>

      <div className="dev-file-content">
        <div className="hard-drive-test-content">
          {showResults ? (
            <div className="test-results-section">
              <div className="test-results-header">
                <h4 className="test-results-title">Test Results</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="dev-file-action-btn"
                    onClick={loadTestResults}
                    disabled={isTesting}
                  >
                    <i className="fas fa-sync" /> Refresh
                  </button>
                  <button
                    className="dev-file-action-btn"
                    onClick={() => setShowResults(false)}
                    disabled={isTesting}
                  >
                    <i className="fas fa-play" /> New Test
                  </button>
                </div>
              </div>

              {testResults?.results && testResults.results.exists && testResults.results.content ? (
                <div className="test-results-content">
                  {testResults.results.content}
                </div>
              ) : (
                <div className="no-results-message">
                  <i className="fas fa-file-excel" />
                  {testResults?.results?.error 
                    ? `Error: ${testResults.results.error}` 
                    : testResults?.results?.message || 'No test results available'}
                </div>
              )}

              {testResults?.results.exists && testResults?.results.content && (
                <div className="dev-file-actions" style={{ marginTop: '1rem' }}>
                  <button
                    className="dev-file-action-btn"
                    onClick={handleCopyResults}
                  >
                    <i className="fas fa-copy" /> Copy Results
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="device-selection-section">
                <div className="device-selection-header">
                  <h4 className="device-selection-title">Select Device</h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="refresh-devices-btn"
                      onClick={loadDevices}
                      disabled={isLoadingDevices || isTesting}
                    >
                      {isLoadingDevices ? (
                        <>
                          <i className="fas fa-spinner fa-spin" /> Loading...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-sync" /> Refresh
                        </>
                      )}
                    </button>
                    <button
                      className="refresh-devices-btn"
                      onClick={() => setShowResults(true)}
                      disabled={isTesting}
                      style={{ background: 'var(--background-alt)', color: 'var(--text)', border: '1px solid var(--border)' }}
                    >
                      <i className="fas fa-arrow-left" /> Back
                    </button>
                  </div>
                </div>

                {devices.length > 0 ? (
                  <div className="devices-list">
                    {devices.map((device) => (
                      <div
                        key={device.device}
                        className={`device-item ${selectedDevice === device.device ? 'selected' : ''} ${device.is_usb ? 'usb' : ''} ${device.is_luks ? 'luks' : ''}`}
                        onClick={() => handleDeviceSelect(device.device)}
                      >
                        <input
                          type="radio"
                          className="device-checkbox"
                          checked={selectedDevice === device.device}
                          onChange={() => handleDeviceSelect(device.device)}
                        />
                        <div className="device-info">
                          <div className="device-name">{device.device}</div>
                          <div className="device-details">
                            {device.description} {device.label && `• ${device.label}`} {device.fstype && `• ${device.fstype}`}
                            {device.is_luks && device.mapper_device && ` • Mapper: ${device.mapper_device}`}
                            {device.is_luks && device.mapper_fstype && ` • FS: ${device.mapper_fstype}`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {device.is_usb && (
                            <span className="device-usb-badge">USB</span>
                          )}
                          {device.is_luks && (
                            <span className="device-usb-badge" style={{ background: 'var(--primary)', color: 'white' }}>LUKS</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-devices-message">
                    {isLoadingDevices ? 'Loading devices...' : 'No testable devices found'}
                  </div>
                )}
              </div>

              {devices.length > 0 && (
                <div className="test-options-section">
                  <h4 className="test-options-title">Test Type</h4>
                  <div className="test-type-options">
                    {(['quick', 'full', 'ultimate'] as const).map((type) => {
                      const info = getTestTypeInfo(type);
                      const selectedDeviceInfo = devices.find(d => d.device === selectedDevice);
                      const isDisabled = type === 'ultimate' && selectedDeviceInfo?.is_usb;
                      
                      return (
                        <div
                          key={type}
                          className={`test-type-option ${testType === type ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                          onClick={() => !isDisabled && handleTestTypeChange(type)}
                          style={{ opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                        >
                          <input
                            type="radio"
                            className="test-type-radio"
                            checked={testType === type}
                            disabled={isDisabled}
                            onChange={() => handleTestTypeChange(type)}
                          />
                          <div className="test-type-info">
                            <div className="test-type-name">
                              {info.name}
                              {info.destructive && <span style={{ color: 'var(--statusDown)', marginLeft: '0.5rem' }}>⚠️ DESTRUCTIVE</span>}
                            </div>
                            <div className="test-type-description">{info.description}</div>
                            <div className="test-type-duration">Duration: {info.duration}</div>
                            {isDisabled && (
                              <div style={{ color: 'var(--warning)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                Not supported on USB devices
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {testType === 'ultimate' && (
                    <div className="warning-notice">
                      <i className="fas fa-exclamation-triangle" />
                      <div className="warning-notice-text">
                        <strong>WARNING:</strong> Ultimate test will permanently destroy all data on the selected drive. 
                        This operation cannot be undone and is intended only for secure drive disposal or preparation.
                      </div>
                    </div>
                  )}

                  <div className="test-actions">
                    <button
                      className="dev-file-action-btn view-results-btn"
                      onClick={() => setShowResults(true)}
                      disabled={isTesting}
                    >
                      <i className="fas fa-chart-line" /> View Results
                    </button>
                    <button
                      className="dev-file-action-btn start-test-btn"
                      onClick={handleStartTest}
                      disabled={!selectedDevice || isTesting}
                    >
                      {isTesting ? (
                        <>
                          <i className="fas fa-spinner fa-spin" /> Testing...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-play" /> Start Test
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 