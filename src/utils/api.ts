/**
 * A lightweight fetch wrapper that supports additional request options.
 *
 * This file centralizes our HTTP calls and will be used by our frontend code.
 */

// API response types and utilities
import { ApiResponse } from '../types/global';

const API_BASE_URL = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data: ApiResponse<T> = await response.json();
  
  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'An error occurred');
  }
  
  return data.data as T;
}

async function request<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(response.statusText || 'Fetch error');
  }
  return response.json();
}

const api = {
  // GET supports an optional second parameter for extra options (e.g. headers)
  get: <T>(url: string, options?: RequestInit): Promise<T> => {
    return request<T>(url, { method: 'GET', ...options });
  },

  // POST accepts a body and an optional third parameter for extra options
  post: <T>(
    url: string,
    body: any,
    options?: RequestInit
  ): Promise<T> => {
    return request<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Spread any additional headers from options
        ...(options && options.headers ? options.headers : {}),
      },
      body: JSON.stringify(body),
      ...options,
    });
  },

  async put<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse<T>(response);
  },

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
    });
    return handleResponse<T>(response);
  },
};

export { api };