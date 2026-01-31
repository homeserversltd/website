import React, { useEffect, useMemo, useState, useRef, useCallback, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { useStore, useSubscription, useFallback, useStartup } from './store';
import { PopupManager } from './components/Popup/PopupManager';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useToast } from './hooks/useToast';
import { ApiTabResponse, TabsState } from './types/global';
import { tabManager } from './utils/tabManager';
import { fallbackManager } from './utils/fallbackManager';
import { DebugSubscriptions } from './tablets/admin/components/DebugSubscriptions';
import { CORE_EVENTS } from './components/WebSocket/config';
import { BootstrapResult, performCompleteBootstrap } from './utils/bootstrap';
import { createAppEventHandlers, attachAppEventListeners, createModuleCacheHandlers } from './utils/events';
import { detectRapidRefresh, isInRapidRefreshCooldown, checkConnectionBlock, getRetryDelay } from './utils/refreshUtils';
import { adminModeManager } from './utils/adminModeManager';
import { updateUserActivity } from './components/WebSocket/core/socket';
import { cacheAllImages } from './utils/imageCache';
import { initVersionCache } from './utils/versionCache';
import { useAdminSessionKeepalive, adminSessionKeepAlive } from './utils/keepalive';
import './App.css';
import { subscriptionManager } from './utils/subscriptionManager';
import { BENCHMARKER } from './index'; // Import BENCHMARKER
import { debug, verbose, createComponentLogger, debugPerformance } from './utils/debug';

/**
 * App.tsx
 * 
 * Main application component for the tablet-based UI system.
 * 
 * NOTE: Event handling has been refactored and moved to utils/events.ts
 * All event handlers that were previously defined inline in this component
 * are now centralized in the events utility. This includes:
 * - Fallback system events (activation, deactivation, recovery)
 * - Tablet lifecycle events (mount, unmount, tab changes)
 * - WebSocket connection events (disconnect, reconnect)
 * - UI interaction events (activity tracking)
 * 
 * The main component now focuses on state management and UI rendering.
 */

// Initialize with just the fallback for when everything else fails
const DEFAULT_TAB_STATE = {
  'fallback': {
    config: {
      id: 'fallback',
      displayName: 'System Status',
      adminOnly: false,
      order: 999,
      isEnabled: true
    },
    visibility: { tab: true, elements: {} },
    data: {}
  }
};

// Module cache to avoid redundant imports
const moduleCache = new Map<string, any>();
// Store a cached version of the fallback tablet to use when loading fails
let cachedFallbackTablet: any = null;

// The tablet loader function
const loadTabletModule = async (tabId: string): Promise<any> => {
  // console.log(`[App] loadTabletModule called for tab: ${tabId}`);
  
  // Normalize tab ID - remove @ prefix and handle special cases
  const normalizedTabId = tabId.startsWith('@') ? tabId.substring(1) : tabId;
  
  // Handle fallback specifically
  if (normalizedTabId === 'fallback') {
    // Check if fallback is already cached
    if (moduleCache.has('fallback')) {
      // console.log(`[App] Returning cached fallback module`);
      return moduleCache.get('fallback');
    }
    
    try {
      // console.log(`[App] Loading fallback tablet module`);
      const fallbackModule = await import('./tablets/fallback/index');
      moduleCache.set('fallback', fallbackModule);
      // Update the cached fallback tablet
      cachedFallbackTablet = fallbackModule;
      return fallbackModule;
    } catch (error) {
      console.error(`[App] Critical error: Failed to load fallback tablet module:`, error);
      throw new Error(`Critical error: Failed to load the fallback tablet module`);
    }
  }
  
  // For normal tabs
  // Check cache first
  if (moduleCache.has(normalizedTabId)) {
    // console.log(`[App] Returning cached module for tab: ${normalizedTabId}`);
    return moduleCache.get(normalizedTabId);
  }
  
  try {
    // Use normalized tabId (without @) for import path
    const modulePath = `./tablets/${normalizedTabId}`;
    // console.log(`[App] Importing module from: ${modulePath}`);
    
    // Dynamic import
    const module = await import(`${modulePath}/index`);
    
    // Validate module has a default export
    if (!module || !module.default || typeof module.default !== 'function') {
      console.error(`[App] Invalid module format for ${normalizedTabId}:`, module);
      throw new Error(`Invalid tablet module format for ${normalizedTabId}`);
    }
    
    // Cache the module
    moduleCache.set(normalizedTabId, module);
    return module;
  } catch (error) {
    console.error(`[App] Error loading tablet module for ${normalizedTabId}:`, error);
    
    // Use fallback system's chain to try finding an alternative tab to display
    const alternativeTabId = fallbackManager.executeFallbackChain();
    
    // If we got a different tab than the one that failed, try loading that instead
    if (alternativeTabId !== normalizedTabId && alternativeTabId !== 'fallback') {
      // console.log(`[App] Attempting to load alternative tab: ${alternativeTabId}`);
      try {
        const alternativeModule = await import(`./tablets/${alternativeTabId}/index.tsx`);
        moduleCache.set(alternativeTabId, alternativeModule);
        
        // Update the active tab in the store
        setTimeout(() => useStore.setState({ activeTab: alternativeTabId }), 0);
        
        return alternativeModule;
      } catch (alternativeError) {
        console.error(`[App] Failed to load alternative tab:`, alternativeError);
      }
    }
    
    // Try to load fallback as a last resort
    try {
      // console.log(`[App] Attempting to load fallback tablet instead`);
      const fallbackModule = await import('./tablets/fallback/index');
      moduleCache.set('fallback', fallbackModule);
      
      // Activate fallback mode with reason
      fallbackManager.activateFallback('tablet_load_error');
      
      // Force set active tab to fallback
      setTimeout(() => useStore.setState({ activeTab: 'fallback' }), 0);
      
      return fallbackModule;
    } catch (fallbackError) {
      console.error(`[App] Even fallback tablet failed to load:`, fallbackError);
      throw new Error(`Critical error: Failed to load any tablet module`);
    }
  }
};

