import { StateCreator } from 'zustand';
import { StoreState } from '..';
import { debug, createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('CacheSlice');

// Define types for cache entry
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Define types for cache storage
export interface CacheStore {
  [key: string]: CacheEntry;
}

// Define the interface for the cache slice
export interface CacheSlice {
  // State
  apiCache: CacheStore;
  
  // Cache operations
  setApiCacheEntry: <T>(key: string, data: T, duration: number) => void;
  getApiCacheEntry: <T>(key: string) => CacheEntry<T> | null;
  isApiCacheValid: (key: string) => boolean;
  clearApiCache: (key?: string) => void;
  clearAllApiCaches: () => void; // Clear everything
  clearAdminApiCaches: () => void; // Clear admin-related caches on logout
  
  // Metadata
  getApiCacheLastUpdated: (key: string) => number | null;
  
  // In-flight request tracking
  apiRequestsInFlight: Record<string, boolean>;
  setApiRequestInFlight: (key: string, inFlight: boolean) => void;
  isApiRequestInFlight: (key: string) => boolean;
}

// Key prefix for admin-related cache entries
const ADMIN_CACHE_PREFIX = 'admin:';

// Create the cache slice
export const createCacheSlice: StateCreator<StoreState, [], [], CacheSlice> = (set, get) => ({
  // State
  apiCache: {},
  apiRequestsInFlight: {},
  
  // Set a cache entry with expiration
  setApiCacheEntry: <T>(key: string, data: T, duration: number) => {
    const timestamp = Date.now();
    const expiresAt = timestamp + duration;
    
    set((state) => ({
      apiCache: {
        ...state.apiCache,
        [key]: {
          data,
          timestamp,
          expiresAt
        }
      }
    }));
    
    if (process.env.NODE_ENV !== 'production') {
      debug(`Cache entry set for key "${key}". Expires in ${duration/1000}s.`);
    }
  },
  
  // Get a cache entry if it exists
  getApiCacheEntry: <T>(key: string): CacheEntry<T> | null => {
    const state = get();
    const entry = state.apiCache[key] as CacheEntry<T> | undefined;
    
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        debug(`Cache miss for key "${key}"`);
      }
      return null;
    }
    
    // Check if cache has expired
    if (entry.expiresAt < Date.now()) {
      if (process.env.NODE_ENV !== 'production') {
        debug(`Cache expired for key "${key}"`);
      }
      return null;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      debug(`Cache hit for key "${key}"`);
    }
    
    return entry;
  },
  
  // Check if cache is valid for a key
  isApiCacheValid: (key: string): boolean => {
    const entry = get().getApiCacheEntry(key);
    return entry !== null;
  },
  
  // Clear cache (either specific key or all)
  clearApiCache: (key?: string) => {
    if (key) {
      set((state) => {
        const newCache = { ...state.apiCache };
        delete newCache[key];
        return { apiCache: newCache };
      });
      
      if (process.env.NODE_ENV !== 'production') {
        debug(`Cleared cache for key "${key}"`);
      }
    } else {
      set({ apiCache: {} });
      
      if (process.env.NODE_ENV !== 'production') {
        debug('Cleared entire cache');
      }
    }
  },
  
  // Clear all caches
  clearAllApiCaches: () => {
    set({ apiCache: {} });
    
    if (process.env.NODE_ENV !== 'production') {
      debug('Cleared all API caches');
    }
  },
  
  // Clear admin-specific caches (used on logout)
  clearAdminApiCaches: () => {
    set((state) => {
      const newCache = { ...state.apiCache };
      
      // Remove all admin-prefixed cache entries
      Object.keys(newCache).forEach(key => {
        if (key.startsWith(ADMIN_CACHE_PREFIX) || key.includes('/admin/')) {
          delete newCache[key];
        }
      });
      
      return { apiCache: newCache };
    });
    
    if (process.env.NODE_ENV !== 'production') {
      debug('Cleared all admin API caches');
    }
  },
  
  // Get the last updated timestamp for a key
  getApiCacheLastUpdated: (key: string): number | null => {
    const entry = get().apiCache[key];
    return entry ? entry.timestamp : null;
  },
  
  // Set a request as in-flight
  setApiRequestInFlight: (key: string, inFlight: boolean) => {
    set((state) => ({
      apiRequestsInFlight: {
        ...state.apiRequestsInFlight,
        [key]: inFlight
      }
    }));
    
    if (process.env.NODE_ENV !== 'production') {
      if (inFlight) {
        debug(`Request marked in-flight for key "${key}"`);
      } else {
        debug(`Request completed for key "${key}"`);
      }
    }
  },
  
  // Check if a request is in-flight
  isApiRequestInFlight: (key: string): boolean => {
    return get().apiRequestsInFlight[key] || false;
  }
}); 