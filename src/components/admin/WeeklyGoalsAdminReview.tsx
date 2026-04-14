import React, { useCallback, useEffect, useState } from 'react';
import {
  WEEKLY_GOAL_TYPE_LABELS,
  WEEKLY_EVIDENCE_LABELS,
} from '../../types/weeklyGoals';
import type { WeeklyGoalDoc } from '../../types/weeklyGoals';
import {
  adminSetWeeklyGoalVerification,
  listPendingCustomWeeklyGoalsForAdmin,
} from '../../utils/weeklyGoalsService';
import { tsToMillis } from '../../utils/weeklyGoalDerived';

const WeeklyGoalsAdminReview: React.FC = () => {
  const [items, setItems] = useState<WeeklyGoalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await listPendingCustomWeeklyGoalsForAdmin(200);
      setItems(list);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (g: WeeklyGoalDoc, decision: 'verified' | 'rejected') => {
    setErr(null);
    try {
      await adminSetWeeklyGoalVerification({
        playerId: g.playerId,
        goalId: g.id,
        decision,
        feedback: feedback[g.id],
      });
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ padding: '1rem', maxWidth: 960 }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Weekly goals — custom review</h2>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
        Approve or reject player-submitted evidence for custom weekly goals.
      </p>
      <button
        type="button"
        onClick={() => load()}
        style={{
          marginBottom: '1rem',
          padding: '0.4rem 0.9rem',
          borderRadius: 8,
          border: '1px solid #d1d5db',
          background: 'white',
          cursor: 'pointer',
        }}
      >
        Refresh
      </button>
      {err && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '0.75rem',
            borderRadius: 8,
            marginBottom: '1rem',
          }}
        >
          {err}
        </div>
      )}
      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No goals pending review.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((g) => (
            <li
              key={`${g.playerId}_${g.id}`}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '1rem',
                background: '#fafafa',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 6 }}>
                Player: <code>{g.playerId}</code>
              </div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{g.title}</div>
              <div style={{ fontSize: '0.9rem', marginBottom: 8 }}>{g.description}</div>
              <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                <strong>Type:</strong> {WEEKLY_GOAL_TYPE_LABELS[g.goalType]} · <strong>Evidence:</strong>{' '}
                {WEEKLY_EVIDENCE_LABELS[g.evidenceType]}
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>
                Week: {new Date(tsToMillis(g.weekStartDate) ?? 0).toLocaleDateString()} —{' '}
                {new Date(tsToMillis(g.weekEndDate) ?? 0).toLocaleDateString()}
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Submitted evidence</strong>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{g.customEvidenceText || '—'}</div>
              </div>
              {g.customEvidenceNotes && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Notes</strong>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{g.customEvidenceNotes}</div>
                </div>
              )}
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ fontSize: '0.85rem' }}>Feedback (optional)</span>
                <input
                  value={feedback[g.id] || ''}
                  onChange={(e) => setFeedback((f) => ({ ...f, [g.id]: e.target.value }))}
                  style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => decide(g, 'verified')}
                  style={{
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.45rem 1rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Verify / achieve
                </button>
                <button
                  type="button"
                  onClick={() => decide(g, 'rejected')}
                  style={{
                    background: '#b91c1c',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.45rem 1rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default WeeklyGoalsAdminReview;
