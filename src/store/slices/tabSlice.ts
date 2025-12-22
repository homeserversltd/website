import { StateCreator } from 'zustand';
import { TabsState, TabData } from '../../types/global';
import { StoreState } from '..';
import { tabManager } from '../../utils/tabManager';
import { fallbackManager } from '../../utils/fallbackManager';

// Declare global type for _homeServerState
declare global {
  interface Window {
    _homeServerState: {
      activeTab?: string;
      [key: string]: any;
    };
  }
}

// Cache key interface for memoization
interface VisibleTabsCacheKey {
  isAdmin: boolean;
  visibilitySignature: string;
  tabsVersion: number;
}

// Memoization cache
let lastVisibleTabsKey: VisibleTabsCacheKey | null = null;
let lastVisibleTabsResult: string[] | null = null;

// Track if the event listeners are initialized
let fallbackEventsInitialized = false;

export interface TabSlice {
  tabs: TabsState;
  activeTab: string | null;
  isInitialized: boolean;
  setActiveTab: (tabId: string) => void;
  updateTabConfig: (tabId: string, config: Partial<TabData>) => void;
  getVisibleTabs: () => string[];
  getAdminTabs: () => string[];
  initializeTabs: (config: { tabs: TabsState; starredTab: string }) => void;
  hasTabAccess: (tabId: string) => boolean;
}

export const FALLBACK_TAB: TabData = {
  config: {
    id: 'fallback',
    displayName: 'produced by HOMESERVER LLC',
    adminOnly: false,
    order: 999,
    isEnabled: true
  },
  visibility: { tab: true, elements: {} },
  data: {}
};

// Initialize fallback event listeners
const setupFallbackEventListeners = (get: () => StoreState, set: any) => {
  if (fallbackEventsInitialized) {
    return;
  }

  // Listen for recovery attempt events
  window.addEventListener('fallback-recovery_attempt', () => {
    // We can add additional handling here if needed
  });

  fallbackEventsInitialized = true;
};

export const createTabSlice: StateCreator<StoreState, [], [], TabSlice> = (set, get) => {
  // Initialize fallback event listeners - but only once
  if (!fallbackEventsInitialized) {
    setupFallbackEventListeners(get, set);
  }
  
  return {
    tabs: { 'fallback': FALLBACK_TAB },
    activeTab: 'fallback',
    isInitialized: false,

    setActiveTab: (tabId: string) => {
      const previousTab = get().activeTab;

      set(state => {
        if (state.activeTab === tabId) {
          return {}; // No change
        }
        if (state.isFallbackActive && tabId !== 'fallback') {
          return {}; // No change
        }
        
        return { activeTab: tabId };
      });
    },

    updateTabConfig: (tabId: string, config: Partial<TabData>) => {
      set(state => ({
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...state.tabs[tabId],
            ...config,
          },
        },
      }));
      
      // The fallback system is now event-driven and will react to state changes automatically
    },

    getVisibleTabs: () => {
      const state = get();
      
      // Create cache key from relevant state
      const cacheKey: VisibleTabsCacheKey = {
        isAdmin: state.isAdmin,
        // Create a signature of visible tab IDs and their visibility state
        // This is more sensitive to actual changes than just Object.keys().length
        visibilitySignature: JSON.stringify(
          Object.entries(state.visibility)
            .map(([tabId, visData]) => `${tabId}:${visData?.tab}`)
            .sort()
            .join(',')
        ),
        tabsVersion: Object.keys(state.tabs).length
      };
      
      // Use cached result if available
      if (
        lastVisibleTabsKey &&
        lastVisibleTabsKey.isAdmin === cacheKey.isAdmin &&
        lastVisibleTabsKey.visibilitySignature === cacheKey.visibilitySignature && // Compare new signature
        lastVisibleTabsKey.tabsVersion === cacheKey.tabsVersion &&
        lastVisibleTabsResult
      ) {
        // Defensive: sort the cached result before returning
        const sortedCached = [...lastVisibleTabsResult].sort((a, b) => {
          const orderA = state.tabs[a]?.config?.order ?? 999;
          const orderB = state.tabs[b]?.config?.order ?? 999;
          return orderA - orderB;
        });
        return sortedCached;
      }
      
      let visibleTabs: string[];
      if (state.isAdmin) {
        // In admin mode, show all tabs except fallback, sorted by order
        visibleTabs = Object.keys(state.tabs)
          .filter(tabId => tabId !== 'fallback')
          .sort((a, b) => {
            const orderA = state.tabs[a]?.config?.order ?? 999;
            const orderB = state.tabs[b]?.config?.order ?? 999;
            return orderA - orderB;
          });
      } else {
        // In regular mode, filter by hasTabAccess
        const filteredTabs = Object.keys(state.tabs)
          .filter(tabId => state.hasTabAccess(tabId));
        visibleTabs = filteredTabs
          .sort((a, b) => {
            const orderA = state.tabs[a]?.config?.order ?? 999;
            const orderB = state.tabs[b]?.config?.order ?? 999;
            return orderA - orderB;
          });
      }
      
      // Update cache
      lastVisibleTabsKey = cacheKey;
      lastVisibleTabsResult = visibleTabs;
      
      // Dispatch event with the visible tabs state
      window.dispatchEvent(new CustomEvent('visibility-state-changed', {
        detail: { 
          visibleTabs,
          reason: 'get_visible_tabs',
          isAdmin: state.isAdmin
        }
      }));
      
      return visibleTabs;
    },

    getAdminTabs: () => {
      const state = get();
      
      const adminTabsResult = Object.entries(state.tabs)
        .filter(([_, tabData]) => tabData.config.adminOnly === true)
        .map(([id]) => id);
      return adminTabsResult;
    },

    initializeTabs: (config: { tabs: TabsState; starredTab: string }) => {
      const { tabs, starredTab } = config;
      
      // Always include the fallback tablet
      const mergedTabs = {
        ...tabs,
        fallback: FALLBACK_TAB
      };
      
      set({
        tabs: mergedTabs,
        isInitialized: true,
        starredTab: starredTab // Ensure the global starredTab state is updated with the value from API
      });
      
      // Check if we need to activate fallback mode
      const visibleTabs = get().getVisibleTabs();
      
      if (visibleTabs.length === 0) {
        // If no visible tabs, ensure fallback is activated
        fallbackManager.activateFallback('no_visible_tabs_at_init');
      }
    },

    hasTabAccess: (tabId: string) => {
      const state = get();
      const tabData = state.tabs[tabId];
      
      if (!tabData) {
        return false;
      }
      
      // Basic visibility check
      const isVisible = state.visibility[tabId]?.tab === true;
      
      // Admin check
      const isAdminTab = tabData.config.adminOnly === true;
      const hasAccess = !isAdminTab || (isAdminTab && state.isAdmin);
      
      // Enabled check
      const isEnabled = tabData.config.isEnabled !== false;
      
      const result = isVisible && hasAccess && isEnabled;
      return result;
    }
  };
};