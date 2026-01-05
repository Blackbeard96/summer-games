// Types for In Session Class Mode

export interface InSessionRoom {
  id: string;
  classId: string;
  className: string;
  teacherId: string; // Keep for backward compatibility
  hostUid: string; // UID of the host (admin who started session)
  status: 'open' | 'active' | 'closed' | 'live' | 'ended'; // 'live' and 'ended' are new
  mode?: 'in_session'; // Session mode
  players: InSessionPlayer[];
  activeLaws?: InSessionLaw[]; // Optional for backward compatibility
  battleLog?: string[]; // Battle log entries
  activeViewers?: string[]; // Array of user IDs currently viewing
  createdAt: Date | any; // Firestore Timestamp
  startedAt?: Date | any; // Firestore Timestamp
  endedAt?: Date | any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
}

export interface InSessionPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  health?: number; // Optional for backward compatibility
  maxHealth?: number; // Optional for backward compatibility
  shieldStrength?: number; // Optional for backward compatibility
  maxShieldStrength?: number; // Optional for backward compatibility
  powerPoints: number;
  participationCount: number; // Participation points earned
  movesEarned: number; // Moves available from participation
  eliminated?: boolean; // Whether player is eliminated
  isReady?: boolean; // Optional for backward compatibility
  isTeacher?: boolean; // Optional for backward compatibility
  equippedArtifacts?: any; // Optional for backward compatibility
  moves?: any[]; // Optional for backward compatibility
  actionCards?: any[]; // Optional for backward compatibility
  lawsCreated?: number; // Optional for backward compatibility
  battlesWon?: number; // Optional for backward compatibility
  battlesLost?: number; // Optional for backward compatibility
  activeLoadout?: any; // Session loadout snapshot (from inSessionSkillsService)
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







