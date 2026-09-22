/**
 * Admin Work Board — create periods, assign Work (W), verify completions.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { ENERGY_TYPES, type BattleEnergyType } from '../../constants/energyTypes';
import type { WorkCategory, WorkItem, WorkPeriod } from '../../types/workBoard';
import { WORK_CATEGORY_LABELS } from '../../types/workBoard';
import {
  adminSetWorkCompletion,
  createWorkItem,
  createWorkPeriod,
  listCompletionsForClass,
  listWorkItemsForClass,
  listWorkPeriodsForClass,
  updateWorkItem,
} from '../../utils/workBoardService';
import type { WorkCompletion } from '../../types/workBoard';

type ClassroomOpt = { id: string; name: string };

const WorkBoardAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [classrooms, setClassrooms] = useState<ClassroomOpt[]>([]);
  const [classId, setClassId] = useState('');
  const [periods, setPeriods] = useState<WorkPeriod[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [completions, setCompletions] = useState<WorkCompletion[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [periodTitle, setPeriodTitle] = useState('Today');
  const [periodScope, setPeriodScope] = useState<WorkPeriod['scope']>('day');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<WorkCategory>('academic');
  const [required, setRequired] = useState(true);
  const [wValue, setWValue] = useState(1);
  const [ppReward, setPpReward] = useState(0);
  const [periodId, setPeriodId] = useState('');
  const [energy, setEnergy] = useState<BattleEnergyType>(ENERGY_TYPES.MENTAL);
  const [completionMode, setCompletionMode] = useState<WorkItem['completionMode']>('manual_student');

  const refresh = useCallback(async () => {
    if (!classId) {
      setPeriods([]);
      setItems([]);
      setCompletions([]);
      return;
    }
    const [p, i, c] = await Promise.all([
      listWorkPeriodsForClass(classId),
      listWorkItemsForClass(classId),
      listCompletionsForClass(classId),
    ]);
    setPeriods(p);
    setItems(i);
    setCompletions(c);
  }, [classId]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'classrooms'));
      const list = snap.docs.map((d) => ({
        id: d.id,
        name: String((d.data() as { name?: string }).name || d.id),
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setClassrooms(list);
      if (list.length && !classId) setClassId(list[0].id);
    })().catch((e) => console.error(e));
  }, [classId]);

  useEffect(() => {
    refresh().catch((e) => console.error(e));
  }, [refresh]);

  const className = classrooms.find((c) => c.id === classId)?.name;

  const handleCreatePeriod = async () => {
    if (!currentUser || !classId) return;
    setBusy(true);
    setMessage(null);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await createWorkPeriod({
        title: periodTitle.trim() || 'Work Period',
        classId,
        className,
        scope: periodScope,
        startsAt: now,
        endsAt: end,
        status: 'open',
        createdBy: currentUser.uid,
      });
      setMessage('Period created.');
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to create period');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateWork = async () => {
    if (!currentUser || !classId || !title.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await createWorkItem({
        title: title.trim(),
        description: description.trim(),
        classId,
        className,
        scope: periodScope,
        periodId: periodId || null,
        category,
        required,
        wValue: Math.max(0, Number(wValue) || 0),
        ppReward: Math.max(0, Math.floor(Number(ppReward) || 0)),
        relatedSkillIds: [],
        completionMode,
        energyTypes: [energy],
        status: 'active',
        createdBy: currentUser.uid,
      });
      setTitle('');
      setDescription('');
      setMessage('Work item created.');
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to create work');
    } finally {
      setBusy(false);
    }
  };

  const pending = completions.filter((c) => c.status === 'submitted');

  return (
    <div style={{ padding: '1rem', maxWidth: 1100 }}>
      <h2 style={{ marginTop: 0, color: '#0f172a' }}>Work Board (W)</h2>
      <p style={{ color: '#475569', maxWidth: 720 }}>
        Assign Required / Optional Work for a class period. Students declare Expected W, complete Work,
        and see Expected vs Actual. Completions feed existing energy workStats.
      </p>

      <label style={{ display: 'block', marginBottom: '1rem', color: '#0f172a' }}>
        Class{' '}
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          style={{ marginLeft: 8, padding: '0.35rem 0.5rem' }}
        >
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {message && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: 8,
            color: '#065f46',
          }}
        >
          {message}
        </div>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '1rem',
          }}
        >
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>New period</h3>
          <input
            value={periodTitle}
            onChange={(e) => setPeriodTitle(e.target.value)}
            placeholder="Period title"
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
          <select
            value={periodScope}
            onChange={(e) => setPeriodScope(e.target.value as WorkPeriod['scope'])}
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          >
            <option value="period">Period</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="mission">Mission</option>
            <option value="project">Project</option>
          </select>
          <button type="button" disabled={busy || !classId} onClick={handleCreatePeriod}>
            Create open period
          </button>
          <ul style={{ marginTop: 12, paddingLeft: 18, color: '#334155' }}>
            {periods.slice(0, 8).map((p) => (
              <li key={p.id}>
                {p.title} · {p.status} · {p.scope}
              </li>
            ))}
          </ul>
        </div>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '1rem',
          }}
        >
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>New Work item</h3>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            rows={3}
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WorkCategory)}
              style={{ padding: 8 }}
            >
              {(Object.keys(WORK_CATEGORY_LABELS) as WorkCategory[]).map((k) => (
                <option key={k} value={k}>
                  {WORK_CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              value={energy}
              onChange={(e) => setEnergy(e.target.value as BattleEnergyType)}
              style={{ padding: 8 }}
            >
              {Object.values(ENERGY_TYPES).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <label style={{ color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Required
            </label>
            <select
              value={completionMode}
              onChange={(e) => setCompletionMode(e.target.value as WorkItem['completionMode'])}
              style={{ padding: 8 }}
            >
              <option value="manual_student">Student complete</option>
              <option value="manual_admin">Admin verify</option>
            </select>
            <label style={{ color: '#0f172a' }}>
              W{' '}
              <input
                type="number"
                min={0}
                value={wValue}
                onChange={(e) => setWValue(Number(e.target.value))}
                style={{ width: 72, marginLeft: 6 }}
              />
            </label>
            <label style={{ color: '#0f172a' }}>
              PP{' '}
              <input
                type="number"
                min={0}
                value={ppReward}
                onChange={(e) => setPpReward(Number(e.target.value))}
                style={{ width: 72, marginLeft: 6 }}
              />
            </label>
          </div>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          >
            <option value="">No period link</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !classId || !title.trim()} onClick={handleCreateWork}>
            Create Work
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#0f172a' }}>Active / all Work ({items.length})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#0f172a' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: 8 }}>Title</th>
                <th>Req</th>
                <th>W</th>
                <th>PP</th>
                <th>Status</th>
                <th>Mode</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 8 }}>{item.title}</td>
                  <td>{item.required ? 'Yes' : 'No'}</td>
                  <td>{item.wValue}</td>
                  <td>{item.ppReward}</td>
                  <td>{item.status}</td>
                  <td>{item.completionMode}</td>
                  <td>
                    {item.status === 'active' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await updateWorkItem(item.id, { status: 'inactive' });
                          await refresh();
                        }}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await updateWorkItem(item.id, { status: 'active' });
                          await refresh();
                        }}
                      >
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 style={{ color: '#0f172a' }}>Pending verification ({pending.length})</h3>
        {pending.length === 0 ? (
          <p style={{ color: '#64748b' }}>No submissions waiting.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {pending.map((c) => {
              const work = items.find((i) => i.id === c.workId);
              return (
                <li
                  key={c.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: '0.75rem',
                    marginBottom: 8,
                    background: '#fff7ed',
                    borderRadius: 8,
                    border: '1px solid #fed7aa',
                    color: '#0f172a',
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {work?.title || c.workId} · student {c.studentId.slice(0, 8)}…
                  </span>
                  <button
                    type="button"
                    disabled={!work || !currentUser}
                    onClick={async () => {
                      if (!work || !currentUser) return;
                      await adminSetWorkCompletion({
                        work,
                        studentId: c.studentId,
                        status: 'verified',
                        adminUid: currentUser.uid,
                      });
                      await refresh();
                    }}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={!work || !currentUser}
                    onClick={async () => {
                      if (!work || !currentUser) return;
                      await adminSetWorkCompletion({
                        work,
                        studentId: c.studentId,
                        status: 'rejected',
                        adminUid: currentUser.uid,
                        rejectionNote: 'Needs revision',
                      });
                      await refresh();
                    }}
                  >
                    Reject
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default WorkBoardAdmin;
