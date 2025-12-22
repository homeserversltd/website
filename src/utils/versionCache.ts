/**
 * versionCache.ts
 * Utility for caching version information in localStorage for offline use
 */

import { API_ENDPOINTS } from '../api/endpoints';
import { api } from '../api/client';
import { useStore } from '../store'; // Import Zustand store

// Cache keys
// const VERSION_CACHE_KEY = 'homeserver_version_cache'; // Removed
const VERSION_INFO_API_CACHE_KEY = 'api:version_info'; // New key for cacheSlice
const VERSION_CACHE_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour

// Default version info
const DEFAULT_VERSION = {
  generation: 0,
  buildId: 'unknown',
  lastUpdated: 'unknown'
};

// Version info type
export interface VersionInfo {
  generation: number;
  buildId: string;
  lastUpdated: string;
}

// API response type
interface VersionResponse {
  status: string;
  version: VersionInfo;
}

/**
 * Fetch version info from the server
 */
const fetchVersionInfo = async (): Promise<VersionInfo> => {
  // console.log('[VersionCache] Fetching version info from server...');
  try {
    const response = await api.get<VersionResponse>(API_ENDPOINTS.version.info);
    if (response.status === 'success' && response.version) {
      // Store in cacheSlice after fetching
      useStore.getState().setApiCacheEntry(VERSION_INFO_API_CACHE_KEY, response.version, VERSION_CACHE_DURATION_MS);
      return response.version;
    }
    console.warn('[VersionCache] Server response missing version data or success status');
    return DEFAULT_VERSION;
  } catch (err) {
    console.error('[VersionCache] Failed to fetch version info:', err);
    return DEFAULT_VERSION;
  }
};

/**
 * Cache version info in localStorage
 */
/* // Removed localStorage caching logic
const cacheVersionInfo = (versionInfo: VersionInfo): void => {
  try {
    localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify(versionInfo));
    //console.log('[VersionCache] Version info cached successfully');
  } catch (err) {
    console.error('[VersionCache] Failed to cache version info:', err);
  }
};
*/

/**
 * Get cached version info from localStorage
 */
export const getCachedVersionInfo = (): VersionInfo => {
  // Attempt to get from cacheSlice first
  const cachedEntry = useStore.getState().getApiCacheEntry<VersionInfo>(VERSION_INFO_API_CACHE_KEY);
  if (cachedEntry) {
    // console.log('[VersionCache] Version info retrieved from apiCache');
    return cachedEntry.data;
  }
  // console.log('[VersionCache] No valid version info in apiCache, returning default.');
  return DEFAULT_VERSION;
};

/**
 * Initialize version cache - fetch and store
 * Should be called during app initialization
 */
export const initVersionCache = async (): Promise<VersionInfo> => {
  // Check cacheSlice first
  const cachedEntry = useStore.getState().getApiCacheEntry<VersionInfo>(VERSION_INFO_API_CACHE_KEY);
  if (cachedEntry && useStore.getState().isApiCacheValid(VERSION_INFO_API_CACHE_KEY)) {
    // console.log('[VersionCache] Valid version info found in apiCache.');
    // Optionally, trigger a background update if needed, but for now, just return cached.
    // fetchVersionInfoInBackground(); // Example for background update
    return cachedEntry.data;
  }

  // console.log('[VersionCache] No valid version info in apiCache or expired, fetching from server...');
  // If not in cache or expired, fetch and store (fetchVersionInfo now handles storing)
  try {
    return await fetchVersionInfo();
  } catch (err) {
    console.error('[VersionCache] Initialization fetch failed:', err);
    return DEFAULT_VERSION; // Fallback to default if fetch fails
  }
};

// Helper for background fetch, could be added to initVersionCache if desired
/*
const fetchVersionInfoInBackground = (): void => {
  if (useStore.getState().isApiRequestInFlight(VERSION_INFO_API_CACHE_KEY)) {
    console.log('[VersionCache] Background update already in flight.');
    return;
  }
  useStore.getState().setApiRequestInFlight(VERSION_INFO_API_CACHE_KEY, true);
  fetchVersionInfo()
    .then(latestVersion => {
      console.log('[VersionCache] Background version info updated.');
    })
    .catch(err => {
      console.error('[VersionCache] Background update failed:', err);
    })
    .finally(() => {
      useStore.getState().setApiRequestInFlight(VERSION_INFO_API_CACHE_KEY, false);
    });
};
*/

/**
 * Force refresh the version cache - fetches from server and updates cache
 * Useful for manual refresh after known updates
 */
export const forceRefreshVersionCache = async (): Promise<VersionInfo> => {
  // console.log('[VersionCache] Forcing refresh of version info...');
  // Invalidate existing cache entry
  useStore.getState().clearApiCache(VERSION_INFO_API_CACHE_KEY);
  // Fetch new data (which will also update the cache)
  try {
    return await fetchVersionInfo();
  } catch (err) {
    console.error('[VersionCache] Force refresh fetch failed:', err);
    return DEFAULT_VERSION; // Fallback to default if fetch fails
  }
}; 