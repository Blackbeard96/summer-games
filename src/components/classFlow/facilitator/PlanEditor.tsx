import React, { useEffect, useState } from 'react';
import type { CfSprintPlanItem } from '../../../types/classFlowWork';
import { newPlanItem, updateCfConfig } from '../../../utils/classFlowWorkService';
import SprintWorkPicker from '../SprintWorkPicker';

interface Props {
  sessionId: string;
  plan: CfSprintPlanItem[];
  activePlanId: string | null;
  classId?: string | null;
  actorUid: string;
  onMessage: (msg: string, error?: boolean) => void;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

const PlanEditor: React.FC<Props> = ({ sessionId, plan, activePlanId, classId, actorUid, onMessage }) => {
  const [draft, setDraft] = useState<CfSprintPlanItem[]>(plan);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const planKey = JSON.stringify(plan);
  useEffect(() => {
    if (!dirty) setDraft(JSON.parse(planKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

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
          <div className="cf-sub">Attach library work or create new work for each sprint. Points set here apply to that sprint only.</div>
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
            <div style={{ marginTop: 8 }}>
              <SprintWorkPicker
                assignments={item.assignments}
                onChange={(assignments) => patchItem(i, { assignments })}
                actorUid={actorUid}
                classId={classId}
                onMessage={onMessage}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanEditor;
