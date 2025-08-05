import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';
import { fallbackManager } from '../../utils/fallbackManager';
import { socketClient } from '../../components/WebSocket/client';
import { getSafeImagePath, FALLBACK_EMBEDDED_LOGO } from '../../utils/imageCache';
import { getCachedVersionInfo, VersionInfo, initVersionCache } from '../../utils/versionCache';
import './FallbackTablet.css';

interface FallbackProps {
  error?: Error;
  tabletId?: string;
}

// Replace the Debian ASCII art with a reference to our logo
const FallbackTablet: React.FC<FallbackProps> = ({ 
  error,
  tabletId = 'unknown'
}) => {
  const isAdmin = useStore(state => state.isAdmin);
  const visibility = useStore(state => state.visibility);
  const hasTabAccess = useStore(state => state.hasTabAccess);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [websocketStatus, setWebsocketStatus] = useState<'connected' | 'disconnected'>('disconnected'); // Default to disconnected
  const [attemptingRecovery, setAttemptingRecovery] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isFallbackOnlyAccessibleTab, setIsFallbackOnlyAccessibleTab] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string>(FALLBACK_EMBEDDED_LOGO); // Start with embedded fallback
  const [versionInfo, setVersionInfo] = useState<VersionInfo>(getCachedVersionInfo());
  
  // Add a ref to track admin mode transitions
  const adminModeTransitionRef = useRef<{
    inTransition: boolean;
    lastTransitionTime: number;
  }>({
    inTransition: false,
    lastTransitionTime: 0
  });

  // Track previous admin state to detect changes
  const prevAdminState = useRef<boolean>(isAdmin);

  // Define checkAccessibility function at component level
  const checkAccessibility = () => {
    let accessibleTabCount = 0;
    let isFallbackAccessible = false;
    
    // Count accessible tabs and check if fallback is accessible
    for (const [tabId, tabVisibility] of Object.entries(visibility)) {
      if (hasTabAccess(tabId)) {
        accessibleTabCount++;
        if (tabId === 'fallback') {
          isFallbackAccessible = true;
        }
      }
    }
    
    // If fallback is accessible and it's the only accessible tab, set the flag
    const shouldShowSimplified = isFallbackAccessible && accessibleTabCount === 1;
    console.log('[FallbackTablet] Accessibility check - accessible tabs:', accessibleTabCount, 'fallback accessible:', isFallbackAccessible, 'showing simplified:', shouldShowSimplified);
    setIsFallbackOnlyAccessibleTab(shouldShowSimplified);
  };

  // Get cached logo and version info on component mount
  useEffect(() => {
    try {
      // Use the cached image path if available, otherwise use the original path
      const cachedLogoPath = getSafeImagePath('/android-chrome-192x192.png');
      setLogoSrc(cachedLogoPath || FALLBACK_EMBEDDED_LOGO);
      
      // Initialize version cache
      initVersionCache().then(versionInfo => {
        setVersionInfo(versionInfo);
      });
    } catch (err) {
      console.error('[FallbackTablet] Error during initialization:', err);
      // Keep using the embedded fallback logo and default version
    }
  }, []);

  // Enhanced effect to detect admin mode changes
  useEffect(() => {
    if (prevAdminState.current !== isAdmin) {
      console.log(`[FallbackTablet] Admin mode changed from ${prevAdminState.current} to ${isAdmin}`);
      
      // Mark that we're in a transition
      adminModeTransitionRef.current = {
        inTransition: true,
        lastTransitionTime: Date.now()
      };
      
      // Schedule multiple accessibility checks to ensure we catch the final state
      const checkTimes = [100, 300, 500, 1000];
      
      checkTimes.forEach(delay => {
        setTimeout(() => {
          if (adminModeTransitionRef.current.inTransition) {
            console.log(`[FallbackTablet] Running delayed accessibility check after ${delay}ms`);
            checkAccessibility();
            
            // If this is the last scheduled check, clear the transition state
            if (delay === checkTimes[checkTimes.length - 1]) {
              adminModeTransitionRef.current.inTransition = false;
              console.log('[FallbackTablet] Admin mode transition completed');
            }
          }
        }, delay);
      });
      
      // Update the previous state reference
      prevAdminState.current = isAdmin;
    }
  }, [isAdmin]);

  // Check if fallback is the only accessible tab
  useEffect(() => {
    // Run accessibility check immediately
    checkAccessibility();
    
    // Also run it after a short delay to catch any race conditions
    const delayedCheck = setTimeout(checkAccessibility, 100);
    
    return () => clearTimeout(delayedCheck);
  }, [visibility, hasTabAccess]);

  // Listen for WebSocket status changes
  useEffect(() => {
    // Check the actual reason first to set the correct state immediately
    const reason = fallbackManager.getReason();
    setFallbackReason(reason);
    
    // Check WebSocket status
    const status = socketClient.getStatus();
    setWebsocketStatus(status);
    
    // Listen for fallback events
    const handleFallbackActivate = (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      setFallbackReason(customEvent.detail.reason);
      checkAccessibility();
    };
    
    const handleFallbackDeactivate = () => {
      setFallbackReason(null);
      setRecoveryMessage('Successfully authenticated. Loading admin interface...');
      setAttemptingRecovery(false);
      setRecoveryError(null);
    };
    
    const handleRecoveryAttempt = () => {
      setAttemptingRecovery(true);
      setRecoveryMessage('Attempting to recover from fallback mode...');
      setRecoveryError(null);
    };
    
    const handleRecoverySuccess = () => {
      setRecoveryMessage('Successfully authenticated. Loading admin interface...');
      setAttemptingRecovery(false);
      setRecoveryError(null);
    };
    
    const handleRecoveryFailure = (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      setRecoveryError(`Recovery failed: ${customEvent.detail.reason || 'Unknown reason'}`);
      setAttemptingRecovery(false);
      setRecoveryMessage(null);
    };
    
    const handlePrepareRecovery = () => {
      console.log('[FallbackTablet] Received prepare_recovery event');
      setAttemptingRecovery(true);
      setRecoveryMessage('Preparing for recovery from network outage...');
      setRecoveryError(null);
    };
    
    // Add event listeners
    window.addEventListener('fallback-activate', handleFallbackActivate);
    window.addEventListener('fallback-deactivate', handleFallbackDeactivate);
    window.addEventListener('fallback-recovery_attempt', handleRecoveryAttempt);
    window.addEventListener('fallback-recovery_success', handleRecoverySuccess);
    window.addEventListener('fallback-recovery_failure', handleRecoveryFailure);
    window.addEventListener('fallback-prepare_recovery', handlePrepareRecovery);
    
    // Handle WebSocket status changes
    const handleWebSocketStatusChange = (event: Event) => {
      const customEvent = event as CustomEvent<{status: 'connected' | 'disconnected', reason?: string}>;
      const status = customEvent.detail.status;
      
      console.log(`[FallbackTablet] WebSocket status changed to: ${status}`);
      setWebsocketStatus(status);
      
      if (status === 'connected' && fallbackManager.isActive() && 
          (fallbackManager.getReason() === 'websocket_disconnected' || 
           fallbackManager.getReason() === 'user_inactivity')) {
        // Add a more robust recovery mechanism with checking
        console.log('[FallbackTablet] WebSocket reconnected while in fallback mode, preparing to recover');
        
        // Show recovery UI immediately
        setAttemptingRecovery(true);
        setRecoveryMessage('Connection restored, preparing for recovery...');
        setRecoveryError(null);
        
        // First, verify that the connection is stable by waiting a bit
        // This helps prevent rapid cycling between fallback and normal mode
        setTimeout(() => {
          // Check that we're still connected and not already in recovery
          const currentStatus = socketClient.getStatus();
          const isRecovering = fallbackManager.isRecovering?.() || false;
          
          if (currentStatus === 'connected' && !isRecovering) {
            console.log('[FallbackTablet] WebSocket connection stable, but automatic recovery is disabled');
            
            // Update recovery message
            setRecoveryMessage('Connection stable, but automatic recovery is disabled. Enter admin mode to recover.');
            
            // No longer attempt automatic recovery
            setAttemptingRecovery(false);
          } else if (isRecovering) {
            console.log('[FallbackTablet] Recovery already in progress, waiting for completion');
            setRecoveryMessage('Recovery in progress, please wait...');
          } else {
            console.log('[FallbackTablet] WebSocket disconnected again during recovery wait, staying in fallback mode');
            setRecoveryError('Connection lost during recovery attempt. Please try again.');
            setAttemptingRecovery(false);
          }
        }, 2000); // Wait 2 seconds to ensure connection stability
      }
    };
    
    window.addEventListener('websocket-status-change', handleWebSocketStatusChange as EventListener);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('fallback-activate', handleFallbackActivate);
      window.removeEventListener('fallback-deactivate', handleFallbackDeactivate);
      window.removeEventListener('fallback-recovery_attempt', handleRecoveryAttempt);
      window.removeEventListener('fallback-recovery_success', handleRecoverySuccess);
      window.removeEventListener('fallback-recovery_failure', handleRecoveryFailure);
      window.removeEventListener('fallback-prepare_recovery', handlePrepareRecovery);
      window.removeEventListener('websocket-status-change', handleWebSocketStatusChange as EventListener);
    };
  }, []);

  // Helper to render version info
  const renderVersionInfo = () => {
    return (
      <div className="version-info">
        <small>
          {`Version ${versionInfo.generation} (${versionInfo.buildId})`}
        </small>
      </div>
    );
  };

  // Simplified view for when fallback is the only accessible tab
  if (isFallbackOnlyAccessibleTab) {
    // Check if websocket is disconnected, even in restricted access mode
    if (websocketStatus === 'disconnected' || fallbackReason === 'websocket_disconnected') {
      return (
        <div className="fallback-tablet simplified-view websocket-disconnected">
          <div className="status-container">
            <img src={logoSrc} alt="HomeServer Logo" className="fallback-logo" />
            <h3>Restricted Access Mode - Connection Lost</h3>
            <p>The WebSocket connection to the server has been lost.</p>
            <p>To access all system features, please switch to Admin Mode.</p>
            
            <div className="action-buttons">
              <button 
                onClick={() => window.location.reload()}
                className="primary-button reload-button"
              >
                Reload Page
              </button>
            </div>
            
            <small>Product of HOMESERVER LLC</small>
            {renderVersionInfo()}
          </div>
        </div>
      );
    }
    
    // Standard restricted access view when connected
    return (
      <div className="fallback-tablet simplified-view">
        <div className="status-container">
          <img src={logoSrc} alt="HomeServer Logo" className="fallback-logo" />
          <h3>Restricted Access Mode</h3>
          <p>To access all system features, please switch to Admin Mode.</p>
          <small>Product of HOMESERVER LLC</small>
          {renderVersionInfo()}
        </div>
      </div>
    );
  }

  // If websocket is disconnected, show special message
  if (websocketStatus === 'disconnected' || fallbackReason === 'websocket_disconnected') {
    // Check if we should show the reload button (not the only accessible tab)
    const showReloadButton = !isFallbackOnlyAccessibleTab;

    return (
      <div className="fallback-tablet websocket-disconnected">
        <div className="status-container">
          <img src={logoSrc} alt="HomeServer Logo" className="fallback-logo" />
          <h2>Connection Lost</h2>
          <p>The WebSocket connection to the server has been lost.</p>
          <p>This could be due to client timeout, network issues, or server restart.</p>
          
          {recoveryError && (
            <div className="error-message">
              {recoveryError}
            </div>
          )}
          
          {recoveryMessage && !recoveryError && (
            <div className="success-message">
              {recoveryMessage}
            </div>
          )}
          
          {showReloadButton && (
            <div className="action-buttons">
              <button 
                onClick={() => window.location.reload()}
                className="primary-button reload-button"
              >
                Reload Page
              </button>
            </div>
          )}
          <small>Product of HOMESERVER LLC</small>
          {renderVersionInfo()}
        </div>
      </div>
    );
  }

  // If no specific error/reason, show standard fallback display
  if (!error && !fallbackReason) {
    // Check if we should show the reload button (not the only accessible tab)
    const showReloadButton = !isFallbackOnlyAccessibleTab;
    
    return (
      <div className="fallback-tablet">
        <div className="status-container">
          <img src={logoSrc} alt="HomeServer Logo" className="fallback-logo" />
          <h3>System Fallback Mode</h3>
          <p>The system is operating in fallback mode.</p>
          
          {recoveryError && (
            <div className="error-message">
              {recoveryError}
            </div>
          )}
          
          {recoveryMessage && !recoveryError && (
            <div className="success-message">
              {recoveryMessage}
            </div>
          )}
          
          {showReloadButton && (
            <button 
              onClick={() => window.location.reload()}
              className="primary-button reload-button"
            >
              Reload Page
            </button>
          )}
          <small>Product of HOMESERVER LLC</small>
          {renderVersionInfo()}
        </div>
      </div>
    );
  }

  // With a specific error, show detailed fallback
  // Check if we should show the reload button (not the only accessible tab)
  const showReloadButton = !isFallbackOnlyAccessibleTab;
  
  return (
    <div className="fallback-tablet">
      <div className="error-container">
        <img src={logoSrc} alt="HomeServer Logo" className="fallback-logo" />
        <h2>System Recovery Mode</h2>
        
        {fallbackReason && (
          <div className="fallback-reason">
            <p>Reason: {fallbackReason.replace(/_/g, ' ')}</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <p>Error: {error.message}</p>
          </div>
        )}
        
        {recoveryError && (
          <div className="error-message">
            {recoveryError}
          </div>
        )}
        
        {recoveryMessage && !recoveryError && (
          <div className="success-message">
            {recoveryMessage}
          </div>
        )}
        
        {isAdmin && error && (
          <details className="error-details">
            <summary>Technical Details (Admin Only)</summary>
            <pre>{error.message}</pre>
            <pre>{error.stack}</pre>
          </details>
        )}

        <div className="action-buttons">
          {showReloadButton && (
            <button 
              onClick={() => window.location.reload()}
              className="primary-button reload-button"
            >
              Reload Page
            </button>
          )}
        </div>
        <small>Product of HOMESERVER LLC</small>
        {renderVersionInfo()}
      </div>
    </div>
  );
};

export default FallbackTablet;