// Function to ensure fallback tablet is loaded
const ensureFallbackTabletLoaded = async (): Promise<void> => {
  if (!cachedFallbackTablet) {
    try {
      // console.log(`[App] Pre-loading fallback tablet module for cache`);
      cachedFallbackTablet = await import('./tablets/fallback/index');
      moduleCache.set('fallback', cachedFallbackTablet);
    } catch (error) {
      console.error('[App] Failed to pre-load fallback tablet:', error);
    }
  }
};

// Define App component props interface
// interface AppProps {} // Changed to use React.FC without explicit props if none are defined
// Initialize managers once
fallbackManager.initialize();
adminModeManager.initialize();
subscriptionManager.initialize();

// Initialize component logger for App
const logger = createComponentLogger('App');

export const App: React.FC = () => { 
  const { 
    currentPhase: startupPhase,
    startupError,
  } = useStartup();

  // Select activeTab directly for more targeted re-renders
  const activeTab = useStore((state) => state.activeTab);

  // Get other essential state from store
  const { 
    starredTab,
    getVisibleTabs,
    isAdmin,
    checkSessionTimeout, 
    updateLastActivity,
    tabs,
    loadThemes,
    setActiveTab,
    isInitialized,
    webSocketStatus: wsStatus,
    exitAdminMode,
    fallbackReason,
  } = useStore((state) => ({
    starredTab: state.starredTab,
    getVisibleTabs: state.getVisibleTabs,
    isAdmin: state.isAdmin,
    checkSessionTimeout: state.checkSessionTimeout,
    updateLastActivity: state.updateLastActivity,
    tabs: state.tabs,
    loadThemes: state.loadThemes,
    setActiveTab: state.setActiveTab,
    isInitialized: state.isInitialized,
    webSocketStatus: state.status,
    exitAdminMode: state.exitAdminMode,
    fallbackReason: state.fallbackReason,
  }));
  
  verbose(`activeTab: '${activeTab}', startupPhase: '${startupPhase}'`);

  const bootstrapResultRef = useRef<BootstrapResult | null>(null);
  const [appInitializationError, setAppInitializationError] = useState<string | null>(null);
  const [showTabBarFromBootstrap, setShowTabBarFromBootstrap] = useState<boolean>(false);

  const previousFallbackReasonRef = useRef(fallbackReason); // Ref for previous fallbackReason

  // Refs for streamlining tab loading logic
  const previousActiveTabRef = useRef<string | null>(null);
  const initialLoadTriggeredRef = useRef<boolean>(false);

  // Main startup useEffect
  useEffect(() => {
    let isMounted = true;
    const bootstrapApp = async () => {
      logger.info('Initiating performCompleteBootstrap');
      try {
        const result = await performCompleteBootstrap({
          // Pass any specific bootstrap options here if needed
          // e.g., verbose: process.env.NODE_ENV !== 'production'
        });
        if (isMounted) {
          logger.info('performCompleteBootstrap completed:', result);
          bootstrapResultRef.current = result;
          setShowTabBarFromBootstrap(result.shouldShowTabBar);

          // The startupSlice will have moved to AppReady or Error.
          // The activeTab should be set based on bootstrapResult.initialTab
          // AFTER the main tab config is loaded and startupSlice is AppReady.
          // We defer setting activeTab until tab config is also ready.
        }
              } catch (error) {
          if (isMounted) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown bootstrap error';
            logger.error('performCompleteBootstrap failed:', errorMsg);
            setAppInitializationError(errorMsg);
            // startupSlice should also reflect this error in startupError and Error phase
          }
        }
    };

    if (startupPhase === 'Idle') { // Only start if Idle, to prevent re-triggering on HMR
      bootstrapApp();
    }

    return () => {
      isMounted = false;
      // Optionally, abort the bootstrap process if `performCompleteBootstrap` supported an abort controller
      // bootstrapResultRef.current?.abortController.abort();
    };
  }, [startupPhase]); // Depend on startupPhase to ensure it only runs when truly idle.

  // Initialize admin session keepalive with explicit debug logs
  useEffect(() => {
    verbose(`Admin status changed to: ${isAdmin ? 'active' : 'inactive'}`);
    // We no longer start keepalive for all admin sessions, only for long-running tasks
  }, [isAdmin]);
  
  // Keep the hook for activity timestamp updates
  useAdminSessionKeepalive();
  
  // Get subscription functionality from store
  const {
    subscribeToCoreEvent,
    subscribeToAdminEvent
  } = useSubscription();
  
  const toast = useToast();
  
  // Tablet state
  const [tabletModule, setTabletModule] = useState<any>(null);
  const [isLoadingTablet, setIsLoadingTablet] = useState<boolean>(true);
  const [tabletError, setTabletError] = useState<Error | null>(null);
  const [isFallbackActive, setIsFallbackActive] = useState<boolean>(false);
  
  // Add state to track if TabBar should be shown based on visible tabs count
  // Initialize with bootstrap result if available
  const [shouldShowTabBar, setShouldShowTabBar] = useState<boolean>(false);
  
  // References for safety checks and tracking
  const isMounted = useRef(true);
  const currentTabId = useRef<string | null>(null);
  const loadCount = useRef(0);
  const loadingTabletRef = useRef(false); // New ref to track loading state
  const lastLoadTimeRef = useRef(0); // New ref to track last load time
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null); // New ref to track load timeout
  const previousAdmin = useRef<boolean>(isAdmin); // Track admin state changes
  const previousFallbackState = useRef<boolean>(false); // Track previous fallback state
  
  // Refs used by loadTablet, must be defined before it
  const lastLoadedTabRef = useRef<{ tabId: string | null; timestamp: number }>({
    tabId: null, 
    timestamp: 0 
  });
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add the new fallback state hook
  const { isFallbackMode, fallbackReason: fallbackReasonFromHook } = useFallback();
  
  // Add a ref to track if bootstrap initialization has already occurred
  const bootstrapInitializedRef = useRef<boolean>(false); // This might still be useful or managed by startupPhase
  
  // Add a state variable to track if we're in a connection block
  const [connectionBlocked, setConnectionBlocked] = useState<boolean>(false);
  
  // Add a state variable to track connection status
  const [connectionState, setConnectionState] = useState<{ status: string; message: string }>({
    status: 'connected',
    message: 'Connection is active'
  });
  
  // Store toast in a ref to prevent it from causing re-renders
  const toastRef = useRef(toast);
  
  // Update toast ref when toast changes
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  
  // Check if TabBar should be shown based on visible tabs count
  useEffect(() => {
    if (startupPhase === 'AppReady') { // Only check when app is ready
      if (Object.keys(tabs).length > 0) {
        const visibleTabs = getVisibleTabs();
        const shouldShow = isAdmin || visibleTabs.length > 2;
        // Prioritize bootstrap result for initial decision
        setShouldShowTabBar(bootstrapResultRef.current?.shouldShowTabBar ?? shouldShow);
      }
    }
  }, [tabs, getVisibleTabs, isAdmin, startupPhase, showTabBarFromBootstrap]);
    // Extract tablet loading logic to a separate function to manage state more carefully
  // Wrapped in useCallback to stabilize its reference for useEffect dependencies
  const loadTablet = useCallback((tabId: string) => {
    if (BENCHMARKER) performance.mark(`loadTabletStart-${tabId}`); // BENCHMARK START
    if (startupPhase !== 'AppReady') {
        debug(`Skipping loadTablet for ${tabId} as startupPhase is ${startupPhase}`);
        if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-skipped-startup`, `loadTabletStart-${tabId}`);
        return;
    }

    const storeActiveTab = useStore.getState().activeTab; // Get current active tab from store for checks

    // Special handling for recovery from fallback mode
    const isRecoveringFromFallback = fallbackManager.isRecovering?.() || false;
    if (isRecoveringFromFallback && tabId === 'fallback') {
      debug(`Skipping fallback tablet load during recovery from fallback mode`);
      // If we're recovering, bootstrap.ts should have set a non-fallback activeTab in the store.
      // Rely on the main activeTab effect to load the correct tab.
      if (storeActiveTab && storeActiveTab !== 'fallback') {
         debug(`During fallback recovery, store activeTab is: ${storeActiveTab}. It will be loaded.`);
         // No direct action needed here, the standard activeTab change effect will handle it.
      }
      if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-skipped-recovery`, `loadTabletStart-${tabId}`);
      return;
    }
    
    // CRITICAL: During initial bootstrap, if we're trying to load the fallback tablet
    // but the store's activeTab (set by bootstrap) is different, prioritize the store's activeTab.
    // This condition needs to be carefully re-evaluated.
    // The original condition was:
    // if (!initialTabFromBootstrap && tabId === 'fallback' && initialTabFromBootstrap && initialTabFromBootstrap !== 'fallback')
    // which was self-contradictory.
    // New thinking: If bootstrap has already set a non-fallback activeTab in the store,
    // and somehow loadTablet is called for 'fallback' during the initial load sequence,
    // we should respect the store's activeTab.
    if (startupPhase === 'AppReady' && tabId === 'fallback' && storeActiveTab && storeActiveTab !== 'fallback') {
      debug(`CRITICAL: Preventing fallback tablet from loading as bootstrap set '${storeActiveTab}' in store.`);
      // The main useEffect for activeTab should handle loading storeActiveTab.
      // This call might be redundant if the main effect is robust.
      // For safety, if this specific loadTablet('fallback') was somehow triggered,
      // and activeTab in store is different, we might want to reload the store's activeTab.
      // However, this could also cause loops if not handled carefully.
      // Best to rely on the main activeTab useEffect.
      // For now, just log and prevent fallback loading if store has a better tab.
      if (activeTab !== storeActiveTab) { // If the current activeTab prop of App.tsx differs
        // This indicates a potential state desync or rapid change.
        // Let the main activeTab useEffect handle loading storeActiveTab.
        logger.warn(`loadTablet called for 'fallback', but store.activeTab is '${storeActiveTab}'. Expecting '${storeActiveTab}' to load.`);
      }
      if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-skipped-bootstrap-override`, `loadTabletStart-${tabId}`);
      return; // Prevent loading 'fallback' if a better tab is already set in store by bootstrap
    }
    
    // Skip if we're already loading or have loaded this tab
    if (loadingTabletRef.current) {
      debug(`Already loading a tablet, skipping request for: ${tabId}`);
      if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-skipped-already-loading`, `loadTabletStart-${tabId}`);
      return;
    }
    
    // Check if this tab was recently loaded (debounce)
    const now = Date.now();
    const { tabId: lastTabId, timestamp: lastTimestamp } = lastLoadedTabRef.current;
    const timeSinceLastLoad = now - lastTimestamp;
    
    // Skip debounce during recovery from fallback mode to ensure immediate loading
    const skipDebounce = isRecoveringFromFallback;
    
    if (!skipDebounce && lastTabId === tabId && timeSinceLastLoad < 500) {
      debug(`Tab ${tabId} was loaded ${timeSinceLastLoad}ms ago, debouncing`);
      
      // Clear any existing debounce timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      // Set a new debounce timeout
      debounceTimeoutRef.current = setTimeout(() => {
        debug(`Debounce timeout expired, loading tab: ${tabId}`);
        loadTablet(tabId); // Recursive call, ensure `loadTablet` is stable
      }, 500 - timeSinceLastLoad);
      
      if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-debounced`, `loadTabletStart-${tabId}`);
      return;
    }
    
    // Update last loaded tab
    lastLoadedTabRef.current = { tabId, timestamp: now };
    
    // During recovery, always force a fresh load by skipping the cache
    if (isRecoveringFromFallback) {
      debug(`Recovery in progress, forcing fresh load of ${tabId}`);
      moduleCache.delete(tabId);
    } else {
      // Check if the module is already in the cache
      if (moduleCache.has(tabId)) {
        debug(`Using cached module for tab: ${tabId}`);
        setTabletModule(moduleCache.get(tabId));
        setIsLoadingTablet(false);
        if (BENCHMARKER) {
          performance.mark(`loadTabletEnd-cached-${tabId}`); // BENCHMARK END (CACHE)
          performance.measure(`loadTablet-cached-${tabId}`, `loadTabletStart-${tabId}`, `loadTabletEnd-cached-${tabId}`);
          debugPerformance.time(`Tab ${tabId} (cached) loaded in:`, () => performance.getEntriesByName(`loadTablet-cached-${tabId}`, 'measure')[0]?.duration);
        }
        return;
      }
    }
    
    // If not in cache, load the module
    debug(`Loading tablet ${tabId}, module not in cache`);
    
    // Mark as loading and update timestamps
    loadingTabletRef.current = true;
    lastLoadTimeRef.current = Date.now();
    
    // Reset state at the beginning of a load
    setIsLoadingTablet(true);
    setTabletError(null);
    
    // Set a loading timeout - if tablet doesn't load in time, show fallback
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    
    loadTimeoutRef.current = setTimeout(() => {
      debug(`Tablet loading timed out for ${tabId}, showing fallback`);
      
      const socketStatus = useStore.getState().status; // Ensuring this is direct status access
      
      if (loadingTabletRef.current && cachedFallbackTablet) {
        // Use cached fallback tablet when loading times out
        setTabletModule(cachedFallbackTablet);
        setIsLoadingTablet(false);
        
        if (socketStatus === 'disconnected') {
          // If WebSocket is disconnected, this is likely a connection issue
          debug('Tablet timeout with disconnected WebSocket - activating connection-related fallback');
          setTabletError(new Error(`Loading tablet ${tabId} timed out due to connection issues`));
          fallbackManager.activateFallback('connection_timeout');
        } else {
          // If WebSocket is connected, this is likely just a slow loading module
          debug('Tablet timeout with connected WebSocket - using fallback without full fallback mode');
          setTabletError(new Error(`Loading tablet ${tabId} timed out, but connection appears stable`));
          
          // Don't activate fallback mode, just show the fallback UI
          // This prevents unnecessary disruption when the connection is fine
          if (tabId !== 'fallback') {
            window.dispatchEvent(new CustomEvent('tablet-load-error', {
              detail: { tabId, reason: 'loading_timeout_with_connection' }
            }));
          }
        }
        
        loadingTabletRef.current = false;
      }
    }, 15000); // Extend timeout to 15 seconds to give more time for loading
    
    // Increment load counter for debugging
    loadCount.current++;
    const thisLoadId = loadCount.current;
    
    debug(`Loading tablet for tab: ${tabId} (load #${thisLoadId})`);
    currentTabId.current = tabId;
    
    // Start loading the tablet module
    loadTabletModule(tabId)
      .then(module => {
        // Only update state if this is still the current load and component is mounted
        if (!isMounted.current || thisLoadId !== loadCount.current) {
          debug(`Stale load detected (#${thisLoadId}), current is #${loadCount.current}`);
          loadingTabletRef.current = false;
          if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-stale-load`, `loadTabletStart-${tabId}`);
          return;
        }
        
        logger.info(`Successfully loaded tablet module for: ${tabId}`);
        setTabletModule(module);
        setIsLoadingTablet(false);
        loadingTabletRef.current = false;
        
        if (BENCHMARKER) {
          performance.mark(`loadTabletEnd-success-${tabId}`); // BENCHMARK END (SUCCESS)
          performance.measure(`loadTablet-success-${tabId}`, `loadTabletStart-${tabId}`, `loadTabletEnd-success-${tabId}`);
          debugPerformance.time(`Tab ${tabId} (success) loaded in:`, () => performance.getEntriesByName(`loadTablet-success-${tabId}`, 'measure')[0]?.duration);
        }
        
        // Clear the timeout since we successfully loaded the tablet
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        
        // Dispatch a tablet-loaded event to notify other components
        window.dispatchEvent(new CustomEvent('tablet-loaded', {
          detail: {
            tabId,
            timestamp: Date.now(),
            loadId: thisLoadId
          }
        }));
        
        // If we're recovering from fallback mode, dispatch a success event
        if (isRecoveringFromFallback) {
          debug(`Recovery from fallback mode successful, loaded: ${tabId}`);
          window.dispatchEvent(new CustomEvent('tablet-recovery-complete', {
            detail: {
              targetTabId: tabId,
              previousTabId: 'fallback',
              success: true,
              timestamp: Date.now()
            }
          }));
        }
      })
      .catch(error => {
        // Only update state if this is still the current load and component is mounted
        if (!isMounted.current || thisLoadId !== loadCount.current) {
          loadingTabletRef.current = false;
          if (BENCHMARKER) performance.measure(`loadTablet-${tabId}-stale-error`, `loadTabletStart-${tabId}`);
          return;
        }
        
        logger.error(`Error loading tablet:`, error);
        setTabletError(error instanceof Error ? error : new Error(error.message));
        setIsLoadingTablet(false);
        loadingTabletRef.current = false;
        
        if (BENCHMARKER) {
          performance.mark(`loadTabletEnd-error-${tabId}`); // BENCHMARK END (ERROR)
          performance.measure(`loadTablet-error-${tabId}`, `loadTabletStart-${tabId}`, `loadTabletEnd-error-${tabId}`);
          debugPerformance.time(`Tab ${tabId} (error) loading failed in:`, () => performance.getEntriesByName(`loadTablet-error-${tabId}`, 'measure')[0]?.duration);
        }
        
        // Show toast for better UX
        toastRef.current.error(`Failed to load ${tabId} content: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        // If we're recovering from fallback mode, dispatch a failure event
        if (isRecoveringFromFallback) {
          debug(`Recovery from fallback mode failed for: ${tabId}`);
          window.dispatchEvent(new CustomEvent('tablet-recovery-failed', {
            detail: {
              targetTabId: tabId,
              previousTabId: 'fallback',
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            }
          }));
        }
        
        // Activate fallback mode if not already active
        if (!fallbackManager.isActive()) {
          fallbackManager.activateFallback('load_error');
        }
      });
  // Dependencies for useCallback: state setters, refs (not needed), and any props/state from App scope that loadTablet reads.
  // activeTab (from useStore) is read inside via useStore.getState(), so it's not a direct dependency here for useCallback.
  // startupPhase is read. toastRef is stable. FallbackManager imported. cachedFallbackTablet module-level.
  // loadTabletModule is outside. moduleCache module-level.
  }, [startupPhase, setTabletModule, setIsLoadingTablet, setTabletError, toastRef, activeTab]);

  // Top-level effect for component mount/unmount status for async operations
  useEffect(() => {
    isMounted.current = true; // Ensure it's true when component is mounted/re-rendered
    return () => {
      isMounted.current = false; // Set to false only when component unmounts
    };
  }, []); // Empty dependency array: runs on mount, cleans up on unmount

  // Main startup useEffect
  useEffect(() => {
    if (startupPhase === 'AppReady' && !initialLoadTriggeredRef.current) {
      logger.info('Initial Load: AppReady detected. Initializing tablet based on activeTab from store.');
      initialLoadTriggeredRef.current = true; // Mark that initial load is being handled

      setTabletModule(null); // Reset tablet module state
      setTabletError(null);  // Reset tablet error state
      // isMounted.current = true; // No longer set here, managed by top-level useEffect

      const tabToLoad = activeTab; // activeTab from useStore()

      if (tabToLoad) {
        logger.info(`Initial Load: Active tab from store is '${tabToLoad}'. Loading it.`);
        loadTablet(tabToLoad);
        previousActiveTabRef.current = tabToLoad;
      } else {
        logger.error('Initial Load: activeTab from store is null or undefined. This indicates an issue. Loading fallback.');
        loadTablet('fallback');
        previousActiveTabRef.current = 'fallback';
      }
      ensureFallbackTabletLoaded().catch(err => logger.error('Error pre-loading fallback in AppReady:', err));

      // No longer returning a cleanup function that sets isMounted.current = false from this effect
      // return () => {
      //   isMounted.current = false;
      // };
    }
  }, [startupPhase, activeTab, loadTablet]); // Depends on startupPhase, activeTab (from store), and loadTablet
  
  // Load the active tab when it changes OR for recovery, AFTER initial load.
  useEffect(() => {
    if (BENCHMARKER) performance.mark(`activeTabEffectStart-${activeTab}`); // BENCHMARK: Start of activeTab effect

    if (!initialLoadTriggeredRef.current || startupPhase !== 'AppReady') {
      debug('[App] Tab Change Hook: BAILED due to initialLoadTriggeredRef or startupPhase.', 
        { initialLoadTriggered: initialLoadTriggeredRef.current, startupPhase });
      if (BENCHMARKER) performance.measure(`activeTabEffect-${activeTab}-skipped-init-or-phase`, `activeTabEffectStart-${activeTab}`);
      return;
    }

    if (!isMounted.current) { 
      debug('[App] Tab Change Hook: BAILED due to !isMounted.current.');
      if (BENCHMARKER) performance.measure(`activeTabEffect-${activeTab}-skipped-not-mounted`, `activeTabEffectStart-${activeTab}`);
      return;
    }

    if (!activeTab) { 
      debug('[App] Tab Change Hook: BAILED due to !activeTab.');
      if (BENCHMARKER) performance.measure(`activeTabEffect-${activeTab}-skipped-no-activeTab`, `activeTabEffectStart-${activeTab}`);
      return;
    }
    
    // Log current and previous tab values for debugging
    verbose(`Current activeTab: '${activeTab}', previousActiveTabRef: '${previousActiveTabRef.current}'`);

    // Skip if we're in fallback mode and the active tab is not fallback
    if (isFallbackActive && activeTab !== 'fallback') {
      debug(`In fallback mode, skipping load for: ${activeTab}`);
      if (BENCHMARKER) performance.measure(`activeTabEffect-${activeTab}-skipped-fallback-active`, `activeTabEffectStart-${activeTab}`);
      return;
    }
    
    // Skip if we're in a connection block
    if (connectionBlocked) {
      debug(`Connection blocked, skipping load for: ${activeTab}`);
      if (BENCHMARKER) performance.measure(`activeTabEffect-${activeTab}-skipped-connection-blocked`, `activeTabEffectStart-${activeTab}`);
      return;
    }

    // If tab hasn't actually changed, only update WebSocket status
    if (activeTab === previousActiveTabRef.current) {
      debug(`Active tab ${activeTab} is same as previous. WebSocket update only.`);
      if (wsStatus === 'connected') {
        debug(`Updating socket active tab to: ${activeTab} (no content change)`);
        useStore.getState().setWebSocketActiveTabId(activeTab);
      }
      if (BENCHMARKER) {
        performance.mark(`activeTabEffectEnd-noChange-${activeTab}`);
        performance.measure(`activeTabEffect-noChange-${activeTab}`, `activeTabEffectStart-${activeTab}`, `activeTabEffectEnd-noChange-${activeTab}`);
        debugPerformance.time(`activeTabEffect (no tab change) for ${activeTab} took:`, () => performance.getEntriesByName(`activeTabEffect-noChange-${activeTab}`, 'measure')[0]?.duration);
      }
      return;
    }
    
    // Load the active tab as it has changed
    logger.info(`Active tab changed to: ${activeTab} from ${previousActiveTabRef.current}. Loading it.`);
    loadTablet(activeTab);
    // Since loadTablet is async, we can't accurately mark the end here.
    // The end of the loadTablet call itself is marked within loadTablet.
    // We can measure the synchronous part of this effect.
    previousActiveTabRef.current = activeTab; // Update ref after deciding to load
    
    // Update WebSocket active tab
    if (wsStatus === 'connected') {
      debug(`Updating socket active tab to: ${activeTab}`);
      useStore.getState().setWebSocketActiveTabId(activeTab);
    }
    if (BENCHMARKER) {
      performance.mark(`activeTabEffectEnd-loaded-${activeTab}`);
      performance.measure(`activeTabEffect-loaded-${activeTab}`, `activeTabEffectStart-${activeTab}`, `activeTabEffectEnd-loaded-${activeTab}`);
      debugPerformance.time(`activeTabEffect (tab change initiated) for ${activeTab} took:`, () => performance.getEntriesByName(`activeTabEffect-loaded-${activeTab}`, 'measure')[0]?.duration);
    }

  }, [activeTab, isFallbackActive, connectionBlocked, startupPhase, wsStatus, loadTablet]);
  
  // Set up tab change listeners
  useEffect(() => {
    if (startupPhase !== 'AppReady') return;
    debug(`Setting up tab change listeners post AppReady`);
    // The event handlers have been moved to events.ts
    // The event listeners are attached in the initialization useEffect
    
    // Clean up on unmount - handled in the initialization useEffect
    return () => {
      // Cleanup handled by attachAppEventListeners
    };
  }, [startupPhase]);
  
  // Ensure WebSocket client is notified of active tab changes
  useEffect(() => {
    if (startupPhase !== 'AppReady' && wsStatus !== 'connected') return;
    
    if (activeTab) {
        useStore.getState().setWebSocketActiveTabId(activeTab); // Ensuring this is setWebSocketActiveTabId
    }

  }, [activeTab, startupPhase, wsStatus]);
  
  // Handle admin session timeout
  useEffect(() => {
    const interval = setInterval(() => {
      if (checkSessionTimeout()) {
        // Handle timeout (e.g., show notification)
        toastRef.current.warning('Admin session about to expire due to inactivity');
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [checkSessionTimeout, toastRef]);

  // Load themes immediately on mount - this can stay, or be part of CoreInitialization
  useEffect(() => {
    loadThemes().then(() => {
      document.documentElement.classList.add('theme-loaded');
    });
  }, [loadThemes]);

  // Create tablet component from loaded module
  const TabletComponent = useMemo(() => {
    if (!tabletModule || !tabletModule.default) {
      return null;
    }
    
    try {
      // Create the component with a unique key to force re-renders
      const TabletFromModule = tabletModule.default;
      const tabletKey = `tablet-${activeTab || 'unknown'}-${Date.now()}`;
      
      return (
        <ErrorBoundary
          fallback={<div className="tablet-error">Error rendering tablet content</div>}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <TabletFromModule key={tabletKey} />
          </Suspense>
        </ErrorBoundary>
      );
    } catch (error) {
      console.error('[App] Error rendering tablet:', error);
      return <div className="tablet-error">Error rendering tablet content</div>;
    }
  }, [tabletModule, activeTab]);

  // Effect to monitor fallback state changes
  useEffect(() => {
    const currentFallbackState = isFallbackMode();
    const isRecovering = fallbackManager.isRecovering?.() || false;

    // Handle admin logout and toast for user inactivity fallback
    if (fallbackReason === 'user_inactivity' && previousFallbackReasonRef.current !== 'user_inactivity') {
      toastRef.current.info('You have been disconnected due to inactivity.', { duration: 7000 });
      if (isAdmin) {
        logger.info('User inactivity fallback detected. Logging out admin.');
        exitAdminMode();
      }
    }
    previousFallbackReasonRef.current = fallbackReason;
    
    // Only run logic when fallback state actually changes and not during recovery
    if (currentFallbackState !== previousFallbackState.current && !isRecovering) {
      if (currentFallbackState) {
        debug(`Fallback mode activated: ${fallbackReason}`);
        
        // If we're in fallback mode but not on the fallback tab, switch to it
        if (activeTab !== 'fallback') {
          logger.info(`Switching to fallback tab due to active fallback mode`);
          setActiveTab('fallback');
        }
        
        // Clear any pending tablet loads since we're going to fallback
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
      } else {
        debug(`Fallback mode deactivated, recovery in progress: ${isRecovering}`);
      }
      
      // Update the ref
      previousFallbackState.current = currentFallbackState;
    }
  }, [isFallbackMode, fallbackReason, activeTab, setActiveTab]);
  
  // Update the WebSocket disconnect handling
  useEffect(() => {
    if (startupPhase !== 'AppReady') return;
    // This event handler has been moved to events.ts
    // and is handled in the initialization useEffect
    
    return () => {
      // Cleanup handled by attachAppEventListeners
    };
  }, [isFallbackMode, setActiveTab, startupPhase]);

  // Clean up the fallback manager when the app unmounts
  useEffect(() => {
    return () => {
      fallbackManager.cleanup();
    };
  }, []);

  // Clean up the WebSocket on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      debug('Page unloading, setting refresh flag and cleaning up WebSocket connection');
      // Set a flag to indicate a page refresh is in progress
      try {
        sessionStorage.setItem('isPageRefreshing', 'true');
      } catch (e) {
        logger.warn('Could not set sessionStorage item for refresh detection:', e);
      }

      try {
        // Try to cleanly disconnect the socket before page refresh
        useStore.getState().disconnect(); // Call disconnect from websocketSlice
      } catch (error) {
        logger.error('Error disconnecting socket during page unload:', error);
      }
    };
    
    // Add the event listener
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Remove on component unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Track user activity for WebSocket timeout
  useEffect(() => {
    // Update activity timestamp on user interaction
    const handleUserActivity = () => {
      updateLastActivity(); // Update app-level activity tracking
      updateUserActivity(); // Update WebSocket activity tracking
    };

    // Handle click events with filtering
    const handleClick = (e: MouseEvent) => {
      // Skip tracking for form controls to avoid interference
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isFormControl = tagName === 'input' || 
                           tagName === 'select' || 
                           tagName === 'textarea' || 
                           tagName === 'button' ||
                           target.closest('label') !== null;
      
      if (!isFormControl) {
        handleUserActivity();
      }
    };

    // Add event listeners for common user interactions
    window.addEventListener('scroll', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('click', handleClick);
    
    // Initial activity update
    handleUserActivity();
    
    return () => {
      window.removeEventListener('scroll', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('click', handleClick);
    };
  }, [updateLastActivity, updateUserActivity]);

      // Initialize caches during app bootstrap - can be part of CoreInitialization
    useEffect(() => {
      // Initialize image cache
      cacheAllImages().catch(err => {
        logger.error('Failed to initialize image cache:', err);
      });
      
      // Initialize version cache
      initVersionCache().catch(err => {
        logger.error('Failed to initialize version cache:', err);
      });
    }, []);

  // Add global error handler for factory mode errors
  useEffect(() => {
    const handleFactoryModeError = (event: ErrorEvent) => {
      // Check if this is an API error from factory mode
      if (event.error?.message?.includes('factory fallback mode')) {
        // Show toast before crashing
        toastRef.current.error('System is in factory fallback mode. Please fix homeserver.json to make changes.', {
          duration: 30000, // Keep the message visible for 30 seconds
          dismissOnClick: false, // Don't dismiss on click since this is important
          priority: 1 // Show above other toasts
        });
      }
    };

    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('factory fallback mode')) {
        toastRef.current.error('System is in factory fallback mode. Please fix homeserver.json to make changes.', {
          duration: 30000,
          dismissOnClick: false,
          priority: 1
        });
      }
    };

    // Add global error handlers
    window.addEventListener('error', handleFactoryModeError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);

    return () => {
      window.removeEventListener('error', handleFactoryModeError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    };
  }, []);


  // Conditional rendering based on startupPhase
  if (startupPhase === 'Idle' || startupPhase === 'CoreInitializing' || startupPhase === 'WebSocketConnecting') {
    return (
      <div className="app bootstrap-loading">
        <div className="bootstrap-container">
          <LoadingSpinner size="large" />
          <p>Initializing application ({startupPhase})...</p>
        </div>
      </div>
    );
  }

  if (startupPhase === 'Error') {
    return (
      <div className="app bootstrap-error">
        <div className="bootstrap-container">
          <h2>Application Initialization Failed</h2>
          <p>{appInitializationError || startupError || 'An unknown error occurred during startup.'}</p>
          {/* Optionally, a retry button could call useStore.getState().resetStartup() and then re-trigger bootstrapApp() */}
        </div>
      </div>
    );
  }
  
  // Only render the main app if startupPhase is AppReady (or WebSocketConnected as an interim)
  if (startupPhase !== 'AppReady' && startupPhase !== 'WebSocketConnected') {
      // This case should ideally be caught by the loading/error states above.
      // If we reach here, it's an unexpected state during transition.
      return (
        <div className="app bootstrap-loading">
          <div className="bootstrap-container">
            <LoadingSpinner size="large" />
            <p>Finalizing initialization ({startupPhase})...</p>
          </div>
        </div>
      );
  }

  return (
    <div className={`app ${fallbackManager.isActive() ? 'fallback-active' : ''}`}>
      <ErrorBoundary>
        <Header />
        
        {/* Connection blocked message */}
        {connectionBlocked && (
          <div className="connection-blocked-message">
            <div className="blocked-content">
              <LoadingSpinner size="medium" />
              <p>{connectionState.message}</p>
            </div>
          </div>
        )}
        
        {/* Only render TabBar when not in fallback mode AND bootstrap initialization is complete */}
        {!isFallbackActive && (startupPhase === 'AppReady') && shouldShowTabBar && <TabBar />}
        
        {/* TabBar placeholder - only show when TabBar will be needed but isn't rendered yet */}
        {!isFallbackActive && (startupPhase !== 'AppReady') && shouldShowTabBar && (
          <div 
            className="tab-bar-placeholder" 
            style={{ 
              height: '48px', /* Same as TabBar min-height */
              width: '100%',
              flex: '0 0 auto'
            }}
            aria-hidden="true"
          />
        )}
        
        <main className="content">
          <ErrorBoundary>
            {/* Render appropriate tablet content */}
            {isLoadingTablet ? (
              <div 
                className="tablet-loading" 
                data-loading-start={Date.now().toString()}
              >
                <LoadingSpinner size="large" />
                <p>Loading {activeTab || 'default'} content...</p>
              </div>
            ) : tabletError ? (
              <div className="tablet-error">
                <h2>Error Loading Content</h2>
                <p>{tabletError?.message}</p>
                <button 
                  className="reload-button" 
                  onClick={() => {
                    // Force a reload of the current tab
                    const currentTab = activeTab || 'fallback'; // Use activeTab or fallback
                    
                    // If currently on fallback, try the first visible tab instead
                    if (currentTab === 'fallback') {
                      const visibleTabs = getVisibleTabs();
                      if (visibleTabs.length > 0) {
                        useStore.setState({ activeTab: visibleTabs[0] });
                      } else {
                        useStore.setState({ activeTab: 'fallback' });
                      }
                    } else {
                      // Just reload the current tab
                      useStore.setState({ activeTab: currentTab });
                    }
                  }}
                >
                  Try Again
                </button>
              </div>
            ) : TabletComponent ? (
              <div className="tablet-container" key={`container-${activeTab || 'unknown'}`}>
                {TabletComponent}
              </div>
            ) : (
              <div className="tablet-loading">
                <LoadingSpinner size="large" />
                <p>Initializing ({activeTab || 'default'})...</p>
              </div>
            )}
          </ErrorBoundary>
        </main>
        
        <PopupManager />
        
        {/* Show subscription debugger only in development mode */}
        {process.env.NODE_ENV !== 'production' && <DebugSubscriptions />}
      </ErrorBoundary>
    </div>
  );
};