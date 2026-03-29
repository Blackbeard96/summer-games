import type { ManifestSkillLevelConfig } from '../types/season1';

/** PP costs and target caps — Season 1 manifest evolution (balanced, single source of truth). */
export const MANIFEST_EVOLUTION_LEVELS: ManifestSkillLevelConfig[] = [
  {
    level: 1,
    unlockCostPP: 0,
    maxTargets: 1,
    description: 'Base manifest skill (already owned).',
  },
  {
    level: 2,
    unlockCostPP: 900,
    maxTargets: 2,
    description: 'Affect up to two allies or opponents.',
    availableChoicePool: ['type_boost', 'type_control', 'type_support'],
  },
  {
    level: 3,
    unlockCostPP: 9000,
    maxTargets: 3,
    description: 'Wider reach — three targets.',
    availableChoicePool: ['type_boost', 'type_control', 'type_support', 'type_utility'],
  },
  {
    level: 4,
    unlockCostPP: 18000,
    maxTargets: 4,
    description: 'Coordinate four participants.',
    availableChoicePool: ['type_boost', 'type_control', 'type_support', 'type_utility'],
  },
  {
    level: 5,
    unlockCostPP: 27000,
    maxTargets: 999,
    description: 'Whole-class scale (GM/host may still cap in session).',
    availableChoicePool: ['type_boost', 'type_control', 'type_support', 'type_utility', 'type_reveal'],
  },
];

export function getManifestLevelConfig(level: number): ManifestSkillLevelConfig | undefined {
  return MANIFEST_EVOLUTION_LEVELS.find((c) => c.level === level);
}
