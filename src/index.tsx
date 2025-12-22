import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { VaultAuth } from './components/VaultAuth';
import './styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye, faEyeSlash, faRotate, faPowerOff, faDownload } from '@fortawesome/free-solid-svg-icons';
import { API_ENDPOINTS } from './api/endpoints';
import { useApi } from './hooks/useApi';
import { debug, createComponentLogger } from './utils/debug';

// Import bootstrap utility instead of direct WebSocket initialization
import { performCompleteBootstrap } from './utils/bootstrap';
// Import version cache functions and type
import { initVersionCache, forceRefreshVersionCache, VersionInfo, getCachedVersionInfo } from './utils/versionCache';
import { useStore } from './store'; // Import useStore to access startupDurationMs

// Create component-specific logger
const logger = createComponentLogger('Index');

library.add(faEye, faEyeSlash, faRotate, faPowerOff, faDownload);

// Register service worker for fallback caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/fallback-sw.js')
      .then(registration => {
        debug('Fallback service worker registered successfully:', registration.scope);
      })
      .catch(error => {
        // Check if this is an SSL certificate error or generic script fetch error
        if (error.message.includes('SSL certificate') || 
            error.message.includes('SecurityError') ||
            error.message.includes('unknown error occurred when fetching the script')) {
          console.warn('🔒 SSL Certificate Required for Offline Features');
          console.warn('================================================');
          console.warn('The "unknown error occurred when fetching the script" message');
          console.warn('is caused by an uninstalled SSL certificate.');
          console.warn('');
          console.warn('To fix this and enable offline fallback functionality:');
          console.warn('1. Go to Admin Mode (top-right corner)');
          console.warn('2. Click "Install HomeServer SSL Certificate"');
          console.warn('3. Follow the step-by-step instructions for your browser/OS');
          console.warn('4. Refresh this page after installation');
          console.warn('');
          console.warn('Note: The main application works fine without this,');
          console.warn('but offline fallback will be disabled.');
          console.warn('================================================');
        } else {
          debug('Fallback service worker registration failed:', error.message);
        }
      });
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Failed to find the root element');

// Set this to true to enable verbose bootstrap logging globally
const BOOTSTRAP_VERBOSE = false;
const appGlobalStartTime = performance.now(); // Record the very initial start time

// --- BENCHMARKER FLAG ---
export const BENCHMARKER = true; // Set to false to disable benchmarking logic globally
// ------------------------

// Create a VaultAuthWrapper component that will handle the vault authentication flow
const VaultAuthWrapper: React.FC = () => {
  const [isVaultMounted, setIsVaultMounted] = useState<boolean | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<any>(null);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const [isVersionFetched, setIsVersionFetched] = useState<boolean>(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const api = useApi();

  // Moved useEffect to the top to avoid conditional hook call error
  useEffect(() => {
    if (bootstrapResult) {
      const startupDurationMs = useStore.getState().startupDurationMs;
      const totalAppStartupTime = performance.now() - appGlobalStartTime;
      debug(`App component rendered. Total application startup time: ${totalAppStartupTime.toFixed(2)} ms`);
      if (startupDurationMs) {
        debug(`Zustand startupSlice (core init to app ready) reported: ${startupDurationMs.toFixed(2)} ms`);
      }
    }
  }, [bootstrapResult]);

  // Function to check if the vault is mounted
  const checkVaultStatus = useCallback(async () => {
    try {
      const data = await api.get<{ mounted: boolean }>(API_ENDPOINTS.status.vault.status);
      return data.mounted;
    } catch (error) {
      logger.error('Error checking vault status:', error);
      
      // For hard failures (network errors, server down, etc.), redirect to standalone fallback
      logger.warn('Vault status check failed hard - redirecting to standalone fallback');
      
      // Add a small delay to allow any console logs to be visible
      setTimeout(() => {
        window.location.href = '/fallback.html';
      }, 1000);
      
      return false;
    }
  }, [api]);

  // Function to start the application bootstrap process
  const startBootstrap = async () => {
    debug('Starting bootstrap process');
    try {
      // Initialize bootstrap with verbose logging
      const result = await performCompleteBootstrap({ verbose: BOOTSTRAP_VERBOSE });
      debug(`Bootstrap complete, initial tab: ${result.initialTab}`);
      setBootstrapResult(result);
    } catch (error) {
      logger.error('Critical bootstrap error:', error);
      setBootstrapError(error as Error);
      
      // If bootstrap fails completely, also redirect to standalone fallback
      logger.warn('Bootstrap failed completely - redirecting to standalone fallback');
      setTimeout(() => {
        window.location.href = '/fallback.html';
      }, 2000);
    }
  };

  // Check vault status and fetch version on initial mount
  useEffect(() => {
    const initializeApp = async () => {
      let fetchedVersion: VersionInfo | null = null;
      try {
        debug('Fetching version info first...');
        fetchedVersion = await initVersionCache(); 
        debug('Version fetch complete:', fetchedVersion);
        setVersionInfo(fetchedVersion);
        setIsVersionFetched(true);

        debug('Checking vault status...');
        const vaultMounted = await checkVaultStatus();
        debug('Initial vault status:', vaultMounted);
        setIsVaultMounted(vaultMounted);
        
        // If vault is already mounted, start bootstrap immediately
        if (vaultMounted) {
          startBootstrap();
        }
        // Ensure versionInfo is set even on error, using cache or default
        if (!fetchedVersion || fetchedVersion.buildId === 'unknown') { // Check if it defaulted
          debug('initVersionCache might have returned default or failed, checking getCachedVersionInfo as a fallback.');
          setVersionInfo(getCachedVersionInfo()); // This will now read from cacheSlice or return default
        }
      } catch (error) {
        logger.error('Error during initialization:', error);
        
        // For critical initialization errors, redirect to standalone fallback
        logger.warn('Critical initialization error - redirecting to standalone fallback');
        setTimeout(() => {
          window.location.href = '/fallback.html';
        }, 2000);
      }
    };
    
    initializeApp();
  }, [checkVaultStatus]);

  // Handler for successful vault authentication
  const handleVaultAuthSuccess = () => {
    debug('Vault authentication successful');
    setIsVaultMounted(true);
    startBootstrap();
  };

  // If version hasn't been fetched yet, show a loading state
  if (!isVersionFetched || !versionInfo) { // Also check if versionInfo is populated
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#000',
        color: '#fff'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '16px' }}>HomeServer</div>
        <div>Initializing...</div>
      </div>
    );
  }

  // Vault status check might still be pending briefly after version fetch
  // Or if an error occurred during vault check after version fetch
  if (isVaultMounted === null) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#000',
        color: '#fff'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '16px' }}>HomeServer</div>
        <div>Checking vault status...</div>
      </div>
    );
  }

  // If vault is not mounted (and version is fetched), show the vault authentication screen
  // Pass the fetched versionInfo down as a prop
  if (!isVaultMounted) {
    return <VaultAuth onSuccess={handleVaultAuthSuccess} versionInfo={versionInfo} />;
  }

  // If vault is mounted but bootstrap hasn't completed, show a loading state
  if (!bootstrapResult && !bootstrapError) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#000',
        color: '#fff'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '16px' }}>HomeServer</div>
        <div>Initializing application...</div>
      </div>
    );
  }

  // If vault is mounted and bootstrap is complete, render the App
  return <App />;
};

// Render the VaultAuthWrapper instead of directly rendering the App
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <VaultAuthWrapper />
  </React.StrictMode>
);