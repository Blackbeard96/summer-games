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
  isSessionHost: boolean;
  currentUserId: string;
  displayName: string;
  /** Append a line to the live battle log */
  onAppendBattleLog?: (line: string) => void | Promise<void>;
  /** After a successful student reflection submit (not host link-save); parent can hide the form and show battle log. */
  onStudentReflectionSaved?: () => void;
}

/**
 * Reflection live mode: students submit **evidence** that they are meeting their goal
 * (merged into Assessment Goals / habit submission Evidence).
 */
const LiveEventReflectionPanel: React.FC<LiveEventReflectionPanelProps> = ({
  sessionId,
  classId,
  reflectionAssessmentId,
  reflectionPrompt,
  liveEventMode,
  isSessionHost,
  currentUserId,
  displayName,
  onAppendBattleLog,
  onStudentReflectionSaved,
}) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [hostAssessments, setHostAssessments] = useState<Assessment[]>([]);
  const [hostAssessmentId, setHostAssessmentId] = useState(reflectionAssessmentId || '');
  const [hostPrompt, setHostPrompt] = useState(reflectionPrompt || '');
  const [reflectionText, setReflectionText] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hostSaving, setHostSaving] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isReflection = liveEventMode === 'reflection';

  useEffect(() => {
    setHostAssessmentId(reflectionAssessmentId || '');
  }, [reflectionAssessmentId]);

  useEffect(() => {
    setHostPrompt(reflectionPrompt || '');
  }, [reflectionPrompt]);

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
    setHostSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateDoc(doc(db, 'inSessionRooms', sessionId), {
        reflectionAssessmentId: hostAssessmentId.trim(),
        reflectionPrompt: hostPrompt.trim() || null,
        reflectionCollectHabit: false,
        reflectionCollectEvidence: true,
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
  }, [sessionId, hostAssessmentId, hostPrompt, onAppendBattleLog]);

  const submitReflection = async () => {
    if (!reflectionAssessmentId) {
      setError('The host has not linked an assessment yet.');
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
            habitCommitmentText: '',
            evidenceText,
            collectHabit: false,
            collectEvidence: true,
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
    setEvidenceText('');
    setMessage('Evidence saved to Assessment Goals. Your teacher can review it on the dashboard.');
    if (onAppendBattleLog) {
      await onAppendBattleLog(
        `📝 ${displayName} updated and submitted their reflection (Assessment Goals).`
      );
    }
    if (!isSessionHost) {
      onStudentReflectionSaved?.();
    }
  };

  const habitsSubmitDisabled = assessment?.type === 'habits' && !evidenceText.trim();
  const genericSubmitDisabled = assessment?.type !== 'habits' && !reflectionText.trim();

  if (!isReflection) return null;

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 25,
        marginBottom: '1rem',
        padding: '1rem 1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid #a7f3d0',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
        color: '#064e3b',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>🪞 Reflection — evidence for your goal</h3>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.45 }}>
        {assessment?.type === 'habits' ? (
          <>
            Submit <strong>evidence</strong> that you are following through on your habit (merged into the{' '}
            <strong>Evidence</strong> column). Set or change your habit commitment in <strong>Goal setting</strong> mode
            first if you do not have one yet.
          </>
        ) : assessment ? (
          <>
            Your text is appended to <strong>Evidence</strong> on your goal row for this assessment so your teacher can
            verify progress.
          </>
        ) : (
          <>The host links an assessment below; then use <strong>Your evidence</strong> to submit.</>
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
            placeholder="e.g. What evidence shows you met this week’s goal?"
            style={{ width: '100%', padding: '0.45rem', borderRadius: 6, marginBottom: 8, resize: 'vertical' }}
          />
          <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem', opacity: 0.9 }}>
            Students only submit <strong>evidence</strong> here. Use <strong>Goal setting</strong> mode for new habit /
            numeric / story goals.
          </p>
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
          Link an assessment above, then <strong>Your evidence</strong> will appear here for you and your class.
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
          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', color: '#064e3b' }}>Your evidence</h4>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', opacity: 0.9, lineHeight: 1.45 }}>
            Describe how you met (or are meeting) your goal. You can submit again to add more detail.
          </p>

          {assessmentLoading ? (
            <p style={{ fontSize: '0.88rem', margin: '0.5rem 0', fontWeight: 600, color: '#047857' }}>
              Loading reflection form…
            </p>
          ) : assessment?.type === 'habits' ? (
            <>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Evidence for your habit goal
              </label>
              <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', opacity: 0.9 }}>
                Merged into <strong>Evidence</strong> on your habit row. If you see an error about no habit goal yet, use{' '}
                <strong>Goal setting</strong> mode first to set your commitment.
              </p>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                rows={6}
                placeholder="What did you do? What progress can your teacher verify?"
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
          ) : assessment ? (
            <>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
                Evidence / reflection
              </label>
              <textarea
                value={reflectionText}
                onChange={(e) => setReflectionText(e.target.value)}
                rows={6}
                placeholder="Evidence that you met your goal for this assessment…"
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
            {loading ? 'Saving…' : 'Submit evidence'}
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
