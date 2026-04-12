import React, { useState } from 'react';
import { ELEMENT_ADVANTAGES } from '../utils/elementAdvantages';
import type { ElementType } from '../types/elementTypes';
import { ALL_ELEMENT_TYPES } from '../types/elementTypes';
import { elementTypeEmoji, elementTypeLabel } from '../utils/elementTypeUi';

function attackersStrongVs(defender: ElementType): ElementType[] {
  return (Object.keys(ELEMENT_ADVANTAGES) as ElementType[]).filter((atk) =>
    ELEMENT_ADVANTAGES[atk]?.includes(defender)
  );
}

/**
 * Compact type chart for the battle arena (above the battle log).
 */
const ElementalAdvantageGuide: React.FC = () => {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '500px',
        background: 'rgba(15, 23, 42, 0.88)',
        border: '1px solid rgba(251, 191, 36, 0.45)',
        borderRadius: '0.5rem',
        color: '#e2e8f0',
        fontSize: '0.72rem',
        lineHeight: 1.35,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          padding: '0.45rem 0.65rem',
          border: 'none',
          background: 'rgba(30, 41, 59, 0.95)',
          color: '#fbbf24',
          fontWeight: 700,
          fontSize: '0.75rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>⚔️ Elemental matchups (1.5× strong · 0.5× weak)</span>
        <span aria-hidden>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div style={{ padding: '0.5rem 0.65rem 0.65rem', borderTop: '1px solid rgba(148, 163, 184, 0.25)' }}>
          <div style={{ marginBottom: '0.4rem', color: '#94a3b8', fontSize: '0.68rem' }}>
            Attacking with an element that is <strong style={{ color: '#a7f3d0' }}>strong</strong> vs the
            defender&apos;s type deals extra damage. Attacking into a <strong style={{ color: '#fecaca' }}>resistant</strong>{' '}
            type deals less.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))',
              gap: '0.35rem',
            }}
          >
            {ALL_ELEMENT_TYPES.map((el) => {
              const strongVs = ELEMENT_ADVANTAGES[el] || [];
              const weakVs = attackersStrongVs(el);
              const fmt = (t: ElementType) => `${elementTypeEmoji(t)} ${elementTypeLabel(t)}`;
              return (
                <div
                  key={el}
                  style={{
                    background: 'rgba(51, 65, 85, 0.55)',
                    borderRadius: '0.35rem',
                    padding: '0.35rem 0.4rem',
                    border: '1px solid rgba(100, 116, 139, 0.35)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '0.15rem' }}>
                    {elementTypeEmoji(el)} {elementTypeLabel(el)}
                  </div>
                  <div style={{ color: '#86efac' }}>
                    Strong vs {strongVs.length ? strongVs.map(fmt).join(' · ') : '—'}
                  </div>
                  <div style={{ color: '#fca5a5' }}>
                    Weak vs {weakVs.length ? weakVs.map(fmt).join(' · ') : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ElementalAdvantageGuide;
