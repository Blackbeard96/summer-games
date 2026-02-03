import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Class,
  Assessment,
  StudentAssessmentRow,
  RewardTier,
  PenaltyTier
} from '../types/assessmentGoals';
import {
  getClassesByTeacher,
  createAssessment,
  updateAssessment,
  getAssessmentsByClass,
  getGoalsByAssessment,
  getResultsByAssessment,
  setAssessmentResult,
  applyAssessmentResults,
  lockAssessment,
  unlockAssessment,
  deleteAssessment,
  getPPLedgerEntriesByAssessment
} from '../utils/assessmentGoalsFirestore';
import { validateAssessmentConfig } from '../utils/assessmentGoals';
import { Timestamp, deleteField } from 'firebase/firestore';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import CreateAssessmentForm from './CreateAssessmentForm';
import AssessmentDashboard from './AssessmentDashboard';
import PPLedgerView from './PPLedgerView';

type ViewMode = 'list' | 'create' | 'edit' | 'dashboard' | 'ledger';

const AssessmentGoalsAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(true);

  // Fetch classes for current teacher/admin
  useEffect(() => {
    if (!currentUser) return;

    const fetchClasses = async () => {
      try {
        const teacherClasses = await getClassesByTeacher(currentUser.uid);
        setClasses(teacherClasses);
        if (teacherClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(teacherClasses[0].id);
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [currentUser, selectedClassId]);

  // Fetch assessments for selected class
  useEffect(() => {
    if (!selectedClassId) return;

    const fetchAssessments = async () => {
      try {
        const classAssessments = await getAssessmentsByClass(selectedClassId);
        setAssessments(classAssessments);
      } catch (error) {
        console.error('Error fetching assessments:', error);
      }
    };

    fetchAssessments();
  }, [selectedClassId]);

  const buildAssessmentData = (assessmentData: any, isUpdate: boolean = false) => {
    const baseAssessment: any = {
      title: assessmentData.title,
      type: assessmentData.type,
      date: Timestamp.fromDate(new Date(assessmentData.date)),
      maxScore: assessmentData.type === 'habits' ? 100 : (assessmentData.maxScore || 100),
      isLocked: assessmentData.isLocked || false,
      rewardTiers: assessmentData.rewardTiers || [],
      missPenaltyTiers: assessmentData.missPenaltyTiers || [],
      penaltyCap: assessmentData.penaltyCap || 75,
      bonusCap: assessmentData.bonusCap || 75,
    };

    // Only set these fields on create, not update
    if (!isUpdate) {
      baseAssessment.classId = selectedClassId;
      baseAssessment.createdBy = currentUser!.uid;
      baseAssessment.gradingStatus = 'open';
      baseAssessment.rewardMode = 'pp';
    }

    // Only include habitsConfig if it exists and type is 'habits'
    // Clean up any undefined values inside habitsConfig
    if (assessmentData.type === 'habits' && assessmentData.habitsConfig) {
      const cleanedHabitsConfig: any = {};
      if (assessmentData.habitsConfig.defaultDuration !== undefined) {
        cleanedHabitsConfig.defaultDuration = assessmentData.habitsConfig.defaultDuration;
      }
      if (assessmentData.habitsConfig.defaultRewardPP !== undefined) {
        cleanedHabitsConfig.defaultRewardPP = assessmentData.habitsConfig.defaultRewardPP;
      }
      if (assessmentData.habitsConfig.defaultRewardXP !== undefined) {
        cleanedHabitsConfig.defaultRewardXP = assessmentData.habitsConfig.defaultRewardXP;
      }
      if (assessmentData.habitsConfig.defaultConsequencePP !== undefined) {
        cleanedHabitsConfig.defaultConsequencePP = assessmentData.habitsConfig.defaultConsequencePP;
      }
      if (assessmentData.habitsConfig.defaultConsequenceXP !== undefined) {
        cleanedHabitsConfig.defaultConsequenceXP = assessmentData.habitsConfig.defaultConsequenceXP;
      }
      if (assessmentData.habitsConfig.requireNotesOnCheckIn !== undefined) {
        cleanedHabitsConfig.requireNotesOnCheckIn = assessmentData.habitsConfig.requireNotesOnCheckIn;
      }
      // Only add habitsConfig if it has at least one property
      if (Object.keys(cleanedHabitsConfig).length > 0) {
        baseAssessment.habitsConfig = cleanedHabitsConfig;
      }
    } else if (isUpdate && assessmentData.type !== 'habits' && selectedAssessment?.habitsConfig) {
      // If updating and type is not habits, remove habitsConfig if it exists
      baseAssessment.habitsConfig = deleteField();
    }

    return baseAssessment;
  };

  const handleCreateAssessment = async (assessmentData: any) => {
    if (!currentUser || !selectedClassId) return;

    try {
      const newAssessment = buildAssessmentData(assessmentData, false) as Omit<Assessment, 'id'>;

      const validation = validateAssessmentConfig(newAssessment);
      if (!validation.valid) {
        alert(`Validation errors:\n${validation.errors.join('\n')}`);
        return;
      }

      await createAssessment(newAssessment);
      setViewMode('list');
      
      // Refresh assessments
      const updatedAssessments = await getAssessmentsByClass(selectedClassId);
      setAssessments(updatedAssessments);
    } catch (error: any) {
      console.error('Error creating assessment:', error);
      alert(`Failed to create assessment: ${error.message}`);
    }
  };

  const handleUpdateAssessment = async (assessmentData: any) => {
    if (!currentUser || !selectedAssessment) return;

    try {
      const updates = buildAssessmentData(assessmentData, true);

      // Validate the updated assessment
      const updatedAssessment = { ...selectedAssessment, ...updates };
      const validation = validateAssessmentConfig(updatedAssessment);
      if (!validation.valid) {
        alert(`Validation errors:\n${validation.errors.join('\n')}`);
        return;
      }

      await updateAssessment(selectedAssessment.id, updates);
      setViewMode('list');
      setSelectedAssessment(null);
      
      // Refresh assessments
      const updatedAssessments = await getAssessmentsByClass(selectedClassId!);
      setAssessments(updatedAssessments);
      
      alert('✅ Assessment updated successfully!');
    } catch (error: any) {
      console.error('Error updating assessment:', error);
      alert(`Failed to update assessment: ${error.message}`);
    }
  };

  const handleEditAssessment = (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    setViewMode('edit');
  };

  const handleViewDashboard = async (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    setViewMode('dashboard');
  };

  const handleViewLedger = async (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    setViewMode('ledger');
  };

  const handleLockAssessment = async (assessmentId: string) => {
    try {
      await lockAssessment(assessmentId);
      const updatedAssessments = await getAssessmentsByClass(selectedClassId!);
      setAssessments(updatedAssessments);
    } catch (error: any) {
      console.error('Error locking assessment:', error);
      alert(`Failed to lock assessment: ${error.message}`);
    }
  };

  const handleUnlockAssessment = async (assessmentId: string) => {
    try {
      await unlockAssessment(assessmentId);
      const updatedAssessments = await getAssessmentsByClass(selectedClassId!);
      setAssessments(updatedAssessments);
    } catch (error: any) {
      console.error('Error unlocking assessment:', error);
      alert(`Failed to unlock assessment: ${error.message}`);
    }
  };

  const handleDeleteAssessment = async (assessment: Assessment) => {
    // Get counts for warning
    const [goals, results] = await Promise.all([
      getGoalsByAssessment(assessment.id),
      getResultsByAssessment(assessment.id)
    ]);
    
    const goalsCount = goals.length;
    const resultsCount = results.length;
    
    const warningMessage = `⚠️ WARNING: Delete Assessment "${assessment.title}"?\n\n` +
      `This will permanently delete:\n` +
      `• The assessment (${assessment.title})\n` +
      `• ${goalsCount} goal(s) set by students\n` +
      `• ${resultsCount} result(s) and scores\n` +
      `• All related PP ledger entries\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Are you absolutely sure you want to delete this assessment?`;
    
    if (!window.confirm(warningMessage)) {
      return;
    }
    
    try {
      await deleteAssessment(assessment.id, true);
      alert(`✅ Assessment "${assessment.title}" has been deleted successfully.`);
      
      // Refresh assessments list
      const updatedAssessments = await getAssessmentsByClass(selectedClassId!);
      setAssessments(updatedAssessments);
    } catch (error: any) {
      console.error('Error deleting assessment:', error);
      alert(`Failed to delete assessment: ${error.message}`);
    }
  };

  if (!currentUser) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to access the admin panel.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>No Classes Found</h2>
        <p>You don't have any classes yet. Create a class first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Assessment Goals Admin</h1>
        {viewMode !== 'list' && (
          <button
            onClick={() => {
              setViewMode('list');
              setSelectedAssessment(null);
            }}
            style={{
              padding: '0.5rem 1rem',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer'
            }}
          >
            ← Back to List
          </button>
        )}
      </div>

      {viewMode === 'list' && (
        <>
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

          {/* Actions */}
          <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setViewMode('create')}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              + Create Assessment
            </button>
          </div>

          {/* Assessments List */}
          {assessments.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: '#f3f4f6', borderRadius: '0.5rem' }}>
              <p>No assessments found. Create one to get started.</p>
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
                        Max Score: {assessment.maxScore} • 
                        Status: {assessment.gradingStatus} • 
                        {assessment.isLocked ? '🔒 Locked' : '🔓 Unlocked'}
                      </p>
                      <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        Goals Set: {assessment.numGoalsSet || 0} • 
                        Graded: {assessment.numGraded || 0} • 
                        Applied: {assessment.numApplied || 0}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleEditAssessment(assessment)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                        title="Edit Assessment"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleViewDashboard(assessment)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Dashboard
                      </button>
                      <button
                        onClick={() => handleViewLedger(assessment)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Ledger
                      </button>
                      {assessment.isLocked ? (
                        <button
                          onClick={() => handleUnlockAssessment(assessment.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Unlock
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLockAssessment(assessment.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Lock
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAssessment(assessment)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                        title="Delete Assessment"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'create' && (
        <CreateAssessmentForm
          classId={selectedClassId!}
          onSave={handleCreateAssessment}
          onCancel={() => setViewMode('list')}
        />
      )}

      {viewMode === 'edit' && selectedAssessment && (
        <CreateAssessmentForm
          classId={selectedClassId!}
          onSave={handleUpdateAssessment}
          onCancel={() => {
            setViewMode('list');
            setSelectedAssessment(null);
          }}
          initialData={selectedAssessment}
        />
      )}

      {viewMode === 'dashboard' && selectedAssessment && (
        <AssessmentDashboard
          assessment={selectedAssessment}
          classId={selectedClassId!}
        />
      )}

      {viewMode === 'ledger' && selectedAssessment && (
        <PPLedgerView
          assessment={selectedAssessment}
        />
      )}
    </div>
  );
};

export default AssessmentGoalsAdmin;

