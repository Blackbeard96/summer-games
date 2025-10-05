import React, { useEffect, useRef, useState } from 'react';

/**
 * Hook for managing focus trap within a component
 */
export function useFocusTrap(isActive: boolean = true) {
  const containerRef = useRef<HTMLElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    // Store the previously focused element
    previousActiveElement.current = document.activeElement;

    // Focus the first element
    if (firstElement) {
      firstElement.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the previously focused element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Hook for managing ARIA live regions for screen readers
 */
export function useAriaLive() {
  const [message, setMessage] = useState('');
  const [politeness, setPoliteness] = useState<'polite' | 'assertive'>('polite');

  const announce = (text: string, level: 'polite' | 'assertive' = 'polite') => {
    setPoliteness(level);
    setMessage(text);
    
    // Clear the message after a short delay to allow for new announcements
    setTimeout(() => setMessage(''), 1000);
  };

  return { message, politeness, announce };
}

/**
 * Hook for managing keyboard navigation
 */
export function useKeyboardNavigation(
  items: any[],
  onSelect: (item: any, index: number) => void,
  options: {
    orientation?: 'horizontal' | 'vertical';
    loop?: boolean;
    disabled?: boolean;
  } = {}
) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const { orientation = 'horizontal', loop = true, disabled = false } = options;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled || items.length === 0) return;

    const isHorizontal = orientation === 'horizontal';
    const isVertical = orientation === 'vertical';

    switch (e.key) {
      case isHorizontal ? 'ArrowLeft' : 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          if (prev <= 0) {
            return loop ? items.length - 1 : 0;
          }
          return prev - 1;
        });
        break;

      case isHorizontal ? 'ArrowRight' : 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          if (prev >= items.length - 1) {
            return loop ? 0 : items.length - 1;
          }
          return prev + 1;
        });
        break;

      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          onSelect(items[focusedIndex], focusedIndex);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setFocusedIndex(-1);
        break;
    }
  };

  useEffect(() => {
    if (disabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled, items.length, focusedIndex, orientation, loop]);

  return {
    focusedIndex,
    setFocusedIndex,
    isFocused: (index: number) => index === focusedIndex,
  };
}

/**
 * Hook for managing skip links
 */
export function useSkipLinks() {
  const [skipLinks, setSkipLinks] = useState<Array<{ id: string; label: string; target: string }>>([]);

  const addSkipLink = (id: string, label: string, target: string) => {
    setSkipLinks(prev => {
      const existing = prev.find(link => link.id === id);
      if (existing) {
        return prev.map(link => link.id === id ? { id, label, target } : link);
      }
      return [...prev, { id, label, target }];
    });
  };

  const removeSkipLink = (id: string) => {
    setSkipLinks(prev => prev.filter(link => link.id !== id));
  };

  const handleSkipTo = (target: string) => {
    const element = document.getElementById(target);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return {
    skipLinks,
    addSkipLink,
    removeSkipLink,
    handleSkipTo,
  };
}

/**
 * Utility for generating accessible IDs
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Utility for managing ARIA attributes
 */
export const ariaUtils = {
  /**
   * Generate ARIA attributes for a button
   */
  button: (options: {
    pressed?: boolean;
    expanded?: boolean;
    controls?: string;
    describedBy?: string;
    label?: string;
  } = {}) => {
    const attrs: Record<string, string | boolean> = {
      role: 'button',
      tabIndex: '0',
    };

    if (options.pressed !== undefined) {
      attrs['aria-pressed'] = options.pressed;
    }

    if (options.expanded !== undefined) {
      attrs['aria-expanded'] = options.expanded;
    }

    if (options.controls) {
      attrs['aria-controls'] = options.controls;
    }

    if (options.describedBy) {
      attrs['aria-describedby'] = options.describedBy;
    }

    if (options.label) {
      attrs['aria-label'] = options.label;
    }

    return attrs;
  },

  /**
   * Generate ARIA attributes for a dialog/modal
   */
  dialog: (options: {
    labelledBy?: string;
    describedBy?: string;
    modal?: boolean;
  } = {}) => {
    const attrs: Record<string, string | boolean> = {
      role: 'dialog',
      'aria-modal': options.modal !== false,
    };

    if (options.labelledBy) {
      attrs['aria-labelledby'] = options.labelledBy;
    }

    if (options.describedBy) {
      attrs['aria-describedby'] = options.describedBy;
    }

    return attrs;
  },

  /**
   * Generate ARIA attributes for a listbox
   */
  listbox: (options: {
    multiSelectable?: boolean;
    required?: boolean;
    labelledBy?: string;
  } = {}) => {
    const attrs: Record<string, string | boolean> = {
      role: 'listbox',
      tabIndex: '0',
    };

    if (options.multiSelectable) {
      attrs['aria-multiselectable'] = options.multiSelectable;
    }

    if (options.required) {
      attrs['aria-required'] = options.required;
    }

    if (options.labelledBy) {
      attrs['aria-labelledby'] = options.labelledBy;
    }

    return attrs;
  },

  /**
   * Generate ARIA attributes for a progress bar
   */
  progress: (options: {
    value: number;
    min?: number;
    max?: number;
    labelledBy?: string;
  }) => {
    const attrs: Record<string, string | number> = {
      role: 'progressbar',
      'aria-valuenow': options.value,
      'aria-valuemin': options.min || 0,
      'aria-valuemax': options.max || 100,
    };

    if (options.labelledBy) {
      attrs['aria-labelledby'] = options.labelledBy;
    }

    return attrs;
  },
};

/**
 * Utility for managing color contrast
 */
export function getContrastRatio(color1: string, color2: string): number {
  // Simple contrast ratio calculation
  // In a real app, you'd want a more robust implementation
  const getLuminance = (color: string): number => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    // Apply gamma correction
    const [rs, gs, bs] = [r, g, b].map(c => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Utility for checking if colors meet WCAG contrast requirements
 */
export function meetsContrastRequirements(
  foreground: string, 
  background: string, 
  level: 'AA' | 'AAA' = 'AA'
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Hook for managing reduced motion preferences
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook for managing high contrast preferences
 */
export function useHighContrast(): boolean {
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    setPrefersHighContrast(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersHighContrast(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersHighContrast;
}

/**
 * Component for providing skip links
 */
export function SkipLinks({ links }: { links: Array<{ id: string; label: string; target: string }> }) {
  const { handleSkipTo } = useSkipLinks();

  if (links.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '-100px',
        left: '0',
        zIndex: 10000,
      }}
    >
      {links.map(link => (
        <a
          key={link.id}
          href={`#${link.target}`}
          onClick={(e) => {
            e.preventDefault();
            handleSkipTo(link.target);
          }}
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            background: '#000',
            color: '#fff',
            padding: '8px 16px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 'bold',
            borderRadius: '0 0 4px 0',
            transform: 'translateY(-100%)',
            transition: 'transform 0.2s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.transform = 'translateY(-100%)';
          }}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

/**
 * Component for providing ARIA live region
 */
export const AriaLiveRegion = ({ 
  message, 
  politeness = 'polite' 
}: { 
  message: string; 
  politeness?: 'polite' | 'assertive' 
}): React.ReactElement => {
  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      style={{
        position: 'absolute',
        left: '-10000px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
    >
      {message}
    </div>
  );
};
