import React, { useEffect, useMemo, useState } from 'react';
import type { CfSprintAssignment, CfSubmissionMethod, CfWorkAssignment, CfWorkType } from '../../types/classFlowWork';
import { CF_METHOD_LABELS, CF_SUBMISSION_METHODS, toSprintAssignment } from '../../utils/classFlowConfig';
import { saveWorkAssignment, subscribeWorkLibrary } from '../../utils/classFlowWorkService';
import './classFlow.css';

interface Props {
  assignments: CfSprintAssignment[];
  onChange: (next: CfSprintAssignment[]) => void;
  actorUid: string;
  classId?: string | null;
  /** Work that already has submissions (cannot be removed). */
  lockedIds?: string[];
  onMessage?: (text: string, error?: boolean) => void;
  /** Render with its own Class Flow theme wrapper (for use outside `.cf-root`). */
  standalone?: boolean;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

interface NewWork {
  title: string;
  description: string;
  instructions: string;
  submissionRequirements: string;
  workType: CfWorkType;
  points: number;
  methods: CfSubmissionMethod[];
  isExtraCredit: boolean;
  saveToLibrary: boolean;
}

const EMPTY_NEW: NewWork = {
  title: '',
  description: '',
  instructions: '',
  submissionRequirements: '',
  workType: 'individual',
  points: 100,
  methods: ['confirm'],
  isExtraCredit: false,
  saveToLibrary: true,
};

/** Attach library work or create new work inside a sprint. Points here apply to this sprint only. */
const SprintWorkPicker: React.FC<Props> = ({ assignments, onChange, actorUid, classId, lockedIds = [], onMessage, standalone }) => {
  const [library, setLibrary] = useState<CfWorkAssignment[]>([]);
  const [libraryBlocked, setLibraryBlocked] = useState(false);
  const [pick, setPick] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<NewWork>(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  useEffect(
    () =>
      subscribeWorkLibrary(
        (items) => {
          setLibraryBlocked(false);
          setLibrary(items);
        },
        () => {
          setLibraryBlocked(true);
          setLibrary([]);
        }
      ),
    []
  );

  const available = useMemo(
    () =>
      library.filter(
        (w) =>
          w.status === 'active' &&
          (!w.classId || !classId || w.classId === classId) &&
          !assignments.some((a) => a.assignmentId === w.id)
      ),
    [library, classId, assignments]
  );

  const patchAt = (i: number, p: Partial<CfSprintAssignment>) =>
    onChange(assignments.map((a, j) => (j === i ? { ...a, ...p } : a)));

  const create = async () => {
    const title = draft.title.trim();
    if (!title || !draft.methods.length) return;
    setSaving(true);
    const base: Omit<CfWorkAssignment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
      title,
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
      submissionRequirements: draft.submissionRequirements.trim(),
      workType: draft.workType,
      basePoints: Math.max(0, Math.floor(draft.points)),
      estimatedMinutes: 10,
      difficulty: null,
      submissionMethods: draft.methods,
      evidenceRequired: draft.methods.some((m) => m === 'written' || m === 'link' || m === 'upload'),
      extraCreditEligible: false,
      isExtraCredit: draft.isExtraCredit,
      bonus: { type: 'none', value: 0, targetAssignmentId: null },
      classId: classId || null,
      status: 'active',
    };
    let id = `adhoc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (draft.saveToLibrary) {
      const res = await saveWorkAssignment(base, actorUid);
      if (res.ok && res.value) id = res.value;
      else onMessage?.('Added to this sprint only — saving to the Work Library needs an admin account.', true);
    }
    onChange([...assignments, toSprintAssignment({ ...base, id, createdBy: actorUid })]);
    setSaving(false);
    setDraft(EMPTY_NEW);
    setCreating(false);
  };

  return (
    <div className={standalone ? 'cf-root cf-inline' : undefined} style={{ display: 'grid', gap: 6 }}>
      {assignments.length === 0 && <div className="cf-sub">No work attached yet.</div>}
      {assignments.map((a, i) => {
        const locked = lockedIds.includes(a.assignmentId);
        return (
          <div key={a.assignmentId} className="cf-row" style={{ fontSize: 13 }}>
            <span style={{ flex: 1, minWidth: 160 }}>
              {a.title}{' '}
              <span className="cf-sub">
                · {a.workType}
                {a.isExtraCredit ? ' · extra' : ''}
                {a.assignmentId.startsWith('adhoc_') ? ' · this sprint only' : ''}
              </span>
            </span>
            <input
              className="cf-input"
              type="number"
              min={0}
              value={a.points}
              style={{ width: 80 }}
              aria-label={`Points for ${a.title}`}
              onChange={(e) => patchAt(i, { points: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
            <span className="cf-sub">pts</span>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => onChange(move(assignments, i, i - 1))} aria-label="Move up">↑</button>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => onChange(move(assignments, i, i + 1))} aria-label="Move down">↓</button>
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              disabled={locked}
              title={locked ? 'Players already submitted this work' : undefined}
              onClick={() => onChange(assignments.filter((_, j) => j !== i))}
              aria-label={`Remove ${a.title}`}
            >
              ✕
            </button>
          </div>
        );
      })}

      <div className="cf-row">
        <select className="cf-select" value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 180 }} aria-label="Add work from library">
          <option value="">
            {libraryBlocked
              ? 'Work Library unavailable — create work below'
              : available.length
                ? 'Add work from library…'
                : 'No more active library work'}
          </option>
          {available.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title} ({w.basePoints} pts · {w.workType}
              {w.isExtraCredit ? ' · extra' : ''})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="cf-btn"
          disabled={!pick}
          onClick={() => {
            const w = available.find((x) => x.id === pick);
            if (w) onChange([...assignments, toSprintAssignment(w)]);
            setPick('');
          }}
        >
          Attach
        </button>
        <button type="button" className="cf-btn cf-btn--purple" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel new work' : '+ Create new work'}
        </button>
      </div>

      {creating && (
        <div className="cf-card cf-card--gold" style={{ display: 'grid', gap: 8 }}>
          <div className="cf-row">
            <input
              className="cf-input"
              style={{ flex: 2, minWidth: 180 }}
              placeholder="Work title"
              value={draft.title}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <select className="cf-select" value={draft.workType} onChange={(e) => setDraft({ ...draft, workType: e.target.value as CfWorkType })} aria-label="Work type">
              <option value="individual">Individual</option>
              <option value="team">Team</option>
            </select>
            <input
              className="cf-input"
              type="number"
              min={0}
              style={{ width: 90 }}
              value={draft.points}
              onChange={(e) => setDraft({ ...draft, points: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              aria-label="Points"
            />
            <span className="cf-sub">pts</span>
          </div>
          <input className="cf-input" placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <textarea className="cf-textarea" style={{ minHeight: 50 }} placeholder="Instructions (optional)" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
          <input className="cf-input" placeholder="Evidence required (optional)" value={draft.submissionRequirements} onChange={(e) => setDraft({ ...draft, submissionRequirements: e.target.value })} />
          <div className="cf-row">
            {CF_SUBMISSION_METHODS.map((m) => (
              <label key={m} className="cf-check" style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={draft.methods.includes(m)}
                  onChange={(e) =>
                    setDraft({ ...draft, methods: e.target.checked ? [...draft.methods, m] : draft.methods.filter((x) => x !== m) })
                  }
                />
                {CF_METHOD_LABELS[m]}
              </label>
            ))}
          </div>
          <div className="cf-row">
            <label className="cf-check" style={{ fontSize: 12 }}>
              <input type="checkbox" checked={draft.isExtraCredit} onChange={(e) => setDraft({ ...draft, isExtraCredit: e.target.checked })} />
              Extra-credit task
            </label>
            <label className="cf-check" style={{ fontSize: 12 }}>
              <input type="checkbox" checked={draft.saveToLibrary} onChange={(e) => setDraft({ ...draft, saveToLibrary: e.target.checked })} />
              Also save to the Work Library
            </label>
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              disabled={saving || !draft.title.trim() || !draft.methods.length}
              onClick={() => void create()}
            >
              {saving ? 'Adding…' : 'Add to sprint'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SprintWorkPicker;
