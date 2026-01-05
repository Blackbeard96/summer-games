import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Assessment, StudentAssessmentRow } from '../types/assessmentGoals';
import {
  getGoalsByAssessment,
  getResultsByAssessment,
  setAssessmentResult,
  applyAssessmentResults,
  getClass
} from '../utils/assessmentGoalsFirestore';
import { computePPChange } from '../utils/assessmentGoals';
import { formatPPChange } from '../utils/assessmentGoals';
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

        // Get all goals and results for this assessment
        const [goals, fetchedResults] = await Promise.all([
          getGoalsByAssessment(assessment.id),
          getResultsByAssessment(assessment.id)
        ]);
        
        // Store results for use in modal
        setResults(fetchedResults);

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

          // Compute PP change preview if we have goal and result
          let ppChangePreview: number | undefined;
          if (goal && result && result.actualScore !== undefined) {
            const computation = computePPChange(goal.goalScore, result.actualScore, assessment);
            ppChangePreview = computation.ppChange;
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
            ppChange: result?.ppChange ?? ppChangePreview,
            applied: result?.applied ?? false,
            goalId: goal?.id,
            resultId: result?.id
          };
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

  const handleApplyResults = async () => {
    if (!window.confirm('Apply PP changes for all unapplied results? This will update student PP balances.')) {
      return;
    }

    setApplying(true);
    try {
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
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Goal Score</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Actual Score</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Delta</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>PP Change</th>
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
                  {row.goalScore !== undefined ? `${row.goalScore} / ${assessment.maxScore}` : '—'}
                  {assessment.minGoalScore !== undefined && assessment.minGoalScore > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Min: {assessment.minGoalScore}
                    </div>
                  )}
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AssessmentDashboard;

