import { StateCreator } from 'zustand';
import { StoreState } from '..';
import { api } from '../../api/client';
import { API_ENDPOINTS } from '../../api/endpoints';
import { HierarchicalDirectoryResponse } from '../../tablets/upload/types';
import { debug, createComponentLogger } from '../../utils/debug';

interface DirectoryEntry {
  name: string;
  path: string;
  type: 'directory';
  size?: number;
  modified?: string;
  children?: DirectoryEntry[] | null;
  isExpanded?: boolean;
  hasChildren?: boolean;
  isLoading?: boolean;
}

interface DirectoryCache {
  [path: string]: {
    entries: DirectoryEntry[];
    timestamp: number;
    isLoading: boolean;
    error: Error | null;
    depth: number; // Track how deep this cache entry goes
  };
}

interface DirectoryResponse {
  path: string;
  entries: DirectoryEntry[];
  parent: string | null;
}

export interface DirectorySlice {
  directoryCache: DirectoryCache;
  cacheTimeout: number;
  isLoading: boolean;
  error: Error | null;
  _inFlightByPath: Record<string, boolean>;
  
  // Actions
  loadDirectory: (path: string, forceRefresh?: boolean) => Promise<DirectoryEntry[]>;
  loadDirectoryDeep: (path: string, forceRefresh?: boolean) => Promise<DirectoryEntry[]>;
  loadDirectoryHierarchical: (path: string, forceRefresh?: boolean) => Promise<DirectoryEntry[]>;
  expandDirectory: (path: string) => Promise<DirectoryEntry[]>;
  toggleDirectoryExpansion: (path: string) => Promise<void>;
  invalidateCache: (path?: string) => void;
  clearCache: () => void;
  updateDirectory: (path: string, entries: DirectoryEntry[], depth: number) => void;
  
  // Tree management
  updateDirectoryTree: (path: string, entries: DirectoryEntry[], parent: string | null) => void;
  getDirectoryTree: (path: string) => DirectoryEntry[] | null;
  setDirectoryExpansion: (path: string, isExpanded: boolean, isLoading?: boolean) => void;
}

const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CACHE_DEPTH = 3; // Cache 3 layers by default

