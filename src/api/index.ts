export { api } from './client';
export type { IApiClient } from './client';
export { API_ENDPOINTS } from './endpoints';
export { 
  ApiError,
  setApiErrorHandlers,
  requestInterceptor,
  responseInterceptor,
} from './interceptors';
export type { ApiResponse } from './interceptors';

// Re-export WebSocket types for convenience
export type {
  WebSocketEventMap,
  WebSocketStatus,
  WebSocketStore,
  SystemStats,
  ServiceStatus,
  UploadProgress,
} from '../components/WebSocket/types';