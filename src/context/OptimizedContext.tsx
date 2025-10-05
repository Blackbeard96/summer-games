import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';

/**
 * Higher-order component for creating optimized context providers
 * that prevent unnecessary re-renders
 */
export function createOptimizedContext<T>(
  displayName: string,
  defaultValue?: T
) {
  const Context = createContext<T | undefined>(defaultValue);
  Context.displayName = displayName;

  const Provider = ({ children, value }: { children: ReactNode; value: T }) => {
    const memoizedValue = useMemo(() => value, [JSON.stringify(value)]);
    
    return (
      <Context.Provider value={memoizedValue}>
        {children}
      </Context.Provider>
    );
  };

  const useOptimizedContext = () => {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(`use${displayName} must be used within a ${displayName}Provider`);
    }
    return context;
  };

  return {
    Context,
    Provider,
    useOptimizedContext,
  };
}

/**
 * Hook for creating stable callback references
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps);
}

/**
 * Hook for creating stable object references
 */
export function useStableObject<T extends Record<string, any>>(
  object: T,
  deps: React.DependencyList
): T {
  return useMemo(() => object, deps);
}

/**
 * Hook for creating stable array references
 */
export function useStableArray<T>(
  array: T[],
  deps: React.DependencyList
): T[] {
  return useMemo(() => array, deps);
}

/**
 * Hook for debouncing context values
 */
export function useDebouncedContext<T>(
  value: T,
  delay: number = 300
): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for throttling context values
 */
export function useThrottledContext<T>(
  value: T,
  limit: number = 100
): T {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastRan = React.useRef<number>(Date.now());

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * Hook for memoizing context selectors
 */
export function useContextSelector<T, R>(
  context: React.Context<T>,
  selector: (value: T) => R
): R {
  const value = useContext(context);
  return useMemo(() => selector(value), [value, selector]);
}

/**
 * Hook for creating context with reducer pattern
 */
export function useOptimizedReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S
) {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const stableDispatch = useCallback(dispatch, []);

  return [state, stableDispatch] as const;
}

/**
 * Hook for creating context with async state management
 */
export function useAsyncContext<T>(
  asyncFunction: () => Promise<T>,
  deps: React.DependencyList = []
) {
  const [state, setState] = React.useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const data = await asyncFunction();
        
        if (!isCancelled) {
          setState({ data, loading: false, error: null });
        }
      } catch (error) {
        if (!isCancelled) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error : new Error('Unknown error'),
          }));
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, deps);

  return state;
}

/**
 * Hook for creating context with local storage persistence
 */
export function usePersistedContext<T>(
  key: string,
  defaultValue: T,
  options: {
    serialize?: (value: T) => string;
    deserialize?: (value: string) => T;
  } = {}
) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options;

  const [value, setValue] = React.useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? deserialize(item) : defaultValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  const setPersistedValue = useCallback(
    (newValue: T | ((prevValue: T) => T)) => {
      try {
        const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
        setValue(valueToStore);
        window.localStorage.setItem(key, serialize(valueToStore));
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, serialize, value]
  );

  return [value, setPersistedValue] as const;
}

/**
 * Hook for creating context with session storage persistence
 */
export function useSessionContext<T>(
  key: string,
  defaultValue: T,
  options: {
    serialize?: (value: T) => string;
    deserialize?: (value: string) => T;
  } = {}
) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options;

  const [value, setValue] = React.useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? deserialize(item) : defaultValue;
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  const setSessionValue = useCallback(
    (newValue: T | ((prevValue: T) => T)) => {
      try {
        const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
        setValue(valueToStore);
        window.sessionStorage.setItem(key, serialize(valueToStore));
      } catch (error) {
        console.warn(`Error setting sessionStorage key "${key}":`, error);
      }
    },
    [key, serialize, value]
  );

  return [value, setSessionValue] as const;
}

/**
 * Hook for creating context with indexedDB persistence
 */
export function useIndexedDBContext<T>(
  dbName: string,
  storeName: string,
  key: string,
  defaultValue: T
) {
  const [value, setValue] = React.useState<T>(defaultValue);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadFromIndexedDB = async () => {
      try {
        const request = indexedDB.open(dbName, 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            setValue(getRequest.result || defaultValue);
            setIsLoading(false);
          };

          getRequest.onerror = () => {
            setValue(defaultValue);
            setIsLoading(false);
          };
        };

        request.onerror = () => {
          setValue(defaultValue);
          setIsLoading(false);
        };
      } catch (error) {
        console.warn('Error loading from IndexedDB:', error);
        setValue(defaultValue);
        setIsLoading(false);
      }
    };

    loadFromIndexedDB();
  }, [dbName, storeName, key, defaultValue]);

  const setIndexedDBValue = useCallback(
    async (newValue: T | ((prevValue: T) => T)) => {
      try {
        const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
        setValue(valueToStore);

        const request = indexedDB.open(dbName, 1);
        
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          store.put(valueToStore, key);
        };
      } catch (error) {
        console.warn('Error saving to IndexedDB:', error);
      }
    },
    [dbName, storeName, key, value]
  );

  return [value, setIndexedDBValue, isLoading] as const;
}

/**
 * Hook for creating context with WebSocket connection
 */
export function useWebSocketContext<T>(
  url: string,
  options: {
    onMessage?: (data: T) => void;
    onError?: (error: Event) => void;
    onOpen?: () => void;
    onClose?: () => void;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
  } = {}
) {
  const [socket, setSocket] = React.useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [reconnectAttempts, setReconnectAttempts] = React.useState(0);

  const {
    onMessage,
    onError,
    onOpen,
    onClose,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        setReconnectAttempts(0);
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as T;
          onMessage?.(data);
        } catch (error) {
          console.warn('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        onError?.(error);
      };

      ws.onclose = () => {
        setIsConnected(false);
        onClose?.();

        if (reconnectAttempts < maxReconnectAttempts) {
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, reconnectInterval);
        }
      };

      setSocket(ws);
    } catch (error) {
      console.warn('Error creating WebSocket connection:', error);
    }
  }, [url, onMessage, onError, onOpen, onClose, reconnectInterval, maxReconnectAttempts, reconnectAttempts]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.close();
      setSocket(null);
    }
  }, [socket]);

  const sendMessage = useCallback(
    (message: any) => {
      if (socket && isConnected) {
        socket.send(JSON.stringify(message));
      }
    },
    [socket, isConnected]
  );

  React.useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    socket,
    isConnected,
    reconnectAttempts,
    connect,
    disconnect,
    sendMessage,
  };
}
