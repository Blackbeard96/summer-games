/**
 * Universal Law Boon Trees (v2)
 *
 * Each node is a progression boon with explicit PP + Truth Metal costs
 * and standardized effect payload metadata.
 */

export type UniversalLawId = 'divine_oneness' | 'vibration' | 'attraction' | 'rhythm';

export type UniversalLawBoonCategory =
  | 'loadout'
  | 'artifact'
  | 'cooldown'
  | 'resource'
  | 'combat'
  | 'combo'
  | 'critical'
  | 'unlock';

export type UniversalLawEffectType =
  | 'max_loadout_slots_bonus'
  | 'artifact_perk_multiplier'
  | 'artifact_skill_cooldown_reduction'
  | 'manifest_skill_bonus'
  | 'elemental_skill_bonus'
  | 'rr_candy_skill_bonus'
  | 'battle_reward_pp_multiplier'
  | 'crit_chance_bonus'
  | 'crit_damage_bonus'
  | 'combo_damage_bonus'
  | 'shield_on_combo_restore'
  | 'first_skill_damage_bonus'
  | 'cooldown_reduction_global'
  | 'every_nth_skill_bonus'
  | 'rare_drop_chance_bonus'
  | 'unlock_specific_skill'
  | 'combo_alt_source_bonus';

export interface UniversalLawBoonNode {
  id: string;
  law: UniversalLawId;
  title: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  icon?: string;
  costPP: number;
  costTruthMetalShards: number;
  prerequisites: string[];
  boonCategory: UniversalLawBoonCategory;
  effectType: UniversalLawEffectType;
  effectPayload: Record<string, unknown>;
  isActive: boolean;
  isImplemented: boolean;
  sortOrder: number;
  position: { col: number; row: number };
}

export interface UniversalLawTreeDef {
  id: UniversalLawId;
  title: string;
  subtitle: string;
  description: string;
  color: string;
}

const N = (node: UniversalLawBoonNode): UniversalLawBoonNode => node;

export const UNIVERSAL_LAW_TREES: Record<UniversalLawId, UniversalLawTreeDef> = {
  divine_oneness: {
    id: 'divine_oneness',
    title: 'Law of Divine Oneness',
    subtitle: 'Unity, shared scaling, build synergy',
    description:
      'Synchronizes your loadout, artifacts, and battle effects into a stronger whole.',
    color: '#8b5cf6',
  },
  vibration: {
    id: 'vibration',
    title: 'Law of Vibration',
    subtitle: 'Speed, tempo, momentum',
    description:
      'Accelerates combat rhythm through cooldown flow, opening burst, and rapid sequencing.',
    color: '#06b6d4',
  },
  attraction: {
    id: 'attraction',
    title: 'Law of Attraction',
    subtitle: 'Rewards, favorable outcomes, pressure',
    description:
      'Pulls stronger outcomes toward you through reward multipliers and higher-impact openers.',
    color: '#f59e0b',
  },
  rhythm: {
    id: 'rhythm',
    title: 'Law of Rhythm',
    subtitle: 'Combos, sequencing, timing',
    description:
      'Rewards clean rotations and source alternation with amplified combo performance.',
    color: '#10b981',
  },
};

