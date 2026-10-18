import React, { useEffect, useMemo, useState } from 'react';
import type { CfSprintPlanItem, CfWorkAssignment } from '../../../types/classFlowWork';
import { toSprintAssignment } from '../../../utils/classFlowConfig';
import { newPlanItem, subscribeWorkLibrary, updateCfConfig } from '../../../utils/classFlowWorkService';

interface Props {
  sessionId: string;
  plan: CfSprintPlanItem[];
  activePlanId: string | null;
  classId?: string | null;
  onMessage: (msg: string, error?: boolean) => void;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

const PlanEditor: React.FC<Props> = ({ sessionId, plan, activePlanId, classId, onMessage }) => {
  const [draft, setDraft] = useState<CfSprintPlanItem[]>(plan);
  const [dirty, setDirty] = useState(false);
  const [library, setLibrary] = useState<CfWorkAssignment[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeWorkLibrary(setLibrary, () => setLibrary([])), []);
  const planKey = JSON.stringify(plan);
  useEffect(() => {
    if (!dirty) setDraft(JSON.parse(planKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  const activeLibrary = useMemo(
    () => library.filter((w) => w.status === 'active' && (!w.classId || !classId || w.classId === classId)),
    [library, classId]
  );

  const update = (fn: (p: CfSprintPlanItem[]) => CfSprintPlanItem[]) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };
  const patchItem = (i: number, p: Partial<CfSprintPlanItem>) =>
    update((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const save = async () => {
    setSaving(true);
    const res = await updateCfConfig(sessionId, { plan: draft });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      onMessage('Sprint plan saved.');
    } else onMessage(res.error, true);
  };

  return (
    <div className="cf-card" style={{ marginTop: 12 }}>
      <div className="cf-between">
        <div>
          <div className="cf-title" style={{ fontSize: 13 }}>Sprint plan</div>
          <div className="cf-sub">Attach Work Library items to each sprint. Points set here apply to this sprint only.</div>
        </div>
        <div className="cf-row">
          <button type="button" className="cf-btn" onClick={() => update((d) => [...d, newPlanItem(d.length)])}>
            + Add sprint
          </button>
          <button type="button" className="cf-btn cf-btn--primary" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}
          </button>
        </div>
      </div>
      {draft.length === 0 && <div className="cf-empty">No sprints planned yet.</div>}
      {activeLibrary.length === 0 && (
        <div className="cf-sub" style={{ marginTop: 6 }}>
          The Work Library has no active items. Add some in Admin → Class Flow Work.
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {draft.map((item, i) => (
          <div key={item.planId} className="cf-card cf-card--gold">
            <div className="cf-between">
              <div className="cf-row" style={{ flex: 1 }}>
                <span className="cf-badge" style={{ color: item.planId === activePlanId ? '#34d399' : '#9aa0b8' }}>
                  {item.planId === activePlanId ? 'Current' : `#${i + 1}`}
                </span>
                <input
                  className="cf-input"
                  value={item.title}
                  onChange={(e) => patchItem(i, { title: e.target.value })}
                  aria-label="Sprint name"
                  style={{ flex: 1, minWidth: 140 }}
                />
                <label className="cf-label" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <input
                    className="cf-input"
                    type="number"
                    min={1}
                    max={120}
                    value={item.durationMinutes}
                    onChange={(e) => patchItem(i, { durationMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}
                    style={{ width: 64 }}
                    aria-label="Duration in minutes"
                  />
                  min
                </label>
              </div>
              <div className="cf-row">
                <button type="button" className="cf-btn cf-btn--ghost" onClick={() => update((d) => move(d, i, i - 1))} aria-label="Move up">↑</button>
                <button type="button" className="cf-btn cf-btn--ghost" onClick={() => update((d) => move(d, i, i + 1))} aria-label="Move down">↓</button>
                <button type="button" className="cf-btn cf-btn--red" onClick={() => update((d) => d.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            </div>
            <input
              className="cf-input"
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Sprint objective"
              value={item.objective}
              onChange={(e) => patchItem(i, { objective: e.target.value })}
            />
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {item.assignments.map((a, k) => (
                <div key={a.assignmentId} className="cf-row" style={{ fontSize: 13 }}>
                  <span style={{ flex: 1 }}>
                    {a.title} <span className="cf-sub">· {a.workType}{a.isExtraCredit ? ' · extra' : ''}</span>
                  </span>
                  <input
                    className="cf-input"
                    type="number"
                    min={0}
                    value={a.points}
                    style={{ width: 80 }}
                    aria-label={`Points for ${a.title}`}
                    onChange={(e) =>
                      patchItem(i, {
                        assignments: item.assignments.map((x, j) =>
                          j === k ? { ...x, points: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x
                        ),
                      })
                    }
                  />
                  <span className="cf-sub">pts</span>
                  <button type="button" className="cf-btn cf-btn--ghost" onClick={() => patchItem(i, { assignments: move(item.assignments, k, k - 1) })} aria-label="Move up">↑</button>
                  <button type="button" className="cf-btn cf-btn--ghost" onClick={() => patchItem(i, { assignments: move(item.assignments, k, k + 1) })} aria-label="Move down">↓</button>
                  <button
                    type="button"
                    className="cf-btn cf-btn--ghost"
                    onClick={() => patchItem(i, { assignments: item.assignments.filter((_, j) => j !== k) })}
                    aria-label={`Remove ${a.title}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="cf-row">
                <select
                  className="cf-select"
                  value={pick[item.planId] || ''}
                  onChange={(e) => setPick((p) => ({ ...p, [item.planId]: e.target.value }))}
                  style={{ flex: 1 }}
                >
                  <option value="">Add work from library…</option>
                  {activeLibrary
                    .filter((w) => !item.assignments.some((a) => a.assignmentId === w.id))
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title} ({w.basePoints} pts · {w.workType}{w.isExtraCredit ? ' · extra' : ''})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="cf-btn"
                  disabled={!pick[item.planId]}
                  onClick={() => {
                    const w = activeLibrary.find((x) => x.id === pick[item.planId]);
                    if (!w) return;
                    patchItem(i, { assignments: [...item.assignments, toSprintAssignment(w)] });
                    setPick((p) => ({ ...p, [item.planId]: '' }));
                  }}
                >
                  Attach
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanEditor;
