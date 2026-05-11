import React, { useState, useEffect } from 'react';
import { Assessment, AssessmentGoal, HabitDuration, HabitEvidenceType, HabitSubmission } from '../types/assessmentGoals';
import {
  bumpAssessmentWorkStats,
  setAssessmentGoal,
  createHabitSubmission,
  updateHabitSubmissionGoal,
} from '../utils/assessmentGoalsFirestore';
import { validateGoalScore } from '../utils/assessmentGoals';
import {
  formatAssessmentTypeLabel,
  formatReflectionResponsesAsEvidence,
  isReflectionAssessmentType,
} from '../utils/assessmentTypeHelpers';
import { useAuth } from '../context/AuthContext';

interface SetGoalModalProps {
  assessment: Assessment;
  existingGoal?: AssessmentGoal;
  existingHabitSubmission?: HabitSubmission;
  onClose: () => void;
  onSave: () => void;
}

const SetGoalModal: React.FC<SetGoalModalProps> = ({
  assessment,
  existingGoal,
  existingHabitSubmission,
  onClose,
  onSave
}) => {
  const { currentUser } = useAuth();
  const isHabits = assessment.type === 'habits';
  const isStoryGoal = assessment.type === 'story-goal';
  const isReflection = isReflectionAssessmentType(assessment.type);
  const reflectionQuestionList = assessment.reflectionConfig?.questions ?? [];
  
  // For regular assessments (numeric goals)
  const [goalScore, setGoalScore] = useState<string>(
    existingGoal ? (existingGoal.goalScore?.toString() || '') : ''
  );
  
  // For Story Goals (text-based, similar to habits)
  const [textGoal, setTextGoal] = useState<string>(
    existingGoal?.textGoal || ''
  );
  
  // For Habits assessments (text + duration)
  const [habitText, setHabitText] = useState<string>(
    existingHabitSubmission?.habitText || ''
  );
  const [duration, setDuration] = useState<HabitDuration>(
    existingHabitSubmission?.duration || assessment.habitsConfig?.defaultDuration || '1_week'
  );
  
  // Evidence field (for Story Goals and Habit Goals — `other` type only for habits)
  const [evidence, setEvidence] = useState<string>(
    existingGoal?.evidence || existingHabitSubmission?.evidence || ''
  );
  const [habitEvidenceType, setHabitEvidenceType] = useState<HabitEvidenceType>(
    (existingHabitSubmission?.habitEvidenceType as HabitEvidenceType) || 'other'
  );

  const [reflectionAnswers, setReflectionAnswers] = useState<Record<string, string>>({});

  const reflectionConfigKey = JSON.stringify(
    reflectionQuestionList.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      responseMode: q.responseMode,
      presetOptions: q.presetOptions,
    }))
  );

  const existingReflectionKey = JSON.stringify(existingGoal?.reflectionResponses ?? null);

  useEffect(() => {
    if (reflectionQuestionList.length === 0) {
      setReflectionAnswers({});
      return;
    }
    const next: Record<string, string> = {};
    reflectionQuestionList.forEach((q) => {
      next[q.id] = existingGoal?.reflectionResponses?.[q.id] ?? '';
    });
    setReflectionAnswers(next);
  }, [assessment.id, reflectionConfigKey, existingReflectionKey]);

  // Update form when existingHabitSubmission or existingGoal changes
  useEffect(() => {
    if (existingHabitSubmission) {
      setHabitText(existingHabitSubmission.habitText);
      setDuration(existingHabitSubmission.duration);
      setEvidence(existingHabitSubmission.evidence || '');
      setHabitEvidenceType((existingHabitSubmission.habitEvidenceType as HabitEvidenceType) || 'other');
    }
    if (existingGoal) {
      setTextGoal(existingGoal.textGoal || '');
      setEvidence(existingGoal.evidence || '');
      if (existingGoal.goalScore !== undefined) {
        setGoalScore(existingGoal.goalScore.toString());
      }
    }
  }, [existingHabitSubmission, existingGoal]);
  
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedGoalData, setSavedGoalData] = useState<{
    type: 'numeric' | 'habit' | 'story-goal' | 'reflection';
    goalScore?: number;
    textGoal?: string;
    habitText?: string;
    duration?: HabitDuration;
    evidence?: string;
    habitEvidenceType?: HabitEvidenceType;
    reflectionAnswers?: Record<string, string>;
    reflectionQuestions?: { id: string; prompt: string; responseMode: 'open' | 'preset' }[];
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      setError('You must be logged in to set a goal');
      return;
    }

    if (assessment.isLocked) {
      setError('This assessment is locked. You cannot change your goal.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      if (isHabits) {
        // Validate habit text
        const trimmedText = habitText.trim();
        if (trimmedText.length < 3) {
          setError('Habit description must be at least 3 characters long');
          setSaving(false);
          return;
        }
        if (trimmedText.length > 180) {
          setError('Habit description must be 180 characters or less');
          setSaving(false);
          return;
        }
        
        // Update existing habit submission or create new one
        const evType: HabitEvidenceType = habitEvidenceType;
        const evText = evType === 'other' ? evidence.trim() || null : null;
        if (existingHabitSubmission) {
          await updateHabitSubmissionGoal(
            assessment.id,
            currentUser.uid,
            trimmedText,
            duration,
            evText,
            evType
          );
        } else {
          await createHabitSubmission(
            assessment.id,
            currentUser.uid,
            assessment.classId,
            trimmedText,
            duration,
            evText,
            evType
          );
        }

        void bumpAssessmentWorkStats({
          studentId: currentUser.uid,
          classId: assessment.classId,
          assessment,
          attemptedIncrement: 1,
          completedIncrement: 1,
          pointsEarnedIncrement: 15 + Math.min(40, trimmedText.length),
          sourceId: `${assessment.id}_assessment_goals_ui_habit`,
        });

        // Store saved data for preview
        setSavedGoalData({
          type: 'habit',
          habitText: trimmedText,
          duration,
          evidence: evText || undefined,
          habitEvidenceType: evType,
        });
      } else if (isStoryGoal) {
        // Story Goal (text-based, similar to habits)
        const trimmedText = textGoal.trim();
        if (trimmedText.length < 3) {
          setError('Goal description must be at least 3 characters long');
          setSaving(false);
          return;
        }
        if (trimmedText.length > 500) {
          setError('Goal description must be 500 characters or less');
          setSaving(false);
          return;
        }
        
        await setAssessmentGoal(
          assessment.id,
          currentUser.uid,
          undefined, // No numeric goalScore for Story Goals
          assessment.classId,
          evidence.trim() || null,
          trimmedText, // textGoal
          undefined
        );

        void bumpAssessmentWorkStats({
          studentId: currentUser.uid,
          classId: assessment.classId,
          assessment,
          completedIncrement: 1,
          pointsEarnedIncrement: 15 + Math.min(50, trimmedText.length),
          sourceId: `${assessment.id}_assessment_goals_ui_story`,
        });

        // Store saved data for preview
        setSavedGoalData({
          type: 'story-goal',
          textGoal: trimmedText,
          evidence: evidence.trim() || undefined
        });
      } else if (isReflection) {
        const score = parseFloat(goalScore);
        const minGoalScore = assessment.minGoalScore || 0;
        const validation = validateGoalScore(score, assessment.maxScore, minGoalScore);
        if (!validation.valid) {
          setError(validation.error || 'Invalid goal score');
          setSaving(false);
          return;
        }

        const qs = reflectionQuestionList;
        if (qs.length === 0) {
          setError('This reflection assessment has no questions yet. Ask your teacher to add prompts.');
          setSaving(false);
          return;
        }

        const answers: Record<string, string> = {};
        for (const q of qs) {
          const raw = (reflectionAnswers[q.id] || '').trim();
          if (!raw) {
            setError('Please answer every reflection question.');
            setSaving(false);
            return;
          }
          if (q.responseMode === 'preset') {
            const opts = (q.presetOptions || []).map((o) => String(o).trim()).filter(Boolean);
            if (opts.length > 0 && !opts.includes(raw)) {
              setError('Invalid selection for a dropdown question.');
              setSaving(false);
              return;
            }
          }
          answers[q.id] = raw;
        }

        const evidenceFormatted =
          qs.length > 0 ? formatReflectionResponsesAsEvidence(qs, answers) : null;

        await setAssessmentGoal(
          assessment.id,
          currentUser.uid,
          score,
          assessment.classId,
          evidenceFormatted,
          undefined,
          answers
        );

        void bumpAssessmentWorkStats({
          studentId: currentUser.uid,
          classId: assessment.classId,
          assessment,
          completedIncrement: 1,
          pointsEarnedIncrement: Math.min(
            120,
            10 + Math.floor((evidenceFormatted || '').length / 15)
          ),
          sourceId: `${assessment.id}_assessment_goals_ui_reflection`,
        });

        setSavedGoalData({
          type: 'reflection',
          goalScore: score,
          reflectionAnswers: answers,
          reflectionQuestions: qs.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            responseMode: q.responseMode,
          })),
        });
      } else {
        // Written assessment (numeric goal)
        const score = parseFloat(goalScore);
        const minGoalScore = assessment.minGoalScore || 0;
        const validation = validateGoalScore(score, assessment.maxScore, minGoalScore);

        if (!validation.valid) {
          setError(validation.error || 'Invalid goal score');
          setSaving(false);
          return;
        }

        await setAssessmentGoal(
          assessment.id,
          currentUser.uid,
          score,
          assessment.classId,
          undefined,
          undefined,
          undefined
        );

        void bumpAssessmentWorkStats({
          studentId: currentUser.uid,
          classId: assessment.classId,
          assessment,
          completedIncrement: 1,
          pointsEarnedIncrement: 12 + Math.min(40, Math.round(score)),
          sourceId: `${assessment.id}_assessment_goals_ui_written`,
        });

        setSavedGoalData({
          type: 'numeric',
          goalScore: score,
        });
      }
      
      // Show preview instead of immediately closing
      setSaving(false);
      setShowPreview(true);
    } catch (err: any) {
      console.error('Error setting goal:', err);
      setError(err.message || 'Failed to set goal. Please try again.');
      setSaving(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setSavedGoalData(null);
    onSave(); // Refresh data and close modal
  };

  // Show preview if goal was successfully saved
  if (showPreview && savedGoalData) {
    const getDurationLabel = (dur: HabitDuration) => {
      switch (dur) {
        case '1_class': return '1 Class';
        case '1_day': return '1 Day';
        case '3_days': return '3 Days';
        case '1_week': return '1 Week';
        default: return dur;
      }
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
        onClick={handleClosePreview}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '0.5rem',
            padding: '2rem',
            maxWidth: '500px',
            width: 'min(500px, 100%)',
            maxHeight: 'min(92vh, calc(100vh - 48px))',
            overflowY: 'auto',
            margin: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#10b981' }}>
              Goal Set Successfully!
            </h2>
            <p style={{ margin: 0, color: '#6b7280' }}>
              {assessment.title}
            </p>
          </div>

          <div
            style={{
              background: '#f9fafb',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              border: '2px solid #10b981'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
              Your Goal Preview:
            </h3>
            
            {savedGoalData.type === 'habit' ? (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                    Habit:
                  </p>
                  <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
                    "{savedGoalData.habitText}"
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                    Duration:
                  </p>
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    {savedGoalData.duration ? getDurationLabel(savedGoalData.duration) : 'N/A'}
                  </p>
                </div>
                {savedGoalData.habitEvidenceType && savedGoalData.habitEvidenceType !== 'other' ? (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                      Evidence type:
                    </p>
                    <p style={{ margin: 0, color: '#6b7280' }}>
                      {savedGoalData.habitEvidenceType === 'live_event_sprint_rate'
                        ? 'Live Event — sprint completion rate (tracked automatically)'
                        : 'Live Event — consistency by day (tracked automatically)'}
                    </p>
                  </div>
                ) : (
                  savedGoalData.evidence && (
                    <div style={{ marginTop: '1rem' }}>
                      <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                        Evidence:
                      </p>
                      <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
                        "{savedGoalData.evidence}"
                      </p>
                    </div>
                  )
                )}
              </div>
            ) : savedGoalData.type === 'story-goal' ? (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                    Your Goal:
                  </p>
                  <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
                    "{savedGoalData.textGoal}"
                  </p>
                </div>
                {savedGoalData.evidence && (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                      Area of Consistency:
                    </p>
                    <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
                      "{savedGoalData.evidence}"
                    </p>
                  </div>
                )}
              </div>
            ) : savedGoalData.type === 'reflection' ? (
              <div>
                <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
                  Goal score:
                </p>
                <p style={{ margin: '0 0 1rem 0', fontSize: '1.35rem', color: '#3b82f6', fontWeight: 'bold' }}>
                  {savedGoalData.goalScore} / {assessment.maxScore}
                </p>
                {savedGoalData.reflectionQuestions?.map((q) => (
                  <div key={q.id} style={{ marginTop: '0.85rem' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                      {q.prompt}
                    </p>
                    <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                      {savedGoalData.reflectionAnswers?.[q.id] ?? ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
                  Goal Score:
                </p>
                <p style={{ margin: 0, fontSize: '1.5rem', color: '#3b82f6', fontWeight: 'bold' }}>
                  {savedGoalData.goalScore} / {assessment.maxScore}
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleClosePreview}
              style={{
                padding: '0.75rem 2rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          padding: '2rem',
          maxWidth: '500px',
          width: 'min(500px, 100%)',
          maxHeight: 'min(92vh, calc(100vh - 48px))',
          overflowY: 'auto',
          margin: 'auto',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>
          {existingGoal || existingHabitSubmission ? 'Edit Goal' : isHabits ? 'Commit to Habit' : 'Set Goal'}
        </h2>
        
        <p style={{ marginBottom: '0.35rem', color: '#111827', fontWeight: 600 }}>
          {assessment.title}
        </p>
        {!isHabits && !isStoryGoal && (
          <p style={{ marginTop: 0, marginBottom: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
            {formatAssessmentTypeLabel(assessment)}
          </p>
        )}
        {isStoryGoal && (
          <p style={{ marginTop: '-0.5rem', marginBottom: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
            {formatAssessmentTypeLabel(assessment)}
          </p>
        )}

        {/* Info for Story Goals */}
        {isStoryGoal && (
          <div style={{ 
            padding: '0.75rem', 
            background: '#fef3c7', 
            borderRadius: '0.5rem', 
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: '#92400e',
            border: '1px solid #fbbf24'
          }}>
            📖 <strong>Story Goal:</strong> Describe your goal and provide evidence of your consistency toward achieving it.
            {assessment.storyGoal?.prompt && (
              <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                "{assessment.storyGoal.prompt}"
              </div>
            )}
          </div>
        )}

        {isReflection && (
          <div
            style={{
              padding: '0.75rem',
              background: '#eff6ff',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              color: '#1e3a8a',
              border: '1px solid #93c5fd',
            }}
          >
            🪞 <strong>Reflection:</strong> Set your target score, then answer each prompt. Your teacher may also ask you
            to add evidence during a live session.
          </div>
        )}

        {assessment.isLocked && (
          <div
            style={{
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              color: '#991b1b'
            }}
          >
            ⚠️ This assessment is locked. You cannot change your goal.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isHabits ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="habitText"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                >
                  What habit are you committing to?
                </label>
                <textarea
                  id="habitText"
                  value={habitText}
                  onChange={(e) => setHabitText(e.target.value)}
                  disabled={assessment.isLocked || saving}
                  placeholder="e.g., Exercise for 30 minutes every day, Practice coding for 1 hour..."
                  minLength={3}
                  maxLength={180}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                  required
                />
                <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  {habitText.length}/180 characters
                </p>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                >
                  Duration:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="1_class"
                      checked={duration === '1_class'}
                      onChange={(e) => setDuration(e.target.value as HabitDuration)}
                      disabled={assessment.isLocked || saving}
                    />
                    <span>1 Class</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="1_day"
                      checked={duration === '1_day'}
                      onChange={(e) => setDuration(e.target.value as HabitDuration)}
                      disabled={assessment.isLocked || saving}
                    />
                    <span>1 Day</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="3_days"
                      checked={duration === '3_days'}
                      onChange={(e) => setDuration(e.target.value as HabitDuration)}
                      disabled={assessment.isLocked || saving}
                    />
                    <span>3 Days</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="1_week"
                      checked={duration === '1_week'}
                      onChange={(e) => setDuration(e.target.value as HabitDuration)}
                      disabled={assessment.isLocked || saving}
                    />
                    <span>1 Week</span>
                  </label>
                </div>
              </div>
            </>
          ) : isStoryGoal ? (
            <>
              {/* Story Goal (text-based) */}
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="textGoal"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#92400e' }}
                >
                  Describe Your Goal: <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  id="textGoal"
                  value={textGoal}
                  onChange={(e) => setTextGoal(e.target.value)}
                  disabled={assessment.isLocked || saving}
                  placeholder="e.g., I will complete all my homework assignments on time, I will participate actively in class discussions..."
                  minLength={3}
                  maxLength={500}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '2px solid #fbbf24',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    background: 'white'
                  }}
                  required
                />
                <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  {textGoal.length}/500 characters
                </p>
              </div>
            </>
          ) : isReflection ? (
            <>
              {reflectionQuestionList.map((q, idx) => (
                <div key={q.id} style={{ marginBottom: '1.25rem' }}>
                  <label
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#1e3a8a' }}
                  >
                    {idx + 1}. {q.prompt} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {q.responseMode === 'preset' ? (
                    <select
                      value={reflectionAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setReflectionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      disabled={assessment.isLocked || saving}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #93c5fd',
                        fontSize: '1rem',
                        background: 'white',
                      }}
                    >
                      <option value="">Choose…</option>
                      {(q.presetOptions || [])
                        .map((o) => String(o).trim())
                        .filter(Boolean)
                        .map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <textarea
                      value={reflectionAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setReflectionAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      disabled={assessment.isLocked || saving}
                      rows={3}
                      placeholder="Your reflection…"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #93c5fd',
                        fontSize: '1rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        background: 'white',
                      }}
                      required
                    />
                  )}
                </div>
              ))}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="goalScore"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                >
                  Goal Score: <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="goalScore"
                  type="number"
                  min={assessment.minGoalScore || 0}
                  max={assessment.maxScore || 100}
                  step="0.1"
                  value={goalScore}
                  onChange={(e) => setGoalScore(e.target.value)}
                  disabled={assessment.isLocked || saving}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    background: 'white',
                  }}
                  required
                />
                <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  Maximum score: {assessment.maxScore || 100}
                  {assessment.minGoalScore !== undefined && assessment.minGoalScore > 0 && (
                    <span> • Minimum: {assessment.minGoalScore}</span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Goal Score field — written assessment (numeric) */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="goalScore"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                >
                  Goal Score: <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="goalScore"
                  type="number"
                  min={assessment.minGoalScore || 0}
                  max={assessment.maxScore || 100}
                  step="0.1"
                  value={goalScore}
                  onChange={(e) => setGoalScore(e.target.value)}
                  disabled={assessment.isLocked || saving}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    background: 'white'
                  }}
                  required
                />
                <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  Maximum score: {assessment.maxScore || 100}
                  {assessment.minGoalScore !== undefined && assessment.minGoalScore > 0 && (
                    <span> • Minimum: {assessment.minGoalScore}</span>
                  )}
                </p>
              </div>
            </>
          )}

          {/* Area of Consistency field for Story Goals */}
          {isStoryGoal && (
            <div style={{ 
              marginBottom: '1.5rem', 
              padding: '1rem', 
              background: '#f0f9ff', 
              borderRadius: '0.5rem', 
              border: '2px solid #3b82f6' 
            }}>
              <label
                htmlFor="evidence"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#1e40af' }}
              >
                Area of Consistency (Optional):
              </label>
              <textarea
                id="evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                disabled={assessment.isLocked || saving}
                placeholder="Describe how you've been consistent with your goal and what evidence you have..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #3b82f6',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  background: 'white'
                }}
              />
              <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                Share evidence of how you've been working toward your goal consistently.
              </p>
            </div>
          )}

          {/* Evidence — habit goals: type + optional text for "Other" */}
          {isHabits && (
            <div style={{ 
              marginBottom: '1.5rem', 
              padding: '1rem', 
              background: '#f0f9ff', 
              borderRadius: '0.5rem', 
              border: '2px solid #3b82f6' 
            }}>
              <div style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold', color: '#1e40af' }}>
                2 — Evidence
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#475569' }}>
                Choose how you want evidence recorded. Live Event options use Class Flow sprints when you join a session.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="habitEvidenceType"
                    checked={habitEvidenceType === 'live_event_sprint_rate'}
                    onChange={() => setHabitEvidenceType('live_event_sprint_rate')}
                    disabled={assessment.isLocked || saving}
                  />
                  <span>
                    <strong>Live Event — sprint completion rate</strong>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b' }}>
                      Counts sprints offered vs. sprints where you were marked complete (per session).
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="habitEvidenceType"
                    checked={habitEvidenceType === 'live_event_consistency'}
                    onChange={() => setHabitEvidenceType('live_event_consistency')}
                    disabled={assessment.isLocked || saving}
                  />
                  <span>
                    <strong>Live Event — consistency</strong>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b' }}>
                      Tracks calendar days where you completed at least one sprint (submitted work in the session).
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="habitEvidenceType"
                    checked={habitEvidenceType === 'other'}
                    onChange={() => setHabitEvidenceType('other')}
                    disabled={assessment.isLocked || saving}
                  />
                  <span>
                    <strong>Other</strong>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b' }}>
                      Type your own reflection or proof (same as before).
                    </span>
                  </span>
                </label>
              </div>
              {habitEvidenceType === 'other' && (
                <>
                  <label
                    htmlFor="evidence"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#1e40af' }}
                  >
                    Reflection or proof (optional)
                  </label>
                  <textarea
                    id="evidence"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    disabled={assessment.isLocked || saving}
                    placeholder="Reflection or proof of your commitment..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #3b82f6',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      background: 'white'
                    }}
                  />
                </>
              )}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '0.75rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                color: '#991b1b'
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#e5e7eb',
                color: '#374151',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={assessment.isLocked || saving}
              style={{
                padding: '0.75rem 1.5rem',
                background: assessment.isLocked ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: (assessment.isLocked || saving) ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {saving ? 'Saving...' : (existingGoal || existingHabitSubmission) ? 'Update Goal' : (isHabits ? 'Commit' : 'Set Goal')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetGoalModal;

