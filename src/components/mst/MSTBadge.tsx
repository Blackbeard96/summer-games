import React from 'react';
import { mst } from '../../theme/mstTokens';

type Tone = 'neutral' | 'gold' | 'purple' | 'success' | 'danger' | 'warning' | 'info';

type Props = {
  children: React.ReactNode;
  tone?: Tone;
  style?: React.CSSProperties;
};

const toneStyles: Record<Tone, React.CSSProperties> = {
  neutral: {
    background: 'rgba(142, 152, 168, 0.12)',
    color: mst.text.secondary,
    border: `1px solid ${mst.border.default}`,
  },
  gold: {
    background: mst.gold.soft,
    color: mst.gold.bright,
    border: `1px solid ${mst.border.gold}`,
  },
  purple: {
    background: mst.purple.soft,
    color: mst.purple.bright,
    border: `1px solid ${mst.border.purple}`,
  },
  success: {
    background: 'rgba(61, 155, 110, 0.15)',
    color: mst.semantic.success,
    border: '1px solid rgba(61, 155, 110, 0.4)',
  },
  danger: {
    background: 'rgba(196, 75, 75, 0.15)',
    color: '#f0a8a8',
    border: `1px solid ${mst.semantic.danger}`,
  },
  warning: {
    background: mst.gold.soft,
    color: mst.gold.base,
    border: `1px solid ${mst.border.gold}`,
  },
  info: {
    background: 'rgba(59, 130, 196, 0.15)',
    color: mst.semantic.info,
    border: '1px solid rgba(59, 130, 196, 0.4)',
  },
};

export function MSTBadge({ children, tone = 'neutral', style }: Props) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.15rem 0.55rem',
        borderRadius: mst.radius.sm,
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        ...toneStyles[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Alias requested in redesign brief */
export const MSTStatusBadge = MSTBadge;
