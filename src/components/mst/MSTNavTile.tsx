import React from 'react';
import { Link } from 'react-router-dom';
import { mst } from '../../theme/mstTokens';

type Props = {
  icon?: React.ReactNode;
  label: string;
  to?: string;
  onClick?: () => void;
  selected?: boolean;
  badge?: number | string;
  description?: string;
};

export function MSTNavTile({
  icon,
  label,
  to,
  onClick,
  selected,
  badge,
  description,
}: Props) {
  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon ? (
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }} aria-hidden>
              {icon}
            </span>
          ) : null}
          <span
            style={{
              fontFamily: mst.font.body,
              fontWeight: 600,
              fontSize: '0.875rem',
              letterSpacing: '0.04em',
              color: selected ? mst.gold.bright : mst.text.primary,
            }}
          >
            {label}
          </span>
        </div>
        {badge != null && badge !== 0 ? (
          <span
            className="mst-notif-badge"
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 5px',
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {description ? (
        <div style={{ marginTop: 6, fontSize: '0.75rem', color: mst.text.muted }}>{description}</div>
      ) : null}
    </>
  );

  const shellStyle: React.CSSProperties = {
    display: 'block',
    textDecoration: 'none',
    padding: '0.85rem 1rem',
    background: selected ? mst.gold.soft : mst.bg.panel,
    border: `1px solid ${selected ? mst.border.gold : mst.border.default}`,
    borderRadius: mst.radius.md,
    boxShadow: selected ? 'var(--mst-glow-selected)' : 'none',
    transition: 'border-color var(--mst-duration) var(--mst-ease), transform var(--mst-duration-fast) var(--mst-ease), box-shadow var(--mst-duration) var(--mst-ease)',
    cursor: 'pointer',
    color: 'inherit',
  };

  if (to) {
    return (
      <Link
        to={to}
        style={shellStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.borderColor = 'var(--mst-border-gold)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = selected
            ? 'var(--mst-border-gold)'
            : 'var(--mst-border)';
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} style={{ ...shellStyle, width: '100%', textAlign: 'left' }}>
      {content}
    </button>
  );
}
