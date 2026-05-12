import React, { useEffect, useMemo, useState } from 'react';
import type { Assessment } from '../types/assessmentGoals';
import {
  applyAssessmentResults,
  getAssessment,
  getResultsByAssessment,
  setAssessmentResult,
} from '../utils/assessmentGoalsFirestore';
import { computePPChange, formatPPChange } from '../utils/assessmentGoals';

export interface LiveEventWeeklyDeliverableMarkPanelProps {
  classId: string;
  goalSettingAssessmentId: string;
  hostUid: string;
  /** Prefer full class roster; falls back to session players if empty. */
  classStudentRoster: { userId: string; displayName: string }[] | null;
  sessionPlayers: { userId: string; displayName: string }[];
  isSessionHost: boolean;
}

type Row = {
  studentId: string;
  displayName: string;
  actualScore?: number;
  ppChange?: number;
  applied?: boolean;
};

function buildRows(
  a: Assessment,
  rosterRows: { userId: string; displayName: string }[],
  results: Awaited<ReturnType<typeof getResultsByAssessment>>
): Row[] {
  const ms = a.maxScore || 100;
  return rosterRows.map((r) => {
    const result = results.find((x) => x.studentId === r.userId);
    let ppPreview: number | undefined;
    if (a.type === 'weekly_deliverable' && result?.actualScore !== undefined) {
      ppPreview = computePPChange(ms, result.actualScore, a).ppChange;
    }
    return {
      studentId: r.userId,
      displayName: r.displayName || 'Student',
      actualScore: result?.actualScore,
      ppChange: result?.ppChange ?? ppPreview,
      applied: result?.applied ?? false,
    };
  });
}

