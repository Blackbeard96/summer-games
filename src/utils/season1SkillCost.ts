import type { Move } from '../types/battle';
import type { EnergyType, EnergiesMap } from '../types/season1';
import { computeLiveEventParticipationSkillCost, type LiveEventSkillCostBreakdown } from './liveEventSkillCost';

export interface Season1ResourceResolution {
  canUse: boolean;
  reason?: string;
  spentParticipation: number;
  spentEnergy: number;
  energyTypeUsed?: EnergyType;
  breakdown: LiveEventSkillCostBreakdown;
  spendSummary?: string;
}

/**
 * Resolve Live Event skill payment: Participation Power and/or matching energy.
 * Awakened Flow: participation cost treated as satisfied without spending movesEarned.
 */
export function resolveSeason1SkillCost(
  move: Move,
  participationAvailable: number,
  energies: EnergiesMap,
  equippedArtifacts: Record<string, unknown> | null | undefined,
  options: {
    reductionFromEffects?: number;
    awakenedFlow?: boolean;
  } = {}
): Season1ResourceResolution {
  const breakdown = computeLiveEventParticipationSkillCost(
    move,
    equippedArtifacts ?? null,
    null,
    options.reductionFromEffects ?? 0
  );

  const s1 = move.season1Cost;
  const mode = s1?.paymentMode ?? 'participation_only';
  const ppRequiredBase = s1?.participationCost ?? breakdown.finalCost;
  const participationCost = options.awakenedFlow ? 0 : ppRequiredBase;
  const energyCost = s1?.energyCost ?? 0;
  const energyType = s1?.energyType;
  const energyHave = energyType ? energies[energyType] ?? 0 : 0;

  if (mode === 'participation_only') {
    if (participationAvailable < participationCost) {
      return {
        canUse: false,
        reason: `Need ${participationCost} Participation Points (have ${participationAvailable})`,
        spentParticipation: 0,
        spentEnergy: 0,
        breakdown,
      };
    }
    return {
      canUse: true,
      spentParticipation: participationCost,
      spentEnergy: 0,
      breakdown,
      spendSummary: options.awakenedFlow
        ? `Awakened Flow — ${move.name} (participation waived)`
        : `Spent ${participationCost} Participation Power on ${move.name}`,
    };
  }

  if (mode === 'energy_only') {
    if (!energyType || energyHave < energyCost) {
      return {
        canUse: false,
        reason: `Need ${energyCost} ${energyType ?? 'matching'} energy (have ${energyHave})`,
        spentParticipation: 0,
        spentEnergy: 0,
        breakdown,
      };
    }
    return {
      canUse: true,
      spentParticipation: 0,
      spentEnergy: energyCost,
      energyTypeUsed: energyType,
      breakdown,
      spendSummary: `Spent ${energyCost} ${energyType} energy on ${move.name}`,
    };
  }

  if (mode === 'either') {
    if (participationAvailable >= participationCost) {
      return {
        canUse: true,
        spentParticipation: participationCost,
        spentEnergy: 0,
        breakdown,
        spendSummary:
          participationCost === 0
            ? `Awakened Flow — ${move.name}`
            : `Spent ${participationCost} Participation Power on ${move.name}`,
      };
    }
    if (energyType && energyHave >= energyCost) {
      return {
        canUse: true,
        spentParticipation: 0,
        spentEnergy: energyCost,
        energyTypeUsed: energyType,
        breakdown,
        spendSummary: `Spent ${energyCost} ${energyType} energy on ${move.name}`,
      };
    }
    return {
      canUse: false,
      reason: `Need ${participationCost} PP or ${energyCost} ${energyType} energy`,
      spentParticipation: 0,
      spentEnergy: 0,
      breakdown,
    };
  }

  // both
  const okPp = participationAvailable >= participationCost;
  const okE = !!energyType && energyHave >= energyCost;
  if (!okPp || !okE) {
    return {
      canUse: false,
      reason: `Need ${participationCost} PP and ${energyCost} ${energyType ?? 'matching'} energy`,
      spentParticipation: 0,
      spentEnergy: 0,
      breakdown,
    };
  }
  return {
    canUse: true,
    spentParticipation: participationCost,
    spentEnergy: energyCost,
    energyTypeUsed: energyType,
    breakdown,
    spendSummary: `${move.name}: ${participationCost === 0 ? '0' : String(participationCost)} PP + ${energyCost} ${energyType}`,
  };
}
