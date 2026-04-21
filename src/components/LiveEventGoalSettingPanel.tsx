import React, { useCallback, useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Assessment, HabitDuration } from '../types/assessmentGoals';
import {
  getAssessment,
  getAssessmentsByClass,
  getAssessmentGoal,
  getHabitSubmission,
  submitLiveEventGoalSettingToAssessment,
} from '../utils/assessmentGoalsFirestore';

export interface LiveEventGoalSettingPanelProps {
  sessionId: string;
  classId: string;
  goalSettingAssessmentId?: string;
  goalSettingPrompt?: string;
  liveEventMode?: string;
  isSessionHost: boolean;
  currentUserId: string;
  displayName: string;
  onAppendBattleLog?: (line: string) => void | Promise<void>;
}

/**
 * Goal Setting live mode: students set or update goals on the linked assessment (same data as /assessment-goals).
 */
const LiveEventGoalSettingPanel: React.FC<LiveEventGoalSettingPanelProps> = ({
  sessionId,
  classId,
  goalSettingAssessmentId,
  goalSettingPrompt,
  liveEventMode,
  isSessionHost,
  currentUserId,
  displayName,
  onAppendBattleLog,
}) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [hostAssessments, setHostAssessments] = useState<Assessment[]>([]);
  const [hostAssessmentId, setHostAssessmentId] = useState(goalSettingAssessmentId || '');
  const [hostPrompt, setHostPrompt] = useState(goalSettingPrompt || '');
  const [goalScore, setGoalScore] = useState('');
  const [textGoal, setTextGoal] = useState('');
  const [habitText, setHabitText] = useState('');
  const [duration, setDuration] = useState<HabitDuration>('1_week');
  const [habitEvidence, setHabitEvidence] = useState('');
  const [storyEvidence, setStoryEvidence] = useState('');
  const [loading, setLoading] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [hostSaving, setHostSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGoalSetting = liveEventMode === 'goal_setting';

  useEffect(() => {
    setHostAssessmentId(goalSettingAssessmentId || '');
  }, [goalSettingAssessmentId]);

  useEffect(() => {
    setHostPrompt(goalSettingPrompt || '');
  }, [goalSettingPrompt]);

  useEffect(() => {
    if (!isGoalSetting || !goalSettingAssessmentId) {
      setAssessment(null);
      setAssessmentLoading(false);
      return;
    }
    let cancelled = false;
    setAssessmentLoading(true);
    (async () => {
      try {
        const [a, goal, sub] = await Promise.all([
          getAssessment(goalSettingAssessmentId),
          getAssessmentGoal(goalSettingAssessmentId, currentUserId),
          getHabitSubmission(goalSettingAssessmentId, currentUserId),
        ]);
        if (!cancelled) {
          setGoalScore('');
          setTextGoal('');
          setHabitText('');
          setDuration('1_week');
          setHabitEvidence('');
          setStoryEvidence('');
          setAssessment(a);
          if (a?.type === 'habits' && sub) {
            setHabitText(sub.habitText || '');
            setDuration(sub.duration || '1_week');
            setHabitEvidence(sub.evidence || '');
          } else if (a?.type === 'story-goal' && goal) {
            setTextGoal(goal.textGoal || '');
            setStoryEvidence(goal.evidence || '');
          } else if (goal && goal.goalScore !== undefined && goal.goalScore !== null) {
            setGoalScore(String(goal.goalScore));
          }
        }
      } finally {
        if (!cancelled) setAssessmentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGoalSetting, goalSettingAssessmentId, currentUserId]);

  useEffect(() => {
    if (!isGoalSetting || !isSessionHost || !classId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getAssessmentsByClass(classId);
        const open = list.filter((a) => a.gradingStatus === 'open' || a.gradingStatus === 'draft');
        if (!cancelled) setHostAssessments(open);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGoalSetting, isSessionHost, classId]);

  const saveHostGoalSettingLink = useCallback(async () => {
    if (!hostAssessmentId.trim()) {
      setError('Choose an assessment to link.');
      return;
    }
    setHostSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateDoc(doc(db, 'inSessionRooms', sessionId), {
        goalSettingAssessmentId: hostAssessmentId.trim(),
        goalSettingPrompt: hostPrompt.trim() || null,
        updatedAt: serverTimestamp(),
      });
      setMessage('Linked assessment updated for Goal Setting.');
      if (onAppendBattleLog) {
        const a = await getAssessment(hostAssessmentId.trim());
        await onAppendBattleLog(
          `🎯 Goal setting linked to assessment: ${a?.title ?? hostAssessmentId.trim()}`
        );
      }
    } catch (e) {
      console.error(e);
      setError('Could not save settings. Check Firestore permissions.');
    } finally {
      setHostSaving(false);
    }
  }, [sessionId, hostAssessmentId, hostPrompt, onAppendBattleLog]);

  const submitGoal = async () => {
    if (!goalSettingAssessmentId) {
      setError('The host has not linked an assessment yet.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await submitLiveEventGoalSettingToAssessment(
      assessment?.type === 'habits'
        ? {
            assessmentId: goalSettingAssessmentId,
            studentId: currentUserId,
            classId,
            sessionId,
            habitText,
            duration,
            habitEvidence: habitEvidence.trim() || null,
          }
        : assessment?.type === 'story-goal'
          ? {
              assessmentId: goalSettingAssessmentId,
              studentId: currentUserId,
              classId,
              sessionId,
              textGoal,
              evidence: storyEvidence.trim() || null,
            }
          : {
              assessmentId: goalSettingAssessmentId,
              studentId: currentUserId,
              classId,
              sessionId,
              goalScore: parseFloat(goalScore),
            }
    );

    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessage('Saved to Assessment Goals. Your teacher can review it on the dashboard.');
    if (onAppendBattleLog) {
      await onAppendBattleLog(`🎯 ${displayName} updated their goal (Assessment Goals).`);
    }
  };

  const submitDisabled =
    !assessment ||
    assessmentLoading ||
    (assessment.type === 'habits' && (habitText.trim().length < 3 || habitText.trim().length > 180)) ||
    (assessment.type === 'story-goal' &&
      (textGoal.trim().length < 3 || textGoal.trim().length > 500)) ||
    (assessment.type !== 'habits' &&
      assessment.type !== 'story-goal' &&
      (goalScore.trim() === '' || Number.isNaN(parseFloat(goalScore))));

  if (!isGoalSetting) return null;

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 25,
        marginBottom: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid #c4b5fd',
        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        color: '#4c1d95',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>🎯 Goal setting → Assessment Goals</h3>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.45 }}>
        Set or update your goal for the linked assessment. This is the same data as the <strong>Assessment Goals</strong>{' '}
        page — your teacher reviews it on the dashboard.
      </p>

      {isSessionHost && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: 'rgba(255,255,255,0.75)',
            borderRadius: '0.5rem',
            border: '1px solid #a78bfa',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Host: link assessment</div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Assessment</label>
          <select
            value={hostAssessmentId}
            onChange={(e) => setHostAssessmentId(e.target.value)}
            style={{ width: '100%', padding: '0.45rem', borderRadius: 6, marginBottom: 8 }}
          >
            <option value="">Select assessment…</option>
            {hostAssessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.type})
              </option>
            ))}
          </select>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
            Class prompt (optional)
          </label>
          <textarea
            value={hostPrompt}
            onChange={(e) => setHostPrompt(e.target.value)}
            rows={2}
            placeholder="e.g. Set a stretch goal for this week’s check-in."
            style={{ width: '100%', padding: '0.45rem', borderRadius: 6, marginBottom: 8, resize: 'vertical' }}
          />
          <button
            type="button"
            onClick={() => void saveHostGoalSettingLink()}
            disabled={hostSaving}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: '#6d28d9',
              color: '#fff',
              fontWeight: 700,
              cursor: hostSaving ? 'wait' : 'pointer',
            }}
          >
            {hostSaving ? 'Saving…' : 'Save link & prompt'}
          </button>
        </div>
      )}

      {goalSettingAssessmentId && assessment && (
        <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: 8 }}>
          Linked: <span style={{ color: '#5b21b6' }}>{assessment.title}</span> ({assessment.type})
        </div>
      )}

      {(goalSettingPrompt || hostPrompt) && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.75rem',
            background: 'rgba(255,255,255,0.88)',
            borderRadius: 8,
            fontSize: '0.9rem',
          }}
        >
          <strong>Prompt:</strong> {goalSettingPrompt || hostPrompt}
        </div>
      )}

      {!goalSettingAssessmentId && !isSessionHost && (
        <p style={{ fontSize: '0.85rem', margin: 0 }}>Waiting for the host to link an assessment…</p>
      )}

      {goalSettingAssessmentId && (
        <div
          style={{
            marginTop: '0.25rem',
            padding: '1rem',
            borderRadius: '0.65rem',
            border: '2px solid #6d28d9',
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 2px 12px rgba(109, 40, 217, 0.12)',
          }}
        >
          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', color: '#4c1d95' }}>Your goal</h4>
          {assessmentLoading ? (
            <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Loading form…</p>
          ) : !assessment ? (
            <p style={{ fontSize: '0.85rem', color: '#b91c1c' }}>Could not load this assessment.</p>
          ) : assessment.type === 'habits' ? (
            <>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Habit commitment (3–180 characters)
              </label>
              <textarea
                value={habitText}
                onChange={(e) => setHabitText(e.target.value)}
                rows={3}
                placeholder="What will you practice this week?"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '2px solid #a78bfa',
                  marginBottom: 12,
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value as HabitDuration)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 8, marginBottom: 12 }}
              >
                <option value="1_class">1 class</option>
                <option value="1_day">1 day</option>
                <option value="3_days">3 days</option>
                <option value="1_week">1 week</option>
              </select>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Optional notes (stored as evidence when type is “other”)
              </label>
              <textarea
                value={habitEvidence}
                onChange={(e) => setHabitEvidence(e.target.value)}
                rows={2}
                placeholder="Optional context for your teacher"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '2px solid #a78bfa',
                  marginBottom: 10,
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </>
          ) : assessment.type === 'story-goal' ? (
            <>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Your goal (3–500 characters)
              </label>
              <textarea
                value={textGoal}
                onChange={(e) => setTextGoal(e.target.value)}
                rows={4}
                placeholder="Describe the goal you are working toward"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '2px solid #a78bfa',
                  marginBottom: 12,
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Optional evidence / context
              </label>
              <textarea
                value={storyEvidence}
                onChange={(e) => setStoryEvidence(e.target.value)}
                rows={2}
                placeholder="Optional"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '2px solid #a78bfa',
                  marginBottom: 10,
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </>
          ) : (
            <>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Target score (max {assessment.maxScore}
                {assessment.minGoalScore != null && assessment.minGoalScore > 0
                  ? `, min goal ${assessment.minGoalScore}`
                  : ''}
                )
              </label>
              <input
                type="number"
                value={goalScore}
                onChange={(e) => setGoalScore(e.target.value)}
                min={assessment.minGoalScore ?? 0}
                max={assessment.maxScore}
                step="any"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '2px solid #a78bfa',
                  marginBottom: 10,
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => void submitGoal()}
            disabled={loading || assessmentLoading || submitDisabled}
            style={{
              padding: '0.55rem 1.35rem',
              borderRadius: 8,
              border: 'none',
              background: '#6d28d9',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading || assessmentLoading || submitDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving…' : 'Save to Assessment Goals'}
          </button>
        </div>
      )}

      {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginTop: 10, marginBottom: 0 }}>{error}</p>}
      {message && <p style={{ color: '#5b21b6', fontSize: '0.85rem', marginTop: 10, marginBottom: 0 }}>{message}</p>}
    </div>
  );
};

export default LiveEventGoalSettingPanel;
