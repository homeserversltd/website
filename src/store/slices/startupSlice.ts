import { StateCreator } from 'zustand';
import { WebSocketSlice } from './websocketSlice';
import { TabSlice, FALLBACK_TAB as DEFAULT_FALLBACK_TAB_DATA } from './tabSlice'; // Assuming TabSlice exports its type and FALLBACK_TAB_DATA
import { VisibilitySlice } from './visibilitySlice'; // INTENTIONALLY REMOVED TabVisibility from here
import { TabsState, TabData, TabVisibility } from '../../types/global'; // TabVisibility is imported here
import { getRetryDelay } from '../../utils/refreshUtils'; // For retry logic
import { BENCHMARKER } from '../../index'; // Import BENCHMARKER
import { debug, createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('StartupSlice');

// --- BENCHMARKER FLAG ---
// export const BENCHMARKER = true; // Set to false to disable benchmarking logic --> Moved to index.tsx
// ------------------------

// Define the possible phases of the application startup
export type StartupPhase =
  | 'Idle'
  | 'CoreInitializing'      // Generic core services, fetching tab config
  | 'CoreInitialized'       // Tab config loaded, core services ready
  | 'WebSocketConnecting'
  | 'WebSocketConnected'
  | 'AppReady'              // All critical steps done
  | 'Error';

// Define a default state for tabs if API fails, similar to App.tsx
const DEFAULT_TAB_CONFIG_STATE: { tabs: TabsState; starredTab: string; visibility: TabVisibility } = {
  tabs: {
    'fallback': DEFAULT_FALLBACK_TAB_DATA
  },
  starredTab: 'fallback',
  visibility: {
    'fallback': { tab: true, elements: {} }
  }
};

export interface StartupSlice {
  // STATE
  currentPhase: StartupPhase;
  startupError: string | null;
  isCoreInitialized: boolean; 
  isWebSocketAttempted: boolean;
  isWebSocketConnected: boolean;
  // No longer need isTabConfigLoaded here, as it's part of CoreInitialized phase
  startupStartTime: number | null; // Added for benchmarking
  startupDurationMs: number | null; // Added for benchmarking

  // ACTIONS
  startCoreInitialization: () => Promise<{ tabs: TabsState; starredTab: string; visibility?: TabVisibility }>; // Will now include fetching tab config
  // coreInitializationSuccess/Failure are internal to the promise chain of startCoreInitialization
  // initiateWebSocketConnection is also internal
  // webSocketConnectionSuccess/Failure are also internal
  markAppReady: () => void;
  resetStartup: () => void;
  initiateWebSocketConnection: () => Promise<void>; // Added to interface
}

const INITIAL_STARTUP_STATE = {
  currentPhase: 'Idle' as StartupPhase,
  startupError: null,
  isCoreInitialized: false,
  isWebSocketAttempted: false,
  isWebSocketConnected: false,
  startupStartTime: null, // Added for benchmarking
  startupDurationMs: null, // Added for benchmarking
};

// CombinedState needs to include parts of TabSlice and VisibilitySlice to set their state
type CombinedStoreState = StartupSlice & WebSocketSlice & TabSlice & VisibilitySlice;

export const createStartupSlice: StateCreator<
  CombinedStoreState,
  [],
  [],
  StartupSlice
> = (set, get) => ({
  ...INITIAL_STARTUP_STATE,

  startCoreInitialization: () => {
    return new Promise((resolve, reject) => {
      const performInitialization = async () => {
        if (BENCHMARKER) {
          set({ startupStartTime: performance.now(), startupDurationMs: null }); // Record start time
        }

        if (get().currentPhase !== 'Idle' && get().currentPhase !== 'Error' && get().currentPhase !== 'CoreInitializing') { // Allow re-init from Error or during CoreInitializing for retries
          logger.warn('Core initialization attempted when not in Idle, Error, or CoreInitializing phase. Current phase:', get().currentPhase);
          // If already initialized and successful, resolve with current config.
          // This part needs careful consideration: if core is initialized, what should we return?
          // For now, let's assume it means re-running. If it should return existing, logic needs to change.
        }
        set({ currentPhase: 'CoreInitializing', startupError: null, isCoreInitialized: false, isWebSocketAttempted: false, isWebSocketConnected: false });
        debug('Core initialization started (including tab config fetch).');
        
        let tabConfigLoadedSuccessfully = false;
        let retryCount = 0;
        const maxRetries = 3;
        let loadedConfigData: { tabs: TabsState; starredTab: string; visibility?: TabVisibility } | null = null;

        const loadTabConfigAndInitialize = async () => {
          try {
            debug(`Fetching tab configuration (attempt ${retryCount + 1})...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);

            const response = await fetch('/api/tabs', {
              signal: controller.signal,
              headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status} for /api/tabs`);
            }
            
            const data = await response.json() as { tabs: TabsState; starredTab: string; visibility?: TabVisibility };
            
            // Call initializeVisibilityState FIRST to ensure visibility is current
            if (data.tabs) {
              get().initializeVisibilityState(data.tabs);
            } else {
              logger.error('data.tabs is missing from API response. VisibilitySlice will use its own minimal default.');
              get().initializeVisibilityState({ 'fallback': DEFAULT_FALLBACK_TAB_DATA }); 
            }

            // Then initializeTabs, which might call getVisibleTabs internally
            get().initializeTabs({ tabs: data.tabs || DEFAULT_TAB_CONFIG_STATE.tabs, starredTab: data.starredTab || DEFAULT_TAB_CONFIG_STATE.starredTab });
            
            loadedConfigData = data; // Store the successfully loaded data
            tabConfigLoadedSuccessfully = true;

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to load tab configuration:', errorMsg);
            retryCount++;
            if (retryCount >= maxRetries) {
              logger.error('Max retries reached for tab configuration. Using default state.');
              get().initializeTabs({ tabs: DEFAULT_TAB_CONFIG_STATE.tabs, starredTab: DEFAULT_TAB_CONFIG_STATE.starredTab });
              get().initializeVisibilityState(DEFAULT_TAB_CONFIG_STATE.tabs);
              loadedConfigData = DEFAULT_TAB_CONFIG_STATE; // Use default config as loaded data
              tabConfigLoadedSuccessfully = true; 
              // Still throw error to signal that actual fetching failed, but resolve outer promise with default data.
              // The design here is tricky: should it reject the outer promise or resolve with defaults?
              // For bootstrap, resolving with defaults allows the app to start.
              // Let's assume the outer promise will still resolve with this default data.
            }
            const delay = getRetryDelay(retryCount -1);
            debug(`Retrying tab configuration load in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            await loadTabConfigAndInitialize(); 
          }
        };

        try {
          await loadTabConfigAndInitialize();
          set({ currentPhase: 'CoreInitialized', isCoreInitialized: true });
          debug('Core initialization successful (tab config loaded), proceeding to WebSocket connection.');
          await get().initiateWebSocketConnection();
          resolve(loadedConfigData || DEFAULT_TAB_CONFIG_STATE); // Resolve with loaded or default data
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Overall Core Initialization or subsequent WebSocket failed:', errorMessage);
          set({ currentPhase: 'Error', startupError: errorMessage, isCoreInitialized: tabConfigLoadedSuccessfully, isWebSocketAttempted: get().isWebSocketAttempted, isWebSocketConnected: false });
          reject(new Error(errorMessage)); // Reject if the overall process fails critically
        }
      };
      performInitialization();
    });
  },

  // initiateWebSocketConnection, webSocketConnectionSuccess, webSocketConnectionFailure remain largely the same
  // but ensure they are called correctly within the new startCoreInitialization promise chain.
  initiateWebSocketConnection: async () => {
    if (get().currentPhase === 'Error') {
      debug('WebSocket connection skipped (startup in error state).');
      throw new Error(get().startupError || 'Startup in error state before WebSocket attempt'); 
    }
    // No need to check isCoreInitialized here anymore as this is sequenced after core init success.
    if (get().isWebSocketAttempted) {
      debug('WebSocket connection skipped (already attempted).');
      if(get().isWebSocketConnected) return Promise.resolve();
      // If already attempted and not connected, it should throw to propagate the previous failure reason or a new one.
      throw new Error(get().startupError || 'WebSocket connection already attempted and failed or is in progress.');
    }

    set({ currentPhase: 'WebSocketConnecting', isWebSocketAttempted: true, startupError: null });
    debug('Initiating WebSocket connection...');
    try {
      await get().connect(); // This is the connect from WebSocketSlice
      // get().webSocketConnectionSuccess(); // webSocketConnectionSuccess will be called by connect's resolution path in this slice.
      // Instead, connect() success path should lead to webSocketConnectionSuccess() directly or indirectly.
      // For now, let's assume `get().connect()` success implies we can call our internal success handler.
      set({ currentPhase: 'WebSocketConnected', isWebSocketConnected: true });
      debug('WebSocket connection successful (called from initiateWebSocketConnection).');
      get().markAppReady(); 
      // return Promise.resolve(); // Not needed, void is fine
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('WebSocket connection failed during initiation (called from initiateWebSocketConnection):', errorMessage);
      // Set state to Error directly here as this is the failing point for this action.
      set({ currentPhase: 'Error', startupError: errorMessage, isWebSocketConnected: false });
      throw error; // Re-throw to allow Promise.race in bootstrap / main init promise to catch it
    }
  },

  // webSocketConnectionSuccess is now effectively part of initiateWebSocketConnection's success path
  // So, we might not need it as a separate callable action if initiateWebSocketConnection handles the full sequence.
  // For simplicity, let's keep it as a conceptual step that markAppReady follows.

  // webSocketConnectionFailure is also handled within initiateWebSocketConnection's catch block.

  markAppReady: () => {
    if (get().currentPhase === 'Error') {
        logger.warn('Attempted to mark app as ready, but startup is in an error state.');
        return;
    }
    if (!get().isCoreInitialized || !get().isWebSocketConnected) {
        const coreReady = get().isCoreInitialized;
        const wsReady = get().isWebSocketConnected;
        const errMsg = `App not marked ready. Core Initialized: ${coreReady}, WebSocket Connected: ${wsReady}`;
        logger.warn(errMsg);
        set({currentPhase: 'Error', startupError: errMsg}); // Force error state if critical things not ready
        return;
    }
    const startTime = get().startupStartTime;
    let durationMs = null;
    if (BENCHMARKER && startTime) {
      durationMs = performance.now() - startTime;
      debug(`Application ready. Startup (from core init to app ready) took: ${durationMs.toFixed(2)} ms`);
    }
    set({ currentPhase: 'AppReady', startupDurationMs: BENCHMARKER ? durationMs : null });
    debug('Application is ready!');
  },

  resetStartup: () => {
    debug('Resetting startup process.');
    // Also reset relevant parts of other slices that were touched by startup
    get().initializeTabs({ tabs: DEFAULT_TAB_CONFIG_STATE.tabs, starredTab: DEFAULT_TAB_CONFIG_STATE.starredTab }); // Reset tabs
    get().initializeVisibilityState(DEFAULT_TAB_CONFIG_STATE.tabs);
    set(INITIAL_STARTUP_STATE); // Reset startup slice state
    // Consider if websocketSlice needs a specific reset action here too, e.g. get().disconnectAndResetWs();
  },
}); 