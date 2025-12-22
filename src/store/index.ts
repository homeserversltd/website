import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { createAdminSlice, AdminSlice } from './slices/adminSlice';
import { createThemeSlice, ThemeSlice } from './slices/themeSlice';
import { createVisibilitySlice, VisibilitySlice } from './slices/visibilitySlice';
import { createTabSlice, TabSlice } from './slices/tabSlice';
import { FavoriteSlice, createFavoriteSlice } from './slices/favoriteSlice';
import { createWebSocketSlice, WebSocketSlice } from './slices/websocketSlice';
import { createDirectorySlice, DirectorySlice } from './slices/directorySlice';
import { createSubscriptionSlice, SubscriptionSlice } from './slices/subscriptionSlice';
import { createFallbackSlice, FallbackSlice } from './slices/fallbackSlice';
import { BroadcastDataSlice, createBroadcastDataSlice } from './slices/broadcastDataSlice';
import { CacheSlice, createCacheSlice } from './slices/cacheSlice';
import { SyncSlice, createSyncSlice } from './slices/syncSlice';
import { InactivityTimeoutSlice, createInactivityTimeoutSlice } from './slices/inactivityTimeoutSlice';
import { StartupSlice, createStartupSlice } from './slices/startupSlice';
import { tabManager } from '../utils/tabManager';
import { debug, createComponentLogger } from '../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('Store');

