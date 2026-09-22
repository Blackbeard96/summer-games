/**
 * Student Work Board — Required / Optional / Completed + Expected W declaration.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import type { WorkItem, WorkPeriod } from '../types/workBoard';
import { WORK_CATEGORY_LABELS } from '../types/workBoard';
import {
  declareExpectedW,
  getStudentWorkBoard,
  getWorkDeclaration,
  listWorkPeriodsForClass,
  submitWorkCompletion,
} from '../utils/workBoardService';
import type { WorkBoardTotals, WorkCompletion } from '../types/workBoard';
import { safeCompletionRate } from '../types/workBoard';

const WorkBoardPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [classId, setClassId] = useState<string>('');
  const [periods, setPeriods] = useState<WorkPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [required, setRequired] = useState<WorkItem[]>([]);
  const [optional, setOptional] = useState<WorkItem[]>([]);
  const [completed, setCompleted] = useState<WorkItem[]>([]);
  const [completions, setCompletions] = useState<Record<string, WorkCompletion>>({});
  const [totals, setTotals] = useState<WorkBoardTotals | null>(null);
  const [declaredW, setDeclaredW] = useState(0);
  const [declareInput, setDeclareInput] = useState('0');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    const studentSnap = await getDoc(doc(db, 'students', currentUser.uid));
    const cid = studentSnap.exists()
      ? String((studentSnap.data() as { classId?: string }).classId || '')
      : '';
    setClassId(cid);
    if (!cid) {
      setPeriods([]);
      setRequired([]);
      setOptional([]);
      setCompleted([]);
      setTotals(null);
      return;
    }
    const periodList = await listWorkPeriodsForClass(cid);
    setPeriods(periodList);
    const open = periodList.find((p) => p.status === 'open') || periodList[0];
    const pid = periodId && periodList.some((p) => p.id === periodId) ? periodId : open?.id || '';
    if (pid !== periodId) setPeriodId(pid);

    const board = await getStudentWorkBoard({
      classId: cid,
      studentId: currentUser.uid,
      periodId: pid || null,
    });
    setRequired(board.required);
    setOptional(board.optional);
    setCompleted(board.completed);
    setCompletions(board.completions);
    setTotals(board.totals);

    if (pid) {
      const decl = await getWorkDeclaration(pid, currentUser.uid);
      const dw = decl?.declaredW ?? 0;
      setDeclaredW(dw);
      setDeclareInput(String(dw));
    }
  }, [currentUser, periodId]);

  useEffect(() => {
    load().catch((e) => console.error(e));
  }, [load]);

  const rate = useMemo(
    () => safeCompletionRate(totals?.completedW || 0, declaredW),
    [totals, declaredW]
  );

  const handleDeclare = async () => {
    if (!currentUser || !classId || !periodId) return;
    setBusy(true);
    setMessage(null);
    try {
      const value = Math.max(0, Math.floor(Number(declareInput) || 0));
      await declareExpectedW({
        periodId,
        studentId: currentUser.uid,
        classId,
        declaredW: value,
        requiredWAtDeclaration: totals?.requiredW || 0,
        availableWAtDeclaration: totals?.totalWAvailable || 0,
      });
      setDeclaredW(value);
      setMessage('Expected W saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save Expected W');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (item: WorkItem) => {
    if (!currentUser) return;
    setBusy(true);
    setMessage(null);
    try {
      await submitWorkCompletion({ work: item, studentId: currentUser.uid });
      setMessage(
        item.completionMode === 'manual_admin'
          ? 'Submitted for teacher verification.'
          : 'Work marked complete.'
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not complete work');
    } finally {
      setBusy(false);
    }
  };

  const renderList = (items: WorkItem[], empty: string, showAction: boolean) => {
    if (!items.length) {
      return <p style={{ color: '#94a3b8', margin: 0 }}>{empty}</p>;
    }
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item) => {
          const c = completions[item.id];
          return (
            <li
              key={item.id}
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 12,
                padding: '0.85rem 1rem',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.title}</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 4 }}>
                    {WORK_CATEGORY_LABELS[item.category]} · {item.wValue} W
                    {item.ppReward > 0 ? ` · ${item.ppReward} PP` : ''}
                    {item.required ? ' · Required' : ' · Optional'}
                    {c ? ` · ${c.status}` : ''}
                  </div>
                  {item.description ? (
                    <p style={{ margin: '0.5rem 0 0', color: '#cbd5e1', fontSize: '0.9rem' }}>
                      {item.description}
                    </p>
                  ) : null}
                </div>
                {showAction && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleComplete(item)}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.completionMode === 'manual_admin' ? 'Submit' : 'Complete'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  if (!currentUser) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.25rem' }}>
      <h1 style={{ marginTop: 0, color: '#e2e8f0' }}>Work Board</h1>
      <p style={{ color: '#94a3b8' }}>
        Declare how much Work (W) you expect to complete, then track Required, Optional, and Completed.
      </p>

      {!classId && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(127, 29, 29, 0.35)',
            border: '1px solid #f87171',
            borderRadius: 10,
            color: '#fecaca',
          }}
        >
          You need a classroom assignment (`students.classId`) to use the Work Board.
        </div>
      )}

      {classId && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#cbd5e1', marginRight: 8 }}>Period</label>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 8 }}
            >
              {periods.length === 0 && <option value="">No periods yet</option>}
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {totals && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 10,
                marginBottom: '1.25rem',
              }}
            >
              {[
                ['Available', totals.totalWAvailable],
                ['Required', totals.requiredW],
                ['Optional', totals.optionalW],
                ['Completed', totals.completedW],
                ['Remaining', totals.remainingW],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    borderRadius: 10,
                    padding: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                    {label} W
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          <section
            style={{
              background: 'rgba(30, 41, 59, 0.9)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: 12,
              padding: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <h2 style={{ marginTop: 0, color: '#e0f2fe', fontSize: '1.1rem' }}>Expected W</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              How much Work do you expect to complete this period? Accuracy matters more than inflated
              declarations.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                value={declareInput}
                onChange={(e) => setDeclareInput(e.target.value)}
                disabled={!periodId || busy}
                style={{ width: 100, padding: '0.5rem', borderRadius: 8 }}
              />
              <button
                type="button"
                disabled={!periodId || busy}
                onClick={handleDeclare}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 8,
                  border: 'none',
                  background: '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Save Expected W
              </button>
              <span style={{ color: '#cbd5e1' }}>
                Expected {declaredW} · Actual {totals?.completedW ?? 0}
                {rate == null ? ' · (no rate when Expected W is 0)' : ` · Rate ${(rate * 100).toFixed(0)}%`}
              </span>
            </div>
          </section>

          {message && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #34d399',
                color: '#a7f3d0',
              }}
            >
              {message}
            </div>
          )}

          <h2 style={{ color: '#fbbf24', fontSize: '1.05rem' }}>Required Work</h2>
          {renderList(required, 'No required work remaining.', true)}

          <h2 style={{ color: '#a78bfa', fontSize: '1.05rem', marginTop: '1.5rem' }}>Optional Work</h2>
          {renderList(optional, 'No optional work remaining.', true)}

          <h2 style={{ color: '#6ee7b7', fontSize: '1.05rem', marginTop: '1.5rem' }}>Completed Work</h2>
          {renderList(completed, 'Nothing completed yet.', false)}
        </>
      )}
    </div>
  );
};

export default WorkBoardPage;
