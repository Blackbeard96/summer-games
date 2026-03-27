/**
 * Universal Law Boon tree gating + node eligibility.
 */

import {
  UniversalLawId,
  UniversalLawTreeDef,
  UNIVERSAL_LAW_TREES,
  getNodeByNodeId,
  getBoonNodesByLaw,
  type UniversalLawBoonNode,
} from '../data/universalLawTrees';
import {
  computeNodeEligibility,
  type PlayerUniversalLawProgress,
  type UniversalLawCurrencySnapshot,
} from './universalLawBoons';

export type LawTreeAccessStatus = 'locked' | 'available' | 'learned';

export interface LawTreeAccess {
  status: LawTreeAccessStatus;
  reason?: string;
  learnedNodeIds?: string[]; // Nodes learned in this tree
}

export interface LawTreeAccessMap {
  [lawId: string]: LawTreeAccess;
}

/**
 * Get access status for a single Universal Law tree
 */
export function getLawTreeAccess(
  lawId: UniversalLawId,
  _userData: any,
  learnedNodeIds: string[]
): LawTreeAccess {
  const tree = UNIVERSAL_LAW_TREES[lawId];
  if (!tree) {
    return {
      status: 'locked',
      reason: 'Unknown law tree'
    };
  }

  const treeNodeIds = new Set(getBoonNodesByLaw(lawId).map((n) => n.id));
  const learnedInTree = learnedNodeIds.filter((id) => treeNodeIds.has(id));

  if (learnedInTree.length > 0) {
    return {
      status: 'learned',
      learnedNodeIds: learnedInTree
    };
  }

  return {
    status: 'available',
    learnedNodeIds: []
  };
}

/**
 * Get access status for all Universal Law trees
 */
export function getAllLawTreeAccess(
  userData: any,
  learnedNodeIds: string[]
): LawTreeAccessMap {
  const accessMap: LawTreeAccessMap = {};
  
  const lawIds: UniversalLawId[] = ['divine_oneness', 'vibration', 'attraction', 'rhythm'];
  
  for (const lawId of lawIds) {
    accessMap[lawId] = getLawTreeAccess(lawId, userData, learnedNodeIds);
  }
  
  return accessMap;
}

/**
 * Check if a specific node can be learned
 */
export function canLearnNode(
  nodeId: string,
  _userData: any,
  learnedNodeIds: string[],
  progress?: PlayerUniversalLawProgress,
  currency?: UniversalLawCurrencySnapshot
): { canLearn: boolean; reason?: string } {
  const nodeInfo = getNodeByNodeId(nodeId);
  
  if (!nodeInfo) {
    return { canLearn: false, reason: 'Node not found' };
  }
  
  const { node } = nodeInfo as { node: UniversalLawBoonNode };
  
  if (learnedNodeIds.includes(nodeId)) {
    return { canLearn: false, reason: 'Already unlocked' };
  }

  if (!progress || !currency) {
    const allDepsMet = node.prerequisites.every((depId) => learnedNodeIds.includes(depId));
    return allDepsMet
      ? { canLearn: true }
      : { canLearn: false, reason: 'Missing prerequisite nodes' };
  }

  const eligibility = computeNodeEligibility(node, progress, currency);
  return { canLearn: eligibility.canUnlock, reason: eligibility.reason };
}