// Debounce function to limit persistence operations
const debounce = <T extends (...args: any[]) => any>(fn: T, ms = 300) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function(this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

// Combine all slice types
export interface StoreState extends AdminSlice, ThemeSlice, VisibilitySlice, TabSlice, FavoriteSlice, WebSocketSlice, DirectorySlice, SubscriptionSlice, FallbackSlice, BroadcastDataSlice, CacheSlice, SyncSlice, InactivityTimeoutSlice, StartupSlice {
  // Additional methods
  setActiveTabForSubscriptions: (tabId: string) => void;
}

// Create debounced localStorage handlers
const pendingWrites = new Map<string, any>();
let lastPersistedState: any = null;

const debouncedSetItem = debounce((name: string, value: any) => {
  const valueStr = JSON.stringify(value);
  
  // Only write if the state has changed
  if (lastPersistedState !== valueStr) {
    localStorage.setItem(name, valueStr);
    lastPersistedState = valueStr;
  }
}, 500);

// Create the store with all slices
export const useStore = create<StoreState>()(
  persist(
    (set, get, api) => ({
      ...createAdminSlice(set, get, api),
      ...createThemeSlice(set, get, api),
      ...createVisibilitySlice(set, get, api),
      ...createTabSlice(set, get, api),
      ...createFavoriteSlice(set, get, api),
      ...createWebSocketSlice(set, get, api),
      ...createDirectorySlice(set, get, api),
      ...createSubscriptionSlice(set, get, api),
      ...createFallbackSlice(set, get, api),
      ...createBroadcastDataSlice(set, get, api),
      ...createCacheSlice(set, get, api),
      ...createSyncSlice(set, get, api),
      ...createInactivityTimeoutSlice(set, get, api),
      ...createStartupSlice(set, get, api),
      
      // Add the setActiveTabForSubscriptions function
      setActiveTabForSubscriptions: (tabId: string) => {
        // Use the centralized tab manager
        tabManager.setActiveTab(tabId, 'api');
      }
    }),
    {
      name: 'homeserver-store',
      partialize: (state: StoreState) => {
        // Type-safe partialize 
        const { 
          theme, 
          visibility, 
          starredTab, 
          isInitialized, 
          tabs, 
          activeTab 
        } = state;
        
        // Log the persisted state for debugging, but less frequently
        if (process.env.NODE_ENV !== 'production') {
          // Only log important state changes to reduce noise
          if (pendingWrites.get('activeTab') !== activeTab || 
              pendingWrites.get('starredTab') !== starredTab) {
            debug('[Store] Persisting state:', { activeTab, starredTab });
            
            // Update pending writes tracking
            pendingWrites.set('activeTab', activeTab);
            pendingWrites.set('starredTab', starredTab);
          }
        }
        
        return { 
          theme, 
          visibility, 
          starredTab, 
          isInitialized, 
          tabs, 
          activeTab
        };
      },
      // Add storage configuration to handle state replacement properly
      storage: {
        getItem: async (name) => {
          const value = localStorage.getItem(name);
          try {
            if (value) {
              lastPersistedState = value;
              return JSON.parse(value);
            }
            return null;
          } catch (e) {
            logger.error(`Error parsing localStorage for ${name}:`, e);
            return null;
          }
        },
        setItem: async (name, value) => {
          // Use debounced version to reduce writes
          debouncedSetItem(name, value);
        },
        removeItem: async (name) => {
          localStorage.removeItem(name);
          lastPersistedState = null;
        }
      }
    }
  )
);

// Export type-safe hooks for each slice
export const useAdmin = () => useStore((state) => ({
  isAdmin: state.isAdmin,
  enterAdminMode: state.enterAdminMode,
  exitAdminMode: state.exitAdminMode,
  updateLastActivity: state.updateLastActivity,
  checkSessionTimeout: state.checkSessionTimeout,
}));

export const useTheme = () => useStore((state) => ({
  theme: state.theme,
  themeData: state.themeData,
  setTheme: state.setTheme,
  toggleTheme: state.toggleTheme,
}));

export const useVisibility = () => useStore((state) => ({
  visibility: state.visibility,
  updateTabVisibility: state.updateTabVisibility,
  updateElementVisibility: state.updateElementVisibility,
  bulkUpdateVisibility: state.bulkUpdateVisibility,
  isElementVisible: state.isElementVisible,
  isTabVisible: state.isTabVisible,
}));

export const useTab = () => useStore((state) => ({
  tabs: state.tabs,
  activeTab: state.activeTab,
  starredTab: state.starredTab,
  setActiveTab: state.setActiveTab,
  setStarredTab: state.setStarredTab,
  updateTabConfig: state.updateTabConfig,
  getVisibleTabs: state.getVisibleTabs,
  getAdminTabs: state.getAdminTabs,
}));

export const useDirectory = () => useStore((state) => ({
  loadDirectory: state.loadDirectory,
  loadDirectoryDeep: state.loadDirectoryDeep,
  loadDirectoryHierarchical: state.loadDirectoryHierarchical,
  expandDirectory: state.expandDirectory,
  toggleDirectoryExpansion: state.toggleDirectoryExpansion,
  setDirectoryExpansion: state.setDirectoryExpansion,
  invalidateCache: state.invalidateCache,
  clearCache: state.clearCache,
  updateDirectory: state.updateDirectory,
  directoryCache: state.directoryCache,
  isLoading: state.isLoading,
  error: state.error,
  updateDirectoryTree: state.updateDirectoryTree,
  getDirectoryTree: state.getDirectoryTree
}));

export const useSubscription = () => useStore((state) => ({
  // Basic subscription methods
  subscribeToEvent: state.subscribeToEvent,
  unsubscribeFromEvent: state.unsubscribeFromEvent,
  
  // Specialized subscription methods
  subscribeToCoreEvent: state.subscribeToCoreEvent,
  subscribeToAdminEvent: state.subscribeToAdminEvent,
  subscribeToTabEvent: state.subscribeToTabEvent,
  
  // Tab management
  clearTabSubscriptions: state.clearTabSubscriptions,
  
  // Subscription information and stats
  getSubscriptionsByTab: state.getSubscriptionsByTab,
  getSubscriptionsByEvent: state.getSubscriptionsByEvent,
  getSubscriptionsStats: state.getSubscriptionsStats,
  
  // State
  subscriptions: state.subscriptions
}));

// Add fallback state hook
export const useFallback = () => useStore((state) => ({
  isFallbackMode: state.isFallbackMode,
  fallbackReason: state.getFallbackReason(),
  activateFallback: state.activateFallback,
  deactivateFallback: state.deactivateFallback,
}));

// Export Broadcast Data slice hooks
export const useBroadcastData = () => useStore((state) => ({
  // State
  broadcastData: state.broadcastData,
  
  // Data access
  getBroadcastData: state.getBroadcastData,
  getLastUpdated: state.getLastUpdated,
  
  // Data management
  updateBroadcastData: state.updateBroadcastData,
  clearBroadcastData: state.clearBroadcastData
}));

// Export API Cache slice hooks
export const useApiCache = () => useStore((state) => ({
  // Cache operations
  setApiCacheEntry: state.setApiCacheEntry,
  getApiCacheEntry: state.getApiCacheEntry,
  isApiCacheValid: state.isApiCacheValid,
  clearApiCache: state.clearApiCache,
  clearAllApiCaches: state.clearAllApiCaches,
  clearAdminApiCaches: state.clearAdminApiCaches,
  getApiCacheLastUpdated: state.getApiCacheLastUpdated,
  
  // In-flight request tracking
  setApiRequestInFlight: state.setApiRequestInFlight,
  isApiRequestInFlight: state.isApiRequestInFlight
}));

// Export Sync slice hook
export const useSync = () => useStore((state) => ({
  syncState: state.syncState,
  registerSyncJob: state.registerSyncJob,
  clearSyncState: state.clearSyncState,
  updateSyncStatus: state.updateSyncStatus,
  incrementKeepaliveCount: state.incrementKeepaliveCount,
  isActiveSyncInProgress: state.isActiveSyncInProgress
}));

// Hook for StartupSlice
export const useStartup = () => useStore((state) => ({
  currentPhase: state.currentPhase,
  startupError: state.startupError,
  isCoreInitialized: state.isCoreInitialized,
  isWebSocketAttempted: state.isWebSocketAttempted,
  isWebSocketConnected: state.isWebSocketConnected,
  startCoreInitialization: state.startCoreInitialization,
  initiateWebSocketConnection: state.initiateWebSocketConnection,
  markAppReady: state.markAppReady,
  resetStartup: state.resetStartup,
}));