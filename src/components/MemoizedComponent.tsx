import React, { memo, ComponentType, ReactNode } from 'react';

/**
 * Higher-order component that wraps a component with React.memo
 * and provides performance optimization utilities
 */
export function withMemo<P extends object>(
  Component: ComponentType<P>,
  displayName?: string,
  areEqual?: (prevProps: P, nextProps: P) => boolean
) {
  const MemoizedComponent = memo(Component, areEqual);
  
  if (displayName) {
    MemoizedComponent.displayName = displayName;
  }
  
  return MemoizedComponent;
}

/**
 * Hook for debouncing values to prevent excessive re-renders
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

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
 * Hook for throttling values to limit update frequency
 */
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = React.useState<T>(value);
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
 * Hook for managing loading states with automatic timeout
 */
export function useLoadingState(initialState: boolean = false, timeout: number = 10000) {
  const [isLoading, setIsLoading] = React.useState(initialState);
  const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  const startLoading = React.useCallback(() => {
    setIsLoading(true);
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
    }, timeout);
  }, [timeout]);

  const stopLoading = React.useCallback(() => {
    setIsLoading(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isLoading, startLoading, stopLoading };
}

/**
 * Hook for managing intersection observer for lazy loading
 */
export function useIntersectionObserver(
  elementRef: React.RefObject<Element | null>,
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  const [hasIntersected, setHasIntersected] = React.useState(false);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        if (entry.isIntersecting && !hasIntersected) {
          setHasIntersected(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [elementRef, hasIntersected, options]);

  return { isIntersecting, hasIntersected };
}

/**
 * Hook for managing virtual scrolling
 */
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = React.useState(0);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1).map((item, index) => ({
    item,
    index: startIndex + index,
  }));

  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    setScrollTop,
  };
}

/**
 * Component for lazy loading images
 */
export const LazyImage = memo<{
  src: string;
  alt: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
}>(({ src, alt, placeholder, className, style, onLoad, onError }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const { hasIntersected } = useIntersectionObserver(imgRef);

  React.useEffect(() => {
    if (hasIntersected && !isLoaded && !hasError) {
      const img = new Image();
      img.onload = () => {
        setIsLoaded(true);
        onLoad?.();
      };
      img.onerror = () => {
        setHasError(true);
        onError?.();
      };
      img.src = src;
    }
  }, [hasIntersected, src, isLoaded, hasError, onLoad, onError]);

  return (
    <div ref={imgRef} className={className} style={style}>
      {hasIntersected && (
        <>
          {!isLoaded && !hasError && placeholder && (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
              }}
            >
              {placeholder}
            </div>
          )}
          {isLoaded && (
            <img
              src={src}
              alt={alt}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {hasError && (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
              }}
            >
              Failed to load image
            </div>
          )}
        </>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

/**
 * Component for lazy loading any content
 */
export const LazyContent = memo<{
  children: ReactNode;
  fallback?: ReactNode;
  threshold?: number;
  rootMargin?: string;
}>(({ children, fallback, threshold = 0.1, rootMargin = '50px' }) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { hasIntersected } = useIntersectionObserver(contentRef, {
    threshold,
    rootMargin,
  });

  return (
    <div ref={contentRef}>
      {hasIntersected ? children : (fallback || <div>Loading...</div>)}
    </div>
  );
});

LazyContent.displayName = 'LazyContent';

/**
 * Hook for optimizing expensive calculations
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return React.useCallback(callback, deps);
}

/**
 * Hook for optimizing expensive values
 */
export function useMemoizedValue<T>(
  factory: () => T,
  deps: React.DependencyList
): T {
  return React.useMemo(factory, deps);
}

/**
 * Component wrapper that prevents unnecessary re-renders
 */
export const OptimizedComponent = memo<{
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}>(({ children, className, style }) => {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
});

OptimizedComponent.displayName = 'OptimizedComponent';
