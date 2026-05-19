import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { ENERGY_TYPES, battleEnergyDisplayLabel } from '../constants/energyTypes';
import LiveQuizQuestionCard from './liveQuiz/LiveQuizQuestionCard';
import LiveQuizAnswerOptions from './liveQuiz/LiveQuizAnswerOptions';
import {
  activateExamLiveEvent,
  advanceExamQuestionIndex,
  completeExamAttempt,
  ensureExamProgressDoc,
  getPlayerExamProgress,
  mergeExamSettings,
  saveExamToAssessment,
  subscribeExamProgressCollection,
  subscribePlayerExamProgress,
  submitExamAnswer,
} from '../utils/liveEventExamService';
import {
  clampExamQuestionIndex,
  computeExamScoreFromBank,
  DEFAULT_LIVE_EVENT_EXAM_SETTINGS,
  examHasTimeLimit,
  examRemainingSeconds,
  type PlayerExamProgress,
} from '../types/liveEventExam';
import ExamCountdown from './exam/ExamCountdown';
import { tsMs } from '../utils/productivityTracking';
import {
  getPublishedQuizSetsForClass,
  getQuestions,
  getQuizSet,
} from '../utils/trainingGroundsService';
import ExamResultsBreakdown from './exam/ExamResultsBreakdown';
import { getAssessmentsByClass, getAssessment } from '../utils/assessmentGoalsFirestore';
import { isWrittenAssessmentType } from '../utils/assessmentTypeHelpers';
import type { TrainingQuestion } from '../types/trainingGrounds';
import type { Assessment } from '../types/assessmentGoals';

interface StudentRoster {
  id: string;
  displayName: string;
  email?: string;
}

export interface LiveEventExamProps {
  sessionId: string;
  classId: string;
  className?: string;
  students: StudentRoster[];
  onEndSession?: () => void;
}