const LiveEventWeeklyDeliverableMarkPanel: React.FC<LiveEventWeeklyDeliverableMarkPanelProps> = ({
  classId,
  goalSettingAssessmentId,
  hostUid,
  classStudentRoster,
  sessionPlayers,
  isSessionHost,
}) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [wrongType, setWrongType] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [applyBusy, setApplyBusy] = useState(false);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);

  const roster = useMemo(() => {
    if (classStudentRoster && classStudentRoster.length > 0) return classStudentRoster;
    return sessionPlayers;
  }, [classStudentRoster, sessionPlayers]);

  const rosterKey = useMemo(() => roster.map((r) => r.userId).sort().join(','), [roster]);

  const maxScore = assessment?.maxScore || 100;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!goalSettingAssessmentId.trim() || !classId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setWrongType(false);
      setPanelMessage(null);
      try {
        const a = await getAssessment(goalSettingAssessmentId.trim());
        if (cancelled) return;
        if (!a) {
          setAssessment(null);
          setRows([]);
          setPanelMessage('Linked assessment was not found.');
          return;
        }
        if (a.classId !== classId) {
          setAssessment(null);
          setRows([]);
          setPanelMessage('Linked assessment belongs to a different class than this live session.');
          return;
        }
        if (a.type !== 'weekly_deliverable') {
          setAssessment(null);
          setWrongType(true);
          setRows([]);
          return;
        }
        setAssessment(a);
        const results = await getResultsByAssessment(a.id);
        if (cancelled) return;
        setRows(buildRows(a, roster, results));
      } catch (e) {
        console.error('LiveEventWeeklyDeliverableMarkPanel load failed', e);
        if (!cancelled) setPanelMessage('Could not load deliverable assessment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [goalSettingAssessmentId, classId, rosterKey]);

  const pendingApplyCount = useMemo(
    () => rows.filter((r) => !r.applied && r.actualScore !== undefined).length,
    [rows]
  );

  const onToggleComplete = async (studentId: string, completed: boolean) => {
    if (!assessment || !isSessionHost) return;
    setSaving((s) => ({ ...s, [studentId]: true }));
    setPanelMessage(null);
    try {
      const score = completed ? maxScore : 0;
      await setAssessmentResult(assessment.id, studentId, score, hostUid);
      const results = await getResultsByAssessment(assessment.id);
      setRows(buildRows(assessment, roster, results));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save completion.';
      setPanelMessage(msg);
    } finally {
      setSaving((s) => ({ ...s, [studentId]: false }));
    }
  };

  const onApply = async () => {
    if (!assessment || !isSessionHost) return;
    setApplyBusy(true);
    setPanelMessage(null);
    try {
      const res = await applyAssessmentResults(assessment.id);
      if (!res.success) {
        setPanelMessage(res.errors?.join(' ') || 'Apply failed.');
      } else if (res.appliedCount === 0) {
        setPanelMessage('Nothing new to apply (results may already be applied).');
      } else {
        setPanelMessage(`Applied vault PP / rewards for ${res.appliedCount} student(s).`);
      }
      const results = await getResultsByAssessment(assessment.id);
      setRows(buildRows(assessment, roster, results));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not apply results.';
      setPanelMessage(msg);
    } finally {
      setApplyBusy(false);
    }
  };

  if (!isSessionHost || !goalSettingAssessmentId.trim()) return null;

  if (loading) {
    return (
      <div
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          background: 'rgba(0,0,0,0.12)',
          fontSize: '0.85rem',
        }}
      >
        Loading weekly deliverable…
      </div>
    );
  }

  if (wrongType) {
    return (
      <div
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          background: 'rgba(0,0,0,0.12)',
          fontSize: '0.8rem',
          opacity: 0.9,
        }}
      >
        The linked <strong>Goal setting</strong> assessment is not a Weekly Deliverable. To mark deliverables here,
        launch this room with a Weekly Deliverable assessment linked under Goal setting.
      </div>
    );
  }

  if (!assessment) {
    return panelMessage ? (
      <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#fecaca' }}>{panelMessage}</div>
    ) : null;
  }

  const assignmentLabel = assessment.weeklyDeliverableConfig?.assignmentType?.trim() || assessment.title;

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem',
        borderRadius: '0.5rem',
        background: 'rgba(6,95,70,0.35)',
        border: '1px solid rgba(52,211,153,0.35)',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 6 }}>📦 Weekly deliverable (Goal setting)</div>
      <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', opacity: 0.95, lineHeight: 1.45 }}>
        Autofilled from the linked assessment: <strong>{assignmentLabel}</strong>. Mark each student completed or not —
        PP follows the assessment tiers (e.g. Completed / Did not Complete). Use <strong>Apply pending PP</strong> to push
        vault balances (same flow as the Assessment dashboard).
      </p>
      {panelMessage && (
        <div style={{ marginBottom: 8, fontSize: '0.8rem', color: '#fef08a' }} role="status">
          {panelMessage}
        </div>
      )}
      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.length === 0 ? (
          <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            No roster in this room yet — ensure this live session is tied to a class so the full roster loads.
          </div>
        ) : (
          rows.map((row) => {
            const completed = (row.actualScore ?? 0) >= maxScore;
            const busy = !!saving[row.studentId];
            const disabled = busy || row.applied;
            return (
              <div
                key={row.studentId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0.35rem 0.5rem',
                  background: 'rgba(0,0,0,0.15)',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 600, minWidth: 0 }}>{row.displayName}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void onToggleComplete(row.studentId, true)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: 6,
                      border: completed ? '2px solid #a7f3d0' : '1px solid rgba(255,255,255,0.35)',
                      background: completed ? 'rgba(52,211,153,0.35)' : 'transparent',
                      color: '#ecfdf5',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void onToggleComplete(row.studentId, false)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: 6,
                      border: !completed && row.actualScore !== undefined ? '2px solid #fecaca' : '1px solid rgba(255,255,255,0.35)',
                      background: !completed && row.actualScore !== undefined ? 'rgba(248,113,113,0.2)' : 'transparent',
                      color: '#fecaca',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    No
                  </button>
                  {row.ppChange !== undefined ? (
                    <span style={{ fontWeight: 700, color: row.ppChange >= 0 ? '#a7f3d0' : '#fecaca' }}>
                      {formatPPChange(row.ppChange)}
                    </span>
                  ) : (
                    <span style={{ opacity: 0.75 }}>—</span>
                  )}
                  {row.applied ? (
                    <span style={{ fontSize: '0.72rem', color: '#a7f3d0' }}>Applied</span>
                  ) : (
                    <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>Pending apply</span>
                  )}
                  {busy ? <span style={{ fontSize: '0.72rem' }}>Saving…</span> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <button
        type="button"
        disabled={applyBusy || pendingApplyCount === 0}
        onClick={() => void onApply()}
        style={{
          marginTop: 10,
          padding: '0.45rem 0.85rem',
          borderRadius: 8,
          border: 'none',
          fontWeight: 700,
          cursor: applyBusy || pendingApplyCount === 0 ? 'not-allowed' : 'pointer',
          background: pendingApplyCount > 0 ? '#34d399' : 'rgba(148,163,184,0.4)',
          color: pendingApplyCount > 0 ? '#064e3b' : '#e2e8f0',
        }}
      >
        {applyBusy ? 'Applying…' : `Apply pending PP (${pendingApplyCount})`}
      </button>
    </div>
  );
};

export default LiveEventWeeklyDeliverableMarkPanel;
