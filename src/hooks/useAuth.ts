import { useCallback, useEffect, useMemo } from 'react';
import React from 'react';
import { useStore } from '../store';
import { useToast } from './useToast';
import { api } from '../api/client';
import { API_ENDPOINTS } from '../api/endpoints';
import { socketClient } from '../components/WebSocket/client';
import { fetchSecretKey } from '../utils/secureTransmission';

/**
 * Configuration options for authentication hook behavior
 */
interface UseAuthOptions {
  /**
   * Whether to automatically show error toasts
   * Provides immediate user feedback for authentication errors
   * @default true
   */
  showErrorToasts?: boolean;

  /**
   * Whether to automatically handle session timeouts
   * Manages session expiration and logout processes
   * @default true
   */
  handleTimeouts?: boolean;

  /**
   * Whether to automatically connect WebSocket on authentication
   * Ensures real-time communication is established after login
   * @default true
   */
  autoConnectWs?: boolean;
}

/**
 * Comprehensive return type for authentication hook
 * Provides full access to authentication state and actions
 */
interface UseAuthReturn {
  // Authentication state
  /** Current admin authentication status */
  isAdmin: boolean;
  /** Loading state during authentication processes */
  isLoading: boolean;
  /** Current authentication error message */
  error: string | null;
  /** Milliseconds remaining before session timeout */
  sessionTimeoutIn: number;
  
  // Authentication actions
  /** Attempt to log in with PIN */
  login: (pin: string) => Promise<boolean>;
  /** Log out of the current session */
  logout: () => Promise<void>;
  /** Change the current admin PIN */
  changePin: (currentPin: string, newPin: string) => Promise<boolean>;
  
  // State management utilities
  /** Clear any existing authentication errors */
  clearError: () => void;
  /** Update last activity timestamp */
  updateActivity: () => void;
  
  // WebSocket management
  /** Current WebSocket connection status */
  wsStatus: ReturnType<typeof api.ws.getStatus>;
  /** Manually connect WebSocket */
  connectWs: () => Promise<void>;
  /** Manually disconnect WebSocket */
  disconnectWs: () => void;

  // New WebSocket authentication state
  wsAuth: {
    isConnected: boolean;
    isAuthenticated: boolean;
  };
  
  // Explicitly authenticate WebSocket (for retry scenarios)
  authenticateWebSocket: (pin: string) => Promise<boolean>;
}

