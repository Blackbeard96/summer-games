import React, { useEffect, useState, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Assessment } from '../types/assessmentGoals';
import {
  getAssessment,
  getAssessmentsByClass,
  submitLiveEventReflectionToAssessment,
} from '../utils/assessmentGoalsFirestore';

export interface LiveEventReflectionPanelProps {
  sessionId: string;
  classId: string;
  /** From inSessionRooms — which assessment receives Evidence updates */
  reflectionAssessmentId?: string;
  reflectionPrompt?: string;
  liveEventMode?: string;
  /** Habits assessments: when false, students are not asked for habit commitment (Habit Commitment column). */
  reflectionCollectHabit?: boolean;
  /** Habits assessments: when false, students are not asked for evidence text. */
  reflectionCollectEvidence?: boolean;
  isSessionHost: boolean;
  currentUserId: string;
  displayName: string;
  /** Append a line to the live battle log */
  onAppendBattleLog?: (line: string) => void | Promise<void>;
}

/**
 * Reflection live mode: students submit evidence text into Assessment Goals / habit submissions
 * so admins can verify on the Assessment Dashboard.
 */
const LiveEventReflectionPanel: React.FC<LiveEventReflectionPanelProps> = ({
  sessionId,
  classId,
  reflectionAssessmentId,
  reflectionPrompt,
  liveEventMode,
  reflectionCollectHabit,
  reflectionCollectEvidence,
  isSessionHost,
  currentUserId,
  displayName,
  onAppendBattleLog,
}) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [hostAssessments, setHostAssessments] = useState<Assessment[]>([]);
  const [hostAssessmentId, setHostAssessmentId] = useState(reflectionAssessmentId || '');
  const [hostPrompt, setHostPrompt] = useState(reflectionPrompt || '');
  const [hostCollectHabit, setHostCollectHabit] = useState(reflectionCollectHabit !== false);
  const [hostCollectEvidence, setHostCollectEvidence] = useState(reflectionCollectEvidence !== false);
  const [reflectionText, setReflectionText] = useState('');
  const [habitCommitmentText, setHabitCommitmentText] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hostSaving, setHostSaving] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isReflection = liveEventMode === 'reflection';

  const collectHabitEffective = reflectionCollectHabit !== false;
  const collectEvidenceEffective = reflectionCollectEvidence !== false;
  const habitsHostMisconfig = !collectHabitEffective && !collectEvidenceEffective;
  const askHabit = assessment?.type === 'habits' && collectHabitEffective && !habitsHostMisconfig;
  const askEvidence = assessment?.type === 'habits' && collectEvidenceEffective && !habitsHostMisconfig;

  useEffect(() => {
    setHostAssessmentId(reflectionAssessmentId || '');
  }, [reflectionAssessmentId]);

  useEffect(() => {
    setHostPrompt(reflectionPrompt || '');
  }, [reflectionPrompt]);

  useEffect(() => {
    setHostCollectHabit(reflectionCollectHabit !== false);
    setHostCollectEvidence(reflectionCollectEvidence !== false);
  }, [reflectionCollectHabit, reflectionCollectEvidence]);

  useEffect(() => {
    if (!isReflection || !reflectionAssessmentId) {
      setAssessment(null);
      setAssessmentLoading(false);
      return;
    }
    let cancelled = false;
    setAssessmentLoading(true);
    (async () => {
      try {
        const a = await getAssessment(reflectionAssessmentId);
        if (!cancelled) setAssessment(a);
      } finally {
        if (!cancelled) setAssessmentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReflection, reflectionAssessmentId]);

  useEffect(() => {
    if (!isReflection || !isSessionHost || !classId) return;
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
  }, [isReflection, isSessionHost, classId]);

  const saveHostReflectionSettings = useCallback(async () => {
    if (!hostAssessmentId.trim()) {
      setError('Choose an assessment to link.');
      return;
    }
    if (!hostCollectHabit && !hostCollectEvidence) {
      setError('Turn on at least one: habit commitment and/or evidence.');
      return;
    }
    setHostSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateDoc(doc(db, 'inSessionRooms', sessionId), {
        reflectionAssessmentId: hostAssessmentId.trim(),
        reflectionPrompt: hostPrompt.trim() || null,
        reflectionCollectHabit: hostCollectHabit,
        reflectionCollectEvidence: hostCollectEvidence,
        updatedAt: serverTimestamp(),
      });
      setMessage('Linked assessment updated for this session.');
      if (onAppendBattleLog) {
        const a = await getAssessment(hostAssessmentId.trim());
        await onAppendBattleLog(
          `🪞 Reflection linked to assessment: ${a?.title ?? hostAssessmentId.trim()}`
        );
      }
    } catch (e) {
      console.error(e);
      setError('Could not save settings. Check Firestore permissions.');
    } finally {
      setHostSaving(false);
    }
  }, [sessionId, hostAssessmentId, hostPrompt, hostCollectHabit, hostCollectEvidence, onAppendBattleLog]);

  const submitReflection = async () => {
    if (!reflectionAssessmentId) {
      setError('The host has not linked an assessment yet.');
      return;
    }
    if (habitsHostMisconfig) {
      setError('The host needs to enable habit and/or evidence in Reflection settings.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    const isHabits = assessment?.type === 'habits';
    const res = await submitLiveEventReflectionToAssessment(
      isHabits
        ? {
            assessmentId: reflectionAssessmentId,
            studentId: currentUserId,
            classId,
            sessionId,
            habitCommitmentText: askHabit ? habitCommitmentText : undefined,
            evidenceText: askEvidence ? evidenceText : undefined,
            collectHabit: collectHabitEffective,
            collectEvidence: collectEvidenceEffective,
          }
        : {
            assessmentId: reflectionAssessmentId,
            studentId: currentUserId,
            classId,
            sessionId,
            reflectionText,
          }
    );
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReflectionText('');
    setHabitCommitmentText('');
    setEvidenceText('');
    setMessage('Saved to Assessment Goals. Your teacher can review it on the dashboard.');
    if (onAppendBattleLog) {
      await onAppendBattleLog(`📝 ${displayName} submitted reflection (Assessment Goals).`);
    }
  };

  const habitsSubmitDisabled =
    assessment?.type === 'habits' &&
    (habitsHostMisconfig ||
      (askHabit && habitCommitmentText.trim().length < 3) ||
      (askEvidence && !evidenceText.trim()));

  const genericSubmitDisabled = assessment?.type !== 'habits' && !reflectionText.trim();

  if (!isReflection) return null;

  return (
    <div
      style={{
        marginBottom: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid #a7f3d0',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
        color: '#064e3b',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>🪞 Reflection → Assessment Goals</h3>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.45 }}>
        {assessment?.type === 'habits' ? (
          <>
            For <strong>habit</strong> assessments, your answers map to the dashboard columns{' '}
            <strong>Habit commitment</strong> and <strong>Evidence</strong> (your teacher chooses which fields to collect).
          </>
        ) : assessment ? (
          <>
            Your text is saved to the <strong>Evidence</strong> field for the linked assessment so admins can verify it on
            the Assessment Goals dashboard (same row as Habit / Story goals).
          </>
        ) : (
          <>Link an assessment below, then use <strong>Your response</strong> to submit.</>
        )}
      </p>

      {isSessionHost && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: 'rgba(255,255,255,0.7)',
            borderRadius: '0.5rem',
            border: '1px solid #6ee7b7',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Host: link assessment</div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
            Assessment
          </label>
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
            Prompt (optional, shown to class)
          </label>
          <textarea
            value={hostPrompt}
            onChange={(e) => setHostPrompt(e.target.value)}
            rows={2}
            placeholder="e.g. What strategy helped you most this week?"
            style={{ width: '100%', padding: '0.45rem', borderRadius: 6, marginBottom: 8, resize: 'vertical' }}
          />
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.85rem' }}>Student fields (habit assessments)</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.82rem' }}>
            <input
              type="checkbox"
              checked={hostCollectHabit}
              onChange={(e) => setHostCollectHabit(e.target.checked)}
            />
            Ask for <strong>habit commitment</strong> (what they will practice)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.82rem' }}>
            <input
              type="checkbox"
              checked={hostCollectEvidence}
              onChange={(e) => setHostCollectEvidence(e.target.checked)}
            />
            Ask for <strong>evidence</strong> (reflection / proof of commitment)
          </label>
          <button
            type="button"
            onClick={() => void saveHostReflectionSettings()}
            disabled={hostSaving}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: '#059669',
              color: '#fff',
              fontWeight: 700,
              cursor: hostSaving ? 'wait' : 'pointer',
            }}
          >
            {hostSaving ? 'Saving…' : 'Save link & prompt'}
          </button>
        </div>
      )}

      {reflectionAssessmentId && assessment && (
        <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: 8 }}>
          Linked: <span style={{ color: '#047857' }}>{assessment.title}</span> ({assessment.type})
        </div>
      )}

      {(reflectionPrompt || hostPrompt) && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.75rem',
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 8,
            fontSize: '0.9rem',
          }}
        >
          <strong>Prompt:</strong> {reflectionPrompt || hostPrompt}
        </div>
      )}

      {!reflectionAssessmentId && !isSessionHost && (
        <p style={{ fontSize: '0.85rem', margin: 0 }}>Waiting for the host to link an assessment…</p>
      )}

      {!reflectionAssessmentId && isSessionHost && (
        <p style={{ fontSize: '0.85rem', margin: '0 0 0.75rem 0', color: '#047857', fontWeight: 600 }}>
          Link an assessment above, then <strong>Your response</strong> will appear here for you and your class.
        </p>
      )}

      {reflectionAssessmentId && (
        <div
          style={{
            marginTop: '0.25rem',
            padding: '1rem',
            borderRadius: '0.65rem',
            border: '2px solid #047857',
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 2px 12px rgba(4, 120, 87, 0.12)',
          }}
        >
          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', color: '#064e3b' }}>Your response</h4>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', opacity: 0.9, lineHeight: 1.45 }}>
            {isSessionHost
              ? 'Students enter habit and/or evidence here (same fields for you if you want to demo or submit as a participant).'
              : 'Type below and submit. Your answers go to Assessment Goals for your teacher to review.'}
          </p>

          {assessmentLoading ? (
            <p style={{ fontSize: '0.88rem', margin: '0.5rem 0', fontWeight: 600, color: '#047857' }}>
              Loading reflection form…
            </p>
          ) : assessment?.type === 'habits' ? (
            <>
              {habitsHostMisconfig ? (
                <p style={{ fontSize: '0.85rem', margin: 0, color: '#b45309' }}>
                  The host must enable at least one field (habit commitment and/or evidence). Ask them to save Reflection
                  settings.
                </p>
              ) : null}
              {askHabit ? (
                <>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                    1 — Habit commitment
                  </label>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', opacity: 0.9 }}>
                    What will you practice? (3–180 characters — appears as <strong>Habit commitment</strong> on the teacher
                    dashboard.)
                  </p>
                  <textarea
                    value={habitCommitmentText}
                    onChange={(e) => setHabitCommitmentText(e.target.value)}
                    rows={3}
                    placeholder="e.g. I will review notes for 10 minutes before each class."
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      borderRadius: 8,
                      border: '2px solid #34d399',
                      marginBottom: 14,
                      fontSize: '0.95rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </>
              ) : null}
              {askEvidence ? (
                <>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                    {askHabit ? '2 — Evidence' : '1 — Evidence'}
                  </label>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', opacity: 0.9 }}>
                    Reflection or proof of your commitment (appears as <strong>Evidence</strong>. You can submit again to
                    add more.)
                  </p>
                  <textarea
                    value={evidenceText}
                    onChange={(e) => setEvidenceText(e.target.value)}
                    rows={5}
                    placeholder="Describe what you did, what you will do, or how you are following through."
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      borderRadius: 8,
                      border: '2px solid #34d399',
                      marginBottom: 10,
                      fontSize: '0.95rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </>
              ) : null}
            </>
          ) : assessment ? (
            <>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Your evidence / reflection
              </label>
              <textarea
                value={reflectionText}
                onChange={(e) => setReflectionText(e.target.value)}
                rows={5}
                placeholder="Type your reflection. This goes to Assessment Goals → Evidence for verification."
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  borderRadius: 8,
                  border: '2px solid #34d399',
                  marginBottom: 10,
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </>
          ) : (
            <p style={{ fontSize: '0.85rem', margin: 0, color: '#b91c1c' }}>
              Could not load this assessment. Check the link or try again.
            </p>
          )}
          <button
            type="button"
            onClick={() => void submitReflection()}
            disabled={
              loading ||
              assessmentLoading ||
              (assessment?.type === 'habits' ? habitsSubmitDisabled : genericSubmitDisabled) ||
              !assessment
            }
            style={{
              padding: '0.55rem 1.35rem',
              borderRadius: 8,
              border: 'none',
              background: '#047857',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor:
                loading ||
                assessmentLoading ||
                (assessment?.type === 'habits' ? habitsSubmitDisabled : genericSubmitDisabled) ||
                !assessment
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {loading ? 'Saving…' : 'Submit to Assessment Goals'}
          </button>
        </div>
      )}

      {error && (
        <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginTop: 10, marginBottom: 0 }}>{error}</p>
      )}
      {message && (
        <p style={{ color: '#047857', fontSize: '0.85rem', marginTop: 10, marginBottom: 0 }}>{message}</p>
      )}
    </div>
  );
};

export default LiveEventReflectionPanel;
