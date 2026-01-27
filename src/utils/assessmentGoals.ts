import { 
  Assessment, 
  AssessmentGoal, 
  AssessmentResult, 
  RewardTier, 
  PenaltyTier,
  OutcomeType,
  ArtifactReward
} from '../types/assessmentGoals';

/**
 * Assessment Goals Utility Functions
 * 
 * Core logic for computing rewards/penalties based on goal vs actual scores.
 */

// ============================================================================
// Reward/Penalty Computation
// ============================================================================

/**
 * Computes the PP change based on goal score, actual score, and assessment configuration.
 * 
 * @param goalScore - The student's goal score
 * @param actualScore - The actual score achieved
 * @param assessment - The assessment configuration with reward/penalty tiers
 * @returns Object with outcome, ppChange, and tier explanation
 */
export function computePPChange(
  goalScore: number,
  actualScore: number,
  assessment: Assessment
): {
  outcome: OutcomeType;
  ppChange: number;
  tierExplanation: string;
  absDiff: number;
  delta: number;
  artifactsGranted?: ArtifactReward[];
} {
  const delta = actualScore - goalScore;
  const absDiff = Math.abs(delta);
  
  // Special rule: If player is exactly 1 point away from goal, treat as tier 2 reward (within 1 point = tier 2)
  // This ensures fairness - being 1 point off shouldn't result in a penalty
  const isOnePointAway = absDiff === 1 && actualScore < goalScore;
  
  // Check if there's a reward tier that matches this difference
  // This allows close misses (within 1-2 points) to still get rewards
  const matchingRewardTier = findRewardTier(absDiff, assessment.rewardTiers);
  const closeToGoalThreshold = matchingRewardTier?.threshold || 0;
  
  // Determine outcome
  // If actualScore >= goalScore, it's always a hit/exceed
  // If actualScore < goalScore but exactly 1 point away, treat as hit (tier 2 reward)
  // If actualScore < goalScore but within the closest reward tier threshold (typically 1-2 points),
  // treat it as a reward scenario (close miss = still rewarded)
  let outcome: OutcomeType;
  if (actualScore >= goalScore) {
    outcome = actualScore > goalScore ? 'exceed' : 'hit';
  } else if (isOnePointAway) {
    // Exactly 1 point away - treat as hit with tier 2 reward
    outcome = 'hit';
  } else if (absDiff <= closeToGoalThreshold && closeToGoalThreshold <= 2) {
    // Close miss (within 1-2 points) - treat as reward scenario
    outcome = 'hit';
  } else {
    outcome = 'miss';
  }
  
  let ppChange = 0;
  let tierExplanation = '';
  
  if (outcome === 'hit' || outcome === 'exceed') {
    // Award bonus based on reward tiers
    // Special handling: If exactly 1 point away, always use tier 2 (threshold: 2) rewards
    let tier: RewardTier | null;
    if (isOnePointAway) {
      // For 1 point misses, always use tier 2 (threshold: 2) rewards
      tier = findRewardTier(2, assessment.rewardTiers);
    } else {
      // For all other cases, use normal tier matching
      tier = findRewardTier(absDiff, assessment.rewardTiers);
    }
    if (tier) {
      ppChange = tier.bonus;
      if (absDiff === 0) {
        tierExplanation = 'Exact hit bonus';
      } else if (isOnePointAway) {
        tierExplanation = `1 point away - Tier 2 reward applied`;
      } else if (actualScore < goalScore) {
        tierExplanation = `Close to goal (within ${tier.threshold} points) - reward applied`;
      } else {
        tierExplanation = `Within ${tier.threshold} points tier`;
      }
    } else {
      // No tier matches, use worst tier but cap by bonusCap
      const worstTier = assessment.rewardTiers[assessment.rewardTiers.length - 1];
      ppChange = Math.min(worstTier?.bonus || 0, assessment.bonusCap || 75);
      tierExplanation = `Bonus (capped at ${assessment.bonusCap})`;
    }
    
    // Apply bonus cap
    if (assessment.bonusCap) {
      ppChange = Math.min(ppChange, assessment.bonusCap);
    }
  } else {
    // Apply penalty based on miss penalty tiers
    const tier = findPenaltyTier(absDiff, assessment.missPenaltyTiers);
    if (tier) {
      ppChange = -tier.penalty; // Negative for penalty
      tierExplanation = `Within ${tier.threshold} points off (penalty)`;
    } else {
      // No tier matches, use worst tier but cap by penaltyCap
      const worstTier = assessment.missPenaltyTiers[assessment.missPenaltyTiers.length - 1];
      ppChange = -Math.min(worstTier?.penalty || 0, assessment.penaltyCap || 75);
      tierExplanation = `Penalty (capped at ${assessment.penaltyCap})`;
    }
    
    // Apply penalty cap
    if (assessment.penaltyCap) {
      ppChange = Math.max(ppChange, -assessment.penaltyCap);
    }
  }
  
  // Get artifacts for the matching tier
  let artifactsGranted: ArtifactReward[] | undefined;
  if (outcome === 'hit' || outcome === 'exceed') {
    // Use same tier logic as above for artifacts (1 point away = tier 2)
    let tierForArtifacts: RewardTier | null;
    if (isOnePointAway) {
      tierForArtifacts = findRewardTier(2, assessment.rewardTiers);
    } else {
      tierForArtifacts = findRewardTier(absDiff, assessment.rewardTiers);
    }
    
    if (tierForArtifacts && tierForArtifacts.artifacts && tierForArtifacts.artifacts.length > 0) {
      artifactsGranted = tierForArtifacts.artifacts;
    }
  }

  return {
    outcome,
    ppChange,
    tierExplanation,
    absDiff,
    delta,
    artifactsGranted
  };
}

