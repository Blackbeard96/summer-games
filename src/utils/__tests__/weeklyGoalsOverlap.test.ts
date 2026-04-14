import { countOverlappingOpenGoals, intervalsOverlapMs } from '../weeklyGoalsService';
import type { WeeklyGoalDoc } from '../../types/weeklyGoals';

describe('weeklyGoals overlap helpers', () => {
  it('intervalsOverlapMs', () => {
    expect(intervalsOverlapMs(0, 10, 5, 15)).toBe(true);
    expect(intervalsOverlapMs(0, 4, 5, 15)).toBe(false);
  });

  it('countOverlappingOpenGoals respects week overlap and open status', () => {
    const goals = [
      {
        weekStartDate: { toMillis: () => new Date('2026-04-06').getTime() },
        weekEndDate: { toMillis: () => new Date('2026-04-12T23:59:59').getTime() },
        status: 'in_progress',
      },
      {
        weekStartDate: { toMillis: () => new Date('2026-04-06').getTime() },
        weekEndDate: { toMillis: () => new Date('2026-04-12T23:59:59').getTime() },
        status: 'achieved',
      },
    ] as WeeklyGoalDoc[];
    const ws = new Date('2026-04-06').getTime();
    const we = new Date('2026-04-12T23:59:59').getTime();
    expect(countOverlappingOpenGoals(goals, ws, we)).toBe(1);
  });
});
