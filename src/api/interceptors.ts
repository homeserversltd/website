import { useAuth } from './auth';
import { useToast } from '../hooks/useToast';
import { socketClient } from '../components/WebSocket/client';
import { useStore } from '../store';
import { fallbackManager } from '../utils/fallbackManager';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Global handlers that can be set by components
let globalErrorHandler: ((error: ApiError) => void) | null = null;
let globalAuthHandler: (() => void) | null = null;

export const setApiErrorHandlers = (
  errorHandler: (error: ApiError) => void,
  authHandler: () => void
) => {
  globalErrorHandler = errorHandler;
  globalAuthHandler = authHandler;
};

export const requestInterceptor = async (request: Request): Promise<Request> => {
  // Add CSRF token if available
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (csrfToken) {
    request.headers.set('X-CSRFToken', csrfToken);
  }

  // Add auth token if available
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    request.headers.set('Authorization', `Bearer ${authToken}`);
  }

  // Add admin token if available for admin-protected endpoints
  const adminToken = localStorage.getItem('adminToken');
  if (adminToken) {
    request.headers.set('X-Admin-Token', adminToken);
  }

  // Add WebSocket connection ID if connected
  const { status, activeSubscriptions } = useStore.getState();
  if (status === 'connected' && activeSubscriptions.size > 0) {
    request.headers.set('X-WebSocket-ID', Array.from(activeSubscriptions).join(','));
  }

  return request;
};

export const responseInterceptor = async (response: Response): Promise<Response> => {
  // Handle WebSocket upgrade headers
  const upgradeHeader = response.headers.get('Upgrade-WebSocket');
  const { status, connect } = useStore.getState();
  if (upgradeHeader === 'true' && status === 'disconnected') {
    await connect();
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    let errorMessage: string;
    let errorDetails: string | undefined;

    try {
      if (contentType?.includes('application/json')) {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || 'Unknown error occurred';
        errorDetails = errorData.details;

        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          if (globalAuthHandler) {
            globalAuthHandler();
          }
          // Disconnect WebSocket on auth errors
          const { disconnect } = useStore.getState();
          disconnect();
        }
      } else {
        errorMessage = await response.text();
      }
    } catch (e) {
      errorMessage = 'Failed to parse error response';
    }

    const error = new ApiError(response.status, errorMessage, errorDetails);
    
    // Check for specific error conditions that should trigger fallback mode
    if (shouldTriggerFallback(response.status, errorMessage, errorDetails, response.url)) {
      console.warn(`[API Interceptor] Triggering fallback mode due to 405 error on updates/apply route`);
      if (!fallbackManager.isActive()) {
        fallbackManager.activateFallback('updates_apply_405_error');
      }
    }
    
    // Call global error handler if available
    if (globalErrorHandler) {
      globalErrorHandler(error);
    }

    throw error;
  }

  return response;
};

export const isOfflineApiError = (error: any): error is ApiError => {
  return error instanceof ApiError && error.status === 0 && error.message === 'Offline';
};

/**
 * Determines if an API error should trigger fallback mode
 * Only triggers for 405 errors on the specific updates/apply route
 */
const shouldTriggerFallback = (status: number, message: string, details?: string, url?: string): boolean => {
  // Only trigger fallback for 405 errors on the specific updates/apply route
  if (status === 405 && url && url.includes('/api/admin/updates/apply')) {
    return true;
  }
  
  return false;
}; 