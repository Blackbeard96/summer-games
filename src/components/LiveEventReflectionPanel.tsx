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
  isSessionHost,
  currentUserId,
  displayName,
  onAppendBattleLog,
}) => {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [hostAssessments, setHostAssessments] = useState<Assessment[]>([]);
  const [hostAssessmentId, setHostAssessmentId] = useState(reflectionAssessmentId || '');
  const [hostPrompt, setHostPrompt] = useState(reflectionPrompt || '');
  const [reflectionText, setReflectionText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hostSaving, setHostSaving] = useState(false);
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
      return;
    }
    let cancelled = false;
    (async () => {
      const a = await getAssessment(reflectionAssessmentId);
      if (!cancelled) setAssessment(a);
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
    const res = await submitLiveEventReflectionToAssessment({
      assessmentId: reflectionAssessmentId,
      studentId: currentUserId,
      classId,
      sessionId,
      reflectionText,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReflectionText('');
    setMessage('Evidence saved. Your teacher can review it on Assessment Goals → Dashboard.');
    if (onAppendBattleLog) {
      await onAppendBattleLog(`📝 ${displayName} submitted reflection evidence (Assessment Goals).`);
    }
  };

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
        Your text is saved to the <strong>Evidence</strong> field for the linked assessment so admins can verify it on the
        Assessment Goals dashboard (same row as Habit / Story goals).
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

      {reflectionAssessmentId && !isSessionHost && (
        <>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>
            Your evidence / reflection
          </label>
          <textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            rows={5}
            placeholder="Type your reflection. This goes to Assessment Goals → Evidence for verification."
            style={{
              width: '100%',
              padding: '0.6rem',
              borderRadius: 8,
              border: '1px solid #6ee7b7',
              marginBottom: 8,
              fontSize: '0.9rem',
            }}
          />
          <button
            type="button"
            onClick={() => void submitReflection()}
            disabled={loading || !reflectionText.trim()}
            style={{
              padding: '0.5rem 1.2rem',
              borderRadius: 8,
              border: 'none',
              background: '#047857',
              color: '#fff',
              fontWeight: 700,
              cursor: loading || !reflectionText.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving…' : 'Submit to Assessment Goals'}
          </button>
        </>
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
