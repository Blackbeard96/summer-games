import React from 'react';
import { MSTPanel } from './MSTPanel';
import { mst } from '../../theme/mstTokens';

type Props = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: 'gold' | 'purple' | 'none';
};

export function MSTStatCard({ label, value, hint, accent = 'gold' }: Props) {
  return (
    <MSTPanel accent={accent} padding="var(--mst-space-4)">
      <div className="mst-label" style={{ color: mst.text.muted }}>
        {label}
      </div>
      <div
        className="mst-display"
        style={{ marginTop: '0.35rem', fontSize: '1.5rem', color: mst.text.primary }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: mst.text.muted }}>{hint}</div>
      ) : null}
    </MSTPanel>
  );
}
