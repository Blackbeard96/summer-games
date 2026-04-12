/**
 * RR Candy skill trees — global config (Firestore system_config/rr_candy_trees_v1) + typed fallbacks.
 *
 * Audit (where things live):
 * - RR Candy *unlock*: users/{uid} chapters + artifacts; see getRRCandyStatus in utils/rrCandyUtils.ts
 * - Battle move payloads: battleMoves/{uid}/moves[] (ids prefixed rr-candy-)
 * - Player tree *learned nodes*: players/{uid}/skill_state/main → rrCandySkillState + migrations
 * - Admin shell: pages/AdminPanel.tsx (tab-based Sage's Chamber)
 */

import type { Timestamp } from 'firebase/firestore';

export interface RRCandyNodePosition {
  col: number;
  row: number;
}

/** Single node in an RR Candy tree (admin-editable). */
export interface RRCandyNodeDefinition {
  nodeId: string;
  skillId: string;
  name: string;
  icon: string;
  summary: string;
  category: string;
  requiresNodeIds: string[];
  isEnabled: boolean;
  /** When true, node is part of default unlock set for this candy (mirrors starterNodeIds on candy). */
  starterNode?: boolean;
  position: RRCandyNodePosition;
  /** Battle / engine hook (optional implementation later). */
  effectKey?: string;
}

export interface RRCandyDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  themeColor: string;
  isActive: boolean;
  starterNodeIds: string[];
  nodes: RRCandyNodeDefinition[];
}

export interface RRCandyConfig {
  candies: RRCandyDefinition[];
  version: number;
  updatedAt?: Timestamp | null;
}

/** Per-candy learned skill-tree nodes (not the same as chapter “candy unlock”). */
export interface PlayerRRCandyCandyState {
  learnedNodeIds: string[];
}

export type PlayerRRCandySkillStateMap = Record<string, PlayerRRCandyCandyState>;

/** Alias: per-player RR Candy learned nodes keyed by candy id (e.g. konfig). */
export type PlayerRRCandySkillState = PlayerRRCandySkillStateMap;
