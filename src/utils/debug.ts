/**
 * Global Debug Utility for React + Firebase App
 * 
 * Features:
 * - Enable/disable logging via master toggle
 * - Log levels: info, warn, error
 * - Grouped logs (collapsible)
 * - Throttled logs (prevent spam)
 * - Once-only logs (print once per key)
 * - Optional delay mode for step-by-step debugging
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// Master toggle - set to false to disable ALL debug logs
export const DEBUG_ENABLED = true;

// Enable delay mode for step-by-step debugging (set to 0 to disable)
export const DEBUG_DELAY_MS = 0; // 250ms default when debugging

// Log level filter (only logs at or above this level will be shown)
export type LogLevel = 'info' | 'warn' | 'error';
const DEBUG_LEVEL: LogLevel = 'info'; // 'info' shows all, 'warn' shows warn+error, 'error' shows only errors

// Component filters - set to true to enable logs for specific components
export const DEBUG_FILTERS = {
  ChapterTracker: true,
  IslandRaidBattle: true,
  BattleEngine: true,
  InSessionNotification: true,
  BattleContext: true,
  SonidoTransmissionModal: true,
  // Add more components as needed
};

// ============================================================================
// INTERNAL STATE
// ============================================================================

// Track once-only logs
const onceLogs = new Set<string>();

// Track throttled logs (key -> last timestamp)
const throttledLogs = new Map<string, number>();

// Track active groups
let activeGroupDepth = 0;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a log level should be shown
 */
function shouldShowLog(level: LogLevel): boolean {
  if (!DEBUG_ENABLED) return false;
  
  const levels: LogLevel[] = ['info', 'warn', 'error'];
  const currentLevelIndex = levels.indexOf(DEBUG_LEVEL);
  const logLevelIndex = levels.indexOf(level);
  
  return logLevelIndex >= currentLevelIndex;
}

/**
 * Check if a component's logs should be shown
 */
function shouldShowComponent(component: string): boolean {
  if (!DEBUG_ENABLED) return false;
  return DEBUG_FILTERS[component as keyof typeof DEBUG_FILTERS] !== false;
}

/**
 * Format log message with component prefix
 */
function formatMessage(component: string, label: string): string {
  return `[${component}] ${label}`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const debug = {
  /**
   * Standard log (always shows if enabled)
   */
  log: (component: string, label: string, data?: any): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('info')) return;
    
    const message = formatMessage(component, label);
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  },

  /**
   * Warning log
   */
  warn: (component: string, label: string, data?: any): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('warn')) return;
    
    const message = formatMessage(component, label);
    if (data !== undefined) {
      console.warn(message, data);
    } else {
      console.warn(message);
    }
  },

  /**
   * Error log
   */
  error: (component: string, label: string, data?: any): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('error')) return;
    
    const message = formatMessage(component, label);
    if (data !== undefined) {
      console.error(message, data);
    } else {
      console.error(message);
    }
  },

  /**
   * Grouped log (collapsible in console)
   */
  group: (component: string, label: string): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('info')) return;
    
    const message = formatMessage(component, label);
    console.group(message);
    activeGroupDepth++;
  },

  /**
   * End a log group
   */
  groupEnd: (): void => {
    if (activeGroupDepth > 0) {
      console.groupEnd();
      activeGroupDepth--;
    }
  },

  /**
   * Collapsed group (starts collapsed)
   */
  groupCollapsed: (component: string, label: string): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('info')) return;
    
    const message = formatMessage(component, label);
    console.groupCollapsed(message);
    activeGroupDepth++;
  },

  /**
   * Log once per key (prevents spam from loops)
   */
  once: (key: string, component: string, label: string, data?: any): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('info')) return;
    if (onceLogs.has(key)) return;
    
    onceLogs.add(key);
    const message = formatMessage(component, label);
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  },

  /**
   * Throttled log (only shows once per time period)
   */
  throttle: (key: string, ms: number, component: string, label: string, data?: any): void => {
    if (!shouldShowComponent(component) || !shouldShowLog('info')) return;
    
    const now = Date.now();
    const lastTime = throttledLogs.get(key) || 0;
    
    if (now - lastTime < ms) {
      return; // Skip this log
    }
    
    throttledLogs.set(key, now);
    const message = formatMessage(component, label);
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  },

  /**
   * Delay for step-by-step debugging
   */
  delay: async (ms: number = DEBUG_DELAY_MS): Promise<void> => {
    if (!DEBUG_ENABLED || ms <= 0) return;
    await new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Clear once-only logs (useful for testing)
   */
  clearOnce: (): void => {
    onceLogs.clear();
  },

  /**
   * Clear throttled logs (useful for testing)
   */
  clearThrottle: (): void => {
    throttledLogs.clear();
  },

  /**
   * Clear all debug state
   */
  clear: (): void => {
    onceLogs.clear();
    throttledLogs.clear();
    // Close any open groups
    while (activeGroupDepth > 0) {
      console.groupEnd();
      activeGroupDepth--;
    }
  },

  /**
   * Pause execution (opens debugger if enabled)
   */
  pause: (component: string, label: string): void => {
    if (!DEBUG_ENABLED) return;
    const message = formatMessage(component, label);
    console.log(`⏸️ ${message} - Pausing execution...`);
    debugger; // This will pause if DevTools is open
  },
};

// ============================================================================
// EXPORT CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick log function (no component name needed)
 */
export const log = (label: string, data?: any) => debug.log('Global', label, data);
export const warn = (label: string, data?: any) => debug.warn('Global', label, data);
export const error = (label: string, data?: any) => debug.error('Global', label, data);

// ============================================================================
// WINDOW EXPOSURE (for console debugging)
// ============================================================================

if (typeof window !== 'undefined') {
  (window as any).debug = debug;
  (window as any).DEBUG_ENABLED = DEBUG_ENABLED;
  (window as any).DEBUG_FILTERS = DEBUG_FILTERS;
  
  // Helper to toggle debug on/off
  (window as any).toggleDebug = (enabled: boolean) => {
    (window as any).DEBUG_ENABLED = enabled;
    console.log(`Debug logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
  };
  
  // Helper to toggle specific component
  (window as any).toggleComponent = (component: string, enabled: boolean) => {
    DEBUG_FILTERS[component as keyof typeof DEBUG_FILTERS] = enabled;
    console.log(`Debug logging for ${component} ${enabled ? 'ENABLED' : 'DISABLED'}`);
  };
}






