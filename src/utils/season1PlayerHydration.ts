import type { EnergiesMap, EnergyLevelsMap, EnergyXPMap, FlowStateStatus, Season1PlayerSlice } from '../types/season1';

export function defaultEnergies(): EnergiesMap {
  return { kinetic: 0, mental: 0, emotional: 0, spiritual: 0 };
}

export function defaultEnergyLevels(): EnergyLevelsMap {
  return { kinetic: 1, mental: 1, emotional: 1, spiritual: 1 };
}

export function defaultEnergyXP(): EnergyXPMap {
  return { kinetic: 0, mental: 0, emotional: 0, spiritual: 0 };
}

export function defaultFlowState(): FlowStateStatus {
  return { inFlow: false, awakenedFlow: false };
}

export function defaultSeason1PlayerSlice(): Season1PlayerSlice {
  return {
    energies: defaultEnergies(),
    energyLevels: defaultEnergyLevels(),
    energyXP: defaultEnergyXP(),
    flowState: defaultFlowState(),
    streaks: { currentParticipationStreak: 0, highestParticipationStreak: 0 },
    unlockedManifestSkillLevels: {},
    ownedSkillCards: [],
    equippedSkillCards: [],
    battlePass: {
      currentSeasonId: undefined,
      currentTier: 0,
      battlePassXP: 0,
      claimedRewardIds: [],
    },
  };
}

/** Merge Firestore `students/{uid}.season1` (partial) into full slice. */
export function mergeSeason1FromStudentData(raw: Record<string, unknown> | null | undefined): Season1PlayerSlice {
  const base = defaultSeason1PlayerSlice();
  if (!raw || typeof raw !== 'object') return base;

  const s = raw as Partial<Season1PlayerSlice>;

  return {
    energies: { ...base.energies, ...(s.energies as EnergiesMap | undefined) },
    energyLevels: { ...base.energyLevels, ...(s.energyLevels as EnergyLevelsMap | undefined) },
    energyXP: { ...base.energyXP, ...(s.energyXP as EnergyXPMap | undefined) },
    activeGoalByTimeframe: s.activeGoalByTimeframe,
    activeGoalId: s.activeGoalId,
    flowState: { ...base.flowState, ...(s.flowState as FlowStateStatus | undefined) },
    streaks: {
      currentParticipationStreak: Math.max(0, Number(s.streaks?.currentParticipationStreak) || 0),
      highestParticipationStreak: Math.max(0, Number(s.streaks?.highestParticipationStreak) || 0),
    },
    unlockedManifestSkillLevels: { ...base.unlockedManifestSkillLevels, ...(s.unlockedManifestSkillLevels || {}) },
    ownedSkillCards: Array.isArray(s.ownedSkillCards) ? [...s.ownedSkillCards] : base.ownedSkillCards,
    equippedSkillCards: Array.isArray(s.equippedSkillCards) ? [...s.equippedSkillCards] : base.equippedSkillCards,
    battlePass: {
      ...base.battlePass,
      ...(s.battlePass || {}),
      currentTier: Math.max(0, Number(s.battlePass?.currentTier) || base.battlePass.currentTier),
      battlePassXP: Math.max(0, Number(s.battlePass?.battlePassXP) || base.battlePass.battlePassXP),
      claimedRewardIds: Array.isArray(s.battlePass?.claimedRewardIds)
        ? [...s.battlePass!.claimedRewardIds]
        : base.battlePass.claimedRewardIds,
    },
  };
}
