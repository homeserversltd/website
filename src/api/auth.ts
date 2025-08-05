import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import React, { useEffect } from 'react';
import { api } from './client';
import { API_ENDPOINTS } from './endpoints';
import { useStore } from '../store';

interface PinValidationResponse {
  success: boolean;
  error?: string;
  sessionTimeout?: number;
  token?: string;
}

interface AuthState {
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  // State management
  setAdmin: (isAdmin: boolean) => void;
  resetError: () => void;
  // Auth actions
  validatePin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<boolean>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      isAdmin: false,
      isLoading: false,
      error: null,

      setAdmin: (isAdmin: boolean) => {
        set({ 
          isAdmin,
          error: null
        });
      },

      resetError: () => set({ error: null }),

      validatePin: async (pin: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<PinValidationResponse>(API_ENDPOINTS.auth.validatePin, { pin });
          
          if (response.success && response.token) {
            // Update session timeout if provided by server
            const newState: Partial<AuthState> = {
              isAdmin: true,
              isLoading: false,
            };
            
            set(newState);
            
            // Store the session token instead of the PIN for admin-protected API calls
            api.admin.setToken(response.token);
            
            return true;
          }
          
          set({ 
            error: response.error || 'Invalid PIN',
            isLoading: false
          });
          return false;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to validate PIN',
            isLoading: false
          });
          return false;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await api.post(API_ENDPOINTS.auth.logout);
        } catch (error) {
          console.error('[Auth] Logout error:', error);
        } finally {
          set({
            isAdmin: false,
            isLoading: false,
            error: null
          });
          
          // Clear the admin token
          api.admin.clearToken();
        }
      },

      changePin: async (currentPin: string, newPin: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<{ success: boolean; error?: string }>(
            API_ENDPOINTS.auth.changePin,
            { currentPin, newPin }
          );

          if (response.success) {
            set({ isLoading: false });
            return true;
          }

          set({ 
            error: response.error || 'Failed to change PIN',
            isLoading: false
          });
          return false;
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to change PIN',
            isLoading: false
          });
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        isAdmin: state.isAdmin,
      }),
    }
  )
);

// Activity tracking middleware
export const withAuth = (
  WrappedComponent: React.ComponentType<any>
): React.FC<any> => {
  const AuthWrappedComponent: React.FC<any> = (props) => {
    useEffect(() => {
      return () => {
      };
    }, []);

    return React.createElement(WrappedComponent, props);
  };

  return AuthWrappedComponent;
};

// Hook for components that need auth state
export const useAuthCheck = () => {
  const { isAdmin, error } = useAuth();
  
  useEffect(() => {
  }, []);

  return { isAdmin, error };
};

// Utility for getting auth headers
export const getAuthHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add CSRF token if available (Flask specific)
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  return headers;
};