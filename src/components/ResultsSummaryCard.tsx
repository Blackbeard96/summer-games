import React from 'react';
import { Assessment, AssessmentGoal, AssessmentResult } from '../types/assessmentGoals';
import { formatOutcome, formatPPChange } from '../utils/assessmentGoals';

interface ResultsSummaryCardProps {
  goal?: AssessmentGoal;
  result: AssessmentResult;
  assessment: Assessment;
}

const ResultsSummaryCard: React.FC<ResultsSummaryCardProps> = ({
  goal,
  result,
  assessment
}) => {
  const goalScore = goal?.goalScore ?? null;
  const textGoal = goal?.textGoal;
  const isStoryGoal = assessment.type === 'story-goal';
  const actualScore = result.actualScore;
  const delta = result.computedDelta ?? (goalScore !== null ? actualScore - goalScore : null);
  const absDiff = result.computedAbsDiff ?? (delta !== null ? Math.abs(delta) : null);
  const ppChange = result.ppChange ?? 0;
  const outcome = result.outcome;

  // Determine tier explanation
  let tierExplanation = '';
  if (outcome && absDiff !== null && absDiff !== undefined) {
    if (outcome === 'hit' || outcome === 'exceed') {
      // Check if using new label-based system
      const hasLabelBasedTiers = assessment.rewardTiers.some(tier => tier.label !== undefined);
      if (hasLabelBasedTiers) {
        // Determine which label applies (same logic as computePPChange)
        let matchingLabel: string;
        if (absDiff === 0) {
          matchingLabel = 'Completed';
        } else if (absDiff <= 2) {
          matchingLabel = 'Almost';
        } else {
          matchingLabel = 'Attempted';
        }
        const tier = assessment.rewardTiers.find(t => t.label === matchingLabel);
        if (tier) {
          tierExplanation = `${tier.label} - ${tier.bonus} PP`;
        }
      } else {
        // Legacy threshold-based system
        if (absDiff === 0) {
          tierExplanation = 'Exact hit bonus';
        } else {
          const tier = assessment.rewardTiers
            .sort((a, b) => (a.threshold || 0) - (b.threshold || 0))
            .find(t => absDiff <= (t.threshold || Infinity));
          if (tier) {
            tierExplanation = `Within ${tier.threshold} points tier`;
          }
        }
      }
    } else {
      // Penalty tiers (still use threshold-based)
      const tier = assessment.missPenaltyTiers
        .sort((a, b) => a.threshold - b.threshold)
        .find(t => absDiff <= t.threshold);
      if (tier) {
        tierExplanation = `Within ${tier.threshold} points off (penalty)`;
      }
    }
  }

  const ppChangeColor = ppChange > 0 ? '#10b981' : ppChange < 0 ? '#ef4444' : '#6b7280';

  return (
    <div
      style={{
        padding: '1rem',
        background: '#f9fafb',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb'
      }}
    >
      <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Results</h4>
      
      {isStoryGoal && textGoal ? (
        <div style={{ marginBottom: '0.5rem', padding: '0.75rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fbbf24' }}>
          <strong style={{ color: '#92400e' }}>Your Goal:</strong>
          <p style={{ margin: '0.5rem 0 0 0', color: '#78350f', fontStyle: 'italic' }}>"{textGoal}"</p>
          {goal?.evidence && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #fbbf24' }}>
              <strong style={{ color: '#92400e', fontSize: '0.875rem' }}>Area of Consistency:</strong>
              <p style={{ margin: '0.25rem 0 0 0', color: '#78350f', fontSize: '0.875rem', fontStyle: 'italic' }}>"{goal.evidence}"</p>
            </div>
          )}
        </div>
      ) : goalScore !== null ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Goal:</strong> {goalScore} / {assessment.maxScore}
        </div>
      ) : (
        <div style={{ marginBottom: '0.5rem', color: '#6b7280' }}>
          No goal was set
        </div>
      )}
      
      {!isStoryGoal && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Actual:</strong> {actualScore} / {assessment.maxScore}
          </div>

          {delta !== null && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Difference:</strong> {delta > 0 ? '+' : ''}{delta} points
            </div>
          )}
        </>
      )}

      {outcome && (
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Outcome:</strong> {formatOutcome(outcome)}
        </div>
      )}

      {tierExplanation && (
        <div style={{ marginBottom: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
          {tierExplanation}
        </div>
      )}

      <div
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'white',
          borderRadius: '0.5rem',
          border: `2px solid ${ppChangeColor}`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold' }}>PP Change:</span>
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: ppChangeColor
            }}
          >
            {formatPPChange(ppChange)}
          </span>
        </div>
        {result.applied && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#10b981' }}>
            ✓ Applied to your account
          </div>
        )}
      </div>

      {/* Artifact Rewards */}
      {result.artifactsGranted && result.artifactsGranted.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'white',
            borderRadius: '0.5rem',
            border: '2px solid #8b5cf6'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Artifact Rewards:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {result.artifactsGranted.map((artifact, index) => (
              <div key={index} style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                🎁 {artifact.artifactName}
                {artifact.quantity && artifact.quantity > 1 && ` (x${artifact.quantity})`}
              </div>
            ))}
          </div>
          {result.applied && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#10b981' }}>
              ✓ Artifacts added to your inventory
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultsSummaryCard;

