/**
 * bootstrap.ts
 * 
 * Bootstraps the application initialization sequence using the startupSlice.
 */

import { useStore } from '../store';
// import { socketClient } from '../components/WebSocket/client'; // No longer directly using socketClient.connect
// import { getSocket } from '../components/WebSocket/core/socket'; // Not directly needed here
// import { initializeWebSocket, isWebSocketInitialized } from '../components/WebSocket/core/startup'; // Core system init now handled by startupSlice
import { fallbackManager } from './fallbackManager';
import { cacheAllImages } from './imageCache';
import { initializeCoreWebSocketSystem, isCoreSystemInitialized } from '../components/WebSocket/core/startup'; // For explicit core WS system init
import { TabsState, TabVisibility, TabData } from '../types/global'; // Added TabData
import { debug, verbose, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('Bootstrap');

/**
 * Options for bootstrapping the application
 */
export interface BootstrapOptions {
  /** Time to wait for the entire startup sequence (including WebSocket) before falling back (default: 7000ms) */
  startupTimeout?: number; // Renamed from connectionTimeout and potentially adjusted default
  /** Force a specific tab to load (for testing/debugging) */
  forceInitialTab?: string;
  /** Skip fallback system initial check */
  skipFallbackCheck?: boolean;
  /** Whether to log detailed bootstrap process */
  verbose?: boolean;
  /** Skip image caching */
  skipImageCaching?: boolean;
  /** Force TabBar visibility regardless of visible tabs count */
  forceTabBarVisibility?: boolean;
}

/**
 * Result of the bootstrap process
 */
export interface BootstrapResult {
  /** The initial tab to load */
  initialTab: string;
  /** Connection status at bootstrap time, derived from startupSlice/websocketSlice */
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'; // Added 'error' state
  /** Whether fallback mode was activated during bootstrap */
  fallbackActivated: boolean;
  /** Abort controller for the bootstrap process */
  abortController: AbortController;
  /** Time taken for bootstrap in milliseconds */
  bootstrapTime: number;
  /** Whether the TabBar should be shown based on visible tabs count */
  shouldShowTabBar: boolean;
  /** Final startup phase from startupSlice */
  finalStartupPhase: string; 
}

/**
 * Log bootstrap messages with optional verbosity control
 */
const logBootstrap = (message: string, options: BootstrapOptions = {}, isError = false): void => {
  if (options.verbose || isError) {
    if (isError) {
      logger.error(message);
    } else {
      debug(message);
    }
  }
};

/**
 * Determine the initial tab to load based on store state and connection status
 * This is a pure function that doesn't modify any state
 */
const determineInitialTab = (
  connectionSuccess: boolean,
  configFromServer: { tabs: TabsState; starredTab: string; visibility?: TabVisibility }, // New parameter
  options: BootstrapOptions = {}
): string => {
  debug(`determineInitialTab called. connectionSuccess: ${connectionSuccess}, options: ${JSON.stringify(options)}`);
  debug(`determineInitialTab configFromServer.starredTab: '${configFromServer.starredTab}'`);

  // If forcing a specific tab, use it regardless of other conditions
  if (options.forceInitialTab) {
    logBootstrap(`Using forced initial tab: ${options.forceInitialTab}`, options);
    if (options.verbose) verbose(`determineInitialTab returning forced tab: '${options.forceInitialTab}'`);
    return options.forceInitialTab;
  }

  const { tabs: serverTabs, starredTab: serverStarredTabFromConfig } = configFromServer;

  // If connection failed, always use fallback
  if (!connectionSuccess) {
    logBootstrap('Connection failed, using fallback tab', options);
    if (options.verbose) verbose('determineInitialTab returning fallback due to connection failure');
    return 'fallback';
  }

  // If starred tab exists, is not fallback, and is visible & enabled in server config, use it
  if (serverStarredTabFromConfig && serverStarredTabFromConfig !== 'fallback') {
    const normalizedStarred = serverStarredTabFromConfig.startsWith('@') ? serverStarredTabFromConfig.substring(1) : serverStarredTabFromConfig;
    const tabData = serverTabs[normalizedStarred] as TabData | undefined; // Assert type
    
    // Check visibility and enabled status directly from the serverTabs data
    const isVisibleInServerConfig = tabData?.visibility?.tab ?? false;
    const isEnabledInServerConfig = tabData?.config?.isEnabled !== false; // isEnabled defaults to true if undefined
    if (options.verbose) verbose(`determineInitialTab checking server starred tab: '${normalizedStarred}'. isVisibleInServerConfig: ${isVisibleInServerConfig}, isEnabledInServerConfig: ${isEnabledInServerConfig}`);

    if (isVisibleInServerConfig && isEnabledInServerConfig) {
      logBootstrap(`Using starred tab from server config: ${normalizedStarred}`, options);
      if (options.verbose) verbose(`determineInitialTab returning server starred tab: '${normalizedStarred}'`);
      return normalizedStarred;
    }
    logBootstrap(`Starred tab ${normalizedStarred} from server config is not visible or enabled`, options);
  }

  // Fallback: Use first visible, enabled, non-admin (or admin if in admin mode) tab from serverTabs
  const store = useStore.getState(); // Needed for isAdmin check
  const isAdmin = store.isAdmin; // This still reads from the store, assuming isAdmin is stable by this point
  if (options.verbose) verbose(`determineInitialTab: server starred tab not used or not suitable. Checking other visible tabs. isAdmin: ${isAdmin}`);
  const visibleTabsFromConfig = Object.entries(serverTabs)
    .filter(([id, tabEntry]) => {
        const tabData = tabEntry as TabData; // Assert type
        if (id === 'fallback') return false;
        const isVisible = tabData.visibility?.tab ?? false;
        const isEnabled = tabData.config?.isEnabled !== false;
        const isAdminOnly = tabData.config?.adminOnly ?? false;
        return isVisible && isEnabled && (!isAdminOnly || isAdmin);
    })
    .sort(([, aEntry], [, bEntry]) => {
        const a = aEntry as TabData; // Assert type
        const b = bEntry as TabData; // Assert type
        return (a.config?.order ?? 999) - (b.config?.order ?? 999);
    })
    .map(([id]) => id);
  
  if (visibleTabsFromConfig.length > 0) {
    logBootstrap(`Using first visible tab from server config: ${visibleTabsFromConfig[0]}`, options);
    if (options.verbose) verbose(`determineInitialTab returning first visible from config: '${visibleTabsFromConfig[0]}'. All visible from config: ${JSON.stringify(visibleTabsFromConfig)}`);
    return visibleTabsFromConfig[0];
  }

  // If no visible tabs, fallback is the only option
  logBootstrap('No visible tabs available from server config, using fallback', options);
  if (options.verbose) verbose('determineInitialTab returning fallback as no other suitable tab found');
  return 'fallback';
};

/**
 * Determine if the TabBar should be shown based on visible tabs count
 * This is a pure function that doesn't modify any state
 */
const shouldShowTabBar = (options: BootstrapOptions = {}): boolean => {
  // If forcing TabBar visibility, use it
  if (options.forceTabBarVisibility !== undefined) {
    return options.forceTabBarVisibility;
  }

  // Get current store state
  const store = useStore.getState();
  const { getVisibleTabs, isAdmin } = store;
  
  // In admin mode, always show TabBar
  if (isAdmin) {
    return true;
  }
  
  // Get visible tabs count
  const visibleTabs = getVisibleTabs();
  
  // Show TabBar if there are more than 2 visible tabs
  return visibleTabs.length > 2;
};

/**
 * Bootstrap the application by orchestrating the startup sequence via startupSlice.
 */
export const bootstrapApplication = async (options: BootstrapOptions = {}): Promise<BootstrapResult> => {
  const startTime = performance.now();
  const abortController = new AbortController();
  const store = useStore.getState();

  // Declare fetchedConfigData at the function level to ensure it's in scope everywhere in the function
  if (options.verbose) verbose(`bootstrapApplication called with options: ${JSON.stringify(options)}`);
  let fetchedConfigData: { tabs: TabsState; starredTab: string; visibility?: TabVisibility } | null = null; // Changed const to let
  let finalConnectionSuccess = false;

  const timeout = options.startupTimeout || 7000; // Default timeout for the whole startup sequence
  
  const result: BootstrapResult = {
    initialTab: 'fallback',
    connectionStatus: 'disconnected',
    fallbackActivated: false,
    abortController,
    bootstrapTime: 0,
    shouldShowTabBar: false,
    finalStartupPhase: store.currentPhase, // Initial phase
  };

  logBootstrap('Starting application bootstrap via startupSlice', options);
  
  try {
    // Initialize the core WebSocket system components first (listeners, etc.)
    // This prepares the ground before startupSlice attempts to connect.
    if (!isCoreSystemInitialized()) {
        logBootstrap('Initializing Core WebSocket System components (listeners, etc.)', options);
        await initializeCoreWebSocketSystem(); // From core/startup.ts
    } else {
        logBootstrap('Core WebSocket System components already initialized', options);
    }

    logBootstrap(`Attempting startup sequence with ${timeout}ms timeout`, options);
    
    // The main startup sequence is now a promise from startupSlice
    const startupDataPromise = store.startCoreInitialization();

    try {
        // Assign the result of Promise.race to fetchedConfigData
        fetchedConfigData = await Promise.race([
            startupDataPromise,
            new Promise<{ tabs: TabsState; starredTab: string; visibility?: TabVisibility }>((_, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Startup sequence timeout'));
                }, timeout);
                
                abortController.signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Startup sequence aborted'));
                });
            })
        ]);
    } catch (error) {
        // This catch handles errors from Promise.race itself (e.g., timeout, abort)
        // or if startupDataPromise rejects before the race concludes with another outcome.
        logBootstrap(`Error during Promise.race for startup data: ${error instanceof Error ? error.message : String(error)}`, options, true);
        // Set to null so subsequent logic handles it as a failure to get config
        fetchedConfigData = null; 
        debug(`bootstrapApplication: Promise.race for startup data failed or timed out. fetchedConfigData set to null. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // If we get here, the startup sequence (including WS connection via slice) has completed, timed out, or failed.
    if (options.verbose) verbose(`bootstrapApplication: startupDataPromise (Promise.race) finished. fetchedConfigData: ${fetchedConfigData ? `starredTab: '${fetchedConfigData.starredTab}', tab keys: ${Object.keys(fetchedConfigData.tabs).join(', ')}` : 'null'}`);
    const finalStoreState = useStore.getState();
    result.finalStartupPhase = finalStoreState.currentPhase;

    // finalConnectionSuccess is already declared in the outer scope
    if (finalStoreState.currentPhase === 'AppReady') {
      // Check websocketSlice status for direct confirmation
      const wsStatus = finalStoreState.status; // from websocketSlice
      result.connectionStatus = wsStatus === 'connected' ? 'connected' : 'error';
      if (result.connectionStatus === 'connected') {
          finalConnectionSuccess = true;
      }
      logBootstrap(`Startup sequence successful. Final Phase: AppReady, WS Status: ${result.connectionStatus}`, options);
      if (options.verbose) verbose(`bootstrapApplication: Startup sequence successful. Final Phase: AppReady, WS Status: ${result.connectionStatus}, finalConnectionSuccess set to: ${finalConnectionSuccess}`);
    } else {
      // If not AppReady, startup didn't fully complete as expected by this point.
      // This could be due to timeout before AppReady, or internal delays like the refresh block.
      result.connectionStatus = finalStoreState.status || 'disconnected'; // Best guess from websocketSlice status
      logBootstrap(`Startup sequence ended, but final phase is ${result.finalStartupPhase} (expected AppReady). WS Status: ${result.connectionStatus}`, options, true);
      if (options.verbose) verbose(`bootstrapApplication: Startup sequence ended, but final phase is ${result.finalStartupPhase}. WS Status: ${result.connectionStatus}, finalConnectionSuccess: ${finalConnectionSuccess}`);
      // FallbackManager will likely handle activation if necessary based on connection status or earlier timeout.
    }

  } catch (error) {
    const finalStoreState = useStore.getState();
    result.finalStartupPhase = finalStoreState.currentPhase;
    logBootstrap(`Startup sequence failed or timed out: ${error instanceof Error ? error.message : String(error)}. Final Phase: ${result.finalStartupPhase}`, options, true);
    debug(`bootstrapApplication: Main try block caught error: ${error instanceof Error ? error.message : String(error)}. Final Phase: ${result.finalStartupPhase}`);
    
    // Update connection status based on the slices
    result.connectionStatus = finalStoreState.status === 'connected' ? 'connected' : (finalStoreState.status || 'error');
    
    if (!options.skipFallbackCheck && !fallbackManager.isActive()) {
      logBootstrap('Activating fallback due to startup failure', options);
      fallbackManager.activateFallback(error instanceof Error && error.message === 'Startup sequence timeout' ? 'startup_timeout' : 'startup_failure');
      result.fallbackActivated = true;
    }
  }
  
  // Determine initial tab based on the outcome
  // Ensure fetchedConfigData is handled if it's null due to an error in its retrieval race
  if (fetchedConfigData) {
    result.initialTab = determineInitialTab(finalConnectionSuccess, fetchedConfigData, options);
    if (options.verbose) verbose(`bootstrapApplication: determineInitialTab called with finalConnectionSuccess: ${finalConnectionSuccess}, fetchedConfigData (starred: '${fetchedConfigData.starredTab}'). Resulting initialTab: '${result.initialTab}'`);
  } else {
    // If fetchedConfigData is null (e.g., startupDataPromise race failed or it resolved to something unexpected),
    // use a safe default or rely on finalConnectionSuccess to guide to fallback.
    // This is a fallback for determineInitialTab's config parameter.
    logBootstrap('Fetched config data not available for determineInitialTab, relying on connection status for fallback.', options, true);
    result.initialTab = determineInitialTab(finalConnectionSuccess, { tabs: {} as TabsState, starredTab: 'fallback' }, options); // Assert TabsState for empty tabs
    if (options.verbose) verbose(`bootstrapApplication: fetchedConfigData was null. determineInitialTab called with finalConnectionSuccess: ${finalConnectionSuccess}, default config. Resulting initialTab: '${result.initialTab}'`);
  }
  result.shouldShowTabBar = shouldShowTabBar(options);
  logBootstrap(`TabBar visibility determined: ${result.shouldShowTabBar ? 'visible' : 'hidden'}`, options);
  
  result.bootstrapTime = Math.round(performance.now() - startTime);
  logBootstrap(`Bootstrap completed in ${result.bootstrapTime}ms. Initial Tab: ${result.initialTab}, Connection: ${result.connectionStatus}, Final Phase: ${result.finalStartupPhase}`, options);
  if (options.verbose) verbose(`bootstrapApplication returning: ${JSON.stringify(result)}`);
  return result;
  
}

/**
 * Initialize the application tabs based on the bootstrap result
 * This should be called after bootstrapApplication() completes
 * 
 * This function only dispatches an event with the bootstrap result
 * and doesn't directly modify any state or interact with TabManager
 */
export const initializeAppWithBootstrap = (result: BootstrapResult): void => {
  // Only log the result, don't modify state or register tabs
  debug(`Bootstrap completed with initial tab: ${result.initialTab}`);
  
  // Dispatch event for completion notification only
  window.dispatchEvent(new CustomEvent('bootstrap-complete', {
    detail: {
      initialTab: result.initialTab,
      connectionStatus: result.connectionStatus,
      fallbackActivated: result.fallbackActivated,
      bootstrapTime: result.bootstrapTime,
      shouldShowTabBar: result.shouldShowTabBar
    }
  }));
}

/**
 * Complete bootstrap process (combines bootstrapApplication and initializeAppWithBootstrap)
 * This is a convenience function for use in index.tsx or App.tsx
 */
export const performCompleteBootstrap = async (options: BootstrapOptions = {}): Promise<BootstrapResult> => {
  // Check for and clear the refresh flag at the very beginning
  let wasRefresh = false;
  try {
    if (sessionStorage.getItem('isPageRefreshing') === 'true') {
      wasRefresh = true;
      sessionStorage.removeItem('isPageRefreshing');
      logBootstrap('Detected page refresh.', options);
    }
  } catch (e) {
    logBootstrap('Could not access sessionStorage for refresh detection.', options, true);
  }

  // Start image caching as early as possible and don't await it
  if (!options.skipImageCaching) {
    logBootstrap('Starting image caching', options);
    cacheAllImages().catch(err => {
      logBootstrap(`Image caching error: ${err}`, options, true);
    });
  }

  // Check if we're recovering from a previous fallback state
  const wasInFallbackMode = fallbackManager.isActive();
  if (wasInFallbackMode) {
    logBootstrap('Detected recovery from fallback mode, coordinating transition', options);
    // Signal to fallbackManager that we're starting a bootstrap-initiated recovery
    fallbackManager.prepareForBootstrapRecovery?.();
  }

  const result = await bootstrapApplication(options);
  
  initializeAppWithBootstrap(result);

  const store = useStore.getState(); // Get store instance

  // If bootstrap was successful and resulted in AppReady state
  if (result.finalStartupPhase === 'AppReady') {
    // Check if fallback mode is currently active in the store (might have been set during bootstrapApplication)
    // OR if FallbackManager thought it was active at the start of performCompleteBootstrap (wasInFallbackMode)
    // AND the connection is good, meaning we should attempt to leave fallback.
    if ((store.isFallbackActive || wasInFallbackMode) && result.connectionStatus === 'connected') {
      logBootstrap('[Bootstrap] Ensuring fallback mode is deactivated post-bootstrap.', options);
      fallbackManager.deactivateFallback(); 
      // fallbackManager.deactivateFallback() will set:
      // - store.isFallbackActive = false
      // - store.fallbackReason = null
      // - store.activeTab = lastActiveTab (if viable, this is handled internally by FallbackManager)
    }
    
    // Authoritatively set the initial tab determined by bootstrap logic.
    // This ensures it overrides any tab set by localStorage hydration or by fallbackManager.deactivateFallback()
    // if result.initialTab is different from what deactivateFallback() might have set as active.
    logBootstrap(`[Bootstrap] Finalizing active tab in store to: ${result.initialTab}`, options);
    store.setActiveTab(result.initialTab);

  } else { // If bootstrap didn't reach AppReady (e.g. error, timeout)
    // result.initialTab should already be 'fallback' (from determineInitialTab taking connectionSuccess=false).
    // FallbackManager.activateFallback would likely have been called inside bootstrapApplication's catch block.
    // Ensure the store's activeTab reflects this 'fallback' state if it's not already.
    // Check current store's activeTab before forcibly setting it.
    if (store.activeTab !== result.initialTab && result.initialTab === 'fallback') {
        logBootstrap(`[Bootstrap] Startup did not complete as AppReady. Ensuring active tab is fallback: ${result.initialTab}`, options);
        store.setActiveTab(result.initialTab); // Usually 'fallback'
    }
  }

  return result;
}; 