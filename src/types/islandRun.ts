// Types for Island Run Campaign Mode (PvE Co-op)

export interface IslandRunTeam {
  id: string;
  name: string;
  members: IslandRunPlayer[];
  artifactsFound: string[];
  sonidoArtifactFound: boolean;
  createdAt: Date;
  status: 'lobby' | 'in_game' | 'completed' | 'defeated';
}

export interface IslandRunPlayer {
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
}

export interface IslandRunEnemy {
  id: string;
  type: 'zombie' | 'hostile_group' | 'boss';
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

export interface IslandRunGameState {
  id: string;
  teamId: string;
  phase: 'lobby' | 'dropping' | 'exploring' | 'combat' | 'extracting' | 'completed' | 'defeated';
  round: number;
  maxRounds: number;
  timer: number; // seconds remaining
  enemies: IslandRunEnemy[];
  artifacts: IslandArtifact[];
  discoveredArtifacts: string[];
  sonidoArtifactFound: boolean;
  teamHealth: number;
  totalTeamHealth: number;
  waveNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IslandRunRewards {
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

export interface IslandRunLobby {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  currentPlayers: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  status: 'waiting' | 'starting' | 'in_progress' | 'expired';
  players: IslandRunPlayer[];
  createdAt: Date;
  updatedAt?: Date;
  lastActivityAt?: Date;
  gameId?: string; // Reference to the active game
}







