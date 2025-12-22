/**
 * HOMESERVER Google Cloud Storage Setup Modal Component
 * Comprehensive setup guide for Google Cloud Storage backup integration
 */

import React, { useState } from 'react';

interface GoogleCloudStorageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCredentialsSubmit?: (credentials: string) => void;
  className?: string;
}

export const GoogleCloudStorageSetupModal: React.FC<GoogleCloudStorageSetupModalProps> = ({
  isOpen,
  onClose,
  onCredentialsSubmit,
  className = ''
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [credentialsJson, setCredentialsJson] = useState('');
  const [projectId, setProjectId] = useState('');
  const [bucketName, setBucketName] = useState('homeserver-backups');
  const [isValidJson, setIsValidJson] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const totalSteps = 5;

  const validateJson = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const hasRequiredFields = parsed.type === 'service_account' && 
        parsed.project_id && 
        parsed.private_key && 
        parsed.client_email;
      setIsValidJson(hasRequiredFields);
      return hasRequiredFields;
    } catch {
      setIsValidJson(false);
      return false;
    }
  };

  const handleJsonChange = (value: string) => {
    setCredentialsJson(value);
    validateJson(value);
    
    // Auto-extract project_id if present
    try {
      const parsed = JSON.parse(value);
      if (parsed.project_id) {
        setProjectId(parsed.project_id);
      }
    } catch {
      // Ignore JSON parsing errors during typing
    }
  };

  const handleSubmit = () => {
    if (isValidJson && onCredentialsSubmit) {
      onCredentialsSubmit(credentialsJson);
      onClose();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const sampleCredentials = {
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "your-private-key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
    "client_email": "your-service-account@your-project-id.iam.gserviceaccount.com",
    "client_id": "your-client-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project-id.iam.gserviceaccount.com"
  };

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${className}`}>
      <div className="modal-content google-cloud-storage-setup-modal">
        <div className="modal-header">
          <h2>Google Cloud Storage Backup Setup</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Progress Indicator */}
          <div className="setup-progress">
            <div className="progress-steps">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div 
                  key={i + 1}
                  className={`progress-step ${currentStep >= i + 1 ? 'active' : ''}`}
                >
                  <div className="step-number">{i + 1}</div>
                  <div className="step-label">
                    {i === 0 && 'Project'}
                    {i === 1 && 'Service Account'}
                    {i === 2 && 'Credentials'}
                    {i === 3 && 'Configuration'}
                    {i === 4 && 'Complete'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="setup-content">
            {currentStep === 1 && (
              <div className="setup-step">
                <h3>1. Create Google Cloud Project</h3>
                <div className="step-instructions">
                  <div className="instruction-item">
                    <div className="instruction-number">1</div>
                    <div className="instruction-text">
                      <strong>Go to Google Cloud Console</strong>
                      <p>Visit <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a></p>
                    </div>
                  </div>
                  
                  <div className="instruction-item">
                    <div className="instruction-number">2</div>
                    <div className="instruction-text">
                      <strong>Create or Select Project</strong>
                      <p>Create a new project or select an existing one for your HOMESERVER backup system</p>
                    </div>
                  </div>
                  
                  <div className="instruction-item">
                    <div className="instruction-number">3</div>
                    <div className="instruction-text">
                      <strong>Enable Billing</strong>
                      <p>Ensure billing is enabled for your project (required for Cloud Storage)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="setup-step">
                <h3>2. Create Service Account</h3>
                <div className="step-instructions">
                  <div className="instruction-item">
                    <div className="instruction-number">1</div>
                    <div className="instruction-text">
                      <strong>Navigate to IAM & Admin</strong>
                      <p>Go to "IAM & Admin" → "Service Accounts"</p>
                    </div>
                  </div>
                  
                  <div className="instruction-item">
                    <div className="instruction-number">2</div>
                    <div className="instruction-text">
                      <strong>Create Service Account</strong>
                      <p>Click "Create Service Account" and give it a name like "homeserver-backup"</p>
                    </div>
                  </div>
                  
                  <div className="instruction-item">
                    <div className="instruction-number">3</div>
                    <div className="instruction-text">
                      <strong>Assign Roles</strong>
                      <p>Add the "Storage Admin" role to the service account</p>
                    </div>
                  </div>
                  
                  <div className="instruction-item">
                    <div className="instruction-number">4</div>
                    <div className="instruction-text">
                      <strong>Create Key</strong>
                      <p>Click on the service account → "Keys" → "Add Key" → "Create new key" → "JSON"</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="setup-step">
                <h3>3. Configure Storage Settings</h3>
                <div className="configuration-form">
                  <div className="form-group">
                    <label htmlFor="project-id">
                      <strong>Project ID *</strong>
                    </label>
                    <input
                      id="project-id"
                      type="text"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      placeholder="your-project-id"
                      className="form-input"
                    />
                    <small>Your Google Cloud project ID (will be auto-filled from credentials)</small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="bucket-name">
                      <strong>Bucket Name *</strong>
                    </label>
                    <input
                      id="bucket-name"
                      type="text"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                      placeholder="homeserver-backups"
                      className="form-input"
                    />
                    <small>Name for your backup bucket (must be globally unique)</small>
                  </div>
                </div>

                <div className="credentials-preview">
                  <h4>Your service account key should look like this:</h4>
                  <div className="code-block">
                    <pre>{JSON.stringify(sampleCredentials, null, 2)}</pre>
                    <button 
                      className="copy-button"
                      onClick={() => copyToClipboard(JSON.stringify(sampleCredentials, null, 2))}
                    >
                      Copy Sample
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="setup-step">
                <h3>4. Configure HOMESERVER Backup</h3>
                <div className="credentials-input">
                  <label htmlFor="credentials-json">
                    <strong>Paste your service account key JSON here:</strong>
                  </label>
                  <textarea
                    id="credentials-json"
                    value={credentialsJson}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    placeholder="Paste the contents of your downloaded service account key JSON file here..."
                    rows={12}
                    className={`credentials-textarea ${isValidJson ? 'valid' : credentialsJson ? 'invalid' : ''}`}
                  />
                  <div className="validation-message">
                    {isValidJson ? (
                      <span className="valid-message">✓ Valid service account key format detected</span>
                    ) : credentialsJson ? (
                      <span className="invalid-message">✗ Invalid JSON format or missing required fields</span>
                    ) : (
                      <span className="info-message">Paste your service account key JSON above</span>
                    )}
                  </div>
                </div>

                <div className="advanced-options">
                  <button 
                    className="toggle-advanced"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                  </button>
                  
                  {showAdvanced && (
                    <div className="advanced-content">
                      <h4>Manual Configuration (Advanced Users)</h4>
                      <p>If you prefer to configure manually, you can:</p>
                      <ul>
                        <li>Place the service account key file in the backup directory as <code>gcs_credentials.json</code></li>
                        <li>Use the CLI command: <code>python3 backup set-credentials-json google_cloud_storage --json 'YOUR_JSON_HERE'</code></li>
                        <li>Set project ID: <code>python3 backup set-config google_cloud_storage project_id 'YOUR_PROJECT_ID'</code></li>
                        <li>Set bucket name: <code>python3 backup set-config google_cloud_storage bucket_name 'YOUR_BUCKET_NAME'</code></li>
                        <li>Enable the provider: <code>python3 backup enable-provider google_cloud_storage</code></li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="setup-step">
                <h3>5. Setup Complete!</h3>
                <div className="completion-message">
                  <div className="success-icon">✓</div>
                  <h4>Google Cloud Storage backup is now configured</h4>
                  <p>Your HOMESERVER will now be able to create backups and store them in your Google Cloud Storage bucket.</p>
                </div>

                <div className="next-steps">
                  <h4>What happens next:</h4>
                  <ul>
                    <li>Bucket will be created automatically if it doesn't exist</li>
                    <li>Backups will be stored in the <code>{bucketName}</code> bucket</li>
                    <li>Files will be organized with timestamps and metadata</li>
                    <li>You can monitor usage and costs in the Google Cloud Console</li>
                  </ul>
                </div>

                <div className="test-options">
                  <h4>Test your setup:</h4>
                  <div className="test-commands">
                    <code>python3 backup test-providers</code>
                    <button onClick={() => copyToClipboard('python3 backup test-providers')}>
                      Copy
                    </button>
                  </div>
                  <div className="test-commands">
                    <code>python3 backup create --items /tmp/test.txt</code>
                    <button onClick={() => copyToClipboard('python3 backup create --items /tmp/test.txt')}>
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="setup-navigation">
            <button 
              className="nav-button secondary"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
            >
              Previous
            </button>
            
            <div className="step-indicator">
              Step {currentStep} of {totalSteps}
            </div>
            
            {currentStep < totalSteps ? (
              <button 
                className="nav-button primary"
                onClick={() => setCurrentStep(Math.min(totalSteps, currentStep + 1))}
                disabled={currentStep === 3 && (!projectId || !bucketName)}
              >
                Next
              </button>
            ) : (
              <button 
                className="nav-button primary"
                onClick={handleSubmit}
                disabled={!isValidJson}
              >
                Complete Setup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleCloudStorageSetupModal;
