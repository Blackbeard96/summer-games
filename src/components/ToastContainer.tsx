import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const [pausedToasts, setPausedToasts] = useState<Set<string>>(new Set());

  // Handle auto-dismiss with pause on hover
  useEffect(() => {
    const timers: Map<string, NodeJS.Timeout> = new Map();

    toasts.forEach((toast) => {
      if (!pausedToasts.has(toast.id)) {
        const timer = setTimeout(() => {
          removeToast(toast.id);
        }, toast.duration || 5000);
        timers.set(toast.id, timer);
      }
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, pausedToasts, removeToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxWidth: '400px',
        width: '90%',
        pointerEvents: 'none', // Allow clicks through container
      }}
    >
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          index={index}
          onClose={() => removeToast(toast.id)}
          onPause={() => setPausedToasts((prev) => new Set(prev).add(toast.id))}
          onResume={() =>
            setPausedToasts((prev) => {
              const next = new Set(prev);
              next.delete(toast.id);
              return next;
            })
          }
        />
      ))}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

interface ToastItemProps {
  toast: {
    id: string;
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  index: number;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({
  toast,
  index,
  onClose,
  onPause,
  onResume,
}) => {
  return (
    <div
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        boxShadow: '0 10px 25px rgba(139, 92, 246, 0.4)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        color: 'white',
        animation: `slideInRight 0.3s ease-out`,
        pointerEvents: 'auto', // Enable interactions on toast
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        position: 'relative',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          color: 'white',
          cursor: 'pointer',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        ×
      </button>

      {/* Icon and Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ fontSize: '1.5rem' }}>✅</div>
        <h4
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 'bold',
            flex: 1,
          }}
        >
          {toast.title}
        </h4>
      </div>

      {/* Message */}
      <p
        style={{
          margin: 0,
          fontSize: '0.875rem',
          opacity: 0.95,
          lineHeight: 1.4,
          paddingRight: '1.5rem', // Space for close button
        }}
      >
        "{toast.message}"
      </p>

      {/* Action Button */}
      {toast.onAction && (
        <button
          onClick={() => {
            toast.onAction?.();
            onClose();
          }}
          style={{
            background: 'white',
            color: '#8b5cf6',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            transition: 'all 0.2s',
            marginTop: '0.25rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {toast.actionLabel || 'View'}
        </button>
      )}

      {/* Reward ready message */}
      <p
        style={{
          margin: 0,
          fontSize: '0.75rem',
          opacity: 0.9,
          fontStyle: 'italic',
        }}
      >
        Reward ready to collect.
      </p>
    </div>
  );
};

export default ToastContainer;

