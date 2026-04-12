// Types for Island Raid Campaign Mode (PvE Co-op)

import type { ElementType } from './elementTypes';
import type {
  CoopBattleMode,
  CoopParticipantRecord,
  MissionBattleCoopConfig,
  NpcAllyBattleInstance,
} from './coopBattle';
import type { MissionMediaSequenceStep } from './missions';

export interface IslandRaidTeam {
  id: string;
  name: string;
  members: IslandRaidPlayer[];
  artifactsFound: string[];
  sonidoArtifactFound: boolean;
  createdAt: Date;
  status: 'lobby' | 'in_game' | 'completed' | 'defeated';
}

export interface IslandRaidPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  xp: number;
  health: number;
  maxHealth: number;
  shieldStrength: number;
  maxShieldStrength: number;
  equippedArtifacts: any;
  moves: any[];
  actionCards: any[];
  isReady: boolean;
  isLeader: boolean;
  isInBattle: boolean; // Whether player is currently in the battle room
}

export interface IslandRaidEnemy {
  id: string;
  type: 'zombie' | 'hostile_group' | 'boss' | 'powered_zombie' | 'zombie_captain';
  name: string;
  health: number;
  maxHealth: number;
  shieldStrength: number;
  maxShieldStrength: number;
  level: number;
  damage: number;
  moves: any[];
  position: { x: number; y: number };
  spawnTime: Date;
  waveNumber: number;
  image?: string; // Optional image path for the enemy
  /** Combat element for type advantage (omit/null = neutral) */
  enemyType?: ElementType | null;
  /** When true, enemy can enter a second phase at low HP (see awakened* fields). */
  awakenedModeEnabled?: boolean;
  /** Trigger awakened phase when current HP / max HP is at or below this percent (default 50). */
  awakenAtHealthPercent?: number;
  awakenedImage?: string;
  awakenedHealth?: number;
  awakenedShields?: number;
  awakenedEnemyType?: ElementType | null;
  awakenedMoves?: any[];
  /** Mission-style slides/videos when this CPU awakens (optional). */
  awakeningAnimation?: MissionMediaSequenceStep[];
  /** Runtime: phase-two active (synced in raid room when possible). */
  isAwakened?: boolean;
}

export interface IslandArtifact {
  id: string;
  name: string;
  description: string;
  type: 'sonido_target' | 'powerful' | 'common';
  location: { x: number; y: number };
  found: boolean;
  foundBy?: string;
  foundAt?: Date;
  power: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface IslandRaidGameState {
  id: string;
  teamId: string;
  phase: 'lobby' | 'dropping' | 'exploring' | 'combat' | 'extracting' | 'completed' | 'defeated';
  round: number;
  maxRounds: number;
  timer: number; // seconds remaining
  enemies: IslandRaidEnemy[];
  artifacts: IslandArtifact[];
  discoveredArtifacts: string[];
  sonidoArtifactFound: boolean;
  teamHealth: number;
  totalTeamHealth: number;
  waveNumber: number;
  currentWave: number;
  maxWaves: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IslandRaidRewards {
  xp: number;
  pp: number;
  artifacts: string[];
  actionCards: string[];
  cosmetics: string[];
  bonusRewards?: {
    survivalBonus?: number;
    artifactBonus?: number;
    speedBonus?: number;
  };
}

export interface IslandRaidLobby {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  currentPlayers: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  status: 'waiting' | 'starting' | 'in_progress' | 'expired';
  players: IslandRaidPlayer[];
  createdAt: Date;
  updatedAt?: Date;
  lastActivityAt?: Date;
  gameId?: string; // Reference to the active game
}

export interface IslandRaidBattleRoom {
  id: string;
  gameId: string;
  lobbyId: string;
  players: string[]; // Array of userIds currently in battle
  enemies: IslandRaidEnemy[];
  waveNumber: number;
  maxWaves: number;
  status: 'active' | 'wave_complete' | 'defeated' | 'victory';
  /** If set, use admin-defined level for waves and rewards */
  levelId?: string;
  difficulty?: 'easy' | 'normal' | 'hard' | 'nightmare';
  createdAt: Date;
  updatedAt: Date;

  // --- Dynamic co-op / reinforcement (optional; see `src/types/coopBattle.ts`) ---
  /** Any signed-in user may read while `active` (Firestore rules). */
  joinableMidBattle?: boolean;
  /** When true, do not auto-add the opening user to `players`; use Join CTA. */
  requireExplicitJoin?: boolean;
  hostPlayerId?: string;
  participantCap?: number;
  roundNumber?: number;
  battleEventLog?: string[];
  allyTurnOrderSnapshot?: string[];
  participantRecords?: Record<string, CoopParticipantRecord>;
  npcAllies?: NpcAllyBattleInstance[];
  allowNpcAllies?: boolean;
  maxNpcAllies?: number;
  coopBattleMode?: CoopBattleMode;
  /** Mission sequence battle step config echo (optional). */
  missionCoop?: MissionBattleCoopConfig;
}

/** Admin-defined enemy template for one wave (count copies spawned). */
export interface IslandRaidLevelEnemyTemplate {
  type: IslandRaidEnemy['type'];
  name: string;
  count: number;
  health: number;
  shieldStrength?: number;
  level: number;
  damage: number;
  image?: string;
  enemyType?: ElementType | null;
}

/** Admin-defined wave config (one wave's enemies). */
export interface IslandRaidLevelWave {
  waveIndex: number; // 1-based
  enemies: IslandRaidLevelEnemyTemplate[];
}

/** Completion rewards for an admin-defined level. */
export interface IslandRaidLevelRewards {
  pp: number;
  xp: number;
  truthMetal: number;
  /** First completion only: grant Captain's Helmet */
  captainHelmet?: boolean;
  /** First completion only: grant one of these ring ids at random (e.g. blaze-ring, terra-ring) */
  elementalRingIds?: string[];
  /** First completion only: grant these artifact ids (any marketplace artifact) */
  artifactIds?: string[];
}

/** Admin-defined Island Raid level (enemies per wave + rewards). */
export interface IslandRaidLevel {
  id: string;
  name: string;
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  maxWaves: number;
  waves: IslandRaidLevelWave[];
  rewards: IslandRaidLevelRewards;
  /** Repeat completion rewards (when not first time); if omitted, uses same as rewards */
  repeatRewards?: IslandRaidLevelRewards;
  order: number; // for admin listing
  createdAt?: any;
  updatedAt?: any;
}

