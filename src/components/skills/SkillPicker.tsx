import React, { useEffect, useMemo, useState } from 'react';
import { AcademicSkill } from '../../types/academicSkills';
import { groupSkillsByCategory, listAcademicSkills } from '../../utils/academicSkillService';
import SkillChip from './SkillChip';

interface SkillPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  suggestedIds?: string[];
  disabled?: boolean;
  label?: string;
}

/**
 * Searchable multi-select skill picker with chips + category groups.
 */
const SkillPicker: React.FC<SkillPickerProps> = ({
  selectedIds,
  onChange,
  suggestedIds = [],
  disabled,
  label = 'Skills Assessed',
}) => {
  const [skills, setSkills] = useState<AcademicSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listAcademicSkills({ activeOnly: true });
        if (!cancelled) setSkills(rows);
      } catch (e) {
        console.error('SkillPicker load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean) as AcademicSkill[];

  const suggested = suggestedIds
    .filter((id) => !selectedIds.includes(id))
    .map((id) => byId.get(id))
    .filter(Boolean) as AcademicSkill[];

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const pool = skills.filter((s) => !selectedIds.includes(s.id));
    if (!q) return pool;
    return pool.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
    );
  }, [skills, selectedIds, queryText]);

  const grouped = groupSkillsByCategory(filtered);

  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f0c96a', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem', minHeight: '1.5rem' }}>
        {selected.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No skills selected</span>
        )}
        {selected.map((s) => (
          <SkillChip key={s.id} skill={s} onRemove={disabled ? undefined : () => toggle(s.id)} />
        ))}
      </div>

      {suggested.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Suggested from CFU
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {suggested.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(s.id)}
                style={{
                  border: '1px dashed rgba(212,168,79,0.5)',
                  background: 'rgba(212,168,79,0.08)',
                  color: '#f0c96a',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        type="search"
        value={queryText}
        disabled={disabled || loading}
        placeholder={loading ? 'Loading skills…' : 'Search skills…'}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQueryText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{
          width: '100%',
          padding: '0.55rem 0.75rem',
          borderRadius: '0.45rem',
          border: '1px solid rgba(212,168,79,0.35)',
          background: '#05070d',
          color: '#f4f0e6',
          fontSize: '0.875rem',
        }}
      />

      {open && !disabled && (
        <div
          style={{
            marginTop: '0.35rem',
            maxHeight: '220px',
            overflowY: 'auto',
            borderRadius: '0.5rem',
            border: '1px solid rgba(212,168,79,0.35)',
            background: '#0e1420',
            boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
            zIndex: 20,
            position: 'relative',
          }}
        >
          {Object.keys(grouped).length === 0 ? (
            <div style={{ padding: '0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>
              No matching skills. Create some in Skill Library.
            </div>
          ) : (
            Object.entries(grouped).map(([category, rows]) => (
              <div key={category}>
                <div
                  style={{
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.65rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#d4a84f',
                    background: 'rgba(212,168,79,0.06)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {category}
                </div>
                {rows.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.55rem 0.75rem',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: 'transparent',
                      color: '#f4f0e6',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span style={{ marginRight: '0.35rem' }}>{s.icon || '✦'}</span>
                    {s.name}
                    {s.parentSkillId ? (
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}> · child skill</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: 'none',
              background: 'rgba(255,255,255,0.04)',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default SkillPicker;