export const createDirectorySlice: StateCreator<StoreState, [], [], DirectorySlice> = (set, get) => {
  // Initialize component logger for directory slice
  const logger = createComponentLogger('DirectorySlice');
  
  return {
  directoryCache: {},
  cacheTimeout: CACHE_TIMEOUT,
  isLoading: false,
  error: null,
  _inFlightByPath: {},

  loadDirectoryDeep: async (path: string, forceRefresh = false) => {
    const state = get();
    
    // Enhanced cache check
    const cached = state.directoryCache[path];
    const isCacheValid = !forceRefresh && 
      cached && 
      !cached.isLoading && 
      cached.entries?.length > 0 &&
      (Date.now() - cached.timestamp) < state.cacheTimeout &&
      cached.depth >= DEFAULT_CACHE_DEPTH;

    if (isCacheValid) {
      debug(`Using cached data for ${path}`);
      return cached.entries;
    }

    if (forceRefresh) {
      debug(`Force refresh requested for ${path}, bypassing cache`);
    }

    // Set loading state before network request
    set(state => ({
      directoryCache: {
        ...state.directoryCache,
        [path]: {
          ...(state.directoryCache[path] || {}),
          isLoading: true,
          error: null
        }
      }
    }));

    try {
      const entries = await state.loadDirectory(path, forceRefresh);
      
      // Update cache with fresh data
      set(state => ({
        directoryCache: {
          ...state.directoryCache,
          [path]: {
            entries,
            timestamp: Date.now(),
            isLoading: false,
            error: null,
            depth: DEFAULT_CACHE_DEPTH
          }
        }
      }));

      return entries;
    } catch (error) {
      // Update cache with error state
      const errorObj = error instanceof Error ? error : new Error(String(error));
      set(state => ({
        directoryCache: {
          ...state.directoryCache,
          [path]: {
            ...(state.directoryCache[path] || {}),
            isLoading: false,
            error: errorObj,
            timestamp: Date.now()
          }
        }
      }));
      throw errorObj;
    }
  },

  loadDirectory: async (path: string, forceRefresh = false) => {
    const state = get();
    debug(`[DirectorySlice] loadDirectory start`, { path, forceRefresh });
    
    // Check cache first
    const cached = state.directoryCache[path];
    const isCacheValid = !forceRefresh && 
      cached && 
      !cached.isLoading && 
      cached.entries?.length > 0 &&
      (Date.now() - cached.timestamp) < state.cacheTimeout;

    if (isCacheValid) {
      debug(`Using cached data for ${path}`);
      return cached.entries;
    }

    if (forceRefresh) {
      debug(`Force refresh requested for ${path}, bypassing cache`);
    }

    // Mark as loading
    debug(`${forceRefresh ? 'Force refreshing' : 'Cache invalid for'} ${path}, loading from API`);
    set(state => ({
      directoryCache: {
        ...state.directoryCache,
        [path]: {
          ...(state.directoryCache[path] || {}),
          isLoading: true,
          error: null
        }
      }
    }));

    try {
      // Use api utility and endpoints
      debug(`Fetching directory ${path} from API`);
      const data = await api.get<DirectoryResponse>(
        `${API_ENDPOINTS.files.browse}?path=${encodeURIComponent(path)}`
      );
      
      // Ensure entries array exists
      const entries = data.entries || [];
      debug(`API returned ${entries.length} entries for ${path}`);
      
      // Store complete tree in cache
      set(state => ({
        directoryCache: {
          ...state.directoryCache,
          [path]: {
            entries: entries,
            timestamp: Date.now(),
            isLoading: false,
            error: null,
            depth: 999 // Complete tree
          }
        }
      }));

      debug(`[DirectorySlice] loadDirectory success`, { path, entries: entries.length });
      return entries;

    } catch (error: any) {
      logger.error(`API error for ${path}:`, error);
      debug(`[DirectorySlice] loadDirectory error`, { path, error: String(error) });
      
      // Create enhanced error object with NAS availability info
      let errorObj: Error;
      if (error?.response?.data?.nas_unavailable) {
        errorObj = new Error('NAS storage is not available or mounted');
        (errorObj as any).nas_unavailable = true;
        (errorObj as any).response = error.response;
      } else {
        errorObj = error instanceof Error ? error : new Error(String(error));
      }
      
      set(state => ({
        directoryCache: {
          ...state.directoryCache,
          [path]: {
            ...(state.directoryCache[path] || {}),
            isLoading: false,
            error: errorObj
          }
        }
      }));
      throw errorObj;
    }
  },

  invalidateCache: (path?: string) => {
    if (path) {
      debug(`Invalidating cache for path: ${path}`);
      // Get all cache keys
      const allCacheKeys = Object.keys(get().directoryCache);
      
      // Set of paths to invalidate (including the specified path and all descendants)
      const pathsToInvalidate = allCacheKeys.filter(cachedPath => 
        cachedPath === path || cachedPath.startsWith(`${path}/`)
      );
      
      debug(`Invalidating ${pathsToInvalidate.length} cache entries related to ${path}`);
      
      // Update state with all invalidated paths
      set(state => {
        const newCache = { ...state.directoryCache };
        
        // Clear all related paths
        pathsToInvalidate.forEach(invalidPath => {
          delete newCache[invalidPath];
        });
        
        return { directoryCache: newCache };
      });
    } else {
      debug(`Invalidating all directory cache`);
      // Completely reset the cache
      set({ directoryCache: {} });
    }
  },

  clearCache: () => {
    set({ directoryCache: {} });
  },

  updateDirectory: (path: string, entries: DirectoryEntry[], depth: number) => {
    set(state => ({
      directoryCache: {
        ...state.directoryCache,
        [path]: {
          entries,
          timestamp: Date.now(),
          isLoading: false,
          error: null,
          depth
        }
      }
    }));
  },

  updateDirectoryTree: (path: string, entries: DirectoryEntry[], parent: string | null) => {
    set(state => {
      const newCache = { ...state.directoryCache };
      const depth = newCache[path]?.depth || 1;
      
      // Update current directory
      newCache[path] = {
        entries,
        timestamp: Date.now(),
        isLoading: false,
        error: null,
        depth
      };

      // Update parent's children if parent exists
      if (parent && newCache[parent] && newCache[parent].entries) {
        const parentEntries = newCache[parent].entries.map(entry => {
          if (entry.path === path) {
            return { ...entry, children: entries };
          }
          return entry;
        });

        newCache[parent] = {
          ...newCache[parent],
          entries: parentEntries
        };
      }

      return { directoryCache: newCache };
    });
  },

  getDirectoryTree: (path: string) => {
    const state = get();
    const cached = state.directoryCache[path];
    if (!cached?.entries) return null;
    
    // Recursively reconstruct the full tree with children
    const reconstructTree = (entries: DirectoryEntry[]): DirectoryEntry[] => {
      return entries.map(entry => {
        // Check if this entry has children in the cache
        const childrenCache = state.directoryCache[entry.path];
        const hasChildren = entry.hasChildren || (childrenCache?.entries && childrenCache.entries.length > 0);
        
        if (hasChildren && entry.isExpanded && childrenCache?.entries) {
          // Recursively reconstruct children
          return {
            ...entry,
            children: reconstructTree(childrenCache.entries)
          };
        } else {
          // No children or not expanded
          return {
            ...entry,
            children: entry.isExpanded ? entry.children : null
          };
        }
      });
    };
    
    return reconstructTree(cached.entries);
  },

  // Hierarchical navigation methods
  loadDirectoryHierarchical: async (path: string, forceRefresh = false) => {
    const state = get();
    debug(`[DirectorySlice] loadDirectoryHierarchical start`, { path, forceRefresh });
    console.log('[DirectorySlice] loadDirectoryHierarchical begin', { path, forceRefresh });
    
    // Check cache first for hierarchical data
    const cached = state.directoryCache[path];
    const isCacheValid = !forceRefresh && 
      cached && 
      !cached.isLoading && 
      cached.entries?.length >= 0 &&
      (Date.now() - cached.timestamp) < state.cacheTimeout &&
      cached.depth === 1; // Only for single-level hierarchical loads

    if (isCacheValid) {
      debug(`Using cached hierarchical data for ${path}`);
      return cached.entries;
    }

    // Set loading state
    set(state => ({
      directoryCache: {
        ...state.directoryCache,
        [path]: {
          ...(state.directoryCache[path] || {}),
          isLoading: true,
          error: null
        }
      }
    }));

    try {
      debug(`Fetching hierarchical directory ${path} from API`);
      const data = await api.get<HierarchicalDirectoryResponse>(
        API_ENDPOINTS.files.browseHierarchical(path)
      );
      
      const entries = data.entries || [];
      debug(`API returned ${entries.length} hierarchical entries for ${path}`);
      
      // Store single-level hierarchical data in cache
      set(state => ({
        directoryCache: {
          ...state.directoryCache,
          [path]: {
            entries: entries,
            timestamp: Date.now(),
            isLoading: false,
            error: null,
            depth: 1 // Single level
          }
        }
      }));

      debug(`[DirectorySlice] loadDirectoryHierarchical success`, { path, entries: entries.length });
      console.log('[DirectorySlice] loadDirectoryHierarchical success', { path, count: entries.length });
      return entries;
    } catch (error: any) {
      logger.error(`API error for hierarchical ${path}:`, error);
      debug(`[DirectorySlice] loadDirectoryHierarchical error`, { path, error: String(error) });
      console.log('[DirectorySlice] loadDirectoryHierarchical error', { path, error: String(error) });
      
      let errorObj: Error;
      if (error?.response?.data?.nas_unavailable) {
        errorObj = new Error('NAS storage is not available or mounted');
        (errorObj as any).nas_unavailable = true;
        (errorObj as any).response = error.response;
      } else {
        errorObj = error instanceof Error ? error : new Error(String(error));
      }
      
      set(state => ({
        directoryCache: {
          ...state.directoryCache,
          [path]: {
            ...(state.directoryCache[path] || {}),
            isLoading: false,
            error: errorObj
          }
        }
      }));
      throw errorObj;
    }
  },

  expandDirectory: async (path: string) => {
    const state = get();
    
    debug(`expandDirectory called for: ${path}`);
    console.log('[DirectorySlice] expandDirectory begin', { path });
    
    // Prevent overlapping expand operations per path
    if (state._inFlightByPath[path]) {
      debug(`expandDirectory in-flight for ${path}, skipping`);
      return [];
    }
    set(s => ({ _inFlightByPath: { ...s._inFlightByPath, [path]: true } }));

    // Check if already loading to prevent race conditions
    let currentEntry: DirectoryEntry | null = null;
    for (const [cachePath, cache] of Object.entries(state.directoryCache)) {
      const entry = cache.entries.find((e: DirectoryEntry) => e.path === path);
      if (entry) {
        currentEntry = entry;
        break;
      }
    }
    
    if (currentEntry?.isLoading) {
      debug(`Already loading ${path}, skipping`);
      return currentEntry.children || [];
    }
    
    // Mark directory as loading
    debug(`Setting loading state for: ${path}`);
    state.setDirectoryExpansion(path, true, true); // true for expanded, true for loading
    console.log('[DirectorySlice] setDirectoryExpansion(loading=true)', { path });
    
    try {
      const children = await state.loadDirectoryHierarchical(path);
      debug(`Loaded ${children.length} children for: ${path}`);
      console.log('[DirectorySlice] expandDirectory loaded children', { path, count: children.length });
      
      // Update the parent directory's children in cache
      const updateParentWithChildren = (parentPath: string, targetPath: string, newChildren: DirectoryEntry[]) => {
        const cached = state.directoryCache[parentPath];
        if (cached) {
          const updatedEntries = cached.entries.map(entry => {
            if (entry.path === targetPath) {
              return {
                ...entry,
                children: newChildren,
                isExpanded: true,
                isLoading: false
              };
            }
            return entry;
          });
          
          set(state => ({
            directoryCache: {
              ...state.directoryCache,
              [parentPath]: {
                ...cached,
                entries: updatedEntries
              }
            }
          }));
        }
      };

      // Find parent path and update
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/mnt/nas';
      updateParentWithChildren(parentPath, path, children);
      console.log('[DirectorySlice] parent updated with children', { parentPath, path, count: children.length });

      return children;
    } catch (error) {
      logger.error(`Error expanding ${path}:`, error);
      // Mark directory as not loading and not expanded on error
      state.setDirectoryExpansion(path, false, false);
      console.log('[DirectorySlice] expandDirectory error -> reset expansion', { path, error: String(error) });
      throw error;
    } finally {
      set(s => {
        const next = { ...s._inFlightByPath };
        delete next[path];
        return { _inFlightByPath: next } as Partial<StoreState> as any;
      });
      console.log('[DirectorySlice] expandDirectory end', { path });
    }
  },

  toggleDirectoryExpansion: async (path: string) => {
    const state = get();
    console.log('[DirectorySlice] toggleDirectoryExpansion begin', { path });

    // Find the directory entry across all cached data
    let currentEntry: DirectoryEntry | null = null;
    let parentPath: string | null = null;
    
    for (const [cachePath, cache] of Object.entries(state.directoryCache)) {
      const entry = cache.entries.find((e: DirectoryEntry) => e.path === path);
      if (entry) {
        currentEntry = entry;
        parentPath = cachePath;
        break;
      }
    }

    if (!currentEntry) {
      logger.warn(`Cannot find entry for path: ${path}`);
      console.log('[DirectorySlice] toggleDirectoryExpansion: entry not found', { path });
      return;
    }

    const isCurrentlyExpanded = Boolean(currentEntry.isExpanded);
    debug(`toggleDirectoryExpansion: ${path}, currently expanded: ${isCurrentlyExpanded}, loading: ${currentEntry.isLoading}`);
    
    if (currentEntry.isLoading) {
      debug(`Directory ${path} is loading, ignoring toggle`);
      console.log('[DirectorySlice] toggle ignored: entry is loading', { path });
      return;
    }
    
    try {
      if (isCurrentlyExpanded) {
        // Collapse: set children to null and isExpanded to false
        debug(`Collapsing: ${path}`);
        console.log('[DirectorySlice] collapsing', { path });
        state.setDirectoryExpansion(path, false, false);
      } else {
        // Expand: load children
        debug(`Expanding: ${path}`);
        console.log('[DirectorySlice] expanding', { path });
        await state.expandDirectory(path);
      }
    } finally {
      console.log('[DirectorySlice] toggleDirectoryExpansion end', { path });
    }
  },

  setDirectoryExpansion: (path: string, isExpanded: boolean, isLoading = false) => {
    debug(`setDirectoryExpansion: ${path}, expanded: ${isExpanded}, loading: ${isLoading}`);
    console.log('[DirectorySlice] setDirectoryExpansion', { path, isExpanded, isLoading });
    set(state => {
      const newCache = { ...state.directoryCache };
      
      // Find and update the entry across all cached data
      Object.entries(newCache).forEach(([cachePath, cache]) => {
        const entryIndex = cache.entries.findIndex(e => e.path === path);
        if (entryIndex !== -1) {
          const updatedEntries = [...cache.entries];
          updatedEntries[entryIndex] = {
            ...updatedEntries[entryIndex],
            isExpanded,
            isLoading,
            children: isExpanded ? updatedEntries[entryIndex].children : null
          };
          
          newCache[cachePath] = {
            ...cache,
            entries: updatedEntries
          };
          console.log('[DirectorySlice] setDirectoryExpansion applied', { cachePath, index: entryIndex });
        }
      });
      
      return { directoryCache: newCache };
    });
  }
  };
};
 