/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useStore } from '../../store';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { TabData, TabVisibility } from '../../types/global';
import type { StoreState } from '../../store';
import './TabBar.css';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';  
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { TabProps } from '../../types/global';
import { PremiumTabButton } from './PremiumTabButton';
// Memoize individual tab components to prevent unnecessary re-renders
const Tab = React.memo<TabProps>(({ tabId, tab, isActive, isStarred, isVisible, onTabClick, onStarClick, onVisibilityToggle, isAdmin }) => {
  // Get the active tab directly from the store to ensure most accurate state
  const storeActiveTab = useStore(state => state.activeTab);
  const isReallyActive = storeActiveTab === tabId;
  
  // Use the real active state if it differs from what was passed as prop
  // This handles race conditions in prop updates
  const actuallyActive = isReallyActive || isActive;
  
  // Add a click handler that directly updates the store
  const handleTabClick = React.useCallback(() => {
    
    // Skip click handling if already active according to store
    if (isReallyActive) {
      return;
    }
    
    // Call the onTabClick prop to update the state
    onTabClick(tabId);
  }, [tabId, actuallyActive, isReallyActive, isVisible, onTabClick]);

  return (
    <div
      className={`tab ${actuallyActive ? 'active' : ''}`}
      onClick={handleTabClick}
      data-tab-id={tabId}
      data-visibility={isVisible ? 'visible' : 'hidden'}
    >
      {/* Visibility toggle column */}
      <div className="tab-visibility-column">
        {isAdmin && !tab.config?.adminOnly && (
          <button
            className="visibility-toggle"
            onClick={(e) => {
              onVisibilityToggle(e, tabId, isVisible);
            }}
            data-visible={isVisible}
          >
            <FontAwesomeIcon icon={isVisible ? faEye : faEyeSlash} />
          </button>
        )}
      </div>
      
      {/* Tab name column */}
      <span className="tab-name">{tab.config?.displayName}</span>
      
      {/* Star button column */}
      <div className="tab-star-column">
        {isVisible && !tab.config?.adminOnly && (
          <button
            className={`star-button ${isStarred ? 'fas' : 'far'} fa-star`}
            onClick={(e) => {
              onStarClick(e, tabId);
            }}
            title={isStarred ? 'Starred' : 'Star this tab'}
          />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.isActive === nextProps.isActive &&
         prevProps.isStarred === nextProps.isStarred &&
         prevProps.isVisible === nextProps.isVisible &&
         prevProps.tab === nextProps.tab &&
         prevProps.isAdmin === nextProps.isAdmin;
});

// Add display name
Tab.displayName = 'Tab';

export const TabBar: React.FC = () => {
  // Regular useStore for selectors without equality functions
  const { isAdmin, isInitialized, isFallbackActive, visibility } = useStore(
    (state: StoreState) => ({
      isAdmin: state.isAdmin,
      isInitialized: state.isInitialized,
      isFallbackActive: state.isFallbackActive,
      visibility: state.visibility
    })
  );

  // Use useStoreWithEqualityFn for selectors with custom equality functions
  const { tabs, activeTab, starredTab, setActiveTab, setStarredTab } = useStoreWithEqualityFn(
    useStore,
    (state: StoreState) => ({
      tabs: state.tabs,
      activeTab: state.activeTab,
      starredTab: state.starredTab,
      setActiveTab: state.setActiveTab,
      setStarredTab: state.setStarredTab
    }),
    (prev, next) => {
      return (
        prev.activeTab === next.activeTab &&
        prev.starredTab === next.starredTab &&
        prev.tabs === next.tabs
      );
    }
  );

  // Regular useStore for selectors without equality functions
  const { getVisibleTabs, isTabVisible, updateTabVisibility } = useStore(
    (state: StoreState) => ({
      getVisibleTabs: state.getVisibleTabs,
      isTabVisible: state.isTabVisible,
      updateTabVisibility: state.updateTabVisibility
    })
  );

  // Track last admin state to prevent unnecessary updates
  const lastAdminState = useRef(isAdmin);
  const hasInitialized = useRef(false);
  
  // Add a ref to track admin mode transitions
  const adminTransitionRef = useRef<{
    inTransition: boolean;
    lastTransitionTime: number;
  }>({
    inTransition: false,
    lastTransitionTime: 0
  });

  // Handle admin mode changes
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }

    if (lastAdminState.current !== isAdmin) {
      
      // Mark that we're in a transition
      adminTransitionRef.current = {
        inTransition: true,
        lastTransitionTime: Date.now()
      };
      
      // Perform a single immediate re-render and recalculation of visible tabs
      getVisibleTabs();
      
      // Clear the transition state immediately after
      adminTransitionRef.current.inTransition = false;
      
      lastAdminState.current = isAdmin;
    }
  }, [isAdmin, getVisibleTabs]);

  // Memoize visible tabs but with isAdmin dependency
  const visibleTabs = useMemo(() => {
    // If we're in an admin transition, force a fresh calculation
    if (adminTransitionRef.current.inTransition) {
      // No debug logging
    }
    const tabsToDisplay = getVisibleTabs();
    return tabsToDisplay;
  }, [
    tabs,
    visibility,
    isAdmin,
    getVisibleTabs
  ]);

  // Add a ref to track tab overflow
  const tabBarRef = useRef<HTMLElement>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  // Check if tabs are overflowing
  const checkOverflow = useCallback(() => {
    if (tabBarRef.current) {
      const { scrollWidth, clientWidth } = tabBarRef.current;
      const hasOverflow = scrollWidth > clientWidth;
      setIsOverflowing(hasOverflow);
      
    }
  }, []);

  // Check for overflow on mount and when tabs change
  useEffect(() => {
    // Also check on window resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [checkOverflow]);

  // Use useLayoutEffect to check overflow after DOM updates
  useLayoutEffect(() => {
    checkOverflow();
    
    // Add a small delay to check again after any animations or transitions
    const timeoutId = setTimeout(checkOverflow, 100);
    return () => clearTimeout(timeoutId);
  }, [checkOverflow, tabs, visibleTabs, isAdmin]);

  // Memoize derived state
  const { showFallback, shouldHideTabBar, tabBarClasses } = useMemo(() => {
    // Directly use isFallbackActive from the store to determine if fallback UI aspects should be shown
    const actualShowFallback = isFallbackActive;

    // Hide TabBar if fallback is active, OR if user is not admin and has 2 or fewer visible tabs.
    const newShouldHideTabBar = actualShowFallback || (!isAdmin && visibleTabs.length <= 2);
    
    const tabBarClasses = [
      'tab-bar',
      actualShowFallback && 'fallback-only', // If fallback is active, apply 'fallback-only' class
      newShouldHideTabBar && 'hidden',       // If tab bar should be hidden, apply 'hidden' class
      isOverflowing && 'tabs-overflow'
    ].filter(Boolean).join(' ');
    
    return { showFallback: actualShowFallback, shouldHideTabBar: newShouldHideTabBar, tabBarClasses };
  }, [isAdmin, visibleTabs, isOverflowing, isFallbackActive]); // Added isFallbackActive to dependency array

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = async (e: Event) => {
      const customEvent = e as CustomEvent<{ tabId: string; visible: boolean }>;
      const { tabId, visible } = customEvent.detail;
      
      await updateTabVisibility(tabId, visible);
      
      const updatedVisibleTabs = getVisibleTabs();
      
      if ((!visible && tabId === starredTab) || updatedVisibleTabs.length === 0) {
        const newStarredTab = updatedVisibleTabs.length > 0 ? updatedVisibleTabs[0] : 'fallback';
        await setStarredTab(newStarredTab);
      }
      else if (visible && (starredTab === 'fallback' || !starredTab) && updatedVisibleTabs.length > 0) {
        const firstVisibleTab = updatedVisibleTabs[0];
        await setStarredTab(firstVisibleTab);
      }
    };

    window.addEventListener('visibilityChanged', handleVisibilityChange);
    return () => window.removeEventListener('visibilityChanged', handleVisibilityChange);
  }, [starredTab, setStarredTab, updateTabVisibility, getVisibleTabs]);

  // Handle tab-changed events
  useEffect(() => {
    const handleTabChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ newTabId: string; previousTabId?: string | null; source: string }>;
      const { newTabId, previousTabId, source } = customEvent.detail;
      
      // Handle undefined or null values
      const prevTab = previousTabId || null;
      const newTab = newTabId || null;
      
      // Skip processing if newTabId is undefined or null
      if (!newTab) {
        return;
      }
      
      // Get current state directly from the store for maximum accuracy
      const { activeTab: storeActiveTab, starredTab, isInitialized } = useStore.getState();
      
      // During initialization phase, give strong preference to the starred tab
      const isInitializationPhase = isInitialized && 
                                   (Date.now() - window.performance.timing.navigationStart) < 2000;
      
      // Special case for initialization - prefer starred tab over anything except explicit user actions
      if (isInitializationPhase && starredTab && 
          starredTab !== '@fallback' && starredTab !== 'fallback' &&
          source !== 'click' && source !== 'api') {
          
        // If store doesn't already have the starred tab as active, set it
        if (storeActiveTab !== starredTab) {
          setTimeout(() => {
            useStore.setState({ activeTab: starredTab });
          }, 10);
        }
        
        return;
      }
      
    };

    // Listen for the custom tab-changed event
    window.addEventListener('tab-changed', handleTabChanged);
    
    return () => {
      window.removeEventListener('tab-changed', handleTabChanged);
    };
  }, []);

  const canStarTab = useCallback((tabId: string, tab: TabData) => {
    if (tabId === 'fallback') return true;
    return tab.config?.isEnabled && !tab.config?.adminOnly;
  }, []);

  // Memoize handlers to prevent unnecessary re-renders
  const handleTabClick = useCallback((tabId: string) => {
    // Get the current active tab directly from the store for maximum accuracy
    const currentActiveTab = useStore.getState().activeTab;
    
    // Skip if tab is already active
    if (tabId === currentActiveTab) {
      return;
    }
    
    // Directly set the tab ID and ensure it's valid
    if (tabId && tabId !== 'undefined') {
      // Normalize tab ID (remove @ prefix if present)
      const normalizedTabId = tabId.startsWith('@') ? tabId.substring(1) : tabId;
      
      // Set the active tab directly in store
      setActiveTab(normalizedTabId);
      
      // Force synchronize with tabManager for better reliability
      window.setTimeout(() => {
        const storeTab = useStore.getState().activeTab;
        if (storeTab !== normalizedTabId) {
          useStore.setState({ activeTab: normalizedTabId });
        }
      }, 50);
      
      // No need for manual DOM manipulation here - React will handle this
      // when the state updates. This reduces the chance of race conditions.
    } else {
      console.error(`[TabBar] Invalid tab ID: ${tabId}`);
    }
  }, [setActiveTab]);

  const handleStarClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    setStarredTab(tabId);
  }, [setStarredTab]);

  const handleVisibilityToggle = useCallback((e: React.MouseEvent, tabId: string, visible: boolean) => {
    e.stopPropagation();
    updateTabVisibility(tabId, !visible);
  }, [updateTabVisibility]);

  const renderTabs = useCallback(() => {
    // Always use visibleTabs, which is sorted by order property
    const tabsToRender = visibleTabs.filter(id => id !== 'fallback');
    // No debug logging
    return tabsToRender.map(tabId => {
      const tab = tabs[tabId];
      if (!tab) return null;
      
      const isStarred = tabId === starredTab;
      const isActive = tabId === activeTab;
      const isVisible = isTabVisible(tabId);
      const canStar = canStarTab(tabId, tab);

      // In regular mode, only show visible tabs
      if (!isAdmin && !isVisible) {
        return null;
      }

      return (
        <Tab
          key={tabId}
          tabId={tabId}
          tab={tab}
          isActive={isActive}
          isStarred={isStarred}
          isVisible={isVisible}
          isAdmin={isAdmin}
          onTabClick={handleTabClick}
          onStarClick={handleStarClick}
          onVisibilityToggle={handleVisibilityToggle}
        />
      );
    });
  }, [
    isAdmin,
    tabs,
    activeTab,
    starredTab,
    visibleTabs,
    isTabVisible,
    canStarTab,
    handleTabClick,
    handleStarClick,
    handleVisibilityToggle
  ]);

  // Early return if we should hide the tab bar
  if (shouldHideTabBar) { // This condition now incorporates isFallbackActive
    return (
      <nav 
        className={tabBarClasses}
        data-admin-mode={isAdmin}
        data-hidden={shouldHideTabBar}
        ref={tabBarRef}
      >
        {isAdmin && <PremiumTabButton />}
      </nav>
    );
  }

  return (
    <nav 
      className={tabBarClasses}
      data-admin-mode={isAdmin}
      data-hidden={shouldHideTabBar}
      ref={tabBarRef}
    >
      {renderTabs()}
      {isAdmin && <PremiumTabButton />}
    </nav>
  );
};