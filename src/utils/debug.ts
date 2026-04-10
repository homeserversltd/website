/**
 * debug.ts
 * 
 * Centralized debug logging utility that integrates with CLIENT_DEBUG_MODE
 * Provides configurable debug levels and consistent logging patterns
 */

// Import config to access CLIENT_DEBUG_MODE
// Note: This will need to be imported from your config system
// For now, we'll use a dynamic approach that can be configured

interface DebugConfig {
  clientDebugMode: boolean;
  verboseDebug: boolean;
  logPrefix: string;
}

interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
  VERBOSE: 'verbose';
}

interface DebugContext {
  [key: string]: any;
}

interface DebugOptions {
  level?: keyof LogLevel;
  context?: DebugContext;
  timestamp?: boolean;
  component?: string;
}

// Default configuration
let debugConfig: DebugConfig = {
  clientDebugMode: false,
  verboseDebug: false,
  logPrefix: '[DEBUG]'
};

// Log levels for filtering
const LOG_LEVELS: LogLevel = {
  DEBUG: 'debug',
  INFO: 'info', 
  WARN: 'warn',
  ERROR: 'error',
  VERBOSE: 'verbose'
};

type WindowClientDebug = Window & {
  CLIENT_DEBUG_MODE?: boolean;
  CLIENT_VERBOSE_DEBUG?: boolean;
};

/**
 * Read inject client debug switches from the browser window (operator sets before load or in DevTools).
 * Premium tabs MUST NOT force debug on; they apply this together with a tab-local log prefix when mounted.
 */
export const readClientDebugFlagsFromWindow = (): Pick<DebugConfig, 'clientDebugMode' | 'verboseDebug'> => {
  if (typeof window === 'undefined') {
    return { clientDebugMode: false, verboseDebug: false };
  }
  const w = window as WindowClientDebug;
  return {
    clientDebugMode: Boolean(w.CLIENT_DEBUG_MODE),
    verboseDebug: Boolean(w.CLIENT_VERBOSE_DEBUG),
  };
};

/**
 * Initialize debug configuration
 * This should be called early in the application lifecycle
 */
export const initializeDebug = (
  config: Partial<DebugConfig> = {},
  options?: { skipAnnounce?: boolean }
): void => {
  // Check for CLIENT_DEBUG environment variable
  debugConfig = {
    clientDebugMode: config.clientDebugMode ?? false,
    verboseDebug: config.verboseDebug ?? false,
    logPrefix: config.logPrefix ?? '[DEBUG]'
  };

  if (options?.skipAnnounce) {
    return;
  }
  if (debugConfig.clientDebugMode) {
    console.log(`${debugConfig.logPrefix} Debug mode initialized`);
  }
};

/**
 * Check if debug mode is enabled
 */
export const isDebugEnabled = (): boolean => {
  return debugConfig.clientDebugMode;
};

/**
 * Check if verbose debug is enabled
 */
export const isVerboseDebugEnabled = (): boolean => {
  return debugConfig.clientDebugMode && debugConfig.verboseDebug;
};

/**
 * Core debug logging function
 */
const debugLog = (
  level: keyof LogLevel,
  message: string,
  data?: any,
  options: DebugOptions = {}
): void => {
  // Always log errors regardless of debug mode
  if (level === 'ERROR') {
    const errLine = `${debugConfig.logPrefix} [ERROR] ${message}`;
    if (data !== undefined) {
      console.error(errLine, data);
    } else {
      console.error(errLine);
    }
    return;
  }

  // Check if debug mode is enabled
  if (!debugConfig.clientDebugMode) {
    return;
  }

  // Check verbose level
  if (level === 'VERBOSE' && !debugConfig.verboseDebug) {
    return;
  }

  // Build log message
  let logMessage = `${debugConfig.logPrefix}`;
  
  if (options.component) {
    logMessage += ` [${options.component}]`;
  }
  
  logMessage += ` [${level.toUpperCase()}] ${message}`;

  // Add timestamp if requested
  if (options.timestamp) {
    const timestamp = new Date().toISOString();
    logMessage = `[${timestamp}] ${logMessage}`;
  }

  // Add context if provided
  if (options.context) {
    logMessage += ` | Context: ${JSON.stringify(options.context)}`;
  }

  // Omit second console argument when no payload: passing `undefined` prints a stray "undefined" in DevTools.
  const emit = (fn: (m: string, ...rest: unknown[]) => void): void => {
    if (data !== undefined) {
      fn(logMessage, data);
    } else {
      fn(logMessage);
    }
  };

  switch (level) {
    case 'DEBUG':
      emit(console.debug.bind(console));
      break;
    case 'INFO':
      emit(console.info.bind(console));
      break;
    case 'WARN':
      emit(console.warn.bind(console));
      break;
    case 'VERBOSE':
      emit(console.debug.bind(console));
      break;
    default:
      emit(console.log.bind(console));
  }
};

/**
 * Debug logging functions
 */
export const debug = (message: string, data?: any, options?: DebugOptions): void => {
  debugLog('DEBUG', message, data, options);
};

export const info = (message: string, data?: any, options?: DebugOptions): void => {
  debugLog('INFO', message, data, options);
};

