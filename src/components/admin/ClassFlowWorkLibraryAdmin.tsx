import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import '../classFlow/classFlow.css';
import type {
  CfAssignmentStatus,
  CfDifficulty,
  CfSubmissionMethod,
  CfWorkAssignment,
} from '../../types/classFlowWork';
import { CF_METHOD_LABELS, CF_SUBMISSION_METHODS } from '../../utils/classFlowConfig';
import {
  deleteWorkAssignment,
  saveWorkAssignment,
  setWorkAssignmentStatus,
  subscribeWorkLibrary,
} from '../../utils/classFlowWorkService';

type Draft = Omit<CfWorkAssignment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string };

const EMPTY: Draft = {
  title: '',
  description: '',
  instructions: '',
  submissionRequirements: '',
  workType: 'individual',
  basePoints: 100,
  estimatedMinutes: 10,
  difficulty: null,
  submissionMethods: ['confirm'],
  evidenceRequired: false,
  extraCreditEligible: false,
  isExtraCredit: false,
  bonus: { type: 'none', value: 0, targetAssignmentId: null },
  classId: null,
  status: 'draft',
};

const ClassFlowWorkLibraryAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<CfWorkAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [statusFilter, setStatusFilter] = useState<CfAssignmentStatus | 'all'>('active');
  const [search, setSearch] = useState('');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeWorkLibrary(setItems, (e) => setError(e.message)), []);
  useEffect(() => {
    getDocs(collection(db, 'classrooms'))
      .then((snap) =>
        setClasses(
          snap.docs
            .map((d) => ({ id: d.id, name: String(d.data()?.name || d.data()?.title || d.id) }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => setClasses([]));
  }, []);

  const visible = useMemo(
    () =>
      items.filter(
        (w) =>
          (statusFilter === 'all' || w.status === statusFilter) &&
          (!search.trim() || `${w.title} ${w.description}`.toLowerCase().includes(search.trim().toLowerCase()))
      ),
    [items, statusFilter, search]
  );
  const className = (id: string | null) => (id ? classes.find((c) => c.id === id)?.name || id : 'All classes');

  const save = async () => {
    if (!draft || !currentUser) return;
    if (!draft.submissionMethods.length) {
      setError('Pick at least one submission method.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveWorkAssignment(draft, currentUser.uid);
    setSaving(false);
    if (res.ok) {
      setMessage(`Saved “${draft.title}”.`);
      setDraft(null);
    } else setError(res.error);
  };

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <div className="cf-root" style={{ margin: 0 }}>
      <div className="cf-between">
        <div>
          <h2 className="cf-title" style={{ fontSize: 18 }}>Class Flow Work Library</h2>
          <div className="cf-sub">Reusable work for Class Flow sprints. Edits here never change sprints already running.</div>
        </div>
        <button type="button" className="cf-btn cf-btn--primary" onClick={() => setDraft({ ...EMPTY })}>
          + New work
        </button>
      </div>

      {error && <div className="cf-msg cf-msg--error" style={{ marginTop: 10 }}>{error}</div>}
      {message && <div className="cf-msg" style={{ marginTop: 10 }}>{message}</div>}

      {draft && (
        <div className="cf-card cf-card--gold" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div className="cf-title" style={{ fontSize: 13 }}>{draft.id ? 'Edit work' : 'New work'}</div>
          <div className="cf-row">
            <label className="cf-label" style={{ flex: 2, minWidth: 220 }}>
              Title
              <input className="cf-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />
            </label>
            <label className="cf-label">
              Status
              <select className="cf-select" value={draft.status} onChange={(e) => set({ status: e.target.value as CfAssignmentStatus })}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="cf-label">
              Class / course
              <select className="cf-select" value={draft.classId || ''} onChange={(e) => set({ classId: e.target.value || null })}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="cf-label">
            Description
            <textarea className="cf-textarea" style={{ minHeight: 50 }} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="cf-label">
            Instructions
            <textarea className="cf-textarea" value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
          </label>
          <label className="cf-label">
            Submission requirements (evidence)
            <textarea className="cf-textarea" style={{ minHeight: 50 }} value={draft.submissionRequirements} onChange={(e) => set({ submissionRequirements: e.target.value })} />
          </label>
          <div className="cf-row">
            <label className="cf-label">
              Work type
              <select className="cf-select" value={draft.workType} onChange={(e) => set({ workType: e.target.value as Draft['workType'] })}>
                <option value="individual">Individual</option>
                <option value="team">Team</option>
              </select>
            </label>
            <label className="cf-label">
              Point value
              <input className="cf-input" type="number" min={0} value={draft.basePoints} onChange={(e) => set({ basePoints: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 100 }} />
            </label>
            <label className="cf-label">
              Est. minutes
              <input className="cf-input" type="number" min={0} value={draft.estimatedMinutes} onChange={(e) => set({ estimatedMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90 }} />
            </label>
            <label className="cf-label">
              Difficulty
              <select className="cf-select" value={draft.difficulty || ''} onChange={(e) => set({ difficulty: (e.target.value || null) as CfDifficulty | null })}>
                <option value="">—</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>
          <div>
            <div className="cf-stat-label" style={{ marginBottom: 4 }}>Submission methods</div>
            <div className="cf-row">
              {CF_SUBMISSION_METHODS.map((m: CfSubmissionMethod) => (
                <label key={m} className="cf-check">
                  <input
                    type="checkbox"
                    checked={draft.submissionMethods.includes(m)}
                    onChange={(e) =>
                      set({
                        submissionMethods: e.target.checked
                          ? [...draft.submissionMethods, m]
                          : draft.submissionMethods.filter((x) => x !== m),
                      })
                    }
                  />
                  {CF_METHOD_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
          <div className="cf-row">
            <label className="cf-check">
              <input type="checkbox" checked={draft.evidenceRequired} onChange={(e) => set({ evidenceRequired: e.target.checked })} />
              Evidence required
            </label>
            <label className="cf-check">
              <input type="checkbox" checked={draft.extraCreditEligible} onChange={(e) => set({ extraCreditEligible: e.target.checked })} />
              Extra-credit eligible
            </label>
            <label className="cf-check">
              <input
                type="checkbox"
                checked={draft.isExtraCredit}
                onChange={(e) => set({ isExtraCredit: e.target.checked, bonus: e.target.checked ? draft.bonus : { type: 'none', value: 0, targetAssignmentId: null } })}
              />
              This is an extra-credit task
            </label>
          </div>
          {draft.isExtraCredit && (
            <div className="cf-row">
              <label className="cf-label">
                Bonus type
                <select
                  className="cf-select"
                  value={draft.bonus.type}
                  onChange={(e) => set({ bonus: { ...draft.bonus, type: e.target.value as Draft['bonus']['type'], value: e.target.value === 'multiplier' ? 1.25 : 0 } })}
                >
                  <option value="none">Flat bonus (uses point value)</option>
                  <option value="multiplier">Credit multiplier</option>
                </select>
              </label>
              {draft.bonus.type === 'multiplier' && (
                <>
                  <label className="cf-label">
                    Multiplier
                    <input className="cf-input" type="number" min={1} max={5} step={0.05} value={draft.bonus.value} onChange={(e) => set({ bonus: { ...draft.bonus, value: Math.max(1, Math.min(5, Number(e.target.value) || 1)) } })} style={{ width: 90 }} />
                  </label>
                  <label className="cf-label">
                    Applies to
                    <select className="cf-select" value={draft.bonus.targetAssignmentId || ''} onChange={(e) => set({ bonus: { ...draft.bonus, targetAssignmentId: e.target.value || null } })}>
                      <option value="">All of the player's approved work</option>
                      {items.filter((w) => !w.isExtraCredit && w.id !== draft.id).map((w) => (
                        <option key={w.id} value={w.id}>{w.title}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <span className="cf-sub">Multipliers apply only to the individual who earned them, never the whole team.</span>
            </div>
          )}
          <div className="cf-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="cf-btn cf-btn--primary" disabled={saving || !draft.title.trim()} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="cf-row" style={{ marginTop: 14 }}>
        {(['active', 'draft', 'archived', 'all'] as const).map((s) => (
          <button key={s} type="button" className={`cf-btn ${statusFilter === s ? 'cf-btn--primary' : 'cf-btn--ghost'}`} onClick={() => setStatusFilter(s)}>
            {s[0].toUpperCase() + s.slice(1)} ({s === 'all' ? items.length : items.filter((w) => w.status === s).length})
          </button>
        ))}
        <input className="cf-input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {visible.length === 0 && <div className="cf-empty">No work items.</div>}
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {visible.map((w) => (
          <div key={w.id} className="cf-card">
            <div className="cf-between">
              <div>
                <strong>{w.title}</strong>{' '}
                <span className="cf-sub">
                  · {w.basePoints} pts · {w.workType} · ~{w.estimatedMinutes} min{w.difficulty ? ` · ${w.difficulty}` : ''}
                  {w.isExtraCredit ? ` · extra credit${w.bonus.type === 'multiplier' ? ` ×${w.bonus.value}` : ''}` : ''} · {className(w.classId)}
                </span>
                {w.description && <div className="cf-sub" style={{ marginTop: 2 }}>{w.description}</div>}
                <div className="cf-sub" style={{ marginTop: 2 }}>{w.submissionMethods.map((m) => CF_METHOD_LABELS[m]).join(' · ')}</div>
              </div>
              <span className={`cf-badge ${w.status === 'active' ? 'cf-status-approved' : w.status === 'draft' ? 'cf-status-submitted' : 'cf-status-not_started'}`}>{w.status}</span>
            </div>
            <div className="cf-row" style={{ marginTop: 8 }}>
              <button type="button" className="cf-btn" onClick={() => { const { id, createdAt, updatedAt, createdBy, ...rest } = w; void createdAt; void updatedAt; void createdBy; setDraft({ id, ...rest }); }}>
                Edit
              </button>
              <button type="button" className="cf-btn cf-btn--ghost" onClick={() => { const { id, createdAt, updatedAt, createdBy, ...rest } = w; void id; void createdAt; void updatedAt; void createdBy; setDraft({ ...rest, title: `${w.title} (copy)`, status: 'draft' }); }}>
                Duplicate
              </button>
              {w.status !== 'active' && (
                <button type="button" className="cf-btn cf-btn--green" onClick={() => void setWorkAssignmentStatus(w.id, 'active')}>Activate</button>
              )}
              {w.status !== 'archived' && (
                <button type="button" className="cf-btn cf-btn--ghost" onClick={() => void setWorkAssignmentStatus(w.id, 'archived')}>Archive</button>
              )}
              {w.status === 'draft' && (
                <button type="button" className="cf-btn cf-btn--red" onClick={() => window.confirm(`Delete “${w.title}”?`) && void deleteWorkAssignment(w.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClassFlowWorkLibraryAdmin;
