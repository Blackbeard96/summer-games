import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Assessment, StudentAssessmentRow, HabitSubmission, HabitSubmissionStatus, HabitVerification } from '../types/assessmentGoals';
import {
  getGoalsByAssessment,
  getResultsByAssessment,
  setAssessmentResult,
  applyAssessmentResults,
  getClass,
  getHabitSubmissionsByAssessment,
  updateHabitSubmission,
  applyHabitPP
} from '../utils/assessmentGoalsFirestore';
import { computePPChange } from '../utils/assessmentGoals';
import { formatPPChange } from '../utils/assessmentGoals';
import { computeHabitImpact, canApplyHabitPP } from '../utils/habitRewards';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import AssessmentResultsSummaryModal from './AssessmentResultsSummaryModal';

interface AssessmentDashboardProps {
  assessment: Assessment;
  classId: string;
}

const AssessmentDashboard: React.FC<AssessmentDashboardProps> = ({
  assessment,
  classId
}) => {
  const { currentUser } = useAuth();
  const [studentRows, setStudentRows] = useState<StudentAssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<{ [studentId: string]: boolean }>({});
  const [applying, setApplying] = useState(false);

  const [results, setResults] = useState<any[]>([]);
  const [habitSubmissions, setHabitSubmissions] = useState<HabitSubmission[]>([]);
  const isHabits = assessment.type === 'habits';
  
  // Local editing state for habit fields
  const [editingHabit, setEditingHabit] = useState<{ [studentId: string]: {
    status?: HabitSubmissionStatus;
    evidence?: string;
    verification?: HabitVerification;
  } }>({});

  // Fetch class to get student list
  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;

      try {
        setLoading(true);
        
        // Get class to get student IDs
        const classData = await getClass(classId);
        if (!classData) {
          console.error('Class not found');
          return;
        }

        // Get all goals, results, and habit submissions for this assessment
        const [goals, fetchedResults, fetchedHabitSubmissions] = await Promise.all([
          getGoalsByAssessment(assessment.id),
          getResultsByAssessment(assessment.id),
          isHabits ? getHabitSubmissionsByAssessment(assessment.id) : Promise.resolve([])
        ]);
        
        // Store results and habit submissions for use
        setResults(fetchedResults);
        setHabitSubmissions(fetchedHabitSubmissions);

        // Fetch student data
        const studentDataPromises = classData.studentIds.map(async (studentId) => {
          const studentRef = doc(db, 'students', studentId);
          const studentDoc = await getDoc(studentRef);
          if (!studentDoc.exists()) return null;
          const studentData = studentDoc.data();
          return {
            id: studentId,
            name: studentData.displayName || studentData.email || 'Unknown',
            email: studentData.email
          };
        });

        const studentDataList = (await Promise.all(studentDataPromises)).filter(Boolean) as any[];

        // Build student rows
        const rows: StudentAssessmentRow[] = studentDataList.map(student => {
          const goal = goals.find(g => g.studentId === student.id);
          const result = fetchedResults.find(r => r.studentId === student.id);
          const habitSubmission = isHabits ? fetchedHabitSubmissions.find(h => h.studentId === student.id) : undefined;

          // Compute PP change preview if we have goal and result (only for numeric goals)
          let ppChangePreview: number | undefined;
          if (goal && result && result.actualScore !== undefined && goal.goalScore !== undefined && assessment.type !== 'story-goal') {
            const computation = computePPChange(goal.goalScore, result.actualScore, assessment);
            ppChangePreview = computation.ppChange;
          }
          
          // Compute PP impact for habits
          let habitPPImpact: number | undefined;
          if (habitSubmission) {
            // Use existing ppImpact if set, otherwise compute from status
            habitPPImpact = habitSubmission.ppImpact ?? computeHabitImpact(habitSubmission.status);
          }

          return {
            studentId: student.id,
            studentName: student.name,
            studentEmail: student.email,
            goalScore: goal?.goalScore,
            actualScore: result?.actualScore,
            computedDelta: result?.computedDelta,
            computedAbsDiff: result?.computedAbsDiff,
            outcome: result?.outcome,
            ppChange: isHabits ? habitPPImpact : (result?.ppChange ?? ppChangePreview),
            applied: isHabits ? (habitSubmission?.applied ?? false) : (result?.applied ?? false),
            goalId: goal?.id,
            resultId: result?.id,
            habitSubmission // Add habit submission to row data
          } as StudentAssessmentRow & { habitSubmission?: HabitSubmission };
        });

        setStudentRows(rows);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [assessment.id, classId, currentUser]);

  const handleScoreChange = async (studentId: string, score: number) => {
    if (!currentUser) return;

    setSaving(prev => ({ ...prev, [studentId]: true }));

    try {
      await setAssessmentResult(assessment.id, studentId, score, currentUser.uid);
      
      // Refresh data
      const [goals, results] = await Promise.all([
        getGoalsByAssessment(assessment.id),
        getResultsByAssessment(assessment.id)
      ]);

      const goal = goals.find(g => g.studentId === studentId);
      const result = results.find(r => r.studentId === studentId);

      // Update row
      setStudentRows(prev => prev.map(row => {
        if (row.studentId === studentId) {
          return {
            ...row,
            actualScore: result?.actualScore,
            computedDelta: result?.computedDelta,
            computedAbsDiff: result?.computedAbsDiff,
            outcome: result?.outcome,
            ppChange: result?.ppChange,
            applied: result?.applied ?? false,
            resultId: result?.id
          };
        }
        return row;
      }));
    } catch (error: any) {
      console.error('Error updating score:', error);
      alert(`Failed to update score: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleHabitStatusChange = async (studentId: string, field: 'status' | 'evidence' | 'verification', value: string) => {
    if (!currentUser) return;

    setSaving(prev => ({ ...prev, [studentId]: true }));

    try {
      const updateData: any = {};
      
      if (field === 'status') {
        updateData.status = value as HabitSubmissionStatus;
        // Auto-compute ppImpact when status changes
        updateData.ppImpact = computeHabitImpact(value);
      } else if (field === 'evidence') {
        updateData.evidence = value || null;
      } else if (field === 'verification') {
        updateData.verification = value as HabitVerification;
      }
      
      await updateHabitSubmission(assessment.id, studentId, updateData);
      
      // Update local state
      setStudentRows(prev => prev.map(row => {
        if (row.studentId === studentId && (row as any).habitSubmission) {
          const updated = {
            ...(row as any).habitSubmission,
            ...updateData
          };
          (row as any).habitSubmission = updated;
          (row as any).ppChange = updated.ppImpact ?? computeHabitImpact(updated.status);
        }
        return row;
      }));
      
      // Clear editing state
      setEditingHabit(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (error: any) {
      console.error('Error updating habit:', error);
      alert(`Failed to update habit: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleApplyHabitForStudent = async (studentId: string) => {
    if (!currentUser) return;
    
    const row = studentRows.find(r => r.studentId === studentId);
    const habitSubmission = (row as any)?.habitSubmission;
    
    if (!habitSubmission) {
      alert('No habit submission found for this student');
      return;
    }
    
    if (habitSubmission.applied) {
      alert('PP has already been applied for this student');
      return;
    }
    
    if (!canApplyHabitPP(habitSubmission.status, habitSubmission.verification)) {
      alert('Cannot apply PP: Status must be COMPLETED or BROKEN, and verification must be set');
      return;
    }
    
    setSaving(prev => ({ ...prev, [studentId]: true }));
    
    try {
      const result = await applyHabitPP(assessment.id, studentId);
      
      if (result.success) {
        alert(`Successfully applied ${habitSubmission.ppImpact || 0} PP for ${row?.studentName}`);
        
        // Refresh data
        const refreshedSubmissions = await getHabitSubmissionsByAssessment(assessment.id);
        setHabitSubmissions(refreshedSubmissions);
        
        setStudentRows(prev => prev.map(r => {
          if (r.studentId === studentId) {
            const refreshed = refreshedSubmissions.find(h => h.studentId === studentId);
            if (refreshed) {
              (r as any).habitSubmission = refreshed;
              (r as any).applied = refreshed.applied ?? false;
            }
          }
          return r;
        }));
      } else {
        alert(`Failed to apply PP: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error applying habit PP:', error);
      alert(`Failed to apply PP: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleApplyResults = async () => {
    if (!window.confirm('Apply PP changes for all unapplied results? This will update student PP balances.')) {
      return;
    }

    setApplying(true);
    try {
      if (isHabits) {
        // For habits, apply individually per student
        let appliedCount = 0;
        const errors: string[] = [];
        
        for (const row of studentRows) {
          const habitSubmission = (row as any).habitSubmission;
          if (!habitSubmission) continue;
          
          // Check if can apply
          if (habitSubmission.applied) continue; // Already applied
          
          if (!canApplyHabitPP(habitSubmission.status, habitSubmission.verification)) {
            continue; // Skip if can't apply
          }
          
          try {
            const result = await applyHabitPP(assessment.id, row.studentId);
            if (result.success) {
              appliedCount++;
            } else {
              errors.push(`${row.studentName}: ${result.error || 'Failed'}`);
            }
          } catch (err: any) {
            errors.push(`${row.studentName}: ${err.message || 'Failed'}`);
          }
        }
        
        if (appliedCount > 0) {
          alert(`Successfully applied ${appliedCount} habit result(s)!`);
        }
        if (errors.length > 0) {
          alert(`Some errors occurred:\n${errors.join('\n')}`);
        }
        
        // Refresh data
        const refreshedHabitSubmissions = await getHabitSubmissionsByAssessment(assessment.id);
        setHabitSubmissions(refreshedHabitSubmissions);
        setStudentRows(prev => prev.map(row => {
          const refreshed = refreshedHabitSubmissions.find(h => h.studentId === row.studentId);
          if (refreshed) {
            (row as any).habitSubmission = refreshed;
            (row as any).ppChange = refreshed.ppImpact ?? computeHabitImpact(refreshed.status);
            (row as any).applied = refreshed.applied ?? false;
          }
          return row;
        }));
      } else {
        // Regular assessment results
        const result = await applyAssessmentResults(assessment.id);
        if (result.success) {
          alert(`Successfully applied ${result.appliedCount} result(s)!`);
          // Refresh data
          const results = await getResultsByAssessment(assessment.id);
          setStudentRows(prev => prev.map(row => {
            const result = results.find(r => r.studentId === row.studentId);
            return {
              ...row,
              applied: result?.applied ?? false
            };
          }));
        } else {
          alert(`Applied ${result.appliedCount} result(s), but some errors occurred:\n${result.errors.join('\n')}`);
        }
      }
    } catch (error: any) {
      console.error('Error applying results:', error);
      alert(`Failed to apply results: ${error.message}`);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  const unappliedCount = studentRows.filter(r => r.actualScore !== undefined && !r.applied).length;

  return (
    <div>
      <h2>{assessment.title} - Dashboard</h2>
      
      {unappliedCount > 0 && (
        <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem' }}>
          <p style={{ margin: 0 }}>
            {unappliedCount} result(s) ready to apply. Click "Apply Results" to update student PP balances.
          </p>
          <button
            onClick={handleApplyResults}
            disabled={applying}
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: applying ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: applying ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {applying ? 'Applying...' : 'Apply Results'}
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Student</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>
                {isHabits ? 'Habit Commitment' : 'Goal Score'}
              </th>
              {isHabits ? (
                <>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Evidence</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Verification</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>PP Impact</th>
                </>
              ) : (
                <>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Actual Score</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Delta</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>PP Change</th>
                </>
              )}
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Applied</th>
            </tr>
          </thead>
          <tbody>
            {studentRows.map(row => (
              <tr key={row.studentId}>
                <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                  {row.studentName}
                  {row.studentEmail && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{row.studentEmail}</div>
                  )}
                </td>
                <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                  {isHabits ? (
                    <>
                      {(row as any).habitSubmission ? (
                        <>
                          <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                            {(row as any).habitSubmission.habitText}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            Duration: {(row as any).habitSubmission.duration.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            Status: <span style={{ 
                              color: (row as any).habitSubmission.status === 'completed' ? '#10b981' : 
                                     (row as any).habitSubmission.status === 'failed' ? '#ef4444' : '#3b82f6'
                            }}>
                              {(row as any).habitSubmission.status.charAt(0).toUpperCase() + (row as any).habitSubmission.status.slice(1)}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            Check-ins: {(row as any).habitSubmission.checkInCount} / {(row as any).habitSubmission.requiredCheckIns}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </>
                  ) : (
                    <>
                      {row.goalScore !== undefined ? `${row.goalScore} / ${assessment.maxScore}` : '—'}
                      {assessment.minGoalScore !== undefined && assessment.minGoalScore > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Min: {assessment.minGoalScore}
                        </div>
                      )}
                    </>
                  )}
                </td>
                {isHabits ? (
                  <>
                    {/* Status column */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {(row as any).habitSubmission ? (
                        <select
                          value={(row as any).habitSubmission.status || 'IN_PROGRESS'}
                          onChange={(e) => handleHabitStatusChange(row.studentId, 'status', e.target.value)}
                          disabled={saving[row.studentId] || (row as any).habitSubmission.applied}
                          style={{
                            padding: '0.5rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #d1d5db',
                            minWidth: '120px'
                          }}
                        >
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="BROKEN">Broken</option>
                          <option value="DISPUTED">Disputed</option>
                        </select>
                      ) : '—'}
                    </td>
                    {/* Evidence column */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {(row as any).habitSubmission ? (
                        <textarea
                          value={(row as any).habitSubmission.evidence || ''}
                          onChange={(e) => handleHabitStatusChange(row.studentId, 'evidence', e.target.value)}
                          disabled={saving[row.studentId] || (row as any).habitSubmission.applied}
                          placeholder="Optional reflection/evidence..."
                          style={{
                            width: '100%',
                            minWidth: '200px',
                            padding: '0.5rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #d1d5db',
                            fontFamily: 'inherit',
                            fontSize: '0.875rem',
                            resize: 'vertical'
                          }}
                          rows={2}
                        />
                      ) : '—'}
                    </td>
                    {/* Verification column */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {(row as any).habitSubmission ? (
                        <select
                          value={(row as any).habitSubmission.verification || ''}
                          onChange={(e) => handleHabitStatusChange(row.studentId, 'verification', e.target.value)}
                          disabled={saving[row.studentId] || (row as any).habitSubmission.applied}
                          style={{
                            padding: '0.5rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #d1d5db',
                            minWidth: '140px'
                          }}
                        >
                          <option value="">Not Set</option>
                          <option value="VERIFIED">Verified</option>
                          <option value="NOT_VERIFIED">Not Verified</option>
                          <option value="TRUST_ACCEPTED">Trust Accepted</option>
                        </select>
                      ) : '—'}
                    </td>
                    {/* PP Impact column */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {row.ppChange !== undefined ? (
                        <span style={{ 
                          color: row.ppChange > 0 ? '#10b981' : row.ppChange < 0 ? '#ef4444' : '#6b7280',
                          fontWeight: 'bold'
                        }}>
                          {formatPPChange(row.ppChange)}
                        </span>
                      ) : '—'}
                    </td>
                    {/* Applied column with individual apply button for habits */}
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {row.applied ? (
                        <span style={{ color: '#10b981' }}>✓ Applied</span>
                      ) : (
                        <>
                          <span style={{ color: '#6b7280', marginRight: '0.5rem' }}>Pending</span>
                          {(row as any).habitSubmission && canApplyHabitPP((row as any).habitSubmission.status, (row as any).habitSubmission.verification) && (
                            <button
                              onClick={() => handleApplyHabitForStudent(row.studentId)}
                              disabled={saving[row.studentId]}
                              style={{
                                padding: '0.25rem 0.75rem',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                cursor: saving[row.studentId] ? 'not-allowed' : 'pointer',
                                fontSize: '0.875rem'
                              }}
                            >
                              {saving[row.studentId] ? 'Applying...' : 'Apply'}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      <input
                        type="number"
                        min="0"
                        max={assessment.maxScore}
                        step="0.1"
                        value={row.actualScore ?? ''}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value)) {
                            handleScoreChange(row.studentId, value);
                          }
                        }}
                        disabled={saving[row.studentId]}
                        style={{
                          width: '80px',
                          padding: '0.5rem',
                          borderRadius: '0.25rem',
                          border: '1px solid #d1d5db'
                        }}
                      />
                      {saving[row.studentId] && <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>Saving...</span>}
                    </td>
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {row.computedDelta !== undefined ? (
                        <span style={{ color: row.computedDelta >= 0 ? '#10b981' : '#ef4444' }}>
                          {row.computedDelta > 0 ? '+' : ''}{row.computedDelta}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {row.ppChange !== undefined ? (
                        <span style={{ 
                          color: row.ppChange > 0 ? '#10b981' : row.ppChange < 0 ? '#ef4444' : '#6b7280',
                          fontWeight: 'bold'
                        }}>
                          {formatPPChange(row.ppChange)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                      {row.applied ? (
                        <span style={{ color: '#10b981' }}>✓ Applied</span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>Pending</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AssessmentDashboard;