const LiveEventExam: React.FC<LiveEventExamProps> = ({
  sessionId,
  classId,
  className,
  students,
  onEndSession,
}) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Record<string, unknown> | null>(null);
  const [isSessionHost, setIsSessionHost] = useState(false);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [quizTitle, setQuizTitle] = useState('');
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [progress, setProgress] = useState<PlayerExamProgress | null>(null);
  const [allProgress, setAllProgress] = useState<PlayerExamProgress[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  /** Current question answer saved; student can advance (no reveal until end unless settings allow). */
  const [answerLocked, setAnswerLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [examStartMs] = useState(() => Date.now());
  const [questionStartMs, setQuestionStartMs] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);

  const [hostQuizSets, setHostQuizSets] = useState<{ id: string; title: string; questionCount: number }[]>([]);
  const [hostAssessments, setHostAssessments] = useState<Assessment[]>([]);
  const [hostQuizPick, setHostQuizPick] = useState('');
  const [hostAssessmentPick, setHostAssessmentPick] = useState('');
  const [hostAwardPP, setHostAwardPP] = useState(DEFAULT_LIVE_EVENT_EXAM_SETTINGS.awardPP);
  const [hostAwardXP, setHostAwardXP] = useState(DEFAULT_LIVE_EVENT_EXAM_SETTINGS.awardXP);
  const [hostShowFeedback, setHostShowFeedback] = useState(
    DEFAULT_LIVE_EVENT_EXAM_SETTINGS.showFeedbackDuringExam
  );
  const [hostUseTimeLimit, setHostUseTimeLimit] = useState(false);
  const [hostTimeLimitMinutes, setHostTimeLimitMinutes] = useState(30);
  const [hostActivating, setHostActivating] = useState(false);
  const [questionsLoadError, setQuestionsLoadError] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const autoSubmitTriggeredRef = useRef(false);
  const [linkedAssessment, setLinkedAssessment] = useState<Assessment | null>(null);

  const examQuizSetId = typeof room?.examQuizSetId === 'string' ? room.examQuizSetId : '';
  const examAssessmentId = typeof room?.examAssessmentId === 'string' ? room.examAssessmentId : '';
  const examSettings = mergeExamSettings(
    room?.examSettings as Partial<typeof DEFAULT_LIVE_EVENT_EXAM_SETTINGS> | undefined
  );
  const examStartedAtMs = useMemo(() => tsMs(room?.examStartedAt), [room?.examStartedAt]);
  const remainingSec = useMemo(
    () => examRemainingSeconds(examStartedAtMs, examSettings, clockTick),
    [examStartedAtMs, examSettings, clockTick]
  );

  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(db, 'inSessionRooms', sessionId), (snap) => {
      if (!snap.exists()) {
        setRoom(null);
        return;
      }
      const data = snap.data();
      setRoom(data);
      const hostUid =
        (typeof data.hostUid === 'string' && data.hostUid) ||
        (typeof data.teacherId === 'string' && data.teacherId) ||
        '';
      setIsSessionHost(Boolean(currentUser && hostUid === currentUser.uid));
    });
    return () => unsub();
  }, [sessionId, currentUser]);

  useEffect(() => {
    if (!examQuizSetId) {
      setQuestions([]);
      setQuizTitle('');
      setQuestionsLoadError(null);
      return;
    }
    let cancelled = false;
    setLoadingQuestions(true);
    setQuestionsLoadError(null);
    (async () => {
      try {
        const [qs, quiz] = await Promise.all([
          getQuestions(examQuizSetId),
          getQuizSet(examQuizSetId),
        ]);
        if (!cancelled) {
          setQuestions(qs);
          setQuizTitle(quiz?.title || 'Exam');
          if (qs.length === 0) {
            setQuestionsLoadError('This CFU has no questions in Training Grounds.');
          }
        }
      } catch (e) {
        console.error('[LiveEventExam] load questions', e);
        if (!cancelled) {
          setQuestions([]);
          setQuestionsLoadError('Could not load exam questions. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) setLoadingQuestions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examQuizSetId]);

  useEffect(() => {
    if (!examAssessmentId) {
      setLinkedAssessment(null);
      return;
    }
    let cancelled = false;
    getAssessment(examAssessmentId).then((a) => {
      if (!cancelled) setLinkedAssessment(a);
    });
    return () => {
      cancelled = true;
    };
  }, [examAssessmentId]);

  useEffect(() => {
    if (!sessionId || !currentUser || !examQuizSetId || questions.length === 0) return;
    const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Player';
    const questionIds = questions.map((q) => q.id);
    void ensureExamProgressDoc(
      sessionId,
      currentUser.uid,
      name,
      questions.length,
      examQuizSetId,
      examStartedAtMs,
      questionIds
    )
      .then((row) => {
        setProgress(row);
        setAnswerLocked(false);
        setSelectedIndices([]);
      })
      .catch((e) => {
        console.warn('[LiveEventExam] ensureExamProgressDoc', e);
      });
  }, [sessionId, currentUser, examQuizSetId, questions.length, examStartedAtMs, questions]);

  useEffect(() => {
    if (!sessionId || !currentUser) return;
    if (isSessionHost) {
      const unsub = subscribeExamProgressCollection(
        sessionId,
        (rows) => setAllProgress(rows),
        (e) => console.warn('[LiveEventExam] examProgress collection', e)
      );
      return () => unsub();
    }
    const unsub = subscribePlayerExamProgress(
      sessionId,
      currentUser.uid,
      (row) => {
        if (row) setProgress(row);
      },
      (e) => console.warn('[LiveEventExam] examProgress player', e)
    );
    return () => unsub();
  }, [sessionId, currentUser, isSessionHost]);

  useEffect(() => {
    if (!sessionId || !currentUser || progress) return;
    void getPlayerExamProgress(sessionId, currentUser.uid).then(setProgress);
  }, [sessionId, currentUser, progress]);

  useEffect(() => {
    if (!isSessionHost || !classId) return;
    void getPublishedQuizSetsForClass(classId).then((sets) =>
      setHostQuizSets(sets.map((s) => ({ id: s.id, title: s.title, questionCount: s.questionCount || 0 })))
    );
    void getAssessmentsByClass(classId).then((list) =>
      setHostAssessments(
        list.filter(
          (a) =>
            isWrittenAssessmentType(a.type) ||
            a.type === 'written_assessment' ||
            a.writtenAssessmentKind === 'exam'
        )
      )
    );
  }, [isSessionHost, classId]);

  useEffect(() => {
    if (examQuizSetId) setHostQuizPick(examQuizSetId);
    if (examAssessmentId) setHostAssessmentPick(examAssessmentId);
    setHostAwardPP(examSettings.awardPP);
    setHostAwardXP(examSettings.awardXP);
    setHostShowFeedback(examSettings.showFeedbackDuringExam);
    const hasLimit = examHasTimeLimit(examSettings);
    setHostUseTimeLimit(hasLimit);
    if (hasLimit) setHostTimeLimitMinutes(examSettings.timeLimitMinutes);
  }, [
    examQuizSetId,
    examAssessmentId,
    examSettings.awardPP,
    examSettings.awardXP,
    examSettings.showFeedbackDuringExam,
    examSettings.timeLimitMinutes,
  ]);

  const displayTitle =
    linkedAssessment?.title || quizTitle || (className ? `${className} Exam` : 'Exam Mode');

  const bankCount = questions.length;
  const progressTotal = progress?.totalQuestions ?? 0;
  const totalQuestions = bankCount > 0 ? bankCount : progressTotal;
  const isComplete = progress?.completed ?? false;
  const currentIndex =
    totalQuestions > 0
      ? clampExamQuestionIndex(progress?.currentQuestionIndex ?? 0, totalQuestions)
      : 0;
  const currentQuestion = bankCount > 0 ? questions[currentIndex] : undefined;
  const timeExpired =
    examHasTimeLimit(examSettings) && remainingSec !== null && remainingSec <= 0;
  const progressPct =
    totalQuestions > 0
      ? Math.round(((progress?.answeredCount ?? 0) / totalQuestions) * 100)
      : 0;

  const showFeedbackDuringExam = examSettings.showFeedbackDuringExam;

  const scoreSummary = useMemo(
    () => computeExamScoreFromBank(questions, progress?.answers ?? []),
    [questions, progress?.answers]
  );

  const finishExam = useCallback(async () => {
    if (!currentUser || !progress || submitting) return;
    setSubmitting(true);
    try {
      const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Player';
      const finalProgress = await completeExamAttempt({
        sessionId,
        playerId: currentUser.uid,
        playerName: name,
        classId,
        quizSetId: examQuizSetId,
        quizTitle,
        examAssessmentId: examAssessmentId || undefined,
        assessmentTitle: linkedAssessment?.title,
        progress,
        examSettings,
        startedAtMs: examStartedAtMs ?? examStartMs,
      });
      if (examAssessmentId) {
        const max = linkedAssessment?.maxScore ?? 100;
        const hostUid =
          (typeof room?.teacherId === 'string' && room.teacherId) ||
          (typeof room?.hostUid === 'string' && room.hostUid) ||
          currentUser.uid;
        await saveExamToAssessment({
          assessmentId: examAssessmentId,
          studentId: currentUser.uid,
          scorePercent: finalProgress.scorePercent,
          maxScore: max,
          gradedBy: hostUid,
        });
      }
      setProgress(finalProgress);
      setMessage(timeExpired ? 'Time is up — your exam was submitted automatically.' : null);
    } catch (e) {
      console.error(e);
      setMessage('Could not finish the exam. Contact your teacher.');
    } finally {
      setSubmitting(false);
    }
  }, [
    currentUser,
    progress,
    submitting,
    sessionId,
    classId,
    examQuizSetId,
    quizTitle,
    examAssessmentId,
    linkedAssessment,
    examSettings,
    examStartedAtMs,
    examStartMs,
    room,
    timeExpired,
  ]);

  useEffect(() => {
    if (!examQuizSetId || !examHasTimeLimit(examSettings) || isComplete) return;
    const id = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [examQuizSetId, examSettings, isComplete]);

  useEffect(() => {
    if (!isComplete) autoSubmitTriggeredRef.current = false;
  }, [isComplete, examQuizSetId]);

  useEffect(() => {
    if (
      isSessionHost ||
      isComplete ||
      !timeExpired ||
      !progress ||
      !examQuizSetId ||
      autoSubmitTriggeredRef.current
    ) {
      return;
    }
    autoSubmitTriggeredRef.current = true;
    void finishExam();
  }, [isSessionHost, isComplete, timeExpired, progress, examQuizSetId, finishExam]);

  useEffect(() => {
    if (!currentQuestion || !progress?.answers?.length) return;
    const existing = progress.answers.find((a) => a.questionId === currentQuestion.id);
    if (!existing) {
      setAnswerLocked(false);
      setSelectedIndices([]);
      return;
    }
    const indices =
      existing.selectedIndices ??
      (existing.selectedIndex !== undefined ? [existing.selectedIndex] : []);
    setSelectedIndices(indices);
    setAnswerLocked(true);
  }, [currentQuestion?.id, progress?.answers, currentIndex]);

  const handleSelect = (index: number) => {
    if (answerLocked || isComplete || timeExpired || !currentQuestion) return;
    const correctIndices =
      currentQuestion.correctIndices ??
      (currentQuestion.correctIndex !== undefined ? [currentQuestion.correctIndex] : []);
    if (correctIndices.length <= 1) {
      setSelectedIndices([index]);
    } else {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return Array.from(next);
      });
    }
  };

  const handleSubmitAnswer = async () => {
    if (!currentUser || !currentQuestion || answerLocked || submitting) return;
    if (selectedIndices.length === 0) {
      setMessage('Select an answer before submitting.');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Player';
      const updated = await submitExamAnswer({
        sessionId,
        playerId: currentUser.uid,
        playerName: name,
        classId,
        question: currentQuestion,
        questionIndex: currentIndex,
        selectedIndices,
        totalQuestions,
        timeSpentMs: Date.now() - questionStartMs,
        existingAnswers: progress?.answers || [],
        examQuizSetId,
      });
      setProgress(updated);
      setAnswerLocked(true);
    } catch (e) {
      console.error(e);
      setMessage('Could not save your answer. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (!currentUser || !progress || timeExpired) return;
    if (currentIndex < totalQuestions - 1) {
      const nextIndex = currentIndex + 1;
      await advanceExamQuestionIndex(sessionId, currentUser.uid, nextIndex);
      setProgress({ ...progress, currentQuestionIndex: nextIndex });
      setCurrentQuestionState();
      return;
    }
    await finishExam();
  };

  const setCurrentQuestionState = () => {
    setSelectedIndices([]);
    setAnswerLocked(false);
    setQuestionStartMs(Date.now());
    setMessage(null);
  };

  const handleHostActivate = async () => {
    if (!hostQuizPick.trim()) {
      alert('Choose a question set (Training Grounds CFU bank).');
      return;
    }
    setHostActivating(true);
    try {
      const qs = await getQuestions(hostQuizPick.trim());
      if (qs.length === 0) {
        alert('That question set has no questions.');
        return;
      }
      await activateExamLiveEvent({
        sessionId,
        examQuizSetId: hostQuizPick.trim(),
        examAssessmentId: hostAssessmentPick.trim() || undefined,
        examSettings: {
          ...DEFAULT_LIVE_EVENT_EXAM_SETTINGS,
          awardPP: hostAwardPP,
          awardXP: hostAwardXP,
          showFeedbackDuringExam: hostShowFeedback,
          timeLimitMinutes: hostUseTimeLimit
            ? Math.max(1, Math.min(240, Math.round(hostTimeLimitMinutes) || 30))
            : 0,
        },
        totalQuestions: qs.length,
      });
      setMessage('Exam Mode is live for all players.');
    } catch (e) {
      console.error(e);
      alert('Could not start Exam Mode.');
    } finally {
      setHostActivating(false);
    }
  };

  const handleEndExamMode = async () => {
    if (!window.confirm('End Exam Mode and return this room to Class Flow?')) return;
    try {
      await updateDoc(doc(db, 'inSessionRooms', sessionId), {
        liveEventMode: 'class_flow',
        examQuizSetId: null,
        examAssessmentId: null,
        examSettings: null,
        examStartedAt: null,
        workType: null,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert('Could not end Exam Mode.');
    }
  };

  const progressByPlayer = useMemo(() => {
    const map = new Map<string, PlayerExamProgress>();
    allProgress.forEach((p) => map.set(p.playerId, p));
    return map;
  }, [allProgress]);

  const rosterRows = useMemo(() => {
    const ids = new Set<string>();
    students.forEach((s) => ids.add(s.id));
    allProgress.forEach((p) => ids.add(p.playerId));
    return Array.from(ids).map((id) => {
      const student = students.find((s) => s.id === id);
      const prog = progressByPlayer.get(id);
      return {
        id,
        name: student?.displayName || prog?.playerName || id.slice(0, 8),
        prog,
      };
    });
  }, [students, allProgress, progressByPlayer]);

  if (!currentUser) {
    return (
      <ExamShell>
        <p>Sign in to join this exam.</p>
      </ExamShell>
    );
  }

  if (isSessionHost && !examQuizSetId) {
    return (
      <ExamShell>
        <header style={headerStyle}>
          <div>
            <span style={badgeStyle}>Exam Mode</span>
            <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.75rem' }}>Configure Exam Live Event</h1>
            <p style={{ color: '#64748b', marginTop: '0.35rem' }}>
              {battleEnergyDisplayLabel(ENERGY_TYPES.MENTAL)} work — no combat, skills, or battle UI.
            </p>
          </div>
        </header>
        <div style={cardStyle}>
          <label style={labelStyle}>
            Question set (Training Grounds)
            <select
              value={hostQuizPick}
              onChange={(e) => setHostQuizPick(e.target.value)}
              style={inputStyle}
            >
              <option value="">
                {hostQuizSets.length === 0
                  ? 'No published CFUs for this class…'
                  : 'Select Training Grounds CFU…'}
              </option>
              {hostQuizSets.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.questionCount} questions)
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Linked assessment (optional)
            <select
              value={hostAssessmentPick}
              onChange={(e) => setHostAssessmentPick(e.target.value)}
              style={inputStyle}
            >
              <option value="">None — scores stay in live exam only</option>
              {hostAssessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
            <input
              type="checkbox"
              checked={hostAwardPP}
              onChange={(e) => setHostAwardPP(e.target.checked)}
            />
            Award PP for correct answers (quiz reward rules)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
            <input
              type="checkbox"
              checked={hostAwardXP}
              onChange={(e) => setHostAwardXP(e.target.checked)}
            />
            Award XP for correct answers
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
            <input
              type="checkbox"
              checked={hostShowFeedback}
              onChange={(e) => setHostShowFeedback(e.target.checked)}
            />
            Show correct/incorrect after each question (default: review only at the end)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
            <input
              type="checkbox"
              checked={hostUseTimeLimit}
              onChange={(e) => setHostUseTimeLimit(e.target.checked)}
            />
            Set a time limit for the whole exam
          </label>
          {hostUseTimeLimit ? (
            <label style={{ ...labelStyle, marginTop: '0.5rem', marginBottom: 0 }}>
              Time limit (minutes)
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginTop: '0.35rem',
                }}
              >
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={hostTimeLimitMinutes}
                  onChange={(e) =>
                    setHostTimeLimitMinutes(
                      Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 30))
                    )
                  }
                  style={{ ...inputStyle, width: 100, marginTop: 0 }}
                />
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setHostTimeLimitMinutes(m)}
                    style={{
                      padding: '0.35rem 0.65rem',
                      borderRadius: '0.4rem',
                      border: '1px solid #cbd5e1',
                      background: hostTimeLimitMinutes === m ? '#4f46e5' : '#f8fafc',
                      color: hostTimeLimitMinutes === m ? '#fff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#64748b', fontWeight: 400 }}>
                Students see a countdown while they work. When time runs out, the exam auto-submits.
              </p>
            </label>
          ) : null}
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={hostActivating}
              onClick={() => void handleHostActivate()}
              style={primaryBtn}
            >
              {hostActivating ? 'Starting…' : 'Start Exam Mode'}
            </button>
            <button type="button" onClick={() => navigate('/live-events')} style={secondaryBtn}>
              Back to Live Events
            </button>
          </div>
        </div>
      </ExamShell>
    );
  }

  if (isSessionHost && examQuizSetId) {
    return (
      <ExamShell>
        <header style={headerStyle}>
          <div style={{ flex: 1 }}>
            <span style={badgeStyle}>Exam Mode — Host</span>
            <h1 style={{ margin: '0.35rem 0', fontSize: '1.5rem' }}>{displayTitle}</h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              {totalQuestions} questions · {battleEnergyDisplayLabel(ENERGY_TYPES.MENTAL)} · Live progress
              {examHasTimeLimit(examSettings)
                ? ` · ${examSettings.timeLimitMinutes} min limit`
                : ''}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
            <ExamCountdown
              remainingSec={remainingSec}
              settings={examSettings}
              variant="host"
              expired={timeExpired}
            />
            <button type="button" onClick={() => void handleEndExamMode()} style={secondaryBtn}>
            End Exam Mode
            </button>
          </div>
        </header>
        {loadingQuestions ? (
          <p>Loading questions…</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={thStyle}>Player</th>
                    <th style={thStyle}>Progress</th>
                    <th style={thStyle}>Answered</th>
                    <th style={thStyle}>Correct</th>
                    <th style={thStyle}>Score %</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Mental work</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterRows.map((row) => {
                    const p = row.prog;
                    const qLabel =
                      p && !p.completed && totalQuestions > 0
                        ? `Q ${Math.min(p.currentQuestionIndex + 1, totalQuestions)} / ${totalQuestions}`
                        : '—';
                    return (
                      <tr key={row.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={tdStyle}>{row.name}</td>
                        <td style={tdStyle}>{qLabel}</td>
                        <td style={tdStyle}>{p?.answeredCount ?? 0}</td>
                        <td style={tdStyle}>{p?.correctCount ?? 0}</td>
                        <td style={tdStyle}>{p ? `${p.scorePercent}%` : '—'}</td>
                        <td style={tdStyle}>
                          {p?.completed ? 'Submitted' : (p?.answeredCount ?? 0) > 0 ? 'In progress' : 'Not started'}
                        </td>
                        <td style={tdStyle}>
                          {(p?.answeredCount ?? 0) > 0 || p?.mentalWorkCredited ? '✓ Credited' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
              Students see a full-screen exam only — combat and skills are disabled.
            </p>
          </>
        )}
      </ExamShell>
    );
  }

  if (!examQuizSetId) {
    return (
      <ExamShell>
        <span style={badgeStyle}>Exam Mode</span>
        <h1 style={{ marginTop: '0.75rem' }}>Waiting for your teacher</h1>
        <p style={{ color: '#64748b' }}>
          The host has not started the exam yet. When it begins, you will answer Training Grounds questions at your own
          pace and see your full score and review when you finish.
        </p>
        <button type="button" style={{ ...secondaryBtn, marginTop: '1rem' }} onClick={() => navigate('/live-events')}>
          Leave
        </button>
      </ExamShell>
    );
  }

  if (loadingQuestions || (bankCount === 0 && progressTotal > 0 && !questionsLoadError)) {
    return (
      <ExamShell>
        <p>Loading exam questions…</p>
      </ExamShell>
    );
  }

  if (questionsLoadError || (bankCount === 0 && !isComplete)) {
    return (
      <ExamShell>
        <span style={badgeStyle}>Exam Mode</span>
        <h1 style={{ marginTop: '0.75rem' }}>{displayTitle}</h1>
        <p style={{ color: '#b45309', marginTop: '0.75rem', fontWeight: 600 }}>
          {questionsLoadError || 'No questions are available for this exam.'}
        </p>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
          Prior Training Grounds completions do not remove questions — ask your teacher to confirm the CFU is
          published and has questions, then reload.
        </p>
        <button
          type="button"
          style={{ ...secondaryBtn, marginTop: '1rem' }}
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </ExamShell>
    );
  }

  if (isComplete) {
    return (
      <ExamShell>
        <span style={badgeStyle}>Exam complete</span>
        <div style={{ ...cardStyle, marginTop: '1rem' }}>
          <ExamResultsBreakdown
            questions={questions}
            answers={scoreSummary.alignedAnswers}
            scorePercent={scoreSummary.scorePercent}
            correctCount={scoreSummary.correctCount}
            title={displayTitle}
          />
          <p style={{ marginTop: '1rem', color: '#059669', fontWeight: 600, textAlign: 'center' }}>
            Submitted · {battleEnergyDisplayLabel(ENERGY_TYPES.MENTAL)} work recorded
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.25rem' }}>
            <button type="button" style={secondaryBtn} onClick={() => navigate('/live-events')}>
              Done
            </button>
          </div>
        </div>
      </ExamShell>
    );
  }

  const currentAnswer = progress?.answers?.find((a) => a.questionId === currentQuestion?.id);
  const submittedIndices =
    currentAnswer?.selectedIndices ??
    (currentAnswer?.selectedIndex !== undefined ? [currentAnswer.selectedIndex] : []);

  return (
    <ExamShell>
      <header style={{ ...headerStyle, marginBottom: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={badgeStyle}>Exam Mode</span>
          <h1 style={{ margin: '0.35rem 0 0', fontSize: '1.5rem', fontWeight: 800 }}>{displayTitle}</h1>
          <div
            style={{
              marginTop: '0.75rem',
              height: 8,
              background: '#e2e8f0',
              borderRadius: 4,
              overflow: 'hidden',
              maxWidth: 480,
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>
            Question {Math.min(currentIndex + 1, totalQuestions)} of {totalQuestions} ·{' '}
            {battleEnergyDisplayLabel(ENERGY_TYPES.MENTAL)}
            {examHasTimeLimit(examSettings) ? ` · ${examSettings.timeLimitMinutes} min limit` : ''}
          </p>
        </div>
        <ExamCountdown
          remainingSec={remainingSec}
          settings={examSettings}
          variant="student"
          expired={timeExpired}
        />
      </header>

      {timeExpired && submitting ? (
        <p style={{ color: '#dc2626', marginBottom: '0.75rem', fontWeight: 600 }}>Submitting your exam…</p>
      ) : null}

      {message && (
        <p style={{ color: '#b45309', marginBottom: '0.75rem', fontWeight: 600 }}>{message}</p>
      )}

      {currentQuestion ? (
        <>
          <LiveQuizQuestionCard
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={totalQuestions}
          />
          <LiveQuizAnswerOptions
            question={currentQuestion}
            selectedIndices={selectedIndices}
            onSelect={handleSelect}
            disabled={answerLocked || submitting}
            reveal={answerLocked && showFeedbackDuringExam}
            submittedIndices={answerLocked && showFeedbackDuringExam ? submittedIndices : undefined}
          />
          {answerLocked && !showFeedbackDuringExam ? (
            <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>
              Answer saved. Continue when you are ready — correct answers are shown at the end.
            </p>
          ) : null}
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!answerLocked ? (
              <button
                type="button"
                disabled={submitting || timeExpired}
                onClick={() => void handleSubmitAnswer()}
                style={primaryBtn}
              >
                {submitting ? 'Saving…' : 'Save answer'}
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleNext()}
                style={primaryBtn}
              >
                {submitting
                  ? 'Submitting exam…'
                  : currentIndex < totalQuestions - 1
                    ? 'Next question'
                    : 'Finish exam & see results'}
              </button>
            )}
          </div>
        </>
      ) : (
        <p style={{ color: '#b45309', fontWeight: 600 }}>
          Unable to show this question. Try reloading the page — your saved answers are stored.
        </p>
      )}
    </ExamShell>
  );
};

function ExamShell({ children }: { children: React.ReactNode }) {
  return (
    <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
          padding: '1.5rem',
          maxWidth: 900,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {children}
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '1rem',
  flexWrap: 'wrap',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#4f46e5',
  color: '#fff',
  fontSize: '0.75rem',
  fontWeight: 700,
  padding: '0.25rem 0.65rem',
  borderRadius: '999px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '1rem',
  padding: '1.25rem',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: '1rem',
  fontSize: '0.9rem',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: '0.35rem',
  padding: '0.5rem 0.65rem',
  borderRadius: '0.5rem',
  border: '1px solid #cbd5e1',
  fontSize: '1rem',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.65rem 1.25rem',
  borderRadius: '0.5rem',
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: '1rem',
};

const secondaryBtn: React.CSSProperties = {
  padding: '0.65rem 1.25rem',
  borderRadius: '0.5rem',
  background: '#f1f5f9',
  color: '#334155',
  border: '1px solid #cbd5e1',
  fontWeight: 600,
  cursor: 'pointer',
};

const thStyle: React.CSSProperties = { padding: '0.65rem 0.75rem', fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '0.65rem 0.75rem' };

export default LiveEventExam;
