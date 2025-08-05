import { StateCreator } from 'zustand';
import { StoreState } from '..';
import { api, API_ENDPOINTS } from '../../api';
import { createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('FavoriteSlice');

export interface FavoriteSlice {
  starredTab: string;
  setStarredTab: (tabId: string) => Promise<void>;
  getEligibleStarredTab: (visibleTabs: string[]) => string;
  handleVisibilityChange: (tabId: string, visible: boolean) => Promise<void>;
}

export const createFavoriteSlice: StateCreator<StoreState, [], [], FavoriteSlice> = (set, get) => ({
  starredTab: 'fallback',

  getEligibleStarredTab: (visibleTabs: string[]) => {
    const state = get();
    
    // Case 1: No visible tabs - must use fallback
    if (visibleTabs.length === 0) {
      return 'fallback';
    }

    // Case 2: Current starred tab is visible and valid - keep it
    if (state.starredTab !== 'fallback' && 
        visibleTabs.includes(state.starredTab) && 
        state.tabs[state.starredTab]?.config?.isEnabled) {
      return state.starredTab;
    }

    // Case 3: Use first visible tab
    return visibleTabs[0];
  },

  handleVisibilityChange: async (tabId: string, visible: boolean) => {
    const state = get();
    
    try {
      // Calculate visible tabs AFTER this change, excluding admin-only tabs
      const visibleTabs = Object.entries(state.tabs)
        .filter(([id, tab]) => {
          if (id === 'fallback') return false;
          if (id === tabId) return visible; // Use new visibility state for changed tab
          return state.visibility[id]?.tab ?? false; // Use current visibility for others
        })
        .filter(([id, tab]) => {
          const isEnabled = tab.config?.isEnabled ?? false;
          const isAdminOnly = tab.config?.adminOnly ?? false;
          // Never include admin-only tabs in starring system
          return isEnabled && !isAdminOnly;
        })
        .map(([id]) => id);

      // If we have no visible regular tabs, use fallback
      if (visibleTabs.length === 0) {
        if (state.starredTab !== 'fallback') {
          // Update local state first
          set({ starredTab: 'fallback' });
          try {
            await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: 'fallback' });
          } catch (error) {
            logger.error('Failed to set fallback tab:', error);
            // Keep fallback state even if API fails
          }
        }
        return;
      }

      // If we're hiding the currently starred tab
      if (!visible && tabId === state.starredTab) {
        // Find first visible regular tab
        const newStarredTab = visibleTabs.find(id => id !== tabId);
        
        try {
          if (newStarredTab) {
            // Double check visibility before starring
            const isStillVisible = state.visibility[newStarredTab]?.tab ?? false;
            if (isStillVisible) {
              // Update local state first
              set({ starredTab: newStarredTab });
              await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: newStarredTab });
            } else {
              // Update local state first
              set({ starredTab: 'fallback' });
              await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: 'fallback' });
            }
          } else {
            // Update local state first
            set({ starredTab: 'fallback' });
            await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: 'fallback' });
          }
        } catch (error) {
          logger.error('Failed to update starred tab after hiding:', error);
          // Keep the local state change even if API fails
        }
        
        return;
      }
          
      // If current starred tab is not visible (and not fallback)
      if (state.starredTab !== 'fallback' && !visibleTabs.includes(state.starredTab)) {
        // Find first visible regular tab
        const newStarredTab = visibleTabs[0];
            
        try {
          if (newStarredTab) {
            // Double check visibility before starring
            const isStillVisible = state.visibility[newStarredTab]?.tab ?? false;
            if (isStillVisible) {
              // Update local state first
              set({ starredTab: newStarredTab });
              await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: newStarredTab });
            } else {
              // Update local state first
              set({ starredTab: 'fallback' });
              await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: 'fallback' });
            }
          } else {
            // Update local state first
            set({ starredTab: 'fallback' });
            await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: 'fallback' });
          }
        } catch (error) {
          logger.error('Failed to update starred tab after visibility check:', error);
          // Keep the local state change even if API fails
        }
        
        return;
      }

      // If we're showing a tab and currently on fallback
      if (visible && state.starredTab === 'fallback') {
        // Only star if it's not an admin-only tab
        const tab = state.tabs[tabId];
        const isAdminOnly = tab?.config?.adminOnly ?? false;
            
        if (!isAdminOnly) {
          try {
            // Double check visibility before starring
            const isStillVisible = state.visibility[tabId]?.tab ?? false;
            if (isStillVisible) {
              // Update local state first
              set({ starredTab: tabId });
              await api.post(API_ENDPOINTS.tabs.setStarred, { tabId });
            }
          } catch (error) {
            logger.error('Failed to update starred tab after showing:', error);
            // Keep the local state change even if API fails
          }
        }
      }
          
    } catch (error) {
      logger.error('Error in handleVisibilityChange:', error);
      // Ensure we're in a safe state
      if (state.starredTab !== 'fallback') {
        set({ starredTab: 'fallback' });
      }
    }
  },

  setStarredTab: async (tabId: string) => {
    const state = get();

    try {
      // Skip if we're already on this tab
      if (tabId === state.starredTab) {
        return;
      }

      // Get current visible non-admin tabs
      const visibleTabs = Object.entries(state.tabs)
        .filter(([id, tab]) => {
          if (id === 'fallback') return false;
          const isVisible = state.visibility[id]?.tab ?? false;
          const isEnabled = tab.config?.isEnabled ?? false;
          const isAdminOnly = tab.config?.adminOnly ?? false;
          // Never include admin-only tabs in starring system
          return isVisible && isEnabled && !isAdminOnly;
        })
        .map(([id]) => id);

      // Case 1: No visible regular tabs - must use fallback
      if (visibleTabs.length === 0) {
        // Only update if not already on fallback
        if (state.starredTab !== 'fallback') {
          // Update local state first
          set({ starredTab: 'fallback' });
          try {
            await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: 'fallback' });
          } catch (error) {
            logger.error('Failed to set fallback tab:', error);
            // Keep fallback state even if API fails
          }
        }
        return;
      }

      // Case 2: Trying to star fallback with visible tabs
      if (tabId === 'fallback' && visibleTabs.length > 0) {
        // Use first visible regular tab instead
        const newTab = visibleTabs[0];
        // Update local state first
        set({ starredTab: newTab });
        try {
          await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: newTab });
        } catch (error) {
          logger.error('Failed to set alternative tab:', error);
          // Keep the local state change even if API fails
        }
        return;
      }

      // Case 3: Trying to star a regular tab
      const tab = state.tabs[tabId];
      const isVisible = state.visibility[tabId]?.tab ?? false;
      const isEnabled = tab?.config?.isEnabled ?? false;
      const isAdminOnly = tab?.config?.adminOnly ?? false;

      // Never allow starring admin-only tabs
      if (!tab || !isEnabled || isAdminOnly) {
        const fallbackTab = visibleTabs[0] || 'fallback';
        
        // Update local state first
        set({ starredTab: fallbackTab });
        
        try {
          await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: fallbackTab });
        } catch (error) {
          logger.error('Failed to set fallback tab:', error);
          // Keep the local state change even if API fails
        }
        
        return;
      }

      // Double check visibility hasn't changed
      const currentVisibility = state.visibility[tabId]?.tab ?? false;
      if (!currentVisibility) {
        const fallbackTab = visibleTabs[0] || 'fallback';
        
        // Update local state first
        set({ starredTab: fallbackTab });
        
        try {
          await api.post(API_ENDPOINTS.tabs.setStarred, { tabId: fallbackTab });
        } catch (error) {
          logger.error('Failed to set fallback tab after visibility change:', error);
          // Keep the local state change even if API fails
        }
        
        return;
      }

      // All checks passed, update the starred tab
      // Update local state first
      set({ starredTab: tabId });
      
      try {
        // Then try to update backend
        await api.post(API_ENDPOINTS.tabs.setStarred, { tabId });
      } catch (error) {
        logger.error('Failed to update starred tab:', error);
        // If API fails, revert to previous state
        const previousTab = state.starredTab;
        set({ starredTab: previousTab });
        throw error;
      }

    } catch (error) {
      logger.error('Error in setStarredTab:', error);
      throw error;
    }
  }
}); 