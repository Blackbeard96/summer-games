import React from 'react';
import { AssessmentResult, Assessment } from '../types/assessmentGoals';
import { formatPPChange, formatOutcome } from '../utils/assessmentGoals';

interface StudentResult {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  result: AssessmentResult;
  goalScore: number;
}

interface AssessmentResultsSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  assessment: Assessment;
  studentResults: StudentResult[];
  isApplying?: boolean;
}

const AssessmentResultsSummaryModal: React.FC<AssessmentResultsSummaryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  assessment,
  studentResults,
  isApplying = false
}) => {
  if (!isOpen) return null;

  const totalPPChange = studentResults.reduce((sum, sr) => sum + (sr.result.ppChange || 0), 0);
  const totalArtifacts = studentResults.reduce((sum, sr) => 
    sum + (sr.result.artifactsGranted?.length || 0), 0
  );
  const studentsWithRewards = studentResults.filter(sr => (sr.result.ppChange || 0) > 0).length;
  const studentsWithPenalties = studentResults.filter(sr => (sr.result.ppChange || 0) < 0).length;
  const studentsWithArtifacts = studentResults.filter(sr => 
    sr.result.artifactsGranted && sr.result.artifactsGranted.length > 0
  ).length;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '3px solid #8b5cf6'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 'bold', color: '#1f2937' }}>
            Assessment Results Summary
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '1rem' }}>
            {assessment.title}
          </p>
        </div>

        {/* Summary Statistics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.75rem'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#8b5cf6' }}>
              {studentResults.length}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Students</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
              {studentsWithRewards}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Rewards</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
              {studentsWithPenalties}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Penalties</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {totalArtifacts}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Artifacts</div>
          </div>
        </div>

        {/* Student Results List */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            Student Results
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
            {studentResults.map((studentResult) => {
              const { result, goalScore, studentName, studentEmail } = studentResult;
              const ppChange = result.ppChange || 0;
              const isReward = ppChange > 0;
              const isPenalty = ppChange < 0;
              const artifacts = result.artifactsGranted || [];

              return (
                <div
                  key={studentResult.studentId}
                  style={{
                    border: `2px solid ${isReward ? '#10b981' : isPenalty ? '#ef4444' : '#e5e7eb'}`,
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    backgroundColor: isReward ? '#f0fdf4' : isPenalty ? '#fef2f2' : '#f9fafb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#1f2937' }}>
                        {studentName}
                      </div>
                      {studentEmail && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {studentEmail}
                        </div>
                      )}
                    </div>
                    <div style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '0.5rem',
                      backgroundColor: isReward ? '#10b981' : isPenalty ? '#ef4444' : '#6b7280',
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      textTransform: 'capitalize'
                    }}>
                      {formatOutcome(result.outcome || 'miss')}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Goal</div>
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {goalScore} / {assessment.maxScore}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Actual</div>
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {result.actualScore} / {assessment.maxScore}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Difference</div>
                      <div style={{ 
                        fontWeight: 'bold',
                        color: result.computedDelta && result.computedDelta >= 0 ? '#10b981' : '#ef4444'
                      }}>
                        {result.computedDelta && result.computedDelta > 0 ? '+' : ''}{result.computedDelta || 0} points
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>PP Change</div>
                      <div style={{ 
                        fontWeight: 'bold',
                        fontSize: '1.125rem',
                        color: isReward ? '#10b981' : isPenalty ? '#ef4444' : '#6b7280'
                      }}>
                        {formatPPChange(ppChange)}
                      </div>
                    </div>
                  </div>

                  {artifacts.length > 0 && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '0.5rem'
                    }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.5rem' }}>
                        🎁 Artifacts Earned:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {artifacts.map((artifact, index) => (
                          <div key={index} style={{ fontSize: '0.875rem', color: '#78350f' }}>
                            • {artifact.artifactName}
                            {artifact.quantity && artifact.quantity > 1 && ` (x${artifact.quantity})`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Total Summary */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.75rem',
            marginBottom: '1.5rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>Total PP Change:</span>
            <span style={{ 
              fontWeight: 'bold',
              fontSize: '1.25rem',
              color: totalPPChange >= 0 ? '#10b981' : '#ef4444'
            }}>
              {formatPPChange(totalPPChange)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>Total Artifacts:</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#f59e0b' }}>
              {totalArtifacts}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isApplying}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: isApplying ? 'not-allowed' : 'pointer',
              opacity: isApplying ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isApplying}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: isApplying ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: isApplying ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {isApplying ? 'Applying...' : 'Apply All Results'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentResultsSummaryModal;







