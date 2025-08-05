import React, { useState } from 'react';
import { API_ENDPOINTS } from '../../../../api/endpoints';
import { useToast } from '../../../../hooks/useToast';
import { useApi } from '../../../../hooks/useApi';
import { api } from '../../../../api/client';
import { fallbackManager } from '../../../../utils/fallbackManager';
import './RootCAModal.css';

interface RootCAModalProps {
  onClose: () => void;
}

// Platform detection helper
const detectPlatform = (): 'windows' | 'android' | 'linux' | 'macos' | 'chromeos' => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('cros')) return 'chromeos';
  if (userAgent.includes('windows')) return 'windows';
  if (userAgent.includes('android')) return 'android';
  if (userAgent.includes('macintosh') || userAgent.includes('mac os x')) return 'macos';
  return 'linux'; // Default to linux for other platforms
};

const ConfirmationContent: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  isRefreshing: boolean;
}> = ({ onConfirm, onCancel, isRefreshing }) => (
  <>
    <p style={{ color: 'var(--error)' }}>
      <strong>⚠️ IMPORTANT:</strong> Refreshing the certificate will immediately disconnect you from this website, and due to the certificate mismatch, you will not be able to directly access this website with your current browser. These steps will have to be performed for each device that has the previous certificate installed.
    </p>
    <div className="certificate-refresh-steps">
      <p><strong>To regain access, you MUST follow these steps in order:</strong></p>
      <ol>
        <li>Open an incognito/private browser window</li>
        <li>Navigate to this website</li>
        <li>Download and install the new certificate</li>
        <li>Close and reopen your browser</li>
      </ol>
    </div>
    <p>
      <strong>Are you ready to proceed?</strong>
    </p>
    <div className="rootca-button-group">
      <button 
        className="rootca-cancel-btn" 
        onClick={onCancel}
        disabled={isRefreshing}
      >
        Cancel
      </button>
      <button 
        className="rootca-refresh-btn" 
        onClick={onConfirm}
        disabled={isRefreshing}
      >
        {isRefreshing ? 'Refreshing...' : 'Yes, Refresh Certificate'}
      </button>
    </div>
  </>
);

