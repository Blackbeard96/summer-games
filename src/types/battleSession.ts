import { Timestamp } from 'firebase/firestore';

/**
 * Battle Session Types
 * 
 * This file defines the Firestore structure for shared battle sessions.
 * All participants subscribe to the same battleSessions/{battleId} document
 * to see the same battle state in real-time.
 */

export type BattleStatus = 'lobby' | 'active' | 'complete' | 'defeated';
export type BattleMode = 'squadUp' | 'islandRaid' | 'pvp' | 'inSession';

export interface BattleParticipant {
  uid: string;
  displayName: string;
  joinedAt: Timestamp;
  isReady: boolean;
  connected: boolean;
  photoURL?: string;
  level?: number;
}

export interface BattleCombatant {
  id: string;
  name: string;
  currentPP: number;
  maxPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  level: number;
  currentVaultHealth?: number;
  maxVaultHealth?: number;
  isPlayer?: boolean;
  avatar?: string;
  photoURL?: string; // Add photoURL for compatibility
  image?: string;
  type?: string;
  damage?: number;
  position?: { x: number; y: number };
  spawnTime?: Date;
  waveNumber?: number;
}

export interface PendingMove {
  participantId: string;
  moveId: string;
  moveName: string;
  targetId: string;
  submittedAt: Timestamp;
}

export interface BattleLogEntry {
  timestamp: Timestamp;
  text: string;
  actorId?: string;
  moveName?: string;
  type?: 'attack' | 'heal' | 'shield' | 'system' | 'info';
}

export interface TurnResolutionLock {
  lockedBy: string; // uid of the host resolving
  lockedAt: Timestamp;
  turnNumber: number;
}

export interface BattleSession {
  battleId: string;
  status: BattleStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  hostId: string; // uid of the host
  
  // Participants
  participants: BattleParticipant[];
  
  // Combatants
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
  
  // Battle configuration
  mode: BattleMode;
  wave: number;
  maxWaves?: number;
  difficulty?: 'easy' | 'normal' | 'hard' | 'nightmare';
  
  // Chapter/Challenge info (for SquadUp)
  chapterId?: number;
  chapterName?: string;
  challengeId?: string;
  challengeName?: string;
  challengeNumber?: number;
  
  // Turn management
  currentTurnIndex?: number;
  turnQueue?: Array<{
    participantId: string;
    orderScore: number;
    speed: number;
    random: number;
    priority: number;
  }>;
  pendingMoves: { [participantId: string]: PendingMove };
  turnResolutionLock?: TurnResolutionLock;
  
  // Battle state
  battleLog: BattleLogEntry[];
  phase: 'selection' | 'execution' | 'opponent_turn' | 'victory' | 'defeat';
  turnCount: number;
  
  // Enemy AI moves (host selects these)
  enemyMoves?: { [enemyId: string]: PendingMove };
  
  // RNG seed for determinism (optional)
  rngSeed?: number;
  
  // Custom waves (for multi-wave battles)
  customWaves?: { [waveNumber: string]: BattleCombatant[] };
}

