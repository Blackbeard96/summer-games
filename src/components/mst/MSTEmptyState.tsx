import React from 'react';
import { MSTPanel } from './MSTPanel';
import { MSTButton } from './MSTButton';
import { mst } from '../../theme/mstTokens';

type Props = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

export function MSTEmptyState({ title, description, icon, actionLabel, onAction }: Props) {
  return (
    <MSTPanel
      accent="gold"
      style={{
        textAlign: 'center',
        padding: 'var(--mst-space-8) var(--mst-space-5)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 64,
          height: 64,
          margin: '0 auto 1rem',
          borderRadius: '50%',
          border: `1px solid ${mst.border.gold}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: mst.gold.base,
          fontSize: '1.75rem',
          background: mst.gold.soft,
        }}
      >
        {icon ?? '◇'}
      </div>
      <h3 className="mst-display" style={{ margin: 0, fontSize: '1.25rem' }}>
        {title}
      </h3>
      {description ? (
        <p style={{ margin: '0.65rem auto 0', maxWidth: 420, color: mst.text.muted, fontSize: '0.9375rem' }}>
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <div style={{ marginTop: '1.25rem' }}>
          <MSTButton variant="secondary" onClick={onAction}>
            {actionLabel}
          </MSTButton>
        </div>
      ) : null}
    </MSTPanel>
  );
}
