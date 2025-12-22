import React, { useState, useEffect, useRef } from 'react';
import { 
  TestableDevice, 
  TestableDevicesResponse, 
  HardDriveTestProgress,
  HardDriveTestUpdate,
  StartTestRequest,
  StartTestResponse,
  TestResultsResponse,
  AdminDiskInfo,
  BlockDevice,
  ModernHardDriveTestStatus
} from '../../types';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../hooks/useToast';
import { useBroadcastData } from '../../../../store';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheckCircle, 
  faExclamationCircle, 
  faHardDrive, 
  faPlay, 
  faSync, 
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import { useStore } from '../../../../store';
import { 
  isDeviceMounted,
  isDeviceNasCompatible,
  getDeviceMountPoint,
  isDeviceEncrypted,
  hasLockedEncryptedPartition,
  hasUnlockedEncryptedPartition,
  getDeviceFilesystemType
} from '../../utils/diskUtils';
import './HardDriveTestModal.css';
import { startAdminSessionKeepalive, stopAdminSessionKeepalive } from '../../../../utils/keepalive';
import { useLoading } from '../../../../hooks/useLoading';
import { useManagedInactivityTimeout } from '../../../../hooks/useInactivityTimeout';

interface HardDriveTestModalProps {
  onClose: () => void;
  stayOpenOnFallback?: boolean;
}

