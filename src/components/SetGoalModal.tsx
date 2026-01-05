import React, { useState } from 'react';
import { Assessment, AssessmentGoal } from '../types/assessmentGoals';
import { setAssessmentGoal } from '../utils/assessmentGoalsFirestore';
import { validateGoalScore } from '../utils/assessmentGoals';
import { useAuth } from '../context/AuthContext';

interface SetGoalModalProps {
  assessment: Assessment;
  existingGoal?: AssessmentGoal;
  onClose: () => void;
  onSave: () => void;
}

const SetGoalModal: React.FC<SetGoalModalProps> = ({
  assessment,
  existingGoal,
  onClose,
  onSave
}) => {
  const { currentUser } = useAuth();
  const [goalScore, setGoalScore] = useState<string>(
    existingGoal ? existingGoal.goalScore.toString() : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

    const score = parseFloat(goalScore);
    const minGoalScore = assessment.minGoalScore || 0;
    const validation = validateGoalScore(score, assessment.maxScore, minGoalScore);
    
    if (!validation.valid) {
      setError(validation.error || 'Invalid goal score');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await setAssessmentGoal(
        assessment.id,
        currentUser.uid,
        score,
        assessment.classId
      );
      onSave();
    } catch (err: any) {
      console.error('Error setting goal:', err);
      setError(err.message || 'Failed to set goal. Please try again.');
      setSaving(false);
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
          {existingGoal ? 'Update Goal' : 'Set Goal'}
        </h2>
        
        <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
          {assessment.title}
        </p>

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
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="goalScore"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
            >
              Goal Score:
            </label>
            <input
              id="goalScore"
              type="number"
              min={assessment.minGoalScore || 0}
              max={assessment.maxScore}
              step="0.1"
              value={goalScore}
              onChange={(e) => setGoalScore(e.target.value)}
              disabled={assessment.isLocked || saving}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
              required
            />
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
              Maximum score: {assessment.maxScore}
            </p>
          </div>

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
              {saving ? 'Saving...' : existingGoal ? 'Update Goal' : 'Set Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetGoalModal;

