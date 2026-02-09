import React, { useState, useEffect } from 'react';
import { Assessment, AssessmentGoal, HabitDuration, HabitSubmission } from '../types/assessmentGoals';
import { setAssessmentGoal, createHabitSubmission, updateHabitSubmissionGoal } from '../utils/assessmentGoalsFirestore';
import { validateGoalScore } from '../utils/assessmentGoals';
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
  
  // Debug logging
  console.log('[SetGoalModal] Assessment type:', assessment.type, 'isHabits:', isHabits, 'isStoryGoal:', isStoryGoal);
  
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
  
  // Evidence field (for Story Goals and Habit Goals)
  const [evidence, setEvidence] = useState<string>(
    existingGoal?.evidence || existingHabitSubmission?.evidence || ''
  );
  
  // Update form when existingHabitSubmission or existingGoal changes
  useEffect(() => {
    if (existingHabitSubmission) {
      setHabitText(existingHabitSubmission.habitText);
      setDuration(existingHabitSubmission.duration);
      setEvidence(existingHabitSubmission.evidence || '');
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
    type: 'numeric' | 'habit' | 'story-goal';
    goalScore?: number;
    textGoal?: string;
    habitText?: string;
    duration?: HabitDuration;
    evidence?: string;
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
        if (existingHabitSubmission) {
          await updateHabitSubmissionGoal(
            assessment.id,
            currentUser.uid,
            trimmedText,
            duration,
            evidence.trim() || null
          );
        } else {
          await createHabitSubmission(
            assessment.id,
            currentUser.uid,
            assessment.classId,
            trimmedText,
            duration,
            evidence.trim() || null
          );
        }
        
        // Store saved data for preview
        setSavedGoalData({
          type: 'habit',
          habitText: trimmedText,
          duration,
          evidence: evidence.trim() || undefined
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
          trimmedText // textGoal
        );
        
        // Store saved data for preview
        setSavedGoalData({
          type: 'story-goal',
          textGoal: trimmedText,
          evidence: evidence.trim() || undefined
        });
      } else {
        // Regular numeric goal
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
          assessment.classId
        );
        
        // Store saved data for preview
        setSavedGoalData({
          type: 'numeric',
          goalScore: score
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
          zIndex: 1000
        }}
        onClick={handleClosePreview}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '0.5rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
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
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>
          {existingGoal || existingHabitSubmission ? 'Edit Goal' : isHabits ? 'Commit to Habit' : 'Set Goal'}
        </h2>
        
        <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
          {assessment.title}
        </p>

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
          ) : (
            <>
              {/* Goal Score field - shown for numeric goals (test/exam/quiz) */}
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

          {/* Area of Consistency field for Habit Goals */}
          {isHabits && (
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
                placeholder="Describe how you've been consistent with your habit and what evidence you have..."
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
                Share evidence of how you've been maintaining your habit consistently.
              </p>
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