/**
 * Comprehensive hook for managing authentication state and actions
 * 
 * Provides a unified interface for:
 * - Authentication state management
 * - Session timeout handling
 * - WebSocket connection
 * - Error management
 * 
 * @param options - Configuration options for authentication behavior
 * @returns Object containing authentication state and methods
 * 
 * @example
 * ```tsx
 * const { 
 *   isAdmin, 
 *   login, 
 *   logout,
 *   error 
 * } = useAuth({
 *   showErrorToasts: true,
 *   handleTimeouts: true
 * });
 * 
 * // Typical authentication flow
 * const handleLogin = async () => {
 *   const success = await login("1234");
 *   if (success) {
 *     // Handle successful login
 *   }
 * };
 * ```
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    showErrorToasts = true,
    handleTimeouts = true,
    autoConnectWs = true
  } = options;

  const toast = useToast();
  
  const {
    isAdmin,
    lastActivity,
    sessionTimeout,
    enterAdminMode,
    exitAdminMode: logoutStore,
    updateLastActivity,
    checkSessionTimeout
  } = useStore((state) => ({
    isAdmin: state.isAdmin,
    lastActivity: state.lastActivity,
    sessionTimeout: state.sessionTimeout,
    enterAdminMode: state.enterAdminMode,
    exitAdminMode: state.exitAdminMode,
    updateLastActivity: state.updateLastActivity,
    checkSessionTimeout: state.checkSessionTimeout
  }));

  // Memoized calculation of remaining session time
  const sessionTimeoutIn = useMemo(() => {
    if (!isAdmin || !lastActivity) return 0;
    const timeLeft = (lastActivity + sessionTimeout) - Date.now();
    return Math.max(0, timeLeft);
  }, [isAdmin, lastActivity, sessionTimeout]);

  // Automatic session timeout monitoring
  // useEffect(() => {
  //   if (!handleTimeouts) return;
    
  //   const interval = setInterval(() => {
  //     if (checkSessionTimeout()) {
  //       toast.error('Session timed out');
  //     }
  //   }, 1000);

  //   return () => clearInterval(interval);
  // }, [handleTimeouts, checkSessionTimeout, toast]);

  // Enhanced login with WebSocket authentication
  const login = useCallback(async (pin: string) => {
    try {
      // First authenticate with HTTP endpoint
      const httpAuthSuccess = await enterAdminMode(pin);
      
      if (httpAuthSuccess) {
        // WebSocketProvider or other mechanisms will handle WS authentication 
        // after the main application bootstrap, if autoConnectWs is true or handled elsewhere.
      } else {
        // HTTP authentication failed, no further action needed
      }
      
      return httpAuthSuccess;
    } catch (error) {
      console.error('[useAuth] Login failed:', error);
      if (showErrorToasts) {
        toast.error(error instanceof Error ? error.message : 'Login failed');
      }
      return false;
    }
  }, [enterAdminMode, showErrorToasts, toast]);

  // Logout just updates admin state
  const logout = useCallback(async () => {
    await logoutStore();
  }, [logoutStore]);

  // Implement changePin using the API directly since it's not in the store
  const changePin = useCallback(async (currentPin: string, newPin: string) => {
    try {
      const response = await api.post<{ success: boolean; error?: string }>(
        API_ENDPOINTS.auth.changePin,
        { currentPin, newPin }
      );
      return response.success;
    } catch (error) {
      console.error('[useAuth] Change PIN failed:', error);
      return false;
    }
  }, []);

  // Add WebSocket authentication state
  const wsAuthStatus = useMemo(() => {
    return {
      isConnected: api.ws.getStatus() === 'connected',
      isAuthenticated: socketClient.isAuthenticated()
    };
  }, [api.ws.getStatus()]); // This should probably be part of a state that updates

  return {
    // Authentication state
    isAdmin,
    isLoading: false, // We don't track loading state in the store
    error: null, // We don't track error state in the store
    sessionTimeoutIn,
    
    // Authentication actions
    login,
    logout,
    changePin,
    
    // State management
    clearError: () => {
      // No-op since error state is not tracked in the store
      // This is kept for interface compatibility
    },
    updateActivity: updateLastActivity,
    
    // WebSocket management
    wsStatus: api.ws.getStatus(),
    connectWs: api.ws.connect,
    disconnectWs: api.ws.disconnect,

    // New WebSocket authentication state
    wsAuth: wsAuthStatus,
    
    // Explicitly authenticate WebSocket (for retry scenarios)
    authenticateWebSocket: useCallback(async (pin: string) => {
      if (api.ws.getStatus() !== 'connected') {
        console.warn('[useAuth] Attempting to authenticate WebSocket, but main connection is not established. This might fail.');
      }
      
      // Prefetch the encryption key before authenticating
      console.log('[useAuth] Fetching encryption key before WebSocket authentication');
      const secretKey = await fetchSecretKey();
      
      if (!secretKey) {
        console.warn('[useAuth] Could not fetch encryption key, WebSocket authentication might fail');
      }
      
      return socketClient.authenticateAsAdmin(pin);
    }, []),
  };
}

/**
 * Higher-Order Component (HOC) for adding authentication protection
 * 
 * Wraps a component to restrict access based on admin status
 * 
 * @param WrappedComponent - Component to protect
 * @param options - Authentication hook options
 * @returns Protected component that only renders for admin users
 * 
 * @example
 * ```tsx
 * const AdminDashboard = withAuthProtection(DashboardComponent);
 * ```
 */
export function withAuthProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: UseAuthOptions = {}
): React.FC<P> {
  const AuthProtectedComponent: React.FC<P> = (props) => {
    const { isAdmin } = useAuth(options);
    
    if (!isAdmin) {
      return null; // Or return a login component/unauthorized message
    }
    
    return React.createElement(WrappedComponent, props);
  };

  return AuthProtectedComponent;
}

/**
 * Hook for components that need to track authentication state
 * 
 * Provides a simplified view of authentication status
 * 
 * @returns Object with authentication state
 * 
 * @example
 * ```tsx
 * const { 
 *   isAuthenticated, 
 *   timeUntilTimeout 
 * } = useAuthState();
 * ```
 */
export function useAuthState() {
  const { isAdmin, sessionTimeoutIn } = useAuth();
  
  return {
    isAuthenticated: isAdmin,
    timeUntilTimeout: sessionTimeoutIn,
  };
}

/**
 * Hook for components that need to perform authentication actions
 * 
 * Provides a focused set of authentication methods
 * 
 * @returns Object with authentication action methods
 * 
 * @example
 * ```tsx
 * const { 
 *   login, 
 *   logout, 
 *   changePin 
 * } = useAuthActions();
 * ```
 */
export function useAuthActions() {
  const { login, logout, changePin } = useAuth();
  
  return {
    login,
    logout,
    changePin,
  };
} 