const HardDriveTestModal: React.FC<HardDriveTestModalProps> = ({ 
  onClose, 
  stayOpenOnFallback = true 
}) => {
  // Get broadcast data from store
  const { getBroadcastData } = useBroadcastData();
  
  // Get test updates from broadcast data
  const testUpdate = getBroadcastData('hard_drive_test');
  const testStatus = getBroadcastData('hard_drive_test_status');
  
  // Get disk info from broadcast data
  const diskInfo = getBroadcastData<'admin_disk_info'>('admin_disk_info', true) as AdminDiskInfo | undefined;
  const blockDevices: BlockDevice[] = diskInfo?.blockDevices?.blockdevices || [];

  // State for available devices and test configuration
  const [devices, setDevices] = useState<TestableDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [testType, setTestType] = useState<'quick' | 'full' | 'ultimate'>('quick');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // State for test execution
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [testId, setTestId] = useState<string | null>(null);
  const [testComplete, setTestComplete] = useState<boolean>(false);
  // Track when the test started for minimum loading bar duration
  const testStartTimeRef = useRef<number | null>(null);
  
  // State for previous test results
  const [hasPreviousResults, setHasPreviousResults] = useState<boolean>(false);
  const [previousResults, setPreviousResults] = useState<string | null>(null);
  const [showPreviousResults, setShowPreviousResults] = useState<boolean>(true);
  
  // Add new state for view control
  const [showNewTest, setShowNewTest] = useState<boolean>(false);
  
  // References
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // Hooks
  const api = useApi();
  const { error, success, info, warning } = useToast();
  
  // Add a ref to track if we've already fetched previous results in this modal session
  const hasFetchedPreviousResults = useRef(false);
  
  // Add useLoading for test spinner
  const { isLoading: isTestLoading, error: testLoadingError, startLoading, stopLoading } = useLoading();

  // State for keepalive and timer
  const [keepaliveCount, setKeepaliveCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0); // seconds
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add a ref for the current test type
  const currentTestType = useRef<'quick' | 'full' | 'ultimate'>('quick');
  
  // Scroll to bottom of log when new messages are added
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [testLog]);
  
  // Load testable devices from both broadcast data and API
  const fetchDevices = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      // Get devices from broadcast data
      if (diskInfo && blockDevices.length > 0) {
        const testableDevices = diskInfo.nasCompatibleDevices
          // First filter for unique devices by device name
          .filter((device, index, self) => 
            index === self.findIndex(d => d.device === device.device)
          )
          .filter(device => 
            // Device must be NAS-ready
            device.is_nas_ready &&
            // Must be unlocked if encrypted
            (!hasLockedEncryptedPartition(device.device, blockDevices, diskInfo)) &&
            // Must be unmounted
            !isDeviceMounted(device.device, blockDevices, diskInfo)
          )
          .map(device => ({
            device: device.device,
            name: device.device,
            mount: device.mountpoint || 'Not mounted',
            filesystem: device.filesystem
          }));

        setDevices(testableDevices);
        // Select first device by default if none selected
        if (selectedDevices.length === 0 && testableDevices.length > 0) {
          setSelectedDevices([testableDevices[0].device]);
        }
      } else {
        setDevices([]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load testable devices');
      error('Failed to load testable devices');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Only fetch previous results when the user is viewing previous results, or when the modal is first opened for a new test
  useEffect(() => {
    // Fetch previous results if the user is viewing them, or if the modal is opened for a new test and we haven't fetched yet
    if ((showPreviousResults || showNewTest) && !hasFetchedPreviousResults.current) {
      const fetchPreviousResults = async () => {
        try {
          const response = await api.get<TestResultsResponse>(
            API_ENDPOINTS.status.hardDriveTest.results
          );
          if (response.success && response.results) {
            setPreviousResults(response.results);
            setHasPreviousResults(true);
          }
        } catch (err) {
          console.error('Failed to fetch previous test results:', err);
          setShowNewTest(true);
        }
      };
      fetchPreviousResults();
      hasFetchedPreviousResults.current = true;
    }
    // Only run when showPreviousResults or showNewTest changes
  }, [showPreviousResults, showNewTest]);
  
  // Update state when testUpdate arrives
  useEffect(() => {
    if (testUpdate) {
      // Add to test log if message changed
      if (testUpdate.message) {
        setTestLog(prev => {
          if (prev[prev.length - 1] !== testUpdate.message) {
            return [...prev, testUpdate.message];
          }
          return prev;
        });
      }
      // Check if test is complete
      if (testUpdate.complete || testUpdate.progress === 100) {
        setTestComplete(true);
        setIsTesting(false);
        setShowPreviousResults(true);
        setShowNewTest(false);
        success('Hard drive test completed');
        const now = Date.now();
        const started = testStartTimeRef.current;
        const elapsed = started ? now - started : null;
        // Only delay for quick test
        const delay = currentTestType.current === 'quick' ? 2000 : 0;
        if (elapsed !== null && elapsed < delay) {
          setTimeout(() => {
            fetchUpdatedResults();
          }, delay - elapsed);
        } else {
          fetchUpdatedResults();
        }
      }
    }
  }, [testUpdate]);

  // Update state when test status changes (modern backend only)
  useEffect(() => {
    if (!testStatus || !testId) return;

    const status = testStatus as unknown as ModernHardDriveTestStatus;

    // Only handle events for the current test
    if (status.id !== testId) return;

    // Show progress modal if status is 'working'
    if (status.status === 'working') {
      setIsTesting(true);
      // Increment keepalive counter on every keepalive event
      setKeepaliveCount(prev => prev + 1);
      // Optionally update log if message is present
      if (status.message) {
        setTestLog((prev: string[]): string[] => {
          const last = prev[prev.length - 1] ?? '';
          if (prev.length === 0 || last !== status.message) {
            return [...prev, status.message ?? ''];
          }
          return prev;
        });
      }
    }

    // Mark test as complete if complete === true or progress === 100
    if (status.complete === true || status.progress === 100) {
      setTestComplete(true);
      setIsTesting(false);
      setShowPreviousResults(true);
      setShowNewTest(false);
      success('Hard drive test completed');
      // Add 1s buffer if test completed too quickly
      const now = Date.now();
      const started = testStartTimeRef.current;
      const elapsed = started ? now - started : null;
      if (elapsed !== null && elapsed < 1000) {
        setTimeout(() => {
          fetchUpdatedResults();
        }, 1000 - elapsed);
      } else {
        fetchUpdatedResults();
      }
    }
  }, [testStatus, testId]);

  // Use the new hook for timeout management
  useManagedInactivityTimeout(isTesting, 'hard_drive_test');
  
  // Fetch updated test results after test completes
  const fetchUpdatedResults = async () => {
    try {
      const response = await api.get<TestResultsResponse>(
        API_ENDPOINTS.status.hardDriveTest.results
      );
      
      if (response.success && response.results) {
        setPreviousResults(response.results);
        setHasPreviousResults(true);
      }
    } catch (err) {
      console.error('Failed to fetch updated test results:', err);
    }
  };
  
  // Modified device selection handler
  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDevices(prev => {
      const isSelected = prev.includes(deviceId);
      if (isSelected) {
        // Only return devices that are not the one being deselected
        return prev.filter(id => id !== deviceId);
      } else {
        return [...prev, deviceId];
      }
    });
  };

  // Modified start test function with additional logging
  const startTest = async () => {
    if (selectedDevices.length === 0) {
      warning('Please select at least one device to test');
      return;
    }
    
    try {
      // Confirm message based on number of devices
      const deviceCount = selectedDevices.length;
      const confirmMessage = deviceCount === 1
        ? `This will start a ${testType} test on the selected drive.`
        : `This will start a ${testType} test on ${deviceCount} drives.`;
      
      if (!window.confirm(`${confirmMessage} This operation can take a long time and cannot be interrupted once started. Continue?`)) {
        return;
      }
      


      setIsTesting(true);
      setTestLog([]);
      setTestComplete(false);
      setErrorMessage(null);
      // Record the test start time
      testStartTimeRef.current = Date.now();
      
      // Start tests for all selected devices
      for (const device of selectedDevices) {
        const request: StartTestRequest = {
          device,
          test_type: testType
        };
        
        const response = await api.post<StartTestResponse>(
          API_ENDPOINTS.status.hardDriveTest.start,
          request
        );

        if (response.success) {
          if (response.test_id) {
            setTestId(response.test_id);
            setKeepaliveCount(0);
          }
          info(`Test started on device ${device}`);
          setTestLog(prev => [...prev, `Test started: ${testType} test on ${device}`]);
        } else {
          throw new Error(`Failed to start test on device ${device}: ${response.message}`);
        }
      }
      currentTestType.current = testType;
    } catch (err: any) {
      setIsTesting(false);
      setErrorMessage(err.message || 'Failed to start test');
      error(err.message || 'Failed to start test');
    }
  };
  
  // Render no devices state
  const renderNoDevices = () => (
    <div className="no-devices">
      <FontAwesomeIcon icon={faExclamationTriangle} className="warning-icon" />
      <div className="no-devices-content">
        <h3>No Drives Ready for Testing</h3>
        <p>To test a drive, it must be:</p>
        <ul>
          <li>Connected and recognized by the system</li>
          <li>Unlocked (if encrypted)</li>
          <li>Unmounted</li>
        </ul>
        <p>Use the Disk Manager to prepare drives for testing.</p>
        <button 
          className="secondary-btn"
          onClick={() => {
            setIsLoading(true);
            fetchDevices();
          }}
        >
          <FontAwesomeIcon icon={faSync} />
          Refresh Devices
        </button>
      </div>
    </div>
  );

  // Render the test type options with explanations - simplified version
  const renderTestOptions = () => {
    return (
      <div className="test-options">
        <h3>Select Test Type</h3>
        <div className="options-container">
          <div 
            className={`test-option ${testType === 'quick' ? 'selected' : ''}`}
            onClick={() => setTestType('quick')}
          >
            <div className="option-header">
              <h4>Quick Test</h4>
              <span className="duration">(2-5 minutes)</span>
            </div>
            <p>A fast, non-destructive check that combines a SMART short test and a filesystem integrity check, suitable for a basic health assessment.</p>
          </div>
          
          <div 
            className={`test-option ${testType === 'full' ? 'selected' : ''}`}
            onClick={() => setTestType('full')}
          >
            <div className="option-header">
              <h4>Full Test</h4>
              <span className="duration">(30-60 minutes)</span>
            </div>
            <p>Comprehensive, non-destructive health check that combines a SMART long test, a full read scan for bad sectors, and a filesystem integrity check.
            </p>
          </div>

          <div
            className={`test-option ${testType === 'ultimate' ? 'selected' : ''}`}
            onClick={() => setTestType('ultimate')}
          >
            <div className="option-header">
              <h4>Ultimate Test</h4>
              <span className="duration">(1-3 hours, destructive)</span>
            </div>
            <p style={{ color: 'var(--warning)', fontWeight: 'bold' }}>
              <strong>Warning:</strong> This will <u>erase all data</u> on the drive. Runs a destructive write/read test for maximum reliability. Not supported for USB drives.
            </p>
          </div>
        </div>
      </div>
    );
  };
  
  // Render test results
  const renderTestResults = () => {
    return (
      <div className="test-results">
        {hasPreviousResults ? (
          <>
            <div className="results-content">
              <pre>{previousResults}</pre>
            </div>
            <div className="action-buttons">
              <button 
                className="primary-btn"
                onClick={() => setShowNewTest(true)}
              >
                <FontAwesomeIcon icon={faPlay} />
                Run New Test
              </button>
            </div>
          </>
        ) : (
          <div className="no-results">
            <FontAwesomeIcon icon={faExclamationTriangle} className="warning-icon" />
            <p>No previous test results available.</p>
            <button 
              className="primary-btn"
              onClick={() => setShowNewTest(true)}
            >
              <FontAwesomeIcon icon={faPlay} />
              Run New Test
            </button>
          </div>
        )}
      </div>
    );
  };
  
  // Start timer when test starts
  useEffect(() => {
    if (isTesting) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isTesting]);

  // Listen for keepalive events and reset on test start
  const prevTestingRef = useRef<boolean>(false);
  const prevTimestampRef = useRef<number>(0);
  useEffect(() => {
    if (!testStatus) return;
    // Detect test start (testing: false -> true)
    if (!prevTestingRef.current && testStatus.testing) {
      setKeepaliveCount(0);
    }
    // Detect keepalive (testing: true and timestamp changes)
    if (
      testStatus.testing &&
      prevTestingRef.current &&
      testStatus.timestamp !== prevTimestampRef.current
    ) {
      setKeepaliveCount(prev => prev + 1);
    }
    prevTestingRef.current = testStatus.testing;
    prevTimestampRef.current = testStatus.timestamp;
  }, [testStatus]);

  // Start/stop loading spinner on test start/stop
  useEffect(() => {
    if (isTesting) {
      startLoading();
    } else {
      stopLoading();
    }
  }, [isTesting, startLoading, stopLoading]);

  // Refactored renderTestProgress
  const renderTestProgress = () => {
    return (
      <div className="test-progress">
        <div className="progress-header">
          <h3>Test Progress</h3>
        </div>
        <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text)' }}>
          Please keep this window open to see results once complete.
        </small>
        <div className="progress-info" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isTestLoading && <LoadingSpinner size="large" />}
          <div>
            <div><strong>Time Running:</strong> {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</div>
            <div><strong>Keepalive Signals:</strong> {keepaliveCount}</div>
          </div>
        </div>
        <div className="test-log">
          {testLog.map((log, index) => (
            <div key={`${index}-${log}`} className="log-entry">{log}</div>
          ))}
          <div ref={logEndRef} />
        </div>
        {testComplete && (
          <div className="test-complete">
            <FontAwesomeIcon icon={faCheckCircle} className="complete-icon" />
            <span>Test completed</span>
            <button 
              className="view-results-btn"
              onClick={() => setShowPreviousResults(true)}
            >
              View Results
            </button>
          </div>
        )}
      </div>
    );
  };
  
  // Modified device list rendering
  const renderDeviceList = () => (
    <div className="devices-list">
      {devices.map((device) => (
        <div 
          key={device.device}
          className={`device-option ${selectedDevices.includes(device.device) ? 'selected' : ''}`}
          onClick={() => handleDeviceSelect(device.device)}
        >
          <FontAwesomeIcon icon={faHardDrive} className="device-icon" />
          <div className="device-info">
            <span className="device-name">{device.device}</span>
            <span className="device-path">{device.mount}</span>
          </div>
        </div>
      ))}
    </div>
  );

  // Update warning message to be more accurate
  const renderWarningMessage = () => (
    <div className="warning-message">
      <FontAwesomeIcon icon={faExclamationTriangle} className="warning-icon" />
      <span>
        Warning: Full and Ultimate tests can take up to or over an hour to complete and cannot be canceled once started.
        The drive must remain connected and the system powered on during testing, else risk corrupting the drive.
      </span>
    </div>
  );

  useEffect(() => {
    fetchDevices();
  }, [diskInfo, blockDevices]);

  // Find a useEffect that updates the keepalive state based on test progress
  useEffect(() => {
    // Check if test is running based on testStatus and current state
    // For modern backend, check status property and id
    const isModernStatus = testStatus && 
      typeof testStatus === 'object' && 
      'status' in testStatus && 
      'id' in testStatus;
    
    // Safely check if it's a modern status with working state
    const isModernStatusRunning = isModernStatus && 
      (testStatus as unknown as ModernHardDriveTestStatus).status === 'working';
    
    // For legacy test updates, check testing property
    const isLegacyRunning = testStatus && 
      typeof testStatus === 'object' && 
      'testing' in testStatus && 
      (testStatus as HardDriveTestProgress).testing === true;
    
    // Determine if test is running from any indicator
    const testRunning = isModernStatusRunning || isLegacyRunning || (isTesting && !testComplete);
    
    if (testRunning) {
      startAdminSessionKeepalive();
      
      // Start the timer if not already running
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setElapsedTime(prev => prev + 1);
        }, 1000);
      }
      
      // Start the loading spinner
      startLoading();
    } else {
      stopAdminSessionKeepalive();
      
      // Stop the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Stop the loading spinner
      stopLoading();
    }
    
    return () => {
      stopAdminSessionKeepalive();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [testStatus, isTesting, testComplete, startLoading, stopLoading]);

  return (
    <div 
      className="hard-drive-test-modal" 
      data-stay-open={stayOpenOnFallback ? 'true' : 'false'}
    >
      
      {isLoading ? (
        <div className="loading-container">
          <LoadingSpinner size="medium" />
          <span>Loading available devices...</span>
        </div>
      ) : errorMessage ? (
        <div className="error-container">
          <FontAwesomeIcon icon={faExclamationCircle} className="error-icon" />
          <span>{errorMessage}</span>
        </div>
      ) : (
        <div className="modal-content">
          {isTesting ? (
            renderTestProgress()
          ) : showNewTest ? (
            <>
              <div className="device-selection">
                {devices.length > 0 && <h3>Select Drive{devices.length > 1 ? 's' : ''} to Test</h3>}
                {devices.length === 0 ? renderNoDevices() : renderDeviceList()}
              </div>
              
              {devices.length > 0 && renderTestOptions()}
              
              {devices.length > 0 && (
                <>
                  {renderWarningMessage()}
                  
                  <div className="action-buttons">
                    <button 
                      className="secondary-btn"
                      onClick={() => setShowNewTest(false)}
                    >
                      Back to Results
                    </button>
                    
                    <button 
                      className="primary-btn"
                      onClick={startTest}
                      disabled={selectedDevices.length === 0}
                    >
                      <FontAwesomeIcon icon={faPlay} />
                      Start Test {selectedDevices.length > 1 ? `(${selectedDevices.length} drives)` : ''}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            renderTestResults()
          )}
        </div>
      )}
    </div>
  );
};

// Add a displayName to ensure we can find this component in the PopupManager
HardDriveTestModal.displayName = 'HardDriveTestModal';

export default HardDriveTestModal; 