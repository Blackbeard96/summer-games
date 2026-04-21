/**
 * Live Events: Participation Power for skills uses **canonical category rules**, not `move.cost`
 * (vault PP / legacy move cost is often 1 for everything).
 *
 * `computeLiveEventParticipationSkillCost` applies artifact + battle-effect reductions on top of that
 * canonical base, then floors so the player never pays **less** than the category minimum (unless
 * `liveEventAllowZeroCost` / zero base free skills).
 */

import type { Move } from '../types/battle';
import { getLiveEventPpCostReductionFromEquipped } from './artifactPerkEffects';
import type { UniversalLawBoonEffects } from './universalLawBoons';

const DEBUG_LIVE_EVENT_SKILL_COST =
  process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILL_COST === 'true' ||
  process.env.REACT_APP_DEBUG === 'true';

/** High-level bucket for Live Event participation pricing. */
export type LiveEventSkillCostCategory = 'RR_CANDY' | 'MANIFEST' | 'ELEMENTAL' | 'OTHER';

export interface LiveEventSkillCostBreakdown {
  /** Canonical participation base from category rules (not legacy `move.cost`). */
  baseCost: number;
  category: LiveEventSkillCostCategory;
  /** Elemental move tier 1–4 when category is ELEMENTAL; otherwise undefined. */
  elementalMoveTier?: number;
  reductionFromArtifacts: number;
  reductionFromEffects: number;
  /** baseCost - finalCost (after floor rules) */
  totalDiscount: number;
  finalCost: number;
}

export interface LiveEventSkillCostAttemptLog {
  actorId: string;
  skillId: string;
  skillName: string;
  detectedCategory: LiveEventSkillCostCategory;
  detectedLevel?: number;
  baseCost: number;
  reduction: number;
  finalCost: number;
  playerCurrentPP?: number;
  validationResult: 'ok' | 'blocked_insufficient_pp' | 'blocked_other';
  ppBefore?: number;
  ppAfter?: number;
}

export function logLiveEventSkillCostAttempt(payload: LiveEventSkillCostAttemptLog): void {
  if (!DEBUG_LIVE_EVENT_SKILL_COST) return;
  console.log('[liveEventSkillCost:attempt]', { ts: new Date().toISOString(), ...payload });
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

/**
 * Classify a move for Live Event participation pricing.
 * RR Candy is detected by id prefix / RR fields first (Firestore moves often use `category: 'system'`).
 */
export function getLiveEventSkillCostCategory(move: Pick<Move, 'id' | 'category' | 'rrCandyNodeId' | 'rrCandySkillId' | 'effectKey'>): LiveEventSkillCostCategory {
  const id = String(move.id || '').toLowerCase();
  if (
    id.startsWith('rr-candy-') ||
    id.includes('rr-candy') ||
    Boolean(move.rrCandyNodeId) ||
    Boolean(move.rrCandySkillId)
  ) {
    return 'RR_CANDY';
  }
  if (move.category === 'manifest' || move.effectKey === 'level2_manifest' || id.startsWith('l2-manifest::')) {
    return 'MANIFEST';
  }
  if (move.category === 'elemental') {
    return 'ELEMENTAL';
  }
  return 'OTHER';
}

/**
 * Elemental move **tier** for pricing (1–4). Uses `move.level` (elemental move level), not mastery rank.
 */
export function getLiveEventElementalMoveTier(move: Pick<Move, 'level'>): number {
  return Math.max(1, Math.min(4, Math.floor(Number(move.level) || 1)));
}

/** Canonical participation base before artifact / effect reductions. */
export function getLiveEventCanonicalParticipationBaseCost(move: Move): number {
  const cat = getLiveEventSkillCostCategory(move);
  switch (cat) {
    case 'RR_CANDY':
      return 4;
    case 'MANIFEST':
      return 2;
    case 'ELEMENTAL':
      return getLiveEventElementalMoveTier(move);
    default:
      return 1;
  }
}

/**
 * Final Participation Points cost for Live Events (same math as full breakdown with the given reductions).
 */
export function getLiveEventSkillParticipationFinalCost(
  move: Move,
  equippedArtifacts: Record<string, unknown> | null | undefined,
  equippableCatalogRaw: Record<string, unknown> | null | undefined,
  reductionFromEffects: number,
  universalLawEffects?: UniversalLawBoonEffects | null
): number {
  return computeLiveEventParticipationSkillCost(
    move,
    equippedArtifacts ?? null,
    equippableCatalogRaw ?? null,
    reductionFromEffects,
    universalLawEffects ?? null
  ).finalCost;
}

/** Canonical final Participation Points cost (alias for callers that expect `getLiveEventSkillCost`). */
export function getLiveEventSkillCost(
  move: Move,
  equippedArtifacts?: Record<string, unknown> | null,
  equippableCatalogRaw?: Record<string, unknown> | null,
  reductionFromEffects = 0,
  universalLawEffects?: UniversalLawBoonEffects | null
): number {
  return getLiveEventSkillParticipationFinalCost(
    move,
    equippedArtifacts ?? null,
    equippableCatalogRaw ?? null,
    reductionFromEffects,
    universalLawEffects ?? null
  );
}

export function computeLiveEventParticipationSkillCost(
  move: Move,
  equippedArtifacts: Record<string, unknown> | null | undefined,
  equippableCatalogRaw: Record<string, unknown> | null | undefined,
  reductionFromEffects: number,
  universalLawEffects?: UniversalLawBoonEffects | null
): LiveEventSkillCostBreakdown {
  const category = getLiveEventSkillCostCategory(move);
  const elementalMoveTier = category === 'ELEMENTAL' ? getLiveEventElementalMoveTier(move) : undefined;
  const baseCost = getLiveEventCanonicalParticipationBaseCost(move);

  const redArtifacts = getLiveEventPpCostReductionFromEquipped(
    equippedArtifacts ?? null,
    equippableCatalogRaw ?? null,
    universalLawEffects ?? null
  );
  const redEffects = Math.max(0, Math.floor(reductionFromEffects || 0));
  const allowZero =
    baseCost === 0 || (move as Move & { liveEventAllowZeroCost?: boolean }).liveEventAllowZeroCost === true;

  const uncapped = Math.max(0, baseCost - redArtifacts - redEffects);
  let finalCost: number;
  if (allowZero) {
    finalCost = uncapped;
  } else if (baseCost === 0) {
    finalCost = uncapped;
  } else {
    /** Never charge less than the category canonical minimum when that minimum is positive. */
    finalCost = Math.max(baseCost, uncapped);
  }

  return {
    baseCost,
    category,
    elementalMoveTier,
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
