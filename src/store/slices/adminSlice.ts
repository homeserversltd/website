import { StateCreator } from 'zustand';
import { visibilityCache } from './visibilitySlice';
import { api } from '../../api/client';
import { socketClient } from '../../components/WebSocket/client';
import { stopAdminSessionKeepalive } from '../../utils/keepalive';
import { debug, createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('AdminSlice');

export interface AdminSlice {
  isAdmin: boolean;
  lastActivity: number;
  sessionTimeout: number;
  adminToken: string | null;
  isWebSocketAdminAuthenticated: boolean;
  failedPinAttempts: number;
  pinLockoutUntil: number | null;
  enterAdminMode: (pin: string) => Promise<boolean>;
  exitAdminMode: () => void;
  updateLastActivity: () => void;
  checkSessionTimeout: () => boolean;
  setWebSocketAdminAuthenticated: (isAuthenticated: boolean) => void;
  getPinLockoutTimeRemaining: () => number;
}

type StoreWithAdmin = AdminSlice & {
  theme: string;
  visibility: any;
  tabs: any;
  clearAdminApiCaches?: () => void;
};

const MAX_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const BASE_LOCKOUT_POWER = 8; // Max exponent for 2^n (2^8 = 256 seconds)

export const createAdminSlice: StateCreator<StoreWithAdmin, [], [], AdminSlice> = (set, get) => ({
  isAdmin: false,
  lastActivity: Date.now(),
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  adminToken: null,
  isWebSocketAdminAuthenticated: false,
  failedPinAttempts: 0,
  pinLockoutUntil: null,

  getPinLockoutTimeRemaining: () => {
    const { pinLockoutUntil } = get();
    if (!pinLockoutUntil) {
      return 0;
    }
    const timeRemaining = pinLockoutUntil - Date.now();
    return Math.max(0, Math.ceil(timeRemaining / 1000)); // Return in seconds
  },

  enterAdminMode: async (pin: string) => {
    const { pinLockoutUntil, failedPinAttempts } = get();

    if (pinLockoutUntil && Date.now() < pinLockoutUntil) {
      const timeRemaining = Math.ceil((pinLockoutUntil - Date.now()) / 1000);
      logger.warn(`Admin login attempt blocked. Please wait ${timeRemaining} seconds.`);
      return false; 
    }

    try {
      const response = await fetch('/api/validatePin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      
      const data = await response.json();
      const { success, token, sessionTimeout } = data;
      
      if (success && token) {
        api.admin.setToken(token);
        
        set(state => ({ 
          isAdmin: true,
          lastActivity: Date.now(),
          adminToken: token,
          sessionTimeout: sessionTimeout ? sessionTimeout * 1000 : state.sessionTimeout,
          failedPinAttempts: 0,
          pinLockoutUntil: null,
        }));
        
        socketClient.setIsAdmin(true); 

        return true;
      }
      
      const newFailedAttempts = failedPinAttempts + 1;
      const lockoutDurationMs = Math.min(
        MAX_LOCKOUT_MS,
        1000 * Math.pow(2, Math.min(newFailedAttempts - 1, BASE_LOCKOUT_POWER))
      );
      
      const newPinLockoutUntil = Date.now() + lockoutDurationMs;
      
      set({ 
        failedPinAttempts: newFailedAttempts,
        pinLockoutUntil: newPinLockoutUntil,
      });
      
      logger.warn(`Admin PIN validation failed. Attempt ${newFailedAttempts}. Locked out for ${lockoutDurationMs / 1000} seconds.`);
      return false;
    } catch (error) { 
      logger.error('Failed to enter admin mode:', error instanceof Error ? error.message : String(error));
      const newFailedAttempts = get().failedPinAttempts + 1;
      const lockoutDurationMs = Math.min(
        MAX_LOCKOUT_MS,
        1000 * Math.pow(2, Math.min(newFailedAttempts - 1, BASE_LOCKOUT_POWER))
      );
      const newPinLockoutUntil = Date.now() + lockoutDurationMs;
      set({
        failedPinAttempts: newFailedAttempts,
        pinLockoutUntil: newPinLockoutUntil,
      });
      logger.warn(`Admin PIN validation errored. Attempt ${newFailedAttempts}. Locked out for ${lockoutDurationMs / 1000} seconds.`);
      return false;
    }
  },

  exitAdminMode: () => {
    visibilityCache.clear();
    api.admin.clearToken();
    
    const clearAdminApiCaches = get().clearAdminApiCaches;
    if (clearAdminApiCaches) {
      debug('Clearing admin API caches on admin mode exit');
      clearAdminApiCaches();
    }
    
    stopAdminSessionKeepalive();
    
    set({ 
      isAdmin: false, 
      adminToken: null, 
      isWebSocketAdminAuthenticated: false,
      failedPinAttempts: 0,
      pinLockoutUntil: null,
    });
  },

  updateLastActivity: () => {
    set({ lastActivity: Date.now() });
  },

  checkSessionTimeout: () => {
    const { isAdmin } = get();
    if (!isAdmin) {
      return false;
    }
    
    // The adminSlice no longer manages session expiry based on its own timer.
    // Inactivity is handled by the WebSocket layer, which will trigger
    // exitAdminMode externally if the user was admin.
    // This function effectively just confirms if the user is currently admin
    // or not, for any remaining callers. It does not cause a timeout.
    return false; 
  },

  setWebSocketAdminAuthenticated: (isAuthenticated: boolean) => {
    set({ isWebSocketAdminAuthenticated: isAuthenticated });
    if (isAuthenticated) {
      debug('WebSocket is now authenticated for admin privileges.');
    } else {
      debug('WebSocket is no longer authenticated for admin privileges.');
    }
  }
});
