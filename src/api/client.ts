import { API_ENDPOINTS } from './endpoints';
import { requestInterceptor, responseInterceptor, ApiResponse, ApiError } from './interceptors';
import { socketClient } from '../components/WebSocket/client';
import { WebSocketEventMap } from '../components/WebSocket/types';
import { useStore } from '../store';
import { debug, warn, error } from '../utils/debug';

// Export the interface
export interface IApiClient {
  get<T>(endpoint: string): Promise<T>;
  post<T>(endpoint: string, data?: any): Promise<T>;
  put<T>(endpoint: string, data: any): Promise<T>;
  delete<T>(endpoint: string): Promise<T>;
  uploadFile(file: File, path: string): Promise<void>;
  getText(endpoint: string): Promise<string>;
  // WebSocket methods
  ws: {
    connect(): Promise<void>;
    disconnect(): void;
    getStatus(): 'connected' | 'disconnected';
    on<T extends keyof WebSocketEventMap>(
      event: T,
      callback: (data: WebSocketEventMap[T]) => void
    ): void;
    off<T extends keyof WebSocketEventMap>(
      event: T,
      callback: (data: WebSocketEventMap[T]) => void
    ): void;
    emit<T extends keyof WebSocketEventMap>(
      event: T,
      data?: WebSocketEventMap[T]
    ): void;
    isAuthenticated(): boolean;
  };
  admin: {
    setToken: (token: string) => void;
    clearToken: () => void;
    getToken: () => string | null;
  };
}

class ApiClient implements IApiClient {
  private baseUrl = '/api';
  public ws = {
    connect: socketClient.connect,
    disconnect: socketClient.disconnect,
    getStatus: socketClient.getStatus,
    on: socketClient.on,
    off: socketClient.off,
    emit: socketClient.emit,
    isAuthenticated: socketClient.isAuthenticated,
  };

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const fullUrl = endpoint.startsWith('http') ? endpoint : this.baseUrl + endpoint;

      // Check if fallback mode is active
      const { isFallbackActive, fallbackReason } = useStore.getState();
      if (isFallbackActive) {
        const errorMessage = `[API Client] Request to ${fullUrl} cancelled: Fallback mode is active (Reason: ${fallbackReason || 'Unknown'}).`;
        warn(errorMessage);
        // Using a custom status code like 0 or a specific string might be better if the consumer needs to distinguish this.
        // For now, using a common pattern for client-side abort/cancellation.
        throw new ApiError(0, 'Offline', errorMessage); 
      }

      // debug('[API Client] Making request to:', fullUrl, {
      //   method: options.method,
      //   headers: options.headers,
      // });
      
      // Apply request interceptor
      const request = await requestInterceptor(new Request(fullUrl, options));
      
      // Make the request
      const response = await fetch(request);
      // debug('[API Client] Response status:', response.status);
      
      // Apply response interceptor
      const interceptedResponse = await responseInterceptor(response);
      
      // Handle different response types
      const contentType = interceptedResponse.headers.get('content-type');
      // debug('[API Client] Response content-type:', contentType);
      
      if (contentType?.includes('application/json')) {
        const responseText = await interceptedResponse.text();
        // debug('[API Client] Raw response text:', responseText);
        
        try {
          const data = JSON.parse(responseText);
          // debug('[API Client] Parsed JSON data:', data);
          return data as T;
        } catch (parseError) {
          error('[API Client] JSON parse error:', parseError);
          error('[API Client] Failed to parse response:', responseText);
          throw new ApiError(500, 'Invalid JSON response', responseText);
        }
      } else if (contentType?.includes('text/')) {
        const text = await interceptedResponse.text();
        // debug('[API Client] Text response:', text);
        return text as unknown as T;
      } else {
        const blob = await interceptedResponse.blob();
        // debug('[API Client] Blob response size:', blob.size);
        return blob as unknown as T;
      }
    } catch (requestError) {
      error('[API Client] Request failed:', requestError);
      if (requestError instanceof ApiError) {
        throw requestError;
      }
      throw new ApiError(
        500,
        'Request failed',
        requestError instanceof Error ? requestError.message : 'Unknown error'
      );
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
      credentials: 'same-origin',
    });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  }

  async uploadFile(file: File, path: string): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    await this.request(API_ENDPOINTS.files.upload, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });
  }

  async getText(endpoint: string): Promise<string> {
    return this.request<string>(endpoint, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'text/plain',
      },
    });
  }

  // Add admin token management
  admin = {
    setToken: (token: string) => {
      localStorage.setItem('adminToken', token);
    },
    clearToken: () => {
      localStorage.removeItem('adminToken');
    },
    getToken: () => {
      return localStorage.getItem('adminToken');
    }
  };
}

// Create and export singleton instance with proper typing
export const api: IApiClient = new ApiClient();

// Export utility function for response handling
export async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, `API Error ${response.status}`, text);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      return await response.json();
    } catch (e) {
      throw new ApiError(500, 'Invalid JSON response', await response.text());
    }
  }
  
  return response.text() as unknown as T;
}