/**
 * Performance optimization utilities
 */

// Production mode check
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Conditional console logging - disabled in production
 */
export const perfLog = {
  log: (...args: any[]) => {
    if (!isProduction) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (!isProduction) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  },
  debug: (...args: any[]) => {
    if (!isProduction && process.env.REACT_APP_DEBUG === 'true') {
      console.debug(...args);
    }
  }
};

/**
 * Debounce function to limit how often a function can be called
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit function execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Batch state updates to prevent multiple re-renders
 */
export function batchStateUpdates<T>(
  updates: Array<() => void>
): void {
  // React 18+ automatically batches, but this ensures compatibility
  updates.forEach(update => update());
}

/**
 * Memoize expensive calculations
 */
export function memoize<Args extends any[], Return>(
  fn: (...args: Args) => Return,
  keyFn?: (...args: Args) => string
): (...args: Args) => Return {
  const cache = new Map<string, Return>();
  
  return (...args: Args): Return => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    
    // Limit cache size to prevent memory leaks
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    return result;
  };
}

/**
 * Cleanup helper for timers
 */
export class TimerManager {
  private timers: Set<NodeJS.Timeout> = new Set();
  
  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }
  
  setInterval(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setInterval(callback, delay);
    this.timers.add(timer);
    return timer;
  }
  
  clearAll(): void {
    this.timers.forEach(timer => {
      clearTimeout(timer);
      clearInterval(timer);
    });
    this.timers.clear();
  }
  
  clear(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    clearInterval(timer);
    this.timers.delete(timer);
  }
}

/**
 * Firestore listener manager to prevent memory leaks
 */
export class FirestoreListenerManager {
  private listeners: Map<string, () => void> = new Map();
  
  add(id: string, unsubscribe: () => void): void {
    // Clean up existing listener if present
    if (this.listeners.has(id)) {
      this.listeners.get(id)!();
    }
    this.listeners.set(id, unsubscribe);
  }
  
  remove(id: string): void {
    const unsubscribe = this.listeners.get(id);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(id);
    }
  }
  
  clearAll(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
  
  has(id: string): boolean {
    return this.listeners.has(id);
  }
}







