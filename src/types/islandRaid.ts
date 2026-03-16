// Types for Island Raid Campaign Mode (PvE Co-op)

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

