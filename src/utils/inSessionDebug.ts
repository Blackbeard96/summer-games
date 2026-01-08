/**
 * Debug utility for In Session mode
 * Toggle via REACT_APP_DEBUG_SESSION environment variable
 */

const DEBUG_ENABLED = process.env.REACT_APP_DEBUG_SESSION === 'true';

interface LogThrottle {
  lastLog: number;
  count: number;
}

const throttleMap = new Map<string, LogThrottle>();

/**
 * Debug log (only if DEBUG_ENABLED is true)
 */
export function debug(component: string, message: string, data?: any): void {
  if (!DEBUG_ENABLED) return;
  
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${component}] ${message}`, data || '');
}

/**
 * Debug error (always logs, but with [InSession] prefix)
 */
export function debugError(component: string, message: string, error?: any): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${component}] ERROR: ${message}`, error || '');
}

/**
 * Throttled log (only logs once per interval)
 */
export function debugThrottle(
  key: string,
  intervalMs: number,
  component: string,
  message: string,
  data?: any
): void {
  if (!DEBUG_ENABLED) return;
  
  const now = Date.now();
  const throttle = throttleMap.get(key);
  
  if (!throttle || (now - throttle.lastLog) >= intervalMs) {
    const count = throttle?.count || 0;
    if (count > 0) {
      debug(component, `${message} (${count} suppressed)`, data);
    } else {
      debug(component, message, data);
    }
    throttleMap.set(key, { lastLog: now, count: 0 });
  } else {
    throttle.count++;
  }
}

/**
 * Log once (only logs the first time)
 */
const onceSet = new Set<string>();

export function debugOnce(
  key: string,
  component: string,
  message: string,
  data?: any
): void {
  if (!DEBUG_ENABLED) return;
  if (onceSet.has(key)) return;
  
  onceSet.add(key);
  debug(component, message, data);
}

/**
 * Group logs together
 */
export function debugGroup(component: string, label: string): void {
  if (!DEBUG_ENABLED) return;
  console.group(`[${component}] ${label}`);
}

export function debugGroupEnd(): void {
  if (!DEBUG_ENABLED) return;
  console.groupEnd();
}

/**
 * Clear throttle cache (useful for testing)
 */
export function clearThrottleCache(): void {
  throttleMap.clear();
  onceSet.clear();
}




