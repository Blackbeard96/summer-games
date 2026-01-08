import { 
  computePPChange, 
  validateGoalScore, 
  validateAssessmentConfig,
  formatOutcome,
  formatPPChange
} from '../assessmentGoals';
import { Assessment, RewardTier, PenaltyTier } from '../../types/assessmentGoals';

describe('Assessment Goals Utilities', () => {
  const mockAssessment: Assessment = {
    id: 'test-assessment',
    classId: 'test-class',
    title: 'Unit 3 Test',
    type: 'test',
    date: {} as any,
    maxScore: 100,
    createdBy: 'admin-uid',
    isLocked: false,
    gradingStatus: 'open',
    rewardMode: 'pp',
    rewardTiers: [
      { threshold: 0, bonus: 50 },   // Exact hit
      { threshold: 2, bonus: 35 },   // Within 2 points
      { threshold: 5, bonus: 20 },    // Within 5 points
      { threshold: 10, bonus: 10 }    // Within 10 points
    ],
    missPenaltyTiers: [
      { threshold: 1, penalty: 5 },
      { threshold: 5, penalty: 15 },
      { threshold: 10, penalty: 30 },
      { threshold: 20, penalty: 50 }
    ],
    penaltyCap: 75,
    bonusCap: 75
  };

  describe('computePPChange', () => {
    it('should award exact hit bonus (goal 85, actual 85)', () => {
      const result = computePPChange(85, 85, mockAssessment);
      expect(result.outcome).toBe('hit');
      expect(result.ppChange).toBe(50);
      expect(result.absDiff).toBe(0);
      expect(result.tierExplanation).toBe('Exact hit bonus');
    });

    it('should award within 2 points tier (goal 85, actual 86)', () => {
      const result = computePPChange(85, 86, mockAssessment);
      expect(result.outcome).toBe('exceed');
      expect(result.ppChange).toBe(35);
      expect(result.absDiff).toBe(1);
      expect(result.tierExplanation).toBe('Within 2 points tier');
    });

    it('should award within 5 points tier (goal 85, actual 88)', () => {
      const result = computePPChange(85, 88, mockAssessment);
      expect(result.outcome).toBe('exceed');
      expect(result.ppChange).toBe(20);
      expect(result.absDiff).toBe(3);
      expect(result.tierExplanation).toBe('Within 5 points tier');
    });

    it('should apply penalty for missing by 1 point (goal 85, actual 84)', () => {
      const result = computePPChange(85, 84, mockAssessment);
      expect(result.outcome).toBe('miss');
      expect(result.ppChange).toBe(-5);
      expect(result.absDiff).toBe(1);
      expect(result.tierExplanation).toBe('Within 1 points off (penalty)');
    });

    it('should apply penalty for missing by 5 points (goal 85, actual 80)', () => {
      const result = computePPChange(85, 80, mockAssessment);
      expect(result.outcome).toBe('miss');
      expect(result.ppChange).toBe(-15);
      expect(result.absDiff).toBe(5);
      expect(result.tierExplanation).toBe('Within 5 points off (penalty)');
    });

    it('should apply penalty cap for large misses (goal 85, actual 50)', () => {
      const result = computePPChange(85, 50, mockAssessment);
      expect(result.outcome).toBe('miss');
      expect(result.ppChange).toBe(-75); // Capped at penaltyCap
      expect(result.absDiff).toBe(35);
    });

    it('should apply bonus cap for large exceeds (goal 85, actual 100)', () => {
      const result = computePPChange(85, 100, mockAssessment);
      expect(result.outcome).toBe('exceed');
      expect(result.ppChange).toBe(75); // Capped at bonusCap
      expect(result.absDiff).toBe(15);
    });

    it('should handle edge case: goal 0, actual 0', () => {
      const result = computePPChange(0, 0, mockAssessment);
      expect(result.outcome).toBe('hit');
      expect(result.ppChange).toBe(50);
    });

    it('should handle edge case: goal 100, actual 100', () => {
      const result = computePPChange(100, 100, mockAssessment);
      expect(result.outcome).toBe('hit');
      expect(result.ppChange).toBe(50);
    });
  });

  describe('validateGoalScore', () => {
    it('should accept valid goal score', () => {
      const result = validateGoalScore(85, 100);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject negative goal score', () => {
      const result = validateGoalScore(-5, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Goal score cannot be negative');
    });

    it('should reject goal score exceeding max', () => {
      const result = validateGoalScore(105, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Goal score cannot exceed maximum score (100)');
    });

    it('should accept goal score at max', () => {
      const result = validateGoalScore(100, 100);
      expect(result.valid).toBe(true);
    });

    it('should accept goal score at 0', () => {
      const result = validateGoalScore(0, 100);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAssessmentConfig', () => {
    it('should accept valid assessment config', () => {
      const result = validateAssessmentConfig(mockAssessment);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject missing reward tiers', () => {
      const invalid = { ...mockAssessment, rewardTiers: [] };
      const result = validateAssessmentConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one reward tier is required');
    });

    it('should reject missing penalty tiers', () => {
      const invalid = { ...mockAssessment, missPenaltyTiers: [] };
      const result = validateAssessmentConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one penalty tier is required');
    });

    it('should reject negative threshold', () => {
      const invalid = {
        ...mockAssessment,
        rewardTiers: [{ threshold: -1, bonus: 50 }]
      };
      const result = validateAssessmentConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('threshold cannot be negative'))).toBe(true);
    });

    it('should reject negative bonus', () => {
      const invalid = {
        ...mockAssessment,
        rewardTiers: [{ threshold: 0, bonus: -10 }]
      };
      const result = validateAssessmentConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bonus cannot be negative'))).toBe(true);
    });
  });

  describe('formatOutcome', () => {
    it('should format hit correctly', () => {
      expect(formatOutcome('hit')).toBe('Hit Goal');
    });

    it('should format exceed correctly', () => {
      expect(formatOutcome('exceed')).toBe('Exceeded Goal');
    });

    it('should format miss correctly', () => {
      expect(formatOutcome('miss')).toBe('Missed Goal');
    });
  });

  describe('formatPPChange', () => {
    it('should format positive PP change', () => {
      expect(formatPPChange(50)).toBe('+50');
    });

    it('should format negative PP change', () => {
      expect(formatPPChange(-15)).toBe('-15');
    });

    it('should format zero PP change', () => {
      expect(formatPPChange(0)).toBe('0');
    });
  });
});








