/**
 * New Skill System Types
 * Refactored architecture separating skill definitions, tree structure, and player state
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// Skill Definitions (Global)
// ============================================================================

export interface SkillDefinition {
  id: string;
  name: string;
  branchId: string; // Which branch this skill belongs to (e.g., 'manifest', 'elemental', 'system')
  categoryId?: string; // Optional category within branch
  icon: {
    type: 'emoji' | 'url' | 'componentKey';
    value: string;
  };
  tags?: string[]; // e.g., ["manifest", "reading", "control"]
  
  // In-game version (battle description/behavior)
  inGame: {
    summary: string;
    effectText: string;
    type: 'attack' | 'defense' | 'utility' | 'support' | 'control';
    baseCooldown: number;
    baseCostPP: number;
    baseDamage?: number;
    baseHealing?: number;
    baseShieldBoost?: number;
    basePPSteal?: number;
    debuffType?: string;
    buffType?: string;
    targetType?: 'self' | 'single' | 'team' | 'enemy' | 'enemy_team' | 'all';
  };
  
  // Real-world version (lesson/reflection)
  irl: {
    summary: string;
    exampleUse: string;
    reflectionPrompt?: string;
  };
  
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  tier?: number;
  
  // Legacy compatibility fields (for migration)
  legacyCategory?: 'manifest' | 'elemental' | 'system';
  legacyManifestType?: string;
  legacyElementalAffinity?: string;
}

// ============================================================================
// Skill Tree Definition (Global)
// ============================================================================

export interface SkillTreeBranch {
  id: string;
  name: string;
  description: string;
  order: number;
}

export interface SkillTreeCategory {
  id: string;
  branchId: string;
  name: string;
  order: number;
}

export interface SkillTreeNode {
  id: string;
  branchId: string;
  categoryId?: string;
  skillId: string; // References SkillDefinition.id
  position: {
    row: number;
    col: number;
  };
  requires: string[]; // Array of nodeIds that must be unlocked first
  unlockRules: {
    type: 'ppSpent' | 'level' | 'challengeComplete' | 'manual' | 'always';
    value?: any; // Condition value (e.g., minimum PP, level, challenge ID)
  };
}

export interface SkillTreeDefinition {
  version: string; // e.g., 'v1'
  branches: SkillTreeBranch[];
  categories: SkillTreeCategory[];
  nodes: SkillTreeNode[];
  starterNodes: string[]; // NodeIds unlocked by default for all players
  updatedAt?: Timestamp;
}

// ============================================================================
// Player Skill State (Per-player)
// ============================================================================

export interface SkillUpgrade {
  level: number; // Current level (1-10)
  xp?: number; // Optional XP progress to next level
}

export interface PlayerSkillState {
  unlockedNodeIds: string[]; // Array of unlocked node IDs from skill tree (legacy)
  learnedNodeIds?: string[]; // Array of learned Universal Law node IDs (new system)
  equippedSkillIds: string[]; // Array of equipped skill IDs (max 3)
  skillUpgrades: Record<string, SkillUpgrade>; // Map of skillId -> upgrade state
  
  // Metadata
  lastUpdated?: Timestamp;
  version?: string; // Track which version of skill system this state uses
}

// ============================================================================
// Helper Types
// ============================================================================

export interface SkillTreeViewNode {
  node: SkillTreeNode;
  skill: SkillDefinition;
  unlocked: boolean;
  canUnlock: boolean;
  unlockRequirement?: string;
}

export interface UnlockRequirement {
  type: 'ppSpent' | 'level' | 'challengeComplete' | 'manual' | 'always';
  value?: any;
  description: string;
  met: boolean;
}

