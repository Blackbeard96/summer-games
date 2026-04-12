/**
 * Live Events: skill `cost` is Participation Points (movesEarned), not vault PP.
 * finalCost = max(minimum, baseCost - reductions). See Move.liveEventAllowZeroCost for true free skills.
 */

import type { Move } from '../types/battle';
import { getLiveEventPpCostReductionFromEquipped } from './artifactPerkEffects';
import type { UniversalLawBoonEffects } from './universalLawBoons';

export interface LiveEventSkillCostBreakdown {
  baseCost: number;
  reductionFromArtifacts: number;
  reductionFromEffects: number;
  /** baseCost - finalCost (after floor rules) */
  totalDiscount: number;
  finalCost: number;
}

/** Sum flat PP cost reduction from transient battle effects (client-side; server does not see these yet). */
export function getSkillCostReductionFromBattleEffects(
  effects: Array<{ type?: string; intensity?: number; skillCostReduction?: number }> | null | undefined
): number {
  if (!effects?.length) return 0;
  let sum = 0;
  for (const e of effects) {
    if (e.type === 'skill_cost_reduction') {
      sum += Math.max(0, Math.floor(Number(e.skillCostReduction ?? e.intensity ?? 0)));
    }
  }
  return sum;
}

export function computeLiveEventParticipationSkillCost(
  move: Move,
  equippedArtifacts: Record<string, unknown> | null | undefined,
  equippableCatalogRaw: Record<string, unknown> | null | undefined,
  reductionFromEffects: number,
  universalLawEffects?: UniversalLawBoonEffects | null
): LiveEventSkillCostBreakdown {
  const baseCost = Math.max(0, Math.floor(Number(move.cost) || 0));
  const redArtifacts = getLiveEventPpCostReductionFromEquipped(
    equippedArtifacts ?? null,
    equippableCatalogRaw ?? null,
    universalLawEffects ?? null
  );
  const redEffects = Math.max(0, Math.floor(reductionFromEffects || 0));
  const allowZero =
    baseCost === 0 || (move as Move & { liveEventAllowZeroCost?: boolean }).liveEventAllowZeroCost === true;

  const uncapped = Math.max(0, baseCost - redArtifacts - redEffects);
  const finalCost =
    allowZero || baseCost === 0 ? uncapped : Math.max(1, uncapped);

  return {
    baseCost,
    reductionFromArtifacts: redArtifacts,
    reductionFromEffects: redEffects,
    totalDiscount: baseCost - finalCost,
    finalCost,
  };
}

/** Same as computeLiveEventParticipationSkillCost but effects always 0 (authoritative server path). */
export function computeLiveEventParticipationSkillCostServer(
  move: Move,
  equippedArtifacts: unknown
): LiveEventSkillCostBreakdown {
  return computeLiveEventParticipationSkillCost(
    move,
    equippedArtifacts as Record<string, unknown> | null | undefined,
    null,
    0
  );
}
