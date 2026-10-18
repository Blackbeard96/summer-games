import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CfToastInput } from './classFlowPanelTypes';

interface ToastItem extends CfToastInput {
  id: number;
}

export function useClassFlowToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: CfToastInput) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-3), { ...t, id }]);
    window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 6500);
  }, []);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((x) => x.id !== id)), []);
  return { items, push, dismiss };
}

export const ClassFlowToastStack: React.FC<{ items: ToastItem[]; onDismiss: (id: number) => void }> = ({
  items,
  onDismiss,
}) => {
  if (!items.length) return null;
  return createPortal(
    <div className="cf-toast-stack" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`cf-toast ${t.tone && t.tone !== 'info' ? `cf-toast--${t.tone}` : ''}`}
          role="status"
          onClick={() => onDismiss(t.id)}
        >
          <div className="cf-toast-title">{t.title}</div>
          {t.body && <div className="cf-toast-body">{t.body}</div>}
        </div>
      ))}
    </div>,
    document.body
  );
};