export const RootCAModal: React.FC<RootCAModalProps> = ({ onClose }) => {
  const { success, error } = useToast();
  const apiHook = useApi();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);



  const handleDownload = async () => {
    try {
      const platform = detectPlatform();
      
      const blob = await apiHook.get<Blob>(API_ENDPOINTS.admin.downloadRootCA(platform));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Set appropriate filename based on platform
      const filename = platform === 'windows' ? 'homeserver_ca.cer' :
                      platform === 'android' || platform === 'chromeos' ? 'homeserver_ca.crt' :
                      'homeserver_ca.p12';
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      success('Certificate bundle downloaded.');
    } catch (e: any) {
      error('Failed to download certificate: ' + (e.message || e));
      console.error('[CACERT] Certificate download failed:', e);
    }
  };

  const handleRefreshClick = () => {
    setShowConfirmation(true);
  };

  const handleCancelRefresh = () => {
    setShowConfirmation(false);
  };

  const handleConfirmedRefresh = async () => {
    setIsRefreshing(true);
    
    // Activate fallback mode with specific reason before initiating refresh
    fallbackManager.activateFallback('certificate_refresh_in_progress');
    
    // Disconnect WebSocket immediately
    
    // Fire and forget the refresh request - we don't care about the response
    apiHook.post(API_ENDPOINTS.admin.refreshRootCA).catch(() => {/* Do nothing */});
    api.ws.disconnect();

    // Show the steps immediately
    success('4. Close and reopen your browser', { duration: 50000 });
    success('3. Download and install the new certificate', { duration: 50000 });
    success('2. Navigate to this website', { duration: 50000 });
    success('1. Open an incognito/private browser window', { duration: 50000 });
    success('Certificate refresh initiated! Please follow these steps:', { duration: 50000 });
    // Close modal
    onClose();
    
    setIsRefreshing(false);
  };

  if (showConfirmation) {
    return (
      <div className="rootca-modal">
        <ConfirmationContent 
          onConfirm={handleConfirmedRefresh}
          onCancel={handleCancelRefresh}
          isRefreshing={isRefreshing}
        />
      </div>
    );
  }

  return (
    <div className="rootca-modal">
      <ul style={{ color: 'var(--text)' }}>
        <li>
          <strong>Safe & Recommended:</strong>
          <span style={{ fontStyle: 'italic' }}> Installing the certificate is a safe and recommended step for all users.</span>
        </li>
        <li>
          <strong>One-Time Setup:</strong>
          <span style={{ fontStyle: 'italic' }}> You only need to do this once per device.</span>
        </li>
        <li>
          <strong>Privacy Preserved:</strong>
          <span style={{ fontStyle: 'italic' }}> This does <u>not</u> give the server access to your device—it simply tells your browser to trust this server&apos;s secure connection.</span>
        </li>
      </ul>
      <p>
        To ensure secure, trusted HTTPS connections to all HomeServer services, install the HomeServer SSL certificate on your device. This will prevent browser warnings and allow seamless access to all services.
      </p>


      <div className="rootca-button-group">
        <button 
          className="rootca-download-btn" 
          onClick={handleDownload}
          disabled={isRefreshing}
        >
          Download Certificate
        </button>
        <button 
          className="rootca-refresh-btn" 
          onClick={handleRefreshClick}
          disabled={isRefreshing}
        >
          Refresh Certificate
        </button>
      </div>
      <div className="rootca-instructions">
        <h3>Installation Instructions</h3>

        <details>
          <summary><b>Chrome / Chromium / Edge</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Go to Chrome Settings → Privacy and security → Security → Manage certificates.</li>
            <li>Go to the <b>Authorities</b> tab.</li>
            <li>Click <b>Import</b> and select the downloaded certificate file.</li>
            <li>Check all trust settings when prompted, especially <b>Trust this certificate for identifying websites</b>.</li>
            <li>Click <b>OK</b></li>
            <li><b>For other devices:</b> Simply restart your browser.</li>
          </ol>
        </details>
        <details>
          <summary><b>Firefox</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Go to Firefox Settings → Privacy & Security → Certificates → View Certificates.</li>
            <li>Go to the <b>Authorities</b> tab and click <b>Import</b>.</li>
            <li>Select the downloaded <code>homeserver_ca.p12</code> file.</li>
            <li>When prompted for a password, enter: <code>homeserver</code></li>
            <li>Check <b>Trust this CA to identify websites</b>.</li>
            <li>Click <b>OK</b> and restart Firefox.</li>
          </ol>
        </details>
        <details>
        <summary><b>Windows</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Right-click the downloaded <code>homeserver_ca.cer</code> file</li>
            <li>Select <b>Install Certificate</b></li>
            <li>Choose <b>Local Machine</b> as the store location</li>
            <li>Click <b>Next</b></li>
            <li>Select <b>Place all certificates in the following store</b></li>
            <li>Click <b>Browse</b> and select <b>Trusted Root Certification Authorities</b></li>
            <li>Click <b>Next</b> and then <b>Finish</b></li>
            <li>Click <b>Yes</b> on the security warning</li>
            <li>Restart your browser</li>
          </ol>
        </details>
        <details>
          <summary><b>macOS</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Double-click the downloaded <code>homeserver_ca.p12</code> file to open Keychain Access.</li>
            <li>When prompted for a password, enter: <code>homeserver</code></li>
            <li>The certificate will be added to your login keychain.</li>
            <li>Find the certificate, right-click it, select <b>Get Info</b>.</li>
            <li>Expand <b>Trust</b> and set <b>When using this certificate</b> to <b>Always Trust</b>.</li>
            <li>Enter your password to confirm and restart your browser.</li>
          </ol>
        </details>
        <details>
          <summary><b>ChromeOS</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Open Chrome Certificate Manager:
              <ul>
                <li>In the address bar, type: <code>chrome://settings/certificates</code></li>
                <li>Press Enter</li>
              </ul>
            </li>
            <li>Go to the <b>Authorities</b> tab at the top of the certificate manager window.</li>
            <li>Click the <b>Import</b> button.</li>
            <li>Navigate to your Downloads folder and select the downloaded <code>homeserver_ca.crt</code> file.</li>
            <li>In the trust settings dialog:
              <ul>
                <li>Check the box for <b>Trust this certificate for identifying websites</b></li>
                <li>Click <b>OK</b> or <b>Import</b> to finish</li>
              </ul>
            </li>
            <li><b>Important:</b> After installing the certificate, you must restart your Chromebook for the changes to take effect.</li>
          </ol>
        </details>

        <details>
          <summary><b>iOS</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>When prompted to install the profile, tap <b>Allow</b>.</li>
            <li>When prompted for a password, enter: <code>homeserver</code></li>
            <li>Go to <b>Settings → Profile Downloaded</b> and install the certificate.</li>
            <li>Go to <b>Settings → General → About → Certificate Trust Settings</b>.</li>
            <li>Enable full trust for the HomeServer certificate.</li>
            <li>Restart Safari.</li>
          </ol>
        </details>
        <details>
          <summary><b>Android</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Go to <b>Settings</b></li>
            <li>Search for &quot;certificates&quot; or navigate to <b>Security and Privacy → More Security Settings</b></li>
            <li>Tap <b>Install from phone storage</b> (or &quot;Install certificates from storage&quot;)</li>
            <li>Select <b>CA certificate</b></li>
            <li>Tap <b>Install anyway</b></li>
            <li>Navigate to your <b>Downloads</b> folder</li>
            <li>Select <b>homeserver_ca.crt and install</b></li>
            <li>Restart your browser</li>
          </ol>
        </details>
        <details>
          <summary><b>Linux</b></summary>
          <ol>
            <li>Click <b>Download Certificate</b> above to get the certificate bundle.</li>
            <li>Extract the certificate from the PKCS#12 bundle:<br />
              <code>openssl pkcs12 -in ~/Downloads/homeserver_ca.p12 -out ~/Downloads/homeserver_ca.pem -nodes -password pass:homeserver</code>
            </li>
            <li>Install the certificate (distribution-specific):</li>
            <li><b>Arch/Manjaro</b>:<br />
              <code>sudo trust anchor ~/Downloads/homeserver_ca.pem</code>
            </li>
            <li><b>Debian/Ubuntu</b>:<br />
              <code>sudo cp ~/Downloads/homeserver_ca.pem /usr/local/share/ca-certificates/homeserver_ca.crt</code><br />
              <code>sudo update-ca-certificates</code>
            </li>
            <li><b>Fedora/RHEL</b>:<br />
              <code>sudo cp ~/Downloads/homeserver_ca.pem /etc/pki/ca-trust/source/anchors/</code><br />
              <code>sudo update-ca-trust extract</code>
            </li>
            <li>Restart your browser.</li>
          </ol>
        </details>
        <details>
          <summary><b>Certificate Refresh Steps</b></summary>
          <ol>
            <li>Open an incognito/private browser window</li>
            <li>Download the new certificate from the incognito window</li>
            <li>Follow the installation steps per your operating system:</li>
            <li>Import the certificate in your browser&apos;s security settings</li>
            <li>Rerun any command line commands to establish trust if necessary for your operating system</li>
            <li>Close and reopen your browser</li>
          </ol>
        </details>
      </div>
      <div className="certificate-password-info">
        <strong>Important:</strong> When importing the certificate bundle, use the following password:
        <code>homeserver</code>
      </div>
      <div style={{ fontSize: '0.8em', marginTop: '1em', padding: '0.5em', backgroundColor: 'var(--background-light)', borderRadius: '4px' }}>
        <strong>Note:</strong> If you change your Tailnet name settings, you will need to generate a new certificate and distribute it to each user to prevent browser warnings over the tailscale connection.<br />
        <strong>Important:</strong> The certificate is only valid for two years - you will need to generate and distribute a new certificate before expiration. Upon expiration, you will have to return to this site in a private/incognito browser window to download a new certificate.
      </div>
      <button className="rootca-close-btn" onClick={onClose}>Close</button>

    </div>
  );
}; 