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
  createdAt: Date;
  updatedAt: Date;
}

