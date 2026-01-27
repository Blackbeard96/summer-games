import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import {
  Assessment,
  AssessmentGoal,
  AssessmentResult,
  AssessmentWithGoal,
  HabitSubmission,
  HabitDuration
} from '../types/assessmentGoals';
import {
  getClassesByStudent,
  getAssessmentsByClass,
  getAssessmentGoal,
  getAssessmentResult,
  setAssessmentGoal,
  getAssessment,
  getHabitSubmission
} from '../utils/assessmentGoalsFirestore';
import { validateGoalScore } from '../utils/assessmentGoals';
import { formatOutcome, formatPPChange } from '../utils/assessmentGoals';
import SetGoalModal from './SetGoalModal';
import ResultsSummaryCard from './ResultsSummaryCard';
import AssessmentResultModal from './AssessmentResultModal';

const AssessmentGoalsStudent: React.FC = () => {
  const { currentUser } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<AssessmentWithGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showSetGoalModal, setShowSetGoalModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentWithGoal | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultModalData, setResultModalData] = useState<{ result: AssessmentResult; assessment: Assessment; goalScore: number } | null>(null);
  const [habitSubmissions, setHabitSubmissions] = useState<Map<string, HabitSubmission>>(new Map());

  // Fetch classes for current student
  useEffect(() => {
    if (!currentUser) return;

    const fetchClasses = async () => {
      try {
        const studentClasses = await getClassesByStudent(currentUser.uid);
        setClasses(studentClasses);
        if (studentClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(studentClasses[0].id);
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      }
    };

    fetchClasses();
  }, [currentUser, selectedClassId]);

  // Fetch assessments for selected class
  useEffect(() => {
    if (!currentUser || !selectedClassId) return;

    setLoading(true);

    const fetchAssessments = async () => {
      try {
        const classAssessments = await getAssessmentsByClass(selectedClassId);
        
        // Fetch goals, results, and habit submissions for each assessment
        const assessmentsWithData = await Promise.all(
          classAssessments.map(async (assessment) => {
            const [goal, result, habitSubmission] = await Promise.all([
              getAssessmentGoal(assessment.id, currentUser.uid),
              getAssessmentResult(assessment.id, currentUser.uid),
              assessment.type === 'habits' ? getHabitSubmission(assessment.id, currentUser.uid) : Promise.resolve(null)
            ]);

            // Store habit submission in map for easy access
            if (habitSubmission) {
              setHabitSubmissions(prev => new Map(prev).set(assessment.id, habitSubmission));
            }

            return {
              ...assessment,
              goal,
              result
            } as AssessmentWithGoal;
          })
        );

        setAssessments(assessmentsWithData);
      } catch (error) {
        console.error('Error fetching assessments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssessments();

    // Set up real-time listener for assessments
    const assessmentsRef = collection(db, 'assessments');
    const q = query(assessmentsRef, where('classId', '==', selectedClassId));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const updatedAssessments = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const assessment = { id: doc.id, ...doc.data() } as Assessment;
          const [goal, result, habitSubmission] = await Promise.all([
            getAssessmentGoal(assessment.id, currentUser.uid),
            getAssessmentResult(assessment.id, currentUser.uid),
            assessment.type === 'habits' ? getHabitSubmission(assessment.id, currentUser.uid) : Promise.resolve(null)
          ]);
          
          // Store habit submission in map for easy access
          if (habitSubmission) {
            setHabitSubmissions(prev => new Map(prev).set(assessment.id, habitSubmission));
          }
          
          return { ...assessment, goal, result } as AssessmentWithGoal;
        })
      );
      setAssessments(updatedAssessments);
    });

    return () => unsubscribe();
  }, [currentUser, selectedClassId]);

  const handleSetGoal = (assessment: AssessmentWithGoal) => {
    setSelectedAssessment(assessment);
    setShowSetGoalModal(true);
  };

  const handleGoalSaved = async () => {
    if (!currentUser || !selectedAssessment) return;
    
    // Refresh the assessment data
    const [updatedGoal, habitSubmission] = await Promise.all([
      getAssessmentGoal(selectedAssessment.id, currentUser.uid),
      selectedAssessment.type === 'habits' ? getHabitSubmission(selectedAssessment.id, currentUser.uid) : Promise.resolve(null)
    ]);
    
    // Update habit submission in map if it exists
    if (habitSubmission) {
      setHabitSubmissions(prev => new Map(prev).set(selectedAssessment.id, habitSubmission));
    }
    
    setAssessments(prev => prev.map(a => 
      a.id === selectedAssessment.id 
        ? { ...a, goal: updatedGoal || undefined }
        : a
    ));
    
    setShowSetGoalModal(false);
    setSelectedAssessment(null);
  };

  const getDurationLabel = (duration: HabitDuration): string => {
    switch (duration) {
      case '1_class': return '1 Class';
      case '1_day': return '1 Day';
      case '3_days': return '3 Days';
      case '1_week': return '1 Week';
      default: return duration;
    }
  };

  const getStatusBadge = (assessment: AssessmentWithGoal) => {
    if (assessment.isLocked) {
      return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🔒 Locked</span>;
    }
    if (assessment.gradingStatus === 'graded') {
      return <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Graded</span>;
    }
    if (assessment.gradingStatus === 'open') {
      return <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>📝 Open</span>;
    }
    return <span style={{ color: '#6b7280', fontWeight: 'bold' }}>📋 Draft</span>;
  };

  if (!currentUser) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to view your assessment goals.</p>
      </div>
    );
  }

  if (loading && assessments.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading assessments...</p>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>No Classes Found</h2>
        <p>You are not enrolled in any classes yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>Assessment Goals</h1>

      {/* Class Selector */}
      {classes.length > 1 && (
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Select Class:
          </label>
          <select
            value={selectedClassId || ''}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem',
              minWidth: '200px'
            }}
          >
            {classes.map(classItem => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Assessments List */}
      {assessments.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#f3f4f6', borderRadius: '0.5rem' }}>
          <p>No assessments found for this class.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {assessments.map(assessment => (
            <div
              key={assessment.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{assessment.title}</h3>
                  <p style={{ margin: 0, color: '#6b7280' }}>
                    {assessment.type.charAt(0).toUpperCase() + assessment.type.slice(1)} • 
                    Max Score: {assessment.maxScore}
                  </p>
                </div>
                <div>{getStatusBadge(assessment)}</div>
              </div>

              {/* Goal Display */}
              {assessment.type === 'habits' && habitSubmissions.get(assessment.id) ? (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '2px solid #10b981' }}>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 'bold', color: '#10b981' }}>
                    ✅ Your Habit Commitment:
                  </p>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontStyle: 'italic', color: '#374151' }}>
                    "{habitSubmissions.get(assessment.id)!.habitText}"
                  </p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                    Duration: {getDurationLabel(habitSubmissions.get(assessment.id)!.duration)}
                  </p>
                </div>
              ) : assessment.goal ? (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '2px solid #3b82f6' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#3b82f6' }}>
                    ✅ Your Goal: {assessment.goal.goalScore} / {assessment.maxScore}
                  </p>
                </div>
              ) : (
                !assessment.isLocked && (
                  <button
                    onClick={() => handleSetGoal(assessment)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      marginBottom: '1rem'
                    }}
                  >
                    Set Goal
                  </button>
                )
              )}

              {/* Results Display */}
              {assessment.result && (
                <ResultsSummaryCard
                  goal={assessment.goal}
                  result={assessment.result}
                  assessment={assessment}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Set Goal Modal */}
      {showSetGoalModal && selectedAssessment && (
        <SetGoalModal
          assessment={selectedAssessment}
          existingGoal={selectedAssessment.goal || undefined}
          onClose={() => {
            setShowSetGoalModal(false);
            setSelectedAssessment(null);
          }}
          onSave={handleGoalSaved}
        />
      )}

      {showResultModal && resultModalData && (
        <AssessmentResultModal
          result={resultModalData.result}
          assessment={resultModalData.assessment}
          goalScore={resultModalData.goalScore}
          onClose={() => {
            setShowResultModal(false);
            setResultModalData(null);
          }}
        />
      )}
    </div>
  );
};

export default AssessmentGoalsStudent;

