import React, { useState } from 'react';
import { TestService, TestData } from '../types';
import { useTestControls } from '../hooks/useTestControls';

interface TestCardProps {
  service: TestService;
  onAction?: (service: TestService) => void;
  className?: string;
}

export const TestCard: React.FC<TestCardProps> = ({ 
  service, 
  onAction, 
  className = '' 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { generateData, analyzeData, isLoading, error } = useTestControls();
  const [testData, setTestData] = useState<TestData | null>(null);

  const handleGenerateData = async () => {
    try {
      const data = await generateData(service.dataType || 'random', 10);
      setTestData(data);
    } catch (err) {
      console.error('Failed to generate data:', err);
    }
  };

  const handleAnalyzeData = async () => {
    if (!testData?.data) return;
    
    try {
      await analyzeData(testData.data);
    } catch (err) {
      console.error('Failed to analyze data:', err);
    }
  };

  const handleAction = () => {
    if (onAction) {
      onAction(service);
    }
  };

  return (
    <div className={`test-card ${className} ${service.status}`}>
      <div className="test-card-header">
        <div className="test-card-title">
          <h3>{service.name}</h3>
          <span className={`status-badge ${service.status}`}>
            {service.status}
          </span>
        </div>
        <button 
          className="expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      <div className="test-card-content">
        <p className="test-card-description">{service.description}</p>
        
        {service.version && (
          <div className="test-card-meta">
            <span className="version">v{service.version}</span>
            {service.lastUpdated && (
              <span className="last-updated">
                Updated: {new Date(service.lastUpdated).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {isExpanded && (
          <div className="test-card-expanded">
            <div className="test-actions">
              <button 
                onClick={handleAction}
                className="primary-action"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Perform Action'}
              </button>
              
              <button 
                onClick={handleGenerateData}
                className="secondary-action"
                disabled={isLoading}
              >
                Generate Data
              </button>
              
              {testData && (
                <button 
                  onClick={handleAnalyzeData}
                  className="secondary-action"
                  disabled={isLoading}
                >
                  Analyze Data
                </button>
              )}
            </div>

            {error && (
              <div className="error-message">
                Error: {error}
              </div>
            )}

            {testData && (
              <div className="test-data-preview">
                <h4>Generated Data ({testData.count} items)</h4>
                <div className="data-summary">
                  <p>Type: {testData.type}</p>
                  <p>Generated: {new Date(testData.generated_at).toLocaleString()}</p>
                </div>
                
                {testData.data.length > 0 && (
                  <div className="data-sample">
                    <h5>Sample (first 3 items):</h5>
                    <pre>
                      {JSON.stringify(testData.data.slice(0, 3), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {service.capabilities && service.capabilities.length > 0 && (
              <div className="capabilities">
                <h4>Capabilities:</h4>
                <ul>
                  {service.capabilities.map((capability, index) => (
                    <li key={index}>{capability}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}; 