export const warn = (message: string, data?: any, options?: DebugOptions): void => {
  debugLog('WARN', message, data, options);
};

export const error = (message: string, error?: any, options?: DebugOptions): void => {
  debugLog('ERROR', message, error, options);
};

export const verbose = (message: string, data?: any, options?: DebugOptions): void => {
  debugLog('VERBOSE', message, data, options);
};

/**
 * Component-specific debug logger
 */
export const createComponentLogger = (componentName: string) => {
  return {
    debug: (message: string, data?: any, options?: DebugOptions) => 
      debug(message, data, { ...options, component: componentName }),
    info: (message: string, data?: any, options?: DebugOptions) => 
      info(message, data, { ...options, component: componentName }),
    warn: (message: string, data?: any, options?: DebugOptions) => 
      warn(message, data, { ...options, component: componentName }),
    error: (message: string, err?: any, options?: DebugOptions) => 
      error(message, err, { ...options, component: componentName }),
    verbose: (message: string, data?: any, options?: DebugOptions) => 
      verbose(message, data, { ...options, component: componentName })
  };
};

/**
 * Performance debugging utilities
 */
export const debugPerformance = {
  /**
   * Time a function execution
   */
  time: <T>(label: string, fn: () => T): T => {
    if (!debugConfig.clientDebugMode) {
      return fn();
    }
    
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    debug(`${label} took ${(end - start).toFixed(2)}ms`);
    return result;
  },

  /**
   * Time an async function execution
   */
  timeAsync: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!debugConfig.clientDebugMode) {
      return fn();
    }
    
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    
    debug(`${label} took ${(end - start).toFixed(2)}ms`);
    return result;
  },

  /**
   * Measure memory usage
   */
  memory: (label = 'Memory Usage'): void => {
    if (!debugConfig.clientDebugMode) {
      return;
    }
    
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      debug(`${label}:`, {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
      });
    }
  }
};

/**
 * State debugging utilities
 */
export const debugState = {
  /**
   * Log state changes with before/after comparison
   */
  stateChange: (component: string, property: string, oldValue: any, newValue: any): void => {
    if (!debugConfig.clientDebugMode) {
      return;
    }
    
    debug(`State change in ${component}:`, {
      property,
      oldValue,
      newValue,
      changed: oldValue !== newValue
    }, { component });
  },

  /**
   * Log object differences
   */
  objectDiff: (label: string, oldObj: any, newObj: any): void => {
    if (!debugConfig.clientDebugMode) {
      return;
    }
    
    const changes: any = {};
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
    
    allKeys.forEach(key => {
      if (oldObj?.[key] !== newObj?.[key]) {
        changes[key] = {
          old: oldObj?.[key],
          new: newObj?.[key]
        };
      }
    });
    
    if (Object.keys(changes).length > 0) {
      debug(`${label} changes:`, changes);
    }
  }
};

/**
 * Network debugging utilities
 */
export const debugNetwork = {
  /**
   * Log API requests
   */
  request: (method: string, url: string, data?: any): void => {
    if (!debugConfig.clientDebugMode) {
      return;
    }
    
    debug(`API Request: ${method} ${url}`, data, { component: 'Network' });
  },

  /**
   * Log API responses
   */
  response: (method: string, url: string, status: number, data?: any): void => {
    if (!debugConfig.clientDebugMode) {
      return;
    }
    
    const level = status >= 400 ? 'WARN' : 'DEBUG';
    debugLog(level as keyof LogLevel, `API Response: ${method} ${url} (${status})`, data, { component: 'Network' });
  },

  /**
   * Log WebSocket events
   */
  websocket: (event: string, data?: any): void => {
    if (!debugConfig.clientDebugMode) {
      return;
    }
    
    debug(`WebSocket: ${event}`, data, { component: 'WebSocket' });
  }
};

/**
 * Utility to sanitize sensitive data for logging
 */
export const sanitizeForLogging = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'pin', 'auth'];
  const sanitized = { ...data };

  Object.keys(sanitized).forEach(key => {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  });

  return sanitized;
};

/**
 * Conditional logging - only log if condition is true
 */
export const debugIf = (condition: boolean, message: string, data?: any, options?: DebugOptions): void => {
  if (condition && debugConfig.clientDebugMode) {
    debug(message, data, options);
  }
};

/**
 * Group related debug messages
 */
export const debugGroup = (label: string, fn: () => void): void => {
  if (!debugConfig.clientDebugMode) {
    fn();
    return;
  }
  
  console.group(`${debugConfig.logPrefix} ${label}`);
  fn();
  console.groupEnd();
};

/**
 * Group related debug messages (collapsed)
 */
export const debugGroupCollapsed = (label: string, fn: () => void): void => {
  if (!debugConfig.clientDebugMode) {
    fn();
    return;
  }
  
  console.groupCollapsed(`${debugConfig.logPrefix} ${label}`);
  fn();
  console.groupEnd();
};

// Auto-initialize with environment check
if (typeof window !== 'undefined') {
  const w = window as WindowClientDebug;
  if (w.CLIENT_DEBUG_MODE !== undefined) {
    initializeDebug({ ...readClientDebugFlagsFromWindow() });
  }
}

// Export default debug function for convenience
export default debug; 