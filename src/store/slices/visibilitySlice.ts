import { StateCreator } from 'zustand';
import { StoreState } from '..';
import { TabVisibility, ElementVisibility, TabData, TabsState } from '../../types/global';
import { api } from '../../api/client';
import { API_ENDPOINTS } from '../../api/endpoints';
import { fallbackManager } from '../../utils/fallbackManager';
import { tabManager } from '../../utils/tabManager';
import { createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('VisibilitySlice');

// Store debounce timeouts outside component state
const visibilityTimeouts = new Map<string, NodeJS.Timeout>();
const starringQueue = new Map<string, {
  resolve: () => void;
  reject: (error: Error) => void;
  promise: Promise<void>;
}>();

// Helper to ensure only one starring operation is in progress at a time
const queueStarringOperation = async (tabId: string, operation: () => Promise<void>) => {
  const existing = starringQueue.get(tabId);
  if (existing) {
    return existing.promise;
  }

  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  starringQueue.set(tabId, { resolve, reject, promise });

  try {
    await operation();
    resolve();
  } catch (error) {
    reject(error as Error);
  } finally {
    starringQueue.delete(tabId);
  }

  return promise;
};

// Add memoization for visibility calculations
export const visibilityCache = {
  key: '',
  result: {} as TabVisibility,
  update(newKey: string, newResult: TabVisibility) {
    this.key = newKey;
    this.result = newResult;
  },
  clear() {
    this.key = '';
    this.result = {};
  }
};

export interface VisibilitySlice {
  visibility: TabVisibility;
  initializeVisibilityState: (tabsData: TabsState) => void;
  updateTabVisibility: (tabId: string, visible: boolean) => Promise<void>;
  updateElementVisibility: (tabId: string, elementId: string, visible: boolean) => void;
  bulkUpdateVisibility: (updates: TabVisibility) => Promise<void>;
  isElementVisible: (tabId: string, elementId: string) => boolean;
  isTabVisible: (tabId: string) => boolean;
}

export const createVisibilitySlice: StateCreator<StoreState, [], [], VisibilitySlice> = (set, get) => ({
  visibility: {},  // Initial state will be populated by initializeVisibilityState
  
  initializeVisibilityState: (tabsData: TabsState) => {
    const newVisibility: TabVisibility = {};
    if (tabsData) {
      for (const tabId in tabsData) {
        if (Object.prototype.hasOwnProperty.call(tabsData, tabId)) {
          const tab = tabsData[tabId];
          if (tab && tab.visibility && typeof tab.visibility.tab === 'boolean') {
            newVisibility[tabId] = {
              tab: tab.visibility.tab,
              elements: tab.visibility.elements || {},
            };
          } else {
            // Log a warning and default to not visible if visibility data is missing or malformed for a tab
            logger.warn(`Tab '${tabId}' is missing visibility data or it is malformed in the API response. Defaulting to hidden.`);
            newVisibility[tabId] = { tab: false, elements: {} };
          }
        }
      }
    } else {
      // This case should ideally not happen if API always returns a tabs object.
      // If tabsData itself is null/undefined, use the default from startupSlice's DEFAULT_CONFIG as a last resort, or a minimal default here.
      logger.error('initializeVisibilityState called with no tabsData. Falling back to minimal default (only fallback visible).');
      newVisibility['fallback'] = { tab: true, elements: {} }; 
    }

    // Ensure fallback tab always has a visibility entry, defaulting to true if not present
    if (!newVisibility['fallback']) {
        logger.warn("Fallback tab visibility not found after processing tabsData, ensuring it's present and visible.");
        newVisibility['fallback'] = { tab: true, elements: {} };
    }

    // Safety check: if fallback is hidden but no other tabs are visible, force fallback to be visible
    const visibleTabs = Object.entries(newVisibility).filter(([_, visData]) => visData.tab === true);
    if (visibleTabs.length === 0) {
        logger.warn("Fallback tab was marked as hidden, but no other tabs are visible. Forcing fallback to be visible.");
        newVisibility['fallback'] = { tab: true, elements: {} };
    }

    set({ visibility: newVisibility });
    visibilityCache.clear(); // Clear cache after visibility is set
  },

  updateTabVisibility: async (tabId: string, visible: boolean) => {
    const state = get();
    const prevVisibility = state.visibility[tabId]?.tab;
    
    // Skip update if visibility hasn't changed
    if (prevVisibility === visible) {
      return;
    }

    // Use a debounced update to prevent rapid-fire changes
    const debouncedUpdate = async () => {
      try {
        // Update local state first for immediate feedback
        set((state) => ({
          visibility: {
            ...state.visibility,
            [tabId]: {
              ...state.visibility[tabId],
              tab: visible,
            },
          },
        }));

        // Dispatch a visibility change event that our event-driven fallback system can listen for
        window.dispatchEvent(new CustomEvent('visibility-changed', {
          detail: { tabId, visible }
        }));
        
        // Let the fallback manager know directly as well for backward compatibility
        fallbackManager.handleTabVisibilityChangeNoRecovery(tabId, visible);
        
        // Also notify the tab manager for broader system awareness
        tabManager.notifyVisibilityChange(tabId, visible);

        // Persist to backend
        await api.post(API_ENDPOINTS.tabs.updateVisibility, {
          tabId,
          visibility: visible
        });

        // Queue starring update to prevent race conditions
        await queueStarringOperation(tabId, async () => {
          // Wait for visibility state to settle
          await new Promise(resolve => setTimeout(resolve, 100));
          // Handle starring logic through favoriteSlice
          await state.handleVisibilityChange(tabId, visible);
        });

      } catch (error) {
        logger.error('Error updating tab visibility:', error);
        
        // Revert local state on error
        set((state) => ({
          visibility: {
            ...state.visibility,
            [tabId]: {
              ...state.visibility[tabId],
              tab: prevVisibility,
            },
          },
        }));
        
        // If this was the starred tab being hidden, we need to handle that
        if (!visible && tabId === state.starredTab) {
          try {
            const visibleTabs = state.getVisibleTabs();
            const newStarredTab = visibleTabs[0] || 'fallback';
            await state.setStarredTab(newStarredTab);
          } catch (starError) {
            logger.error('Failed to update starred tab after visibility revert:', starError);
            // Set to fallback as last resort
            set({ starredTab: 'fallback' });
          }
        }
        
        // Notify about the rollback - this will trigger our event listeners
        window.dispatchEvent(new CustomEvent('visibility-changed', {
          detail: { 
            tabId, 
            visible: prevVisibility,
            error: true 
          }
        }));
        
        // Rollback the fallback system state too
        if (prevVisibility !== undefined) {
          fallbackManager.handleTabVisibilityChangeNoRecovery(tabId, prevVisibility);
        }
        
        throw error;
      }
    };

    // Create a debounce key for this specific tab
    const debounceKey = `visibility-${tabId}`;
    
    // Clear any pending updates for this tab
    const existingTimeout = visibilityTimeouts.get(debounceKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Schedule the update with a small delay
    const timeoutId = setTimeout(() => {
      debouncedUpdate();
      visibilityTimeouts.delete(debounceKey);
    }, 100); // Increased debounce time for better stability
    
    visibilityTimeouts.set(debounceKey, timeoutId);
  },
  
  updateElementVisibility: (tabId: string, elementId: string, visible: boolean) => {
    const state = get();
    const prevVisibility = state.visibility[tabId]?.elements?.[elementId];
    
    // Skip update if visibility hasn't changed
    if (prevVisibility === visible) return;
    
    set((state) => ({
      visibility: {
        ...state.visibility,
        [tabId]: {
          ...state.visibility[tabId],
          elements: {
            ...state.visibility[tabId]?.elements,
            [elementId]: visible,
          },
        },
      },
    }));
  },
  
  bulkUpdateVisibility: async (updates: TabVisibility) => {
    const state = get();
    const prevVisibility = state.visibility;
    
    // Skip update if nothing has changed
    if (JSON.stringify(prevVisibility) === JSON.stringify(updates)) return;
    
    try {
      // Update local state
      set({ visibility: updates });

      // Check for tab visibility changes that need to be handled by the fallback system
      for (const [tabId, tabVisibility] of Object.entries(updates)) {
        const prevTabVisibility = prevVisibility[tabId]?.tab;
        if (prevTabVisibility !== tabVisibility.tab) {
          // Notify fallback manager about each tab visibility change
          fallbackManager.handleTabVisibilityChangeNoRecovery(tabId, tabVisibility.tab);
          
          // Also notify the tab manager
          tabManager.notifyVisibilityChange(tabId, tabVisibility.tab);
          
          // Also handle starring changes
          await state.handleVisibilityChange(tabId, tabVisibility.tab);
        }
      }
      
      // The fallback system is now event-driven and will react to state changes automatically
    } catch (error) {
      logger.error('Error updating visibility:', error);
      
      // Revert on error
      set({ visibility: prevVisibility });
      
      // The fallback system is now event-driven and will react to state changes automatically
      
      throw error;
    }
  },
  
  isElementVisible: (tabId: string, elementId: string) => {
    const state = get();
    const tabVisibility = state.visibility[tabId];
    if (!tabVisibility?.tab) return false;
    return tabVisibility.elements?.[elementId] ?? true;
  },
  
  isTabVisible: (tabId: string) => {
    const state = get();
    const tab = state.tabs[tabId];
    if (!tab) return false;

    const cacheKey = `${tabId}-${state.visibility[tabId]?.tab}-${tab.config?.isEnabled}-${state.isAdmin}`;
    if (visibilityCache.key === cacheKey) {
      return visibilityCache.result[tabId]?.tab ?? false;
    }

    const isVisible = state.visibility[tabId]?.tab ?? false;
    const isEnabled = tab.config?.isEnabled ?? true;
    const result = isVisible && isEnabled;

    visibilityCache.update(cacheKey, {
      [tabId]: { tab: result, elements: state.visibility[tabId]?.elements ?? {} }
    });

    return result;
  },
});