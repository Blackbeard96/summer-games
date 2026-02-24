/**
 * Universal Law Tree Gating Logic
 * Determines which Universal Law trees are available to a player
 */

import { UniversalLawId, UniversalLawTreeDef, UNIVERSAL_LAW_TREES, getNodeByNodeId } from '../data/universalLawTrees';
import { getRRCandyStatus, RRCandyStatus } from './rrCandyUtils';

export type LawTreeAccessStatus = "locked" | "available" | "learned";

export interface LawTreeAccess {
  status: LawTreeAccessStatus;
  reason?: string;
  learnedNodeIds?: string[]; // Nodes learned in this tree
}

export interface LawTreeAccessMap {
  [lawId: string]: LawTreeAccess;
}

/**
 * Check if Chapter 2-4 is completed
 */
function isChapter24Completed(userData: any): boolean {
  if (!userData?.chapters) return false;
  
  const chapter2 = userData.chapters[2] || userData.chapters['2'] || {};
  const challenges = chapter2.challenges || {};
  const challenge = challenges['ep2-its-all-a-game'] || {};
  
  // Check if challenge is completed
  const challengeCompleted = challenge?.isCompleted === true || challenge?.status === 'approved';
  const chapterCompleted = chapter2?.isCompleted === true;
  
  return challengeCompleted || chapterCompleted;
}

/**
 * Map RR Candy type from tree definition to user data format
 */
function mapRRCandyType(treeCandyType: string): 'on-off' | 'up-down' | 'config' {
  // Tree uses underscores, user data uses hyphens
  return treeCandyType.replace('_', '-') as 'on-off' | 'up-down' | 'config';
}

/**
 * Check if player has the required RR Candy
 */
function hasRequiredRRCandy(
  tree: UniversalLawTreeDef,
  rrCandyStatus: RRCandyStatus
): boolean {
  if (!tree.rrCandyRequired) {
    // Divine Oneness has no RR Candy requirement (but is locked for future)
    return false;
  }
  
  if (!rrCandyStatus.unlocked) {
    return false;
  }
  
  // Map tree candy type to user data format
  const requiredCandy = mapRRCandyType(tree.rrCandyRequired);
  return rrCandyStatus.candyType === requiredCandy;
}

/**
 * Get access status for a single Universal Law tree
 */
export function getLawTreeAccess(
  lawId: UniversalLawId,
  userData: any,
  learnedNodeIds: string[]
): LawTreeAccess {
  const tree = UNIVERSAL_LAW_TREES[lawId];
  if (!tree) {
    return {
      status: "locked",
      reason: "Unknown law tree"
    };
  }
  
  // Divine Oneness is always locked (future content)
  if (lawId === "divine_oneness") {
    return {
      status: "locked",
      reason: "Coming soon"
    };
  }
  
  // Check if any nodes in this tree are learned
  const treeNodeIds = tree.nodes.map(n => n.nodeId);
  const learnedInTree = learnedNodeIds.filter(id => treeNodeIds.includes(id));
  
  if (learnedInTree.length > 0) {
    return {
      status: "learned",
      learnedNodeIds: learnedInTree
    };
  }
  
  // Check chapter requirement
  const chapter24Completed = isChapter24Completed(userData);
  if (!chapter24Completed) {
    return {
      status: "locked",
      reason: "Complete Chapter 2-4 to unlock"
    };
  }
  
  // Check RR Candy requirement
  const rrCandyStatus = getRRCandyStatus(userData);
  if (!hasRequiredRRCandy(tree, rrCandyStatus)) {
    const candyName = tree.rrCandyRequired === "config" ? "Config (Kon)" :
                     tree.rrCandyRequired === "on_off" ? "On/Off (Luz)" :
                     tree.rrCandyRequired === "up_down" ? "Up/Down (Brinx)" : "RR Candy";
    
    return {
      status: "locked",
      reason: `Requires ${candyName} RR Candy`
    };
  }
  
  // All requirements met - tree is available
  return {
    status: "available",
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
  
  const lawIds: UniversalLawId[] = ["divine_oneness", "vibration", "attraction", "rhythm"];
  
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
  userData: any,
  learnedNodeIds: string[]
): { canLearn: boolean; reason?: string } {
  const nodeInfo = getNodeByNodeId(nodeId);
  
  if (!nodeInfo) {
    return { canLearn: false, reason: "Node not found" };
  }
  
  const { tree, node } = nodeInfo;
  
  // Check if already learned
  if (learnedNodeIds.includes(nodeId)) {
    return { canLearn: false, reason: "Already learned" };
  }
  
  // Check tree access
  const treeAccess = getLawTreeAccess(tree.id, userData, learnedNodeIds);
  if (treeAccess.status !== "available" && treeAccess.status !== "learned") {
    return { canLearn: false, reason: treeAccess.reason || "Tree not available" };
  }
  
  // Check node dependencies
  const allDepsMet = node.requiresNodeIds.every(depId => learnedNodeIds.includes(depId));
  if (!allDepsMet) {
    return { canLearn: false, reason: "Dependencies not met" };
  }
  
  return { canLearn: true };
}

