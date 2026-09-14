import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AcademicSkill } from '../../types/academicSkills';
import {
  archiveAcademicSkill,
  createAcademicSkill,
  listAcademicSkills,
  seedDefaultAcademicSkills,
  updateAcademicSkill,
} from '../../utils/academicSkillService';
import SkillChip from '../../components/skills/SkillChip';

const SkillLibraryAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [skills, setSkills] = useState<AcademicSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AcademicSkill | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    parentSkillId: '',
    icon: '✦',
    color: '#d4a84f',
    active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAcademicSkills();
      setSkills(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set(skills.map((s) => s.category || 'Uncategorized'));
    return Array.from(set).sort();
  }, [skills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (!showInactive && s.active === false) return false;
      if (categoryFilter !== 'all' && (s.category || 'Uncategorized') !== categoryFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q)
      );
    });
  }, [skills, search, categoryFilter, showInactive]);

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: '',
      description: '',
      category: '',
      parentSkillId: '',
      icon: '✦',
      color: '#d4a84f',
      active: true,
    });
  };

  const startEdit = (skill: AcademicSkill) => {
    setEditing(skill);
    setForm({
      name: skill.name,
      description: skill.description || '',
      category: skill.category || '',
      parentSkillId: skill.parentSkillId || '',
      icon: skill.icon || '✦',
      color: skill.color || '#d4a84f',
      active: skill.active !== false,
    });
  };

  const save = async () => {
    if (!currentUser || !form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateAcademicSkill(editing.id, {
          name: form.name.trim(),
          description: form.description,
          category: form.category,
          parentSkillId: form.parentSkillId || null,
          icon: form.icon,
          color: form.color,
          active: form.active,
        });
      } else {
        await createAcademicSkill(
          {
            name: form.name.trim(),
            description: form.description,
            category: form.category,
            parentSkillId: form.parentSkillId || null,
            icon: form.icon,
            color: form.color,
            active: form.active,
          },
          currentUser.uid
        );
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    if (!currentUser) return;
    setBusy(true);
    try {
      const n = await seedDefaultAcademicSkills(currentUser.uid);
      alert(n > 0 ? `Seeded ${n} starter skills.` : 'Library already has skills — seed skipped.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto', color: '#f4f0e6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="mst-display" style={{ margin: 0, color: 'var(--mst-gold-bright)', fontSize: '1.75rem' }}>
            Skill Library
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: '#9ca3af', fontSize: '0.9rem' }}>
            Universal academic skills for CFUs, practice, and Power Card mastery (separate from battle Skill Mastery).
          </p>
        </div>
        <button
          type="button"
          onClick={seed}
          disabled={busy}
          style={{
            padding: '0.55rem 0.9rem',
            borderRadius: '0.45rem',
            border: '1px solid rgba(212,168,79,0.45)',
            background: 'rgba(212,168,79,0.12)',
            color: '#f0c96a',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Seed Design + Illustrator
        </button>
      </div>

      {error && (
        <div style={{ color: '#fca5a5', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 340px) 1fr',
          gap: '1rem',
          alignItems: 'start',
        }}
        className="skill-library-grid"
      >
        <div
          style={{
            background: 'rgba(14,20,32,0.95)',
            border: '1px solid rgba(212,168,79,0.35)',
            borderRadius: '0.75rem',
            padding: '1rem',
          }}
        >
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: '#f0c96a' }}>
            {editing ? 'Edit Skill' : 'Create Skill'}
          </h2>
          <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inputStyle}
          />
          <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Category / Course</label>
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="e.g. Design, Illustrator"
            style={inputStyle}
          />
          <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Parent skill (optional)</label>
          <select
            value={form.parentSkillId}
            onChange={(e) => setForm({ ...form, parentSkillId: e.target.value })}
            style={inputStyle}
          >
            <option value="">None</option>
            {skills
              .filter((s) => s.id !== editing?.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Icon</label>
              <input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Color</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                style={{ ...inputStyle, padding: '0.2rem', height: '2.4rem' }}
              />
            </div>
          </div>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', margin: '0.5rem 0 0.75rem', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {editing && (
              <button type="button" onClick={resetForm} style={secondaryBtn}>
                Cancel
              </button>
            )}
            <button type="button" disabled={busy || !form.name.trim()} onClick={save} style={primaryBtn}>
              {busy ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(14,20,32,0.95)',
            border: '1px solid rgba(212,168,79,0.35)',
            borderRadius: '0.75rem',
            padding: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: '180px' }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0, width: 'auto' }}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#9ca3af' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show archived
            </label>
          </div>

          {loading ? (
            <div style={{ color: '#9ca3af' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#9ca3af' }}>
              No skills yet. Create one or seed the Design + Illustrator starter set.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {filtered.map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: skill.active === false ? '1px solid rgba(156,163,175,0.35)' : '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(5,7,13,0.55)',
                    opacity: skill.active === false ? 0.65 : 1,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <SkillChip skill={skill} />
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {skill.category || 'Uncategorized'}
                        {skill.parentSkillId ? ' · child' : ''}
                        {skill.active === false ? ' · archived' : ''}
                      </span>
                    </div>
                    {skill.description && (
                      <div style={{ fontSize: '0.8rem', color: '#d1d5db', marginTop: '0.35rem' }}>
                        {skill.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button type="button" onClick={() => startEdit(skill)} style={secondaryBtn}>
                      Edit
                    </button>
                    {skill.active !== false && (
                      <button
                        type="button"
                        onClick={async () => {
                          await archiveAcademicSkill(skill.id);
                          await load();
                        }}
                        style={{ ...secondaryBtn, borderColor: 'rgba(248,113,113,0.5)', color: '#fecaca' }}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: '0.55rem',
  padding: '0.55rem 0.65rem',
  borderRadius: '0.4rem',
  border: '1px solid rgba(212,168,79,0.35)',
  background: '#05070d',
  color: '#f4f0e6',
  fontSize: '0.875rem',
};

const primaryBtn: React.CSSProperties = {
  flex: 1,
  padding: '0.55rem 0.85rem',
  borderRadius: '0.4rem',
  border: 'none',
  background: '#6d3ef2',
  color: 'white',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '0.45rem 0.75rem',
  borderRadius: '0.4rem',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'transparent',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

export default SkillLibraryAdmin;