export const UNIVERSAL_LAW_BOON_NODES: UniversalLawBoonNode[] = [
  // Divine Oneness
  N({
    id: 'divine_shared_resonance',
    law: 'divine_oneness',
    title: 'Shared Resonance',
    description: 'Artifact perks become 12% stronger.',
    tier: 1,
    icon: '🔗',
    costPP: 300,
    costTruthMetalShards: 2,
    prerequisites: [],
    boonCategory: 'artifact',
    effectType: 'artifact_perk_multiplier',
    effectPayload: { multiplierBonus: 0.12 },
    isActive: true,
    isImplemented: true,
    sortOrder: 10,
    position: { col: 0, row: 0 },
  }),
  N({
    id: 'divine_unified_arsenal',
    law: 'divine_oneness',
    title: 'Unified Arsenal',
    description: 'Increase max equipped loadout skills by +1.',
    tier: 2,
    icon: '🧩',
    costPP: 800,
    costTruthMetalShards: 4,
    prerequisites: ['divine_shared_resonance'],
    boonCategory: 'loadout',
    effectType: 'max_loadout_slots_bonus',
    effectPayload: { bonusSlots: 1 },
    isActive: true,
    isImplemented: true,
    sortOrder: 20,
    position: { col: 1, row: 1 },
  }),
  N({
    id: 'divine_harmony_boost',
    law: 'divine_oneness',
    title: 'Harmony Boost',
    description: 'Manifest and Elemental skills gain +8% outgoing power.',
    tier: 3,
    icon: '✨',
    costPP: 1500,
    costTruthMetalShards: 6,
    prerequisites: ['divine_unified_arsenal'],
    boonCategory: 'combat',
    effectType: 'manifest_skill_bonus',
    effectPayload: { bonusFraction: 0.08, alsoElementalBonusFraction: 0.08 },
    isActive: true,
    isImplemented: true,
    sortOrder: 30,
    position: { col: 2, row: 2 },
  }),
  N({
    id: 'divine_linked_artifacts',
    law: 'divine_oneness',
    title: 'Linked Artifacts',
    description: 'Artifact-granted skills gain 15% cooldown reduction.',
    tier: 3,
    icon: '🛡️',
    costPP: 1700,
    costTruthMetalShards: 7,
    prerequisites: ['divine_unified_arsenal'],
    boonCategory: 'artifact',
    effectType: 'artifact_skill_cooldown_reduction',
    effectPayload: { reductionFraction: 0.15 },
    isActive: true,
    isImplemented: true,
    sortOrder: 40,
    position: { col: 2, row: 0 },
  }),
  // Vibration
  N({
    id: 'vibration_tempo_shift',
    law: 'vibration',
    title: 'Tempo Shift',
    description: 'Global skill cooldowns are reduced by 10%.',
    tier: 1,
    icon: '⚡',
    costPP: 280,
    costTruthMetalShards: 2,
    prerequisites: [],
    boonCategory: 'cooldown',
    effectType: 'cooldown_reduction_global',
    effectPayload: { reductionFraction: 0.1 },
    isActive: true,
    isImplemented: true,
    sortOrder: 10,
    position: { col: 0, row: 0 },
  }),
  N({
    id: 'vibration_resonance_stacks',
    law: 'vibration',
    title: 'Resonance Stacks',
    description: 'Combo sequences gain +10% damage scaling.',
    tier: 2,
    icon: '📶',
    costPP: 900,
    costTruthMetalShards: 4,
    prerequisites: ['vibration_tempo_shift'],
    boonCategory: 'combo',
    effectType: 'combo_damage_bonus',
    effectPayload: { bonusFraction: 0.1 },
    isActive: true,
    isImplemented: true,
    sortOrder: 20,
    position: { col: 1, row: 1 },
  }),
  N({
    id: 'vibration_burst',
    law: 'vibration',
    title: 'Vibration Burst',
    description: 'First skill in battle gains +18% power.',
    tier: 3,
    icon: '💥',
    costPP: 1600,
    costTruthMetalShards: 6,
    prerequisites: ['vibration_resonance_stacks'],
    boonCategory: 'combat',
    effectType: 'first_skill_damage_bonus',
    effectPayload: { bonusFraction: 0.18 },
    isActive: true,
    isImplemented: true,
    sortOrder: 30,
    position: { col: 2, row: 2 },
  }),
  N({
    id: 'vibration_resonant_artifacts',
    law: 'vibration',
    title: 'Resonant Artifacts',
    description: 'Artifact perks gain another +10% potency.',
    tier: 4,
    icon: '🧿',
    costPP: 2300,
    costTruthMetalShards: 9,
    prerequisites: ['vibration_burst'],
    boonCategory: 'artifact',
    effectType: 'artifact_perk_multiplier',
    effectPayload: { multiplierBonus: 0.1 },
    isActive: true,
    isImplemented: true,
    sortOrder: 40,
    position: { col: 3, row: 1 },
  }),
  // Attraction
  N({
    id: 'attraction_power_magnet',
    law: 'attraction',
    title: 'Power Magnet',
    description: 'Gain +15% PP from battle and quiz reward sources.',
    tier: 1,
    icon: '🧲',
    costPP: 320,
    costTruthMetalShards: 2,
    prerequisites: [],
    boonCategory: 'resource',
    effectType: 'battle_reward_pp_multiplier',
    effectPayload: { multiplierBonus: 0.15 },
    isActive: true,
    isImplemented: true,
    sortOrder: 10,
    position: { col: 0, row: 0 },
  }),
  N({
    id: 'attraction_artifact_pull',
    law: 'attraction',
    title: 'Artifact Pull',
    description: 'Increase rare artifact drop chance by 6%.',
    tier: 2,
    icon: '🎁',
    costPP: 850,
    costTruthMetalShards: 4,
    prerequisites: ['attraction_power_magnet'],
    boonCategory: 'resource',
    effectType: 'rare_drop_chance_bonus',
    effectPayload: { bonusFraction: 0.06 },
    isActive: true,
    isImplemented: true,
    sortOrder: 20,
    position: { col: 1, row: 1 },
  }),
  N({
    id: 'attraction_fortune_alignment',
    law: 'attraction',
    title: 'Fortune Alignment',
    description: 'Gain +6% crit chance and +20% crit damage.',
    tier: 3,
    icon: '🎯',
    costPP: 1500,
    costTruthMetalShards: 6,
    prerequisites: ['attraction_artifact_pull'],
    boonCategory: 'critical',
    effectType: 'crit_chance_bonus',
    effectPayload: { chanceBonus: 0.06, critDamageBonus: 0.2 },
    isActive: true,
    isImplemented: true,
    sortOrder: 30,
    position: { col: 2, row: 0 },
  }),
  N({
    id: 'attraction_opportunity_window',
    law: 'attraction',
    title: 'Opportunity Window',
    description: 'Openers deal +12% more damage.',
    tier: 3,
    icon: '🚪',
    costPP: 1700,
    costTruthMetalShards: 7,
    prerequisites: ['attraction_artifact_pull'],
    boonCategory: 'combat',
    effectType: 'first_skill_damage_bonus',
    effectPayload: { bonusFraction: 0.12 },
    isActive: true,
    isImplemented: true,
    sortOrder: 40,
    position: { col: 2, row: 2 },
  }),
  // Rhythm
  N({
    id: 'rhythm_combo_amplifier',
    law: 'rhythm',
    title: 'Combo Amplifier',
    description: 'Consecutive non-repeated skills gain +12% combo damage.',
    tier: 1,
    icon: '🥁',
    costPP: 300,
    costTruthMetalShards: 2,
    prerequisites: [],
    boonCategory: 'combo',
    effectType: 'combo_damage_bonus',
    effectPayload: { bonusFraction: 0.12 },
    isActive: true,
    isImplemented: true,
    sortOrder: 10,
    position: { col: 0, row: 0 },
  }),
  N({
    id: 'rhythm_battle_flow',
    law: 'rhythm',
    title: 'Battle Flow',
    description: 'Every 3rd skill in a chain gains +16% power.',
    tier: 2,
    icon: '🔁',
    costPP: 900,
    costTruthMetalShards: 4,
    prerequisites: ['rhythm_combo_amplifier'],
    boonCategory: 'combo',
    effectType: 'every_nth_skill_bonus',
    effectPayload: { everyN: 3, bonusFraction: 0.16 },
    isActive: true,
    isImplemented: true,
    sortOrder: 20,
    position: { col: 1, row: 1 },
  }),
  N({
    id: 'rhythm_mastery',
    law: 'rhythm',
    title: 'Rhythm Mastery',
    description:
      'Alternating Manifest/Elemental skill sources grants +10% sequence damage.',
    tier: 3,
    icon: '🎼',
    costPP: 1600,
    costTruthMetalShards: 6,
    prerequisites: ['rhythm_battle_flow'],
    boonCategory: 'combo',
    effectType: 'combo_alt_source_bonus',
    effectPayload: { bonusFraction: 0.1 },
    isActive: true,
    isImplemented: true,
    sortOrder: 30,
    position: { col: 2, row: 0 },
  }),
  N({
    id: 'rhythm_momentum_shield',
    law: 'rhythm',
    title: 'Momentum Shield',
    description: 'Successful combo actions restore 24 shields.',
    tier: 4,
    icon: '🛡️',
    costPP: 2400,
    costTruthMetalShards: 9,
    prerequisites: ['rhythm_mastery'],
    boonCategory: 'combo',
    effectType: 'shield_on_combo_restore',
    effectPayload: { shieldRestore: 24 },
    isActive: true,
    isImplemented: true,
    sortOrder: 40,
    position: { col: 3, row: 1 },
  }),
];

export const UNIVERSAL_LAW_BOON_NODE_MAP: Record<string, UniversalLawBoonNode> =
  UNIVERSAL_LAW_BOON_NODES.reduce((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {} as Record<string, UniversalLawBoonNode>);

export function getLawTreeById(lawId: UniversalLawId): UniversalLawTreeDef {
  return UNIVERSAL_LAW_TREES[lawId];
}

export function getAllLawTrees(): UniversalLawTreeDef[] {
  return Object.values(UNIVERSAL_LAW_TREES);
}

export function getBoonNodeById(nodeId: string): UniversalLawBoonNode | undefined {
  return UNIVERSAL_LAW_BOON_NODE_MAP[nodeId];
}

export function getBoonNodesByLaw(lawId: UniversalLawId): UniversalLawBoonNode[] {
  return UNIVERSAL_LAW_BOON_NODES.filter((n) => n.law === lawId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getNodeByNodeId(
  nodeId: string
): { tree: UniversalLawTreeDef; node: UniversalLawBoonNode } | null {
  const node = getBoonNodeById(nodeId);
  if (!node) return null;
  const tree = getLawTreeById(node.law);
  return { tree, node };
}

