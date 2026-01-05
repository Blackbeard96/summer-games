import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Toast {
  id: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number; // Auto-dismiss duration in ms (default 5000)
}

interface ToastContextType {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration || 5000, // Default 5 seconds
    };

    setToasts((prev) => {
      // Limit to max 3 visible toasts at once
      const maxVisible = 3;
      if (prev.length >= maxVisible) {
        // Keep the newest ones
        return [...prev.slice(-(maxVisible - 1)), newToast];
      }
      return [...prev, newToast];
    });

    // Auto-dismiss after duration (unless user hovers)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, newToast.duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, pushToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

