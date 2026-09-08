import React from 'react';
import { mst } from '../../theme/mstTokens';

type Props = {
  children: React.ReactNode;
  maxWidth?: number | string;
  narrow?: boolean;
  style?: React.CSSProperties;
  className?: string;
};

/** Standard page content width + vertical rhythm for MST screens. */
export function MSTPage({ children, maxWidth = 'var(--mst-content-max)', narrow, style, className }: Props) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxWidth: narrow ? 880 : maxWidth,
        margin: '0 auto',
        padding: 'var(--mst-space-5) var(--mst-space-4) var(--mst-space-8)',
        boxSizing: 'border-box',
        color: mst.text.primary,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
