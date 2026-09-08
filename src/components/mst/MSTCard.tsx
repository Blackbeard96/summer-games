import React from 'react';
import { MSTPanel } from './MSTPanel';

type Props = {
  children: React.ReactNode;
  accent?: 'gold' | 'purple' | 'none';
  onClick?: () => void;
  selected?: boolean;
  style?: React.CSSProperties;
  className?: string;
};

/** Interactive content card — use for quests, inventory, admin tools. */
export function MSTCard({
  children,
  accent = 'none',
  onClick,
  selected,
  style,
  className,
}: Props) {
  const interactive = Boolean(onClick);
  return (
    <MSTPanel
      className={className}
      accent={selected ? 'gold' : accent}
      elevated={selected}
      padding="var(--mst-space-4)"
      style={{
        cursor: interactive ? 'pointer' : undefined,
        boxShadow: selected ? 'var(--mst-glow-selected)' : undefined,
        transition: 'transform var(--mst-duration-fast) var(--mst-ease), box-shadow var(--mst-duration) var(--mst-ease)',
        ...style,
      }}
    >
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
      >
        {children}
      </div>
    </MSTPanel>
  );
}
