import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  MAX_ACTIVE_WEEKLY_GOALS,
  WEEKLY_EVIDENCE_LABELS,
  WEEKLY_GOAL_TYPE_LABELS,
  type WeeklyEvidenceType,
  type WeeklyGoalType,
  defaultEvidenceForGoalType,
} from '../types/weeklyGoals';
import type { WeeklyGoalDoc } from '../types/weeklyGoals';
import {
  createWeeklyGoal,
  subscribeWeeklyGoals,
  submitCustomEvidence,
  countOverlappingOpenGoals,
} from '../utils/weeklyGoalsService';
import { deriveDisplayStatus, isGoalInActiveWindow } from '../utils/weeklyGoalDerived';

function defaultWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const EVIDENCE_OPTIONS: WeeklyEvidenceType[] = [
  'tracked_completion_rate',
  'tracked_participation',
  'tracked_completion_speed',
  'custom_admin_verified',
];

const GOAL_TYPES: WeeklyGoalType[] = [
  'sprint_completion_rate',
  'live_event_participation',
  'sprint_assignment_speed',
  'custom',
];

function statusLabel(s: WeeklyGoalDoc['status']): string {
  switch (s) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'achieved':
      return 'Achieved';
    case 'missed':
      return 'Missed';
    default:
      return s;
  }
}

function verificationLabel(v: WeeklyGoalDoc['verificationStatus']): string {
  switch (v) {
    case 'not_required':
      return '—';
    case 'pending_admin_review':
      return 'Pending admin review';
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    default:
      return v;
  }
}

function progressSummary(g: WeeklyGoalDoc): string {
  if (g.goalType === 'sprint_completion_rate' && g.evidenceType === 'tracked_completion_rate') {
    const n = g.numerator ?? 0;
    const d = g.denominator ?? 0;
    const p = g.percentValue ?? 0;
    return `${n} / ${d} (${p}%)`;
  }
  if (g.goalType === 'live_event_participation' && g.evidenceType === 'tracked_participation') {
    return `${g.currentValue} / ${g.targetValue}`;
  }
  if (g.goalType === 'sprint_assignment_speed' && g.evidenceType === 'tracked_completion_speed') {
    const q = g.qualifyingAssignmentsCompleted ?? 0;
    const h = g.speedTargetHours ?? 24;
    return `${q} / ${g.targetValue} within ${h}h`;
  }
  if (g.goalType === 'custom') {
    return g.customEvidenceText ? 'Evidence submitted' : 'No evidence yet';
  }
  return `${g.currentValue} / ${g.targetValue}`;
}

const WeeklyGoalsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [goals, setGoals] = useState<WeeklyGoalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalType, setGoalType] = useState<WeeklyGoalType>('live_event_participation');
  const [evidenceType, setEvidenceType] = useState<WeeklyEvidenceType>(
    defaultEvidenceForGoalType('live_event_participation')
  );
  const [targetValue, setTargetValue] = useState(4);
  const [speedTargetHours, setSpeedTargetHours] = useState(24);
  const [optionalNotes, setOptionalNotes] = useState('');
  const [weekStart, setWeekStart] = useState(() => defaultWeekBounds().start.toISOString().slice(0, 10));
  const [weekEnd, setWeekEnd] = useState(() => defaultWeekBounds().end.toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const [customText, setCustomText] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [submitGoalId, setSubmitGoalId] = useState<string | null>(null);

  useEffect(() => {
    setEvidenceType(defaultEvidenceForGoalType(goalType));
  }, [goalType]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeWeeklyGoals(
      uid,
      (list) => {
        setGoals(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid]);

  const nowMs = Date.now();

  const activeCountForNewWeek = useMemo(() => {
    const ws = new Date(weekStart + 'T00:00:00').getTime();
    const we = new Date(weekEnd + 'T23:59:59').getTime();
    return countOverlappingOpenGoals(goals, ws, we);
  }, [goals, weekStart, weekEnd]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setErr(null);
    setSaving(true);
    try {
      const ws = new Date(weekStart + 'T00:00:00');
      const we = new Date(weekEnd + 'T23:59:59');
      let unitLabel = '';
      if (goalType === 'sprint_completion_rate') unitLabel = '%';
      else if (goalType === 'live_event_participation') unitLabel = 'events';
      else if (goalType === 'sprint_assignment_speed') unitLabel = 'assignments';
      else unitLabel = 'goal';

      await createWeeklyGoal(uid, {
        title,
        description,
        goalType,
        evidenceType,
        targetValue,
        unitLabel,
        weekStartDate: ws,
        weekEndDate: we,
        optionalNotes: optionalNotes.trim() || undefined,
        speedTargetHours: goalType === 'sprint_assignment_speed' ? speedTargetHours : undefined,
      });
      setTitle('');
      setDescription('');
      setOptionalNotes('');
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : String(er));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEvidence = async (goalId: string) => {
    if (!uid) return;
    setErr(null);
    try {
      await submitCustomEvidence(uid, goalId, customText, customNotes);
      setSubmitGoalId(null);
      setCustomText('');
      setCustomNotes('');
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : String(er));
    }
  };

  if (!uid) {
    return (
      <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <p style={{ color: '#6b7280' }}>Sign in to manage weekly goals.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto', color: '#111827' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Weekly goals</h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        Set up to {MAX_ACTIVE_WEEKLY_GOALS} active goals per week. Tracked goals update from Live Events and class
        sprints while you participate. Custom goals need admin verification.
      </p>

      {err && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            marginBottom: '1rem',
          }}
        >
          {err}
        </div>
      )}

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '1.25rem',
          marginBottom: '2rem',
          background: '#fafafa',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Create a weekly goal</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label>
            <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Title</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <label>
              <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Goal type</span>
              <select
                value={goalType}
                onChange={(e) => setGoalType(e.target.value as WeeklyGoalType)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 220 }}
              >
                {GOAL_TYPES.map((gt) => (
                  <option key={gt} value={gt}>
                    {WEEKLY_GOAL_TYPE_LABELS[gt]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Evidence type</span>
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as WeeklyEvidenceType)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 260 }}
              >
                {EVIDENCE_OPTIONS.map((et) => (
                  <option key={et} value={et}>
                    {WEEKLY_EVIDENCE_LABELS[et]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            <label>
              <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>
                Target {goalType === 'sprint_completion_rate' ? '(%)' : goalType === 'sprint_assignment_speed' ? '(count)' : ''}
              </span>
              <input
                type="number"
                required
                min={1}
                value={targetValue}
                onChange={(e) => setTargetValue(Number(e.target.value))}
                style={{ width: 120, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            {goalType === 'sprint_assignment_speed' && (
              <label>
                <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Within (hours)</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={speedTargetHours}
                  onChange={(e) => setSpeedTargetHours(Number(e.target.value))}
                  style={{ width: 120, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </label>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <label>
              <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Week start</span>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Week end</span>
              <input
                type="date"
                value={weekEnd}
                onChange={(e) => setWeekEnd(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
          </div>
          <label>
            <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Optional notes</span>
            <input
              value={optionalNotes}
              onChange={(e) => setOptionalNotes(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Active goals overlapping this window: {activeCountForNewWeek} / {MAX_ACTIVE_WEEKLY_GOALS}
          </p>
          <button
            type="submit"
            disabled={saving || activeCountForNewWeek >= MAX_ACTIVE_WEEKLY_GOALS}
            style={{
              alignSelf: 'flex-start',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem 1.25rem',
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: activeCountForNewWeek >= MAX_ACTIVE_WEEKLY_GOALS ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Create goal'}
          </button>
        </form>
      </section>

      <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Your goals</h2>
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : goals.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No weekly goals yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {goals.map((g) => {
            const displayStatus = deriveDisplayStatus(g, nowMs);
            const inWindow = isGoalInActiveWindow(g, nowMs);
            return (
              <li
                key={g.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '1rem 1.25rem',
                  background: 'white',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{g.title}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>{g.description}</div>
                <div style={{ fontSize: '0.875rem', display: 'grid', gap: '0.25rem' }}>
                  <div>
                    <strong>Type:</strong> {WEEKLY_GOAL_TYPE_LABELS[g.goalType]}
                  </div>
                  <div>
                    <strong>Evidence:</strong> {WEEKLY_EVIDENCE_LABELS[g.evidenceType]}
                  </div>
                  <div>
                    <strong>Progress:</strong> {progressSummary(g)}
                  </div>
                  <div>
                    <strong>Status:</strong> {statusLabel(displayStatus)}
                    {inWindow ? ' · current week window' : ' · past/future week'}
                  </div>
                  {g.evidenceType === 'custom_admin_verified' && (
                    <div>
                      <strong>Verification:</strong> {verificationLabel(g.verificationStatus)}
                    </div>
                  )}
                  {g.customEvidenceText && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong>Submitted evidence:</strong> {g.customEvidenceText}
                    </div>
                  )}
                  {g.adminFeedback && (
                    <div style={{ color: '#4b5563' }}>
                      <strong>Admin feedback:</strong> {g.adminFeedback}
                    </div>
                  )}
                </div>
                {g.goalType === 'custom' &&
                  g.evidenceType === 'custom_admin_verified' &&
                  g.verificationStatus === 'not_required' && (
                    <div style={{ marginTop: '0.75rem' }}>
                      {submitGoalId === g.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <textarea
                            placeholder="Describe your evidence for this goal"
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            rows={3}
                            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                          />
                          <input
                            placeholder="Optional notes / proof"
                            value={customNotes}
                            onChange={(e) => setCustomNotes(e.target.value)}
                            style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => handleSubmitEvidence(g.id)}
                              disabled={!customText.trim()}
                              style={{
                                background: '#059669',
                                color: 'white',
                                border: 'none',
                                borderRadius: 8,
                                padding: '0.4rem 0.9rem',
                                cursor: 'pointer',
                              }}
                            >
                              Submit for review
                            </button>
                            <button type="button" onClick={() => setSubmitGoalId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSubmitGoalId(g.id)}
                          style={{
                            background: '#e0e7ff',
                            color: '#3730a3',
                            border: 'none',
                            borderRadius: 8,
                            padding: '0.4rem 0.9rem',
                            cursor: 'pointer',
                          }}
                        >
                          Submit evidence
                        </button>
                      )}
                    </div>
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default WeeklyGoalsPage;
