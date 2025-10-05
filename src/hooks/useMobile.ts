import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for detecting mobile devices and touch capabilities
 */
export function useMobile() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setIsMobile(width <= 768);
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
      setOrientation(width > height ? 'landscape' : 'portrait');
    };

    checkMobile();
    
    const handleResize = () => {
      checkMobile();
    };

    const handleOrientationChange = () => {
      // Delay to ensure orientation change is complete
      setTimeout(checkMobile, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return { isMobile, isTouch, orientation };
}

/**
 * Hook for managing touch interactions
 */
export function useTouch() {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return null;

    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;
    const isUpSwipe = distanceY > minSwipeDistance;
    const isDownSwipe = distanceY < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe || isUpSwipe || isDownSwipe) {
      return {
        direction: isLeftSwipe ? 'left' : isRightSwipe ? 'right' : isUpSwipe ? 'up' : 'down',
        distance: Math.max(Math.abs(distanceX), Math.abs(distanceY)),
      };
    }

    return null;
  }, [touchStart, touchEnd, minSwipeDistance]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    touchStart,
    touchEnd,
  };
}

/**
 * Hook for managing pull-to-refresh functionality
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  threshold: number = 100
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const { onTouchStart, onTouchMove, onTouchEnd } = useTouch();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      onTouchStart(e);
      setIsPulling(true);
    }
  }, [onTouchStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || window.scrollY > 0) return;

    onTouchMove(e);
    
    const touch = e.touches[0];
    const distance = touch.clientY;
    
    if (distance > 0) {
      setPullDistance(Math.min(distance, threshold * 1.5));
    }
  }, [isPulling, onTouchMove, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    const swipeResult = onTouchEnd();
    setIsPulling(false);

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, onTouchEnd, pullDistance, threshold, isRefreshing, onRefresh]);

  return {
    isRefreshing,
    pullDistance,
    isPulling,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    pullProgress: Math.min(pullDistance / threshold, 1),
  };
}

/**
 * Hook for managing haptic feedback
 */
export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  const light = useCallback(() => vibrate(10), [vibrate]);
  const medium = useCallback(() => vibrate(20), [vibrate]);
  const heavy = useCallback(() => vibrate(30), [vibrate]);
  const success = useCallback(() => vibrate([10, 50, 10]), [vibrate]);
  const error = useCallback(() => vibrate([20, 50, 20, 50, 20]), [vibrate]);

  return {
    vibrate,
    light,
    medium,
    heavy,
    success,
    error,
  };
}

/**
 * Hook for managing safe area insets
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    const updateSafeArea = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      
      setSafeArea({
        top: parseInt(computedStyle.getPropertyValue('--safe-area-inset-top') || '0'),
        right: parseInt(computedStyle.getPropertyValue('--safe-area-inset-right') || '0'),
        bottom: parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0'),
        left: parseInt(computedStyle.getPropertyValue('--safe-area-inset-left') || '0'),
      });
    };

    updateSafeArea();
    window.addEventListener('resize', updateSafeArea);
    window.addEventListener('orientationchange', updateSafeArea);

    return () => {
      window.removeEventListener('resize', updateSafeArea);
      window.removeEventListener('orientationchange', updateSafeArea);
    };
  }, []);

  return safeArea;
}

/**
 * Hook for managing viewport height on mobile
 */
export function useViewportHeight() {
  const [height, setHeight] = useState(window.innerHeight);

  useEffect(() => {
    const updateHeight = () => {
      setHeight(window.innerHeight);
    };

    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, []);

  return height;
}

/**
 * Hook for managing keyboard visibility on mobile
 */
export function useKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = window.innerHeight;
      const heightDifference = initialHeight - currentHeight;
      
      setIsKeyboardOpen(heightDifference > 150);
      setKeyboardHeight(Math.max(0, heightDifference));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return { isKeyboardOpen, keyboardHeight };
}

/**
 * Hook for managing device capabilities
 */
export function useDeviceCapabilities() {
  const [capabilities, setCapabilities] = useState({
    hasTouch: false,
    hasHaptic: false,
    hasGeolocation: false,
    hasCamera: false,
    hasMicrophone: false,
    hasNotifications: false,
    hasClipboard: false,
    hasShare: false,
    hasVibration: false,
  });

  useEffect(() => {
    setCapabilities({
      hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      hasHaptic: 'vibrate' in navigator,
      hasGeolocation: 'geolocation' in navigator,
      hasCamera: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      hasMicrophone: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      hasNotifications: 'Notification' in window,
      hasClipboard: 'clipboard' in navigator,
      hasShare: 'share' in navigator,
      hasVibration: 'vibrate' in navigator,
    });
  }, []);

  return capabilities;
}