/**
 * Finds the appropriate reward tier for a given absolute difference.
 * Returns the tier with the smallest threshold where absDiff <= threshold.
 */
function findRewardTier(absDiff: number, tiers: RewardTier[]): RewardTier | null {
  if (!tiers || tiers.length === 0) return null;
  
  // Sort tiers by threshold ascending
  const sortedTiers = [...tiers].sort((a, b) => a.threshold - b.threshold);
  
  // Find the smallest threshold where absDiff <= threshold
  for (const tier of sortedTiers) {
    if (absDiff <= tier.threshold) {
      return tier;
    }
  }
  
  // No tier matches, return null (caller will use worst tier)
  return null;
}

/**
 * Finds the appropriate penalty tier for a given absolute difference.
 * Returns the tier with the smallest threshold where absDiff <= threshold.
 */
function findPenaltyTier(absDiff: number, tiers: PenaltyTier[]): PenaltyTier | null {
  if (!tiers || tiers.length === 0) return null;
  
  // Sort tiers by threshold ascending
  const sortedTiers = [...tiers].sort((a, b) => a.threshold - b.threshold);
  
  // Find the smallest threshold where absDiff <= threshold
  for (const tier of sortedTiers) {
    if (absDiff <= tier.threshold) {
      return tier;
    }
  }
  
  // No tier matches, return null (caller will use worst tier)
  return null;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates that a goal score is within valid range (minGoalScore to maxScore).
 */
export function validateGoalScore(goalScore: number, maxScore: number, minGoalScore: number = 0): {
  valid: boolean;
  error?: string;
} {
  if (isNaN(goalScore)) {
    return { valid: false, error: 'Goal score must be a number' };
  }
  
  if (goalScore < minGoalScore) {
    return { valid: false, error: `Goal score cannot be less than minimum (${minGoalScore})` };
  }
  
  if (goalScore > maxScore) {
    return { valid: false, error: `Goal score cannot exceed maximum score (${maxScore})` };
  }
  
  return { valid: true };
}

/**
 * Validates assessment configuration (tiers, caps, etc.).
 */
export function validateAssessmentConfig(assessment: Partial<Assessment>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (assessment.maxScore === undefined || assessment.maxScore <= 0) {
    errors.push('Max score must be a positive number');
  }
  
  if (assessment.minGoalScore !== undefined) {
    if (assessment.minGoalScore < 0) {
      errors.push('Minimum goal score cannot be negative');
    }
    if (assessment.maxScore !== undefined && assessment.minGoalScore > assessment.maxScore) {
      errors.push('Minimum goal score cannot exceed max score');
    }
  }
  
  if (!assessment.rewardTiers || assessment.rewardTiers.length === 0) {
    errors.push('At least one reward tier is required');
  } else {
    // Check that tiers are valid
    assessment.rewardTiers.forEach((tier, index) => {
      if (tier.threshold < 0) {
        errors.push(`Reward tier ${index + 1}: threshold cannot be negative`);
      }
      if (tier.bonus < 0) {
        errors.push(`Reward tier ${index + 1}: bonus cannot be negative`);
      }
    });
  }
  
  if (!assessment.missPenaltyTiers || assessment.missPenaltyTiers.length === 0) {
    errors.push('At least one penalty tier is required');
  } else {
    // Check that tiers are valid
    assessment.missPenaltyTiers.forEach((tier, index) => {
      if (tier.threshold < 0) {
        errors.push(`Penalty tier ${index + 1}: threshold cannot be negative`);
      }
      if (tier.penalty < 0) {
        errors.push(`Penalty tier ${index + 1}: penalty cannot be negative`);
      }
    });
  }
  
  if (assessment.bonusCap !== undefined && assessment.bonusCap < 0) {
    errors.push('Bonus cap cannot be negative');
  }
  
  if (assessment.penaltyCap !== undefined && assessment.penaltyCap < 0) {
    errors.push('Penalty cap cannot be negative');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a unique goal document ID: ${assessmentId}_${studentId}
 */
export function generateGoalId(assessmentId: string, studentId: string): string {
  return `${assessmentId}_${studentId}`;
}

/**
 * Generates a unique result document ID: ${assessmentId}_${studentId}
 */
export function generateResultId(assessmentId: string, studentId: string): string {
  return `${assessmentId}_${studentId}`;
}

/**
 * Formats the outcome type for display.
 */
export function formatOutcome(outcome: OutcomeType): string {
  switch (outcome) {
    case 'hit':
      return 'Hit Goal';
    case 'exceed':
      return 'Exceeded Goal';
    case 'miss':
      return 'Missed Goal';
    default:
      return outcome;
  }
}

/**
 * Formats PP change for display (with + or - sign).
 */
export function formatPPChange(ppChange: number): string {
  if (ppChange > 0) {
    return `+${ppChange}`;
  } else if (ppChange < 0) {
    return `${ppChange}`;
  } else {
    return '0';
  }
}

