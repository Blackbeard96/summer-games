import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  getClassesByStudent,
  getAssessmentsByClass,
  getAssessmentGoal,
  getHabitSubmission
} from '../utils/assessmentGoalsFirestore';
import { Assessment, AssessmentWithGoal } from '../types/assessmentGoals';

const AssessmentGoalsNotifier: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [pendingAssessments, setPendingAssessments] = useState<Assessment[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [hasShownNotification, setHasShownNotification] = useState(false);

  // Check for assessments that need goals
  useEffect(() => {
    if (!currentUser) {
      setPendingAssessments([]);
      return;
    }

    const checkPendingAssessments = async () => {
      try {
        // Get all classes the student is enrolled in
        const classes = await getClassesByStudent(currentUser.uid);
        
        // Get all assessments for these classes
        const allAssessments: Assessment[] = [];
        for (const classItem of classes) {
          const assessments = await getAssessmentsByClass(classItem.id);
          allAssessments.push(...assessments);
        }

        // Filter for assessments that:
        // 1. Are not locked
        // 2. Are in 'open' status
        // 3. Student hasn't set a goal yet (for habits, check habit submission instead)
        const pending: Assessment[] = [];
        for (const assessment of allAssessments) {
          if (!assessment.isLocked && assessment.gradingStatus === 'open') {
            let hasGoal = false;
            
            if (assessment.type === 'habits') {
              // For habits, check if there's a habit submission
              const habitSubmission = await getHabitSubmission(assessment.id, currentUser.uid);
              hasGoal = !!habitSubmission;
            } else {
              // For regular assessments, check if there's a goal
              const goal = await getAssessmentGoal(assessment.id, currentUser.uid);
              hasGoal = !!goal;
            }
            
            if (!hasGoal) {
              pending.push(assessment);
            }
          }
        }

        setPendingAssessments(pending);

        // Hide notification immediately if there are no pending assessments
        if (pending.length === 0) {
          setShowNotification(false);
          setHasShownNotification(false); // Reset so it can show again if new assessments appear
        } else if (pending.length > 0 && !hasShownNotification) {
          // Show notification if there are pending assessments and we haven't shown it yet
          // Delay notification slightly to avoid showing immediately on page load
          const timer = setTimeout(() => {
            setShowNotification(true);
            setHasShownNotification(true);
          }, 2000);
          return () => clearTimeout(timer);
        }
      } catch (error) {
        console.error('Error checking pending assessments:', error);
      }
    };

    checkPendingAssessments();

    // Recheck every 30 seconds
    const interval = setInterval(checkPendingAssessments, 30000);
    return () => clearInterval(interval);
  }, [currentUser, hasShownNotification]);

  const handleDismiss = () => {
    setShowNotification(false);
  };

  const handleGoToGoals = () => {
    setShowNotification(false);
    navigate('/assessment-goals');
  };

  if (!currentUser || pendingAssessments.length === 0) {
    return null;
  }

  if (!showNotification) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.65)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
      onClick={handleDismiss}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '450px',
          width: '100%',
          color: 'white',
          boxShadow: '0 20px 60px rgba(16, 185, 129, 0.35)',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
          Set Your Assessment Goals!
        </h2>
        <p style={{ marginTop: '0.5rem', fontSize: '1rem', opacity: 0.9 }}>
          {pendingAssessments.length === 1
            ? 'You have a new assessment that needs a goal set.'
            : `You have ${pendingAssessments.length} assessments that need goals set.`}
        </p>

        <div style={{
          marginTop: '1.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          borderRadius: '0.75rem',
          padding: '1.5rem'
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {pendingAssessments[0]?.title || 'Assessment'}
          </div>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1rem' }}>
            Set your goal score to earn PP rewards based on your performance!
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
          <button
            onClick={handleDismiss}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            Later
          </button>
          <button
            onClick={handleGoToGoals}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'white',
              color: '#059669',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f0fdf4';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Set Goals Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentGoalsNotifier;











