import { useStore } from '../store';
import { TabVisibility } from '../types/global';

/**
 * Hook for managing tab and element visibility states
 * @returns Object containing visibility state and methods to update it
 */
export const useVisibility = () => {
  const store = useStore((state) => ({
    visibility: state.visibility,
    updateTabVisibility: state.updateTabVisibility,
    updateElementVisibility: state.updateElementVisibility,
    bulkUpdateVisibility: state.bulkUpdateVisibility,
    isElementVisible: state.isElementVisible,
    isTabVisible: state.isTabVisible,
  }));

  /**
   * Updates the visibility state of a tab
   * @param tabId - The ID of the tab to update
   * @param visible - The new visibility state
   */
  const setTabVisibility = async (tabId: string, visible: boolean) => {
    await store.updateTabVisibility(tabId, visible);
  };

  /**
   * Updates the visibility state of an element within a tab
   * @param tabId - The ID of the tab containing the element
   * @param elementId - The ID of the element to update
   * @param visible - The new visibility state
   */
  const setElementVisibility = (tabId: string, elementId: string, visible: boolean) => {
    store.updateElementVisibility(tabId, elementId, visible);
  };

  /**
   * Updates multiple visibility states at once
   * @param updates - Object containing visibility updates
   */
  const setBulkVisibility = async (updates: TabVisibility) => {
    await store.bulkUpdateVisibility(updates);
  };

  /**
   * Checks if a specific element is visible
   * @param tabId - The ID of the tab containing the element
   * @param elementId - The ID of the element to check
   * @returns boolean indicating if the element is visible
   */
  const checkElementVisibility = (tabId: string, elementId: string): boolean => {
    return store.isElementVisible(tabId, elementId);
  };

  /**
   * Checks if a specific tab is visible
   * @param tabId - The ID of the tab to check
   * @returns boolean indicating if the tab is visible
   */
  const checkTabVisibility = (tabId: string): boolean => {
    return store.isTabVisible(tabId);
  };

  return {
    visibility: store.visibility,
    setTabVisibility,
    setElementVisibility,
    setBulkVisibility,
    checkElementVisibility,
    checkTabVisibility,
  };
}; 