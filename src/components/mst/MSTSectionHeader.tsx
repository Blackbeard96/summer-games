import React from 'react';
import { mst } from '../../theme/mstTokens';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
};

export function MSTSectionHeader({ eyebrow, title, subtitle, actions, style }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--mst-space-4)',
        marginBottom: 'var(--mst-space-4)',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div>
        {eyebrow ? <div className="mst-label">{eyebrow}</div> : null}
        <h2
          className="mst-display"
          style={{
            margin: eyebrow ? '0.35rem 0 0' : 0,
            fontSize: 'clamp(1.35rem, 2.2vw, 1.75rem)',
            color: mst.text.primary,
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p style={{ margin: '0.4rem 0 0', color: mst.text.muted, fontSize: '0.9375rem', maxWidth: 520 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
