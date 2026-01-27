import React from 'react';
import { AssessmentResult, Assessment } from '../types/assessmentGoals';
import { formatOutcome, formatPPChange } from '../utils/assessmentGoals';

interface AssessmentResultModalProps {
  result: AssessmentResult;
  assessment: Assessment;
  goalScore: number;
  onClose: () => void;
}

const AssessmentResultModal: React.FC<AssessmentResultModalProps> = ({
  result,
  assessment,
  goalScore,
  onClose
}) => {
  const outcome = result.outcome || 'miss';
  const ppChange = result.ppChange || 0;
  const actualScore = result.actualScore;
  const delta = result.computedDelta || 0;
  const absDiff = result.computedAbsDiff || Math.abs(delta);

  const isPositive = outcome === 'hit' || outcome === 'exceed';
  const bgColor = isPositive ? '#d1fae5' : '#fee2e2';
  const borderColor = isPositive ? '#10b981' : '#ef4444';
  const textColor = isPositive ? '#065f46' : '#991b1b';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: `3px solid ${borderColor}`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>
            {isPositive ? '🎉' : '😔'}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>
            Assessment Goal Result
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '1.125rem' }}>
            {assessment.title}
          </p>
        </div>

        <div
          style={{
            backgroundColor: bgColor,
            border: `2px solid ${borderColor}`,
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Your Goal
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: textColor }}>
                {goalScore} / {assessment.maxScore}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Actual Score
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: textColor }}>
                {actualScore} / {assessment.maxScore}
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Difference:</span>
              <span style={{ 
                fontSize: '1.25rem', 
                fontWeight: 'bold',
                color: delta >= 0 ? '#10b981' : '#ef4444'
              }}>
                {delta > 0 ? '+' : ''}{delta} points
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Outcome:</span>
              <span style={{ 
                fontSize: '1.125rem', 
                fontWeight: 'bold',
                color: textColor,
                textTransform: 'capitalize'
              }}>
                {formatOutcome(outcome)}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#f9fafb',
            border: '2px solid #e5e7eb',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Power Points Change
          </div>
          <div style={{ 
            fontSize: '2rem', 
            fontWeight: 'bold',
            color: ppChange > 0 ? '#10b981' : ppChange < 0 ? '#ef4444' : '#6b7280'
          }}>
            {formatPPChange(ppChange)}
          </div>
          {result.applied && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#10b981' }}>
              ✓ Applied to your account
            </div>
          )}
        </div>

        {result.artifactsGranted && result.artifactsGranted.length > 0 && (
          <div
            style={{
              backgroundColor: '#fef3c7',
              border: '2px solid #f59e0b',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem'
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#92400e' }}>
              🎁 Artifacts Earned
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {result.artifactsGranted.map((artifact, index) => (
                <div key={index} style={{ fontSize: '0.875rem', color: '#78350f' }}>
                  • {artifact.artifactName}
                  {artifact.quantity && artifact.quantity > 1 && ` (x${artifact.quantity})`}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: borderColor,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'opacity 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default AssessmentResultModal;











