/**
 * Skill Tree Structure Definition
 * Defines the tree layout, branches, categories, and node connections
 */

import { SkillTreeDefinition, SkillTreeBranch, SkillTreeCategory, SkillTreeNode } from '../types/skillSystem';

export const SKILL_TREE_BRANCHES: SkillTreeBranch[] = [
  {
    id: 'manifest',
    name: 'Manifest Mastery',
    description: 'Enhance your core manifest abilities',
    order: 1
  },
  {
    id: 'elemental',
    name: 'Elemental & Action',
    description: 'Master elemental powers and action skills',
    order: 2
  },
  {
    id: 'system',
    name: 'System & Strategy',
    description: 'Unlock system-level abilities and strategic tools',
    order: 3
  }
];

export const SKILL_TREE_CATEGORIES: SkillTreeCategory[] = [
  // Manifest categories
  { id: 'reading', branchId: 'manifest', name: 'Reading', order: 1 },
  { id: 'writing', branchId: 'manifest', name: 'Writing', order: 2 },
  { id: 'creating', branchId: 'manifest', name: 'Creating', order: 3 },
  
  // Elemental categories
  { id: 'fire', branchId: 'elemental', name: 'Fire', order: 1 },
  { id: 'air', branchId: 'elemental', name: 'Air', order: 2 },
  { id: 'earth', branchId: 'elemental', name: 'Earth', order: 3 },
  
  // System categories
  { id: 'strategy', branchId: 'system', name: 'Strategy', order: 1 },
  { id: 'rr-candy', branchId: 'system', name: 'RR Candy', order: 2 }
];

export const SKILL_TREE_NODES: SkillTreeNode[] = [
  // Manifest Mastery nodes
  {
    id: 'node-manifest-root',
    branchId: 'manifest',
    skillId: 'read-the-flow',
    position: { row: 0, col: 2 },
    requires: [],
    unlockRules: { type: 'always' }
  },
  {
    id: 'node-rewrite-intent',
    branchId: 'manifest',
    categoryId: 'writing',
    skillId: 'rewrite-intent',
    position: { row: 1, col: 1 },
    requires: ['node-manifest-root'],
    unlockRules: { type: 'ppSpent', value: 500 }
  },
  {
    id: 'node-shared-blueprint',
    branchId: 'manifest',
    categoryId: 'creating',
    skillId: 'shared-blueprint',
    position: { row: 1, col: 3 },
    requires: ['node-manifest-root'],
    unlockRules: { type: 'ppSpent', value: 500 }
  },
  
  // Elemental & Action nodes
  {
    id: 'node-elemental-root',
    branchId: 'elemental',
    skillId: 'ember-jab',
    position: { row: 0, col: 2 },
    requires: [],
    unlockRules: { type: 'level', value: 3 }
  },
  {
    id: 'node-quickening-step',
    branchId: 'elemental',
    categoryId: 'air',
    skillId: 'quickening-step',
    position: { row: 1, col: 1 },
    requires: ['node-elemental-root'],
    unlockRules: { type: 'ppSpent', value: 300 }
  },
  {
    id: 'node-bulwark-formation',
    branchId: 'elemental',
    categoryId: 'earth',
    skillId: 'bulwark-formation',
    position: { row: 1, col: 3 },
    requires: ['node-elemental-root'],
    unlockRules: { type: 'ppSpent', value: 400 }
  },
  
  // System & Strategy nodes
  {
    id: 'node-system-root',
    branchId: 'system',
    skillId: 'perfect-timing',
    position: { row: 0, col: 2 },
    requires: [],
    unlockRules: { type: 'level', value: 5 }
  },
  {
    id: 'node-cooldown-lock',
    branchId: 'system',
    categoryId: 'strategy',
    skillId: 'cooldown-lock',
    position: { row: 1, col: 1 },
    requires: ['node-system-root'],
    unlockRules: { type: 'ppSpent', value: 600 }
  },
  {
    id: 'node-vault-insight',
    branchId: 'system',
    categoryId: 'strategy',
    skillId: 'vault-insight',
    position: { row: 1, col: 3 },
    requires: ['node-system-root'],
    unlockRules: { type: 'ppSpent', value: 600 }
  }
];

export const SKILL_TREE_DEFINITION: SkillTreeDefinition = {
  version: 'v1',
  branches: SKILL_TREE_BRANCHES,
  categories: SKILL_TREE_CATEGORIES,
  nodes: SKILL_TREE_NODES,
  starterNodes: ['node-manifest-root'] // Start with first manifest skill unlocked
};

// Helper functions
export function getBranchById(branchId: string): SkillTreeBranch | undefined {
  return SKILL_TREE_BRANCHES.find(b => b.id === branchId);
}

export function getCategoriesByBranch(branchId: string): SkillTreeCategory[] {
  return SKILL_TREE_CATEGORIES
    .filter(c => c.branchId === branchId)
    .sort((a, b) => a.order - b.order);
}

export function getNodesByBranch(branchId: string): SkillTreeNode[] {
  return SKILL_TREE_NODES.filter(n => n.branchId === branchId);
}

export function getNodeById(nodeId: string): SkillTreeNode | undefined {
  return SKILL_TREE_NODES.find(n => n.id === nodeId);
}

export function getStarterNodes(): string[] {
  return SKILL_TREE_DEFINITION.starterNodes;
}

