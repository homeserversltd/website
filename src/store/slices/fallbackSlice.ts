import { StateCreator } from 'zustand';
import { StoreState } from '..';

export interface FallbackSlice {
  // State
  isFallbackActive: boolean;
  fallbackReason: string | null;
  lastActiveTab: string | null;
  fallbackActivationTime: number | null;
  
  // Actions
  activateFallback: (reason: string) => void;
  deactivateFallback: () => void;
  isFallbackMode: () => boolean;
  getFallbackReason: () => string | null;
}

export const createFallbackSlice: StateCreator<
  StoreState,
  [],
  [],
  FallbackSlice
> = (set, get) => ({
  // Initial state
  isFallbackActive: false,
  fallbackReason: null,
  lastActiveTab: null,
  fallbackActivationTime: null,
  
  // Actions
  activateFallback: (reason: string) => {
    // Store current tab before switching
    const currentTab = get().activeTab;
    
    set({
      isFallbackActive: true,
      fallbackReason: reason,
      lastActiveTab: currentTab,
      fallbackActivationTime: Date.now()
    });
    
    // Ensure we switch to the fallback tab
    if (get().activeTab !== 'fallback') {
      get().setActiveTab('fallback');
    }
  },
  
  deactivateFallback: () => {
    const prevTab = get().lastActiveTab;
    
    set({
      isFallbackActive: false,
      fallbackReason: null
    });
    
    // Only switch back if we have a valid previous tab
    if (prevTab && prevTab !== 'fallback') {
      get().setActiveTab(prevTab);
    }
  },
  
  isFallbackMode: () => {
    return get().isFallbackActive;
  },
  
  getFallbackReason: () => {
    return get().fallbackReason;
  }
}); 