// TypeScript types for the test premium tab

export interface TestService {
  id: string;
  name: string;
  url?: string;
  description: string;
  status: 'active' | 'inactive' | 'pending' | 'error';
  version?: string;
  lastUpdated?: string;
  capabilities?: string[];
  dataType?: 'random' | 'users' | 'products' | 'transactions' | 'timeseries';
  settings?: Record<string, any>;
}

export interface TestData {
  success: boolean;
  data: any[];
  count: number;
  type: string;
  generated_at: string;
  error?: string;
}

export interface AnalyticsResult {
  success: boolean;
  results?: {
    row_count: number;
    column_count: number;
    columns: string[];
    data_types: Record<string, string>;
    memory_usage: number;
    null_counts: Record<string, number>;
    numeric_analysis?: Record<string, any>;
    string_analysis?: Record<string, any>;
    date_analysis?: Record<string, any>;
    correlations?: Record<string, any>;
    processing_metadata: {
      processed_at: string;
      processor_instance_count: number;
    };
  };
  processed_at?: string;
  error?: string;
}

export interface ExternalDataResponse {
  success: boolean;
  data?: any;
  status_code?: number;
  fetched_at?: string;
  error?: string;
}

export interface TestConfig {
  tab_name: string;
  display_name: string;
  description: string;
  version: string;
  capabilities: {
    data_processing: boolean;
    analytics: boolean;
    external_api: boolean;
    real_time_updates: boolean;
  };
  settings: {
    max_data_points: number;
    cache_duration: number;
    enable_logging: boolean;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  dependencies?: {
    pandas: boolean;
    numpy: boolean;
    httpx: boolean;
  };
  test_results?: {
    numpy_array_length: number;
    pandas_dataframe_shape: [number, number];
  };
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

// Hook return types
export interface UseTestControlsReturn {
  generateData: (type: string, count: number) => Promise<TestData>;
  analyzeData: (dataset: any[]) => Promise<AnalyticsResult>;
  fetchExternalData: (url: string) => Promise<ExternalDataResponse>;
  getConfig: () => Promise<TestConfig>;
  checkHealth: () => Promise<HealthStatus>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
} 