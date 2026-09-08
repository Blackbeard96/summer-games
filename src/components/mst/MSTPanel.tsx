import React from 'react';
import { mst } from '../../theme/mstTokens';

type Props = {
  children: React.ReactNode;
  accent?: 'gold' | 'purple' | 'none';
  elevated?: boolean;
  padding?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function MSTPanel({
  children,
  accent = 'none',
  elevated = false,
  padding = 'var(--mst-space-5)',
  className,
  style,
}: Props) {
  return (
    <div
      className={className}
      style={{
        background: elevated ? mst.bg.elevated : mst.bg.panel,
        border: `1px solid ${accent === 'gold' ? mst.border.gold : accent === 'purple' ? mst.border.purple : mst.border.default}`,
        borderRadius: mst.radius.lg,
        boxShadow: elevated ? mst.shadow.elevated : mst.shadow.panel,
        padding,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {accent !== 'none' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              accent === 'gold'
                ? `linear-gradient(90deg, transparent, ${mst.gold.base}, transparent)`
                : `linear-gradient(90deg, transparent, ${mst.purple.bright}, transparent)`,
          }}
        />
      )}
      {children}
    </div>
  );
}
