import { browser } from 'webextension-polyfill-ts';

// Define log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

// Define log entry interface
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  data?: any;
}

// Storage key for logs
const LOGS_STORAGE_KEY = 'debugLogs';

// Maximum number of logs to keep (to avoid excessive storage usage)
const MAX_LOGS = 1000;

/**
 * Add a log entry
 */
export async function addLog(
  level: LogLevel,
  source: string,
  message: string,
  data?: any
): Promise<void> {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    source,
    message,
    data: data ? sanitizeData(data) : undefined
  };

  try {
    // Get existing logs
    const logs = await getLogs();
    
    // Add the new log
    logs.unshift(entry);
    
    // Trim logs if needed
    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }
    
    // Save logs
    await browser.storage.local.set({ [LOGS_STORAGE_KEY]: logs });
    
    // Also log to console for immediate debugging
    const consoleData = data ? { ...data } : '';
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`[${source}] ${message}`, consoleData);
        break;
      case LogLevel.INFO:
        console.info(`[${source}] ${message}`, consoleData);
        break;
      case LogLevel.WARNING:
        console.warn(`[${source}] ${message}`, consoleData);
        break;
      case LogLevel.ERROR:
        console.error(`[${source}] ${message}`, consoleData);
        break;
    }
  } catch (error) {
    console.error('Failed to save log:', error);
  }
}

/**
 * Sanitize data for storage by handling circular references
 */
function sanitizeData(data: any): any {
  try {
    // First, try to stringify and parse - this will catch most circular references
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    // If that fails, we need to handle it more carefully
    const seen = new WeakSet();
    const sanitized = deepCopy(data, seen);
    return sanitized;
  }
}

/**
 * Deep copy with circular reference handling
 */
function deepCopy(obj: any, seen: WeakSet<any>): any {
  // Null/undefined or primitives
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Avoid circular references
  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  
  // Add this object to seen
  seen.add(obj);
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepCopy(item, seen));
  }
  
  // Handle objects
  const result: Record<string, any> = {};
  
  // Copy object properties
  for (const [key, value] of Object.entries(obj)) {
    // Skip functions
    if (typeof value === 'function') {
      result[key] = '[Function]';
      continue;
    }
    
    // Skip DOM nodes
    if (value instanceof Node) {
      result[key] = `[${value.nodeName}]`;
      continue;
    }
    
    // Recursively copy properties
    try {
      result[key] = deepCopy(value, seen);
    } catch (error: any) {
      result[key] = `[Error copying: ${error.message || String(error)}]`;
    }
  }
  
  return result;
}

/**
 * Get all stored logs
 */
export async function getLogs(): Promise<LogEntry[]> {
  try {
    const result = await browser.storage.local.get(LOGS_STORAGE_KEY);
    return result[LOGS_STORAGE_KEY] || [];
  } catch (error) {
    console.error('Failed to retrieve logs:', error);
    return [];
  }
}

/**
 * Clear all logs
 */
export async function clearLogs(): Promise<void> {
  try {
    await browser.storage.local.remove(LOGS_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear logs:', error);
  }
}

/**
 * Export logs to a file
 */
export function exportLogs(logs: LogEntry[]): string {
  const formattedLogs = logs.map(log => ({
    ...log,
    timestamp: new Date(log.timestamp).toISOString(),
  }));
  
  return JSON.stringify(formattedLogs, null, 2);
}

/**
 * Helper functions for common log types
 */
export const logger = {
  debug: (source: string, message: string, data?: any) => 
    addLog(LogLevel.DEBUG, source, message, data),
  
  info: (source: string, message: string, data?: any) => 
    addLog(LogLevel.INFO, source, message, data),
  
  warning: (source: string, message: string, data?: any) => 
    addLog(LogLevel.WARNING, source, message, data),
  
  error: (source: string, message: string, data?: any) => 
    addLog(LogLevel.ERROR, source, message, data),
    
  network: (source: string, method: string, url: string, request?: any, response?: any) => {
    // Create a network log entry with complete request/response details
    const message = `${method} ${url}`;
    const data = {
      request,
      response,
      status: response?.status || 'unknown',
      success: response?.ok || false
    };
    
    // Use appropriate log level based on response status
    if (!response) {
      addLog(LogLevel.WARNING, source, message, data);
    } else if (response.ok) {
      addLog(LogLevel.INFO, source, message, data);
    } else {
      addLog(LogLevel.ERROR, source, message, data);
    }
  }
}; 