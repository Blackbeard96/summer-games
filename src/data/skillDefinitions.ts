/**
 * Global Skill Definitions
 * Single source of truth for all skill data
 */

import { SkillDefinition } from '../types/skillSystem';

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  // ============================================================================
  // Manifest Mastery Branch
  // ============================================================================
  {
    id: 'read-the-flow',
    name: 'Read the Flow',
    branchId: 'manifest',
    categoryId: 'reading',
    icon: { type: 'emoji', value: '👁️' },
    tags: ['manifest', 'reading', 'control'],
    inGame: {
      summary: 'Read enemy intentions and predict their next move.',
      effectText: 'Gain insight into opponent\'s planned actions, allowing you to counter more effectively.',
      type: 'utility',
      baseCooldown: 3,
      baseCostPP: 15,
      targetType: 'enemy',
      debuffType: 'reveal'
    },
    irl: {
      summary: 'Develop awareness of social and emotional cues.',
      exampleUse: 'Notice when someone is feeling overwhelmed and adjust your communication style.',
      reflectionPrompt: 'When have you successfully "read the room" in a social situation?'
    },
    rarity: 'rare',
    legacyCategory: 'manifest',
    legacyManifestType: 'reading'
  },
  {
    id: 'rewrite-intent',
    name: 'Rewrite Intent',
    branchId: 'manifest',
    categoryId: 'writing',
    icon: { type: 'emoji', value: '✒️' },
    tags: ['manifest', 'writing', 'control'],
    inGame: {
      summary: 'Change the target\'s intended action, forcing them to reconsider.',
      effectText: 'Disrupt enemy plans by altering their decision-making process.',
      type: 'control',
      baseCooldown: 4,
      baseCostPP: 20,
      targetType: 'enemy',
      debuffType: 'confuse'
    },
    irl: {
      summary: 'Reframe situations to shift perspectives and outcomes.',
      exampleUse: 'Help someone see a problem from a different angle to find a new solution.',
      reflectionPrompt: 'How can changing your perspective change a challenging situation?'
    },
    rarity: 'rare',
    legacyCategory: 'manifest',
    legacyManifestType: 'writing'
  },
  {
    id: 'shared-blueprint',
    name: 'Shared Blueprint',
    branchId: 'manifest',
    categoryId: 'creating',
    icon: { type: 'emoji', value: '🧩' },
    tags: ['manifest', 'creating', 'support'],
    inGame: {
      summary: 'Coordinate team actions by sharing strategic vision.',
      effectText: 'Synergize with allies to execute coordinated attacks.',
      type: 'support',
      baseCooldown: 5,
      baseCostPP: 25,
      targetType: 'team',
      buffType: 'coordination'
    },
    irl: {
      summary: 'Collaborate effectively by aligning goals and plans.',
      exampleUse: 'Work with a team to create a shared vision for a project.',
      reflectionPrompt: 'What makes collaboration successful in your experience?'
    },
    rarity: 'epic',
    legacyCategory: 'manifest',
    legacyManifestType: 'creating'
  },

  // ============================================================================
  // Elemental & Action Branch
  // ============================================================================
  {
    id: 'ember-jab',
    name: 'Ember Jab',
    branchId: 'elemental',
    categoryId: 'fire',
    icon: { type: 'emoji', value: '🔥' },
    tags: ['elemental', 'fire', 'attack'],
    inGame: {
      summary: 'A quick fiery strike that burns the target.',
      effectText: 'Deal fire damage and apply burn status effect.',
      type: 'attack',
      baseCooldown: 2,
      baseCostPP: 10,
      baseDamage: 30,
      targetType: 'single',
      debuffType: 'burn'
    },
    irl: {
      summary: 'Channel passion and energy into focused action.',
      exampleUse: 'Bring intensity and enthusiasm to tackle a challenging task.',
      reflectionPrompt: 'How does passion fuel your best work?'
    },
    rarity: 'common',
    legacyCategory: 'elemental',
    legacyElementalAffinity: 'fire'
  },
  {
    id: 'quickening-step',
    name: 'Quickening Step',
    branchId: 'elemental',
    categoryId: 'air',
    icon: { type: 'emoji', value: '🌀' },
    tags: ['elemental', 'air', 'mobility'],
    inGame: {
      summary: 'Move with the speed of wind, dodging attacks.',
      effectText: 'Temporarily increase dodge chance and movement speed.',
      type: 'utility',
      baseCooldown: 3,
      baseCostPP: 12,
      targetType: 'self',
      buffType: 'speed'
    },
    irl: {
      summary: 'Move quickly and adaptively through challenges.',
      exampleUse: 'Navigate a busy day by staying flexible and moving efficiently.',
      reflectionPrompt: 'When has quick thinking helped you overcome an obstacle?'
    },
    rarity: 'common',
    legacyCategory: 'elemental',
    legacyElementalAffinity: 'air'
  },
  {
    id: 'bulwark-formation',
    name: 'Bulwark Formation',
    branchId: 'elemental',
    categoryId: 'earth',
    icon: { type: 'emoji', value: '🧱' },
    tags: ['elemental', 'earth', 'defense'],
    inGame: {
      summary: 'Create a defensive barrier that protects you and allies.',
      effectText: 'Raise shields and reduce incoming damage for the team.',
      type: 'defense',
      baseCooldown: 4,
      baseCostPP: 18,
      baseShieldBoost: 40,
      targetType: 'team',
      buffType: 'fortify'
    },
    irl: {
      summary: 'Build strong foundations and protective structures.',
      exampleUse: 'Create a study plan or support system that helps you stay focused.',
      reflectionPrompt: 'What structures help you feel secure and supported?'
    },
    rarity: 'rare',
    legacyCategory: 'elemental',
    legacyElementalAffinity: 'earth'
  },

  // ============================================================================
  // System & Strategy Branch
  // ============================================================================
  {
    id: 'perfect-timing',
    name: 'Perfect Timing',
    branchId: 'system',
    categoryId: 'strategy',
    icon: { type: 'emoji', value: '⏱️' },
    tags: ['system', 'strategy', 'utility'],
    inGame: {
      summary: 'Master timing to optimize action efficiency.',
      effectText: 'Reduce cooldowns and increase action priority.',
      type: 'utility',
      baseCooldown: 6,
      baseCostPP: 20,
      targetType: 'self',
      buffType: 'cooldown_reduction'
    },
    irl: {
      summary: 'Learn to recognize the right moment to act.',
      exampleUse: 'Wait for the perfect opportunity to present your ideas or make your move.',
      reflectionPrompt: 'How do you know when the timing is right for an important decision?'
    },
    rarity: 'rare'
  },
  {
    id: 'cooldown-lock',
    name: 'Cooldown Lock',
    branchId: 'system',
    categoryId: 'strategy',
    icon: { type: 'emoji', value: '❄️' },
    tags: ['system', 'strategy', 'control'],
    inGame: {
      summary: 'Freeze opponent abilities, preventing skill usage.',
      effectText: 'Lock enemy skills for a duration, disrupting their strategy.',
      type: 'control',
      baseCooldown: 5,
      baseCostPP: 22,
      targetType: 'enemy',
      debuffType: 'silence'
    },
    irl: {
      summary: 'Pause and reflect before making decisions.',
      exampleUse: 'Stop and think before reacting, preventing hasty choices.',
      reflectionPrompt: 'When has taking a pause helped you make better decisions?'
    },
    rarity: 'epic'
  },
  {
    id: 'vault-insight',
    name: 'Vault Insight',
    branchId: 'system',
    categoryId: 'strategy',
    icon: { type: 'emoji', value: '🔐' },
    tags: ['system', 'strategy', 'utility'],
    inGame: {
      summary: 'Gain deep understanding of vault systems and PP flow.',
      effectText: 'Reveal enemy vault status and optimize PP economy.',
      type: 'utility',
      baseCooldown: 4,
      baseCostPP: 15,
      targetType: 'enemy',
      debuffType: 'reveal'
    },
    irl: {
      summary: 'Understand systems and how resources flow.',
      exampleUse: 'Analyze how time, energy, or money moves through a system.',
      reflectionPrompt: 'What systems do you understand well enough to optimize?'
    },
    rarity: 'rare'
  }
];

// Helper to get skill by ID
export function getSkillDefinition(skillId: string): SkillDefinition | undefined {
  return SKILL_DEFINITIONS.find(skill => skill.id === skillId);
}

// Helper to get skills by branch
export function getSkillsByBranch(branchId: string): SkillDefinition[] {
  return SKILL_DEFINITIONS.filter(skill => skill.branchId === branchId);
}

// Helper to get skills by category
export function getSkillsByCategory(categoryId: string): SkillDefinition[] {
  return SKILL_DEFINITIONS.filter(skill => skill.categoryId === categoryId);
}

