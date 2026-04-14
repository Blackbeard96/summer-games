import {
  recomputePercentFromParts,
  completionRateMeetsTarget,
  isAssignmentWithinSpeedWindow,
  deriveDisplayStatus,
} from '../weeklyGoalDerived';
import type { WeeklyGoalDoc } from '../../types/weeklyGoals';

describe('weeklyGoalDerived', () => {
  it('recomputePercentFromParts', () => {
    expect(recomputePercentFromParts(6, 8)).toBe(75);
    expect(recomputePercentFromParts(0, 0)).toBe(0);
    expect(recomputePercentFromParts(8, 8)).toBe(100);
  });

  it('completionRateMeetsTarget', () => {
    expect(completionRateMeetsTarget(75, 80)).toBe(false);
    expect(completionRateMeetsTarget(80, 80)).toBe(true);
  });

  it('isAssignmentWithinSpeedWindow', () => {
    const start = 1_000_000;
    expect(isAssignmentWithinSpeedWindow(start, start + 23 * 3600 * 1000, 24)).toBe(true);
    expect(isAssignmentWithinSpeedWindow(start, start + 25 * 3600 * 1000, 24)).toBe(false);
  });

  it('deriveDisplayStatus marks missed after week for incomplete tracked goal', () => {
    const start = new Date('2026-04-06T00:00:00.000Z');
    const end = new Date('2026-04-12T23:59:59.999Z');
    const goal = {
      weekStartDate: start as any,
      weekEndDate: end as any,
      goalType: 'live_event_participation',
      evidenceType: 'tracked_participation',
      targetValue: 4,
      currentValue: 2,
      status: 'in_progress',
    } as WeeklyGoalDoc;

    const after = new Date('2026-04-13T12:00:00.000Z').getTime();
    expect(deriveDisplayStatus(goal, after)).toBe('missed');
  });
});
