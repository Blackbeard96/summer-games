import type { Goal, GoalLinkedResponse } from '../types/season1';

export interface GoalPerformanceData {
  totalParticipationEvents?: number;
  correctRatio?: number;
  inactivityPenalty?: number;
}

export interface GoalOutcomeResult {
  status: 'completed' | 'failed' | 'partial';
  alignmentScore: number;
  summary: string;
  suggestedXp: number;
  suggestedPp: number;
  suggestedEnergyBonus: number;
}

/**
 * Explainable heuristic — tune weights without touching UI.
 * Season 1: responses + simple performance metrics → score → rewards.
 */
export function evaluateGoalOutcome(
  goal: Goal,
  linked: GoalLinkedResponse[],
  performance: GoalPerformanceData = {}
): GoalOutcomeResult {
  const n = linked.length;
  const correct = linked.filter((r) => r.wasCorrect === true).length;
  const correctRatio = n > 0 ? correct / n : performance.correctRatio ?? 0;
  const participation = performance.totalParticipationEvents ?? n;
  const consistency = Math.min(1, participation / 8);
  const alignmentScore = Math.round(
    100 * (0.35 * correctRatio + 0.35 * consistency + 0.3 * (1 - (performance.inactivityPenalty ?? 0)))
  );

  let status: GoalOutcomeResult['status'] = 'partial';
  if (alignmentScore >= 70) status = 'completed';
  else if (alignmentScore < 35) status = 'failed';

  const summary =
    status === 'completed'
      ? `Strong alignment (${alignmentScore}): steady participation and progress toward “${goal.title}”.`
      : status === 'failed'
        ? `Low alignment (${alignmentScore}): revisit your goal or join more Flow activities.`
        : `Mixed progress (${alignmentScore}): keep engaging to complete “${goal.title}”.`;

  return {
    status,
    alignmentScore,
    summary,
    suggestedXp: status === 'completed' ? 80 : status === 'failed' ? 10 : 40,
    suggestedPp: status === 'completed' ? 40 : status === 'failed' ? 0 : 20,
    suggestedEnergyBonus: status === 'completed' ? 15 : 5,
  };
}
