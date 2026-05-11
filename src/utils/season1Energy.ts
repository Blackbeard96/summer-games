import type { EnergyType, LiveEventModeType, Season1PlayerSlice } from '../types/season1';
import type { EnergiesMap, EnergyLevelsMap, EnergyXPMap } from '../types/season1';
import { battleEnergyToSeason1Energy, getBattleEnergyTypeForLiveEventMode } from '../constants/energyTypes';

/** Primary Season 1 energy key awarded per live mode (maps through battle energy labels; Neutral uses override). */
export function getEnergyTypeForMode(mode: LiveEventModeType, neutralOverride?: EnergyType): EnergyType {
  const battle = getBattleEnergyTypeForLiveEventMode(mode, mode === 'neutral_flow' ? neutralOverride : undefined);
  return battleEnergyToSeason1Energy(battle);
}

/** XP required to reach next level (simple curve; rebalance in one place). */
export function energyXPForNextLevel(currentLevel: number): number {
  const L = Math.max(1, Math.floor(currentLevel));
  return 100 + (L - 1) * 75;
}

export interface EnergyLevelBonusRow {
  level: number;
  label: string;
  description: string;
}

/** Configurable bonus copy — effect strength applied elsewhere using level. */
export const ENERGY_LEVEL_BONUSES: EnergyLevelBonusRow[] = [
  { level: 1, label: 'Awakening', description: 'Base unlock for this energy track.' },
  { level: 2, label: 'Efficiency', description: 'Slight efficiency when spending this energy type.' },
  { level: 3, label: 'Cost reduction', description: 'Reduced energy cost for matching-type skills.' },
  { level: 4, label: 'Potency', description: 'Stronger effects for matching-type skills.' },
  { level: 5, label: 'Flow surge', description: 'Faster Flow build & special bonus windows.' },
];

export function getEnergyLevelBonuses(level: number): EnergyLevelBonusRow {
  const L = Math.min(5, Math.max(1, Math.floor(level)));
  return ENERGY_LEVEL_BONUSES[L - 1] || ENERGY_LEVEL_BONUSES[0];
}

/** Returns updated levels + xp + energies after gain. Pure — caller persists. */
export function applyEnergyGain(
  energies: EnergiesMap,
  energyXP: EnergyXPMap,
  energyLevels: EnergyLevelsMap,
  type: EnergyType,
  amount: number
): { energies: EnergiesMap; energyXP: EnergyXPMap; energyLevels: EnergyLevelsMap; leveledUp: boolean } {
  const next = {
    energies: { ...energies, [type]: Math.max(0, energies[type] + amount) },
    energyXP: { ...energyXP },
    energyLevels: { ...energyLevels },
    leveledUp: false,
  };
  next.energyXP[type] = Math.max(0, next.energyXP[type] + Math.max(0, amount));
  let leveled = false;
  while (next.energyLevels[type] < 5) {
    const need = energyXPForNextLevel(next.energyLevels[type]);
    if (next.energyXP[type] < need) break;
    next.energyXP[type] -= need;
    next.energyLevels[type] += 1;
    leveled = true;
  }
  next.leveledUp = leveled;
  return next;
}

/** Throttle hint: max energy to apply per client batch tick (anti-spam). */
export const SEASON1_MAX_ENERGY_PER_TICK = 25;

/** Merge energy gain + level-ups into a full Season 1 player slice (pure). */
export function maybeLevelUpEnergy(
  player: Season1PlayerSlice,
  type: EnergyType,
  amount: number
): Season1PlayerSlice {
  const out = applyEnergyGain(player.energies, player.energyXP, player.energyLevels, type, amount);
  return {
    ...player,
    energies: out.energies,
    energyXP: out.energyXP,
    energyLevels: out.energyLevels,
  };
}
