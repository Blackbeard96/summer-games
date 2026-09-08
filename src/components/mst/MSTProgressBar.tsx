import React from 'react';
import { mst } from '../../theme/mstTokens';

type Props = {
  value: number;
  max?: number;
  label?: string;
  tone?: 'gold' | 'purple' | 'success';
  showValue?: boolean;
  style?: React.CSSProperties;
};

export function MSTProgressBar({
  value,
  max = 100,
  label,
  tone = 'gold',
  showValue = true,
  style,
}: Props) {
  const pct = Math.max(0, Math.min(100, max <= 0 ? 0 : (value / max) * 100));
  const fill =
    tone === 'purple'
      ? `linear-gradient(90deg, ${mst.purple.base}, ${mst.purple.bright})`
      : tone === 'success'
        ? `linear-gradient(90deg, #2f7a55, ${mst.semantic.success})`
        : `linear-gradient(90deg, ${mst.gold.muted}, ${mst.gold.bright})`;

  return (
    <div style={style}>
      {(label || showValue) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontSize: '0.75rem',
            color: mst.text.muted,
          }}
        >
          <span>{label}</span>
          {showValue ? (
            <span style={{ color: mst.text.secondary }}>
              {Math.round(value)} / {Math.round(max)}
            </span>
          ) : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        style={{
          height: 8,
          borderRadius: 999,
          background: 'rgba(244, 240, 230, 0.08)',
          border: `1px solid ${mst.border.default}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: fill,
            transition: 'width var(--mst-duration-slow) var(--mst-ease)',
          }}
        />
      </div>
    </div>
  );
}
