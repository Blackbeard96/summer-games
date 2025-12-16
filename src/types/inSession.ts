// Types for In Session Class Mode

export interface InSessionRoom {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  status: 'open' | 'active' | 'closed';
  players: InSessionPlayer[];
  activeLaws: InSessionLaw[];
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface InSessionPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  health: number;
  maxHealth: number;
  shieldStrength: number;
  maxShieldStrength: number;
  powerPoints: number;
  isReady: boolean;
  isTeacher: boolean;
  equippedArtifacts: any;
  moves: any[];
  actionCards: any[];
  lawsCreated: number;
  battlesWon: number;
  battlesLost: number;
}

export interface InSessionLaw {
  id: string;
  createdBy: string;
  createdByName: string;
  title: string;
  description: string;
  effect: LawEffect;
  duration: number; // in seconds, -1 for permanent until removed
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  votes: {
    support: string[];
    oppose: string[];
  };
}

export interface LawEffect {
  type: 'damage_modifier' | 'move_restriction' | 'resource_modifier' | 'battle_rule' | 'custom';
  target: 'all_players' | 'specific_player' | 'team' | 'self';
  value: number;
  description: string;
  // Specific effect data based on type
  moveRestrictions?: string[]; // Move IDs that are restricted
  damageMultiplier?: number;
  ppCostModifier?: number;
  customRule?: string;
}

export interface InSessionBattle {
  id: string;
  roomId: string;
  attackerId: string;
  defenderId: string;
  status: 'pending' | 'active' | 'completed';
  winnerId?: string;
  startedAt?: Date;
  completedAt?: Date;
  moves: InSessionBattleMove[];
  lawsApplied: string[]; // Law IDs that affect this battle
}

export interface InSessionBattleMove {
  playerId: string;
  moveId: string;
  moveName: string;
  damage: number;
  timestamp: Date;
  lawsAffected: string[]; // Law IDs that modified this move
}

export interface InSessionRewards {
  xp: number;
  pp: number;
  lawsCreated: number;
  battlesWon: number;
  achievements?: string[];
}





