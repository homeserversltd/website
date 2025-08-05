import React, { useState, useEffect } from 'react';
import './PortalCard.css';
import { TestService, TestConfig, HealthStatus } from './types';
import { TestCard } from './components/TestCard';
import { useTestControls } from './hooks/useTestControls';

// Sample test services for demonstration
const testServices: TestService[] = [
  {
    id: 'data-generator',
    name: 'Data Generator',
    description: 'Generate sample datasets for testing and development',
    status: 'active',
    version: '1.0.0',
    dataType: 'random',
    capabilities: ['Random Data', 'User Data', 'Product Data', 'Transaction Data'],
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'analytics-processor',
    name: 'Analytics Processor',
    description: 'Process and analyze datasets using pandas and numpy',
    status: 'active',
    version: '1.0.0',
    capabilities: ['Statistical Analysis', 'Data Correlation', 'Memory Usage Analysis'],
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'external-api',
    name: 'External API Client',
    description: 'Fetch data from external APIs with timeout and error handling',
    status: 'active',
    version: '1.0.0',
    capabilities: ['HTTP Requests', 'JSON Parsing', 'Error Handling'],
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'health-monitor',
    name: 'Health Monitor',
    description: 'Monitor the health and status of premium tab dependencies',
    status: 'active',
    version: '1.0.0',
    capabilities: ['Dependency Checking', 'Performance Testing', 'Status Reporting'],
    lastUpdated: new Date().toISOString()
  }
];

const TestTablet: React.FC = () => {
  const { getConfig, checkHealth, isLoading, error } = useTestControls();
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'services' | 'config' | 'health'>('services');

  useEffect(() => {
    // Load initial configuration
    const loadConfig = async () => {
      try {
        const configData = await getConfig();
        setConfig(configData);
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };

    loadConfig();
  }, [getConfig]);

  const handleHealthCheck = async () => {
    try {
      const health = await checkHealth();
      setHealthStatus(health);
    } catch (err) {
      console.error('Health check failed:', err);
    }
  };

  const handleServiceAction = (service: TestService) => {
    console.log(`Action triggered for service: ${service.name}`);
    // You can add specific actions based on service type
    switch (service.id) {
      case 'health-monitor':
        handleHealthCheck();
        break;
      default:
        console.log(`Default action for ${service.name}`);
    }
  };

  return (
    <div className="test-tablet">
      <div className="test-tablet-header">
        <h2>Test Premium Tab</h2>
        <p className="test-tablet-description">
          A comprehensive testing environment for premium tab functionality
        </p>
        
        {config && (
          <div className="version-info">
            <span className="version-badge">v{config.version}</span>
          </div>
        )}
      </div>

      <div className="test-tablet-nav">
        <button 
          className={`nav-button ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => setActiveTab('services')}
        >
          Services
        </button>
        <button 
          className={`nav-button ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
        <button 
          className={`nav-button ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          Health Status
        </button>
      </div>

      <div className="test-tablet-content">
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {isLoading && (
          <div className="loading-banner">
            Loading...
          </div>
        )}

        {activeTab === 'services' && (
          <div className="services-grid">
            {testServices.map((service) => (
              <TestCard 
                key={service.id}
                service={service} 
                onAction={handleServiceAction}
                className="service-card"
              />
            ))}
          </div>
        )}

        {activeTab === 'config' && (
          <div className="config-panel">
            <h3>Configuration</h3>
            {config ? (
              <div className="config-details">
                <div className="config-section">
                  <h4>Basic Information</h4>
                  <p><strong>Name:</strong> {config.display_name}</p>
                  <p><strong>Description:</strong> {config.description}</p>
                  <p><strong>Version:</strong> {config.version}</p>
                </div>

                <div className="config-section">
                  <h4>Capabilities</h4>
                  <ul>
                    {Object.entries(config.capabilities).map(([key, value]) => (
                      <li key={key}>
                        <span className={`capability ${value ? 'enabled' : 'disabled'}`}>
                          {key.replace(/_/g, ' ')}: {value ? 'Enabled' : 'Disabled'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="config-section">
                  <h4>Settings</h4>
                  <ul>
                    {Object.entries(config.settings).map(([key, value]) => (
                      <li key={key}>
                        <strong>{key.replace(/_/g, ' ')}:</strong> {String(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p>Loading configuration...</p>
            )}
          </div>
        )}

        {activeTab === 'health' && (
          <div className="health-panel">
            <div className="health-header">
              <h3>Health Status</h3>
              <button 
                onClick={handleHealthCheck}
                disabled={isLoading}
                className="health-check-button"
              >
                {isLoading ? 'Checking...' : 'Run Health Check'}
              </button>
            </div>

            {healthStatus ? (
              <div className="health-details">
                <div className={`health-status ${healthStatus.status}`}>
                  <h4>Overall Status: {healthStatus.status.toUpperCase()}</h4>
                  <p>Last checked: {new Date(healthStatus.timestamp).toLocaleString()}</p>
                </div>

                {healthStatus.dependencies && (
                  <div className="dependencies-status">
                    <h4>Dependencies</h4>
                    <ul>
                      {Object.entries(healthStatus.dependencies).map(([dep, status]) => (
                        <li key={dep}>
                          <span className={`dependency ${status ? 'healthy' : 'unhealthy'}`}>
                            {dep}: {status ? '✓ Available' : '✗ Unavailable'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {healthStatus.test_results && (
                  <div className="test-results">
                    <h4>Test Results</h4>
                    <ul>
                      <li>NumPy Array Length: {healthStatus.test_results.numpy_array_length}</li>
                      <li>Pandas DataFrame Shape: {healthStatus.test_results.pandas_dataframe_shape.join(' × ')}</li>
                    </ul>
                  </div>
                )}

                {healthStatus.error && (
                  <div className="health-error">
                    <h4>Error Details</h4>
                    <p>{healthStatus.error}</p>
                  </div>
                )}
              </div>
            ) : (
              <p>Click &quot;Run Health Check&quot; to check system status</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestTablet; 