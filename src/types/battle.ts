// Battle System Types for Nine Knowings MST

export interface Vault {
  id: string;
  ownerId: string;
  capacity: number;
  currentPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  firewall: number; // 0-100, chance to nullify vault attacks
  lastUpgrade: Date;
  debtStatus: boolean;
  debtAmount: number;
  lastDuesPaid: Date;
}

export interface Move {
  id: string;
  name: string;
  description: string;
  type: 'attack' | 'defense' | 'utility' | 'special';
  manifestType: string; // Which manifest this move is associated with
  elementalAffinity: string;
  cost: number; // PP cost
  damage?: number;
  healing?: number;
  shieldBoost?: number;
  debuffType?: 'vault_hack' | 'shield_break' | 'pp_drain' | 'move_lock';
  debuffStrength?: number;
  duration?: number; // How many turns the effect lasts
  cooldown: number; // Turns before can be used again
  currentCooldown: number;
  unlocked: boolean;
  masteryLevel: number; // 1-5, affects power
}

export interface ActionCard {
  id: string;
  name: string;
  description: string;
  type: 'attack' | 'defense' | 'utility';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  truthMetalCost: number;
  uses: number;
  maxUses: number;
  effect: {
    type: 'shield_breach' | 'pp_restore' | 'teleport_pp' | 'reverse_dues' | 'double_xp' | 'move_disrupt';
    strength: number;
    duration?: number;
  };
  imageUrl?: string;
  unlocked: boolean;
}

export interface BattleState {
  id: string;
  type: 'live' | 'vault_siege' | 'offline_move';
  status: 'preparing' | 'active' | 'completed' | 'cancelled';
  participants: BattleParticipant[];
  currentTurn: number;
  maxTurns?: number;
  timeLimit?: number; // For live battles
  startTime: Date;
  endTime?: Date;
  winner?: string;
  moves: BattleMove[];
  chat: BattleMessage[];
}

export interface BattleParticipant {
  userId: string;
  displayName: string;
  manifest: string;
  elementalAffinity: string;
  vault: Vault;
  moves: Move[];
  actionCards: ActionCard[];
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  buffs: Buff[];
  debuffs: Debuff[];
  isReady: boolean;
}

export interface BattleMove {
  id: string;
  battleId: string;
  userId: string;
  moveId: string;
  actionCardId?: string;
  targetUserId?: string;
  turnNumber: number;
  timestamp: Date;
  result: MoveResult;
}

export interface MoveResult {
  success: boolean;
  damage?: number;
  healing?: number;
  shieldDamage?: number;
  ppStolen?: number;
  buffsApplied?: Buff[];
  debuffsApplied?: Debuff[];
  message: string;
}

export interface Buff {
  id: string;
  type: 'shield_boost' | 'pp_regen' | 'damage_boost' | 'energy_regen';
  strength: number;
  duration: number;
  remainingTurns: number;
  source: string; // move or action card that applied it
}

export interface Debuff {
  id: string;
  type: 'shield_break' | 'pp_drain' | 'move_lock' | 'vulnerability';
  strength: number;
  duration: number;
  remainingTurns: number;
  source: string;
}

export interface BattleMessage {
  id: string;
  battleId: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: Date;
  type: 'chat' | 'taunt' | 'system';
}

export interface OfflineMove {
  id: string;
  userId: string;
  type: 'vault_attack' | 'shield_buff' | 'pp_trade' | 'mastery_challenge';
  targetUserId?: string;
  moveId?: string;
  actionCardId?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  resolvedAt?: Date;
  result?: any;
}

export interface BattleLobby {
  id: string;
  name: string;
  type: 'live' | 'vault_siege';
  hostId: string;
  hostName: string;
  participants: string[];
  maxParticipants: number;
  settings: {
    timeLimit?: number;
    maxTurns?: number;
    allowActionCards: boolean;
    allowSpectators: boolean;
  };
  status: 'waiting' | 'starting' | 'active' | 'completed';
  createdAt: Date;
  startTime?: Date;
}

// Battle Constants
export const BATTLE_CONSTANTS = {
  MAX_MOVES_PER_TURN: 3,
  MAX_ENERGY: 100,
  ENERGY_REGEN_PER_TURN: 20,
  BASE_HEALTH: 100,
  BASE_SHIELD_STRENGTH: 50,
  MAX_FIREWALL: 100,
  DEBT_VULNERABILITY_MULTIPLIER: 1.5,
  DAILY_OFFLINE_MOVES: 3,
  MOVE_SLOTS_BASE: 2,
  MOVE_SLOTS_MAX: 6,
  ASCENSION_LEVELS_FOR_SLOTS: [1, 3, 5, 7, 9], // Levels that unlock additional move slots
} as const;

// Move Templates
export const MOVE_TEMPLATES: Omit<Move, 'id' | 'unlocked' | 'currentCooldown' | 'masteryLevel'>[] = [
  {
    name: 'Manifest Strike',
    description: 'A basic attack using your manifest power',
    type: 'attack',
    manifestType: 'gaming',
    elementalAffinity: 'fire',
    cost: 10,
    damage: 15,
    cooldown: 0,
  },
  {
    name: 'Vault Hack',
    description: 'Attempt to steal PP from opponent\'s vault',
    type: 'attack',
    manifestType: 'gaming',
    elementalAffinity: 'fire',
    cost: 20,
    damage: 5,
    debuffType: 'vault_hack',
    debuffStrength: 10,
    cooldown: 3,
  },
  {
    name: 'Shield Boost',
    description: 'Increase your vault\'s shield strength',
    type: 'defense',
    manifestType: 'gaming',
    elementalAffinity: 'fire',
    cost: 15,
    shieldBoost: 20,
    cooldown: 2,
  },
  {
    name: 'Elemental Burst',
    description: 'Channel your elemental affinity for massive damage',
    type: 'special',
    manifestType: 'gaming',
    elementalAffinity: 'fire',
    cost: 50,
    damage: 40,
    cooldown: 5,
  },
];

// Action Card Templates
export const ACTION_CARD_TEMPLATES: Omit<ActionCard, 'id' | 'unlocked'>[] = [
  {
    name: 'Shield Breaker',
    description: 'Breach through enemy shields with devastating force',
    type: 'attack',
    rarity: 'common',
    truthMetalCost: 100,
    uses: 3,
    maxUses: 3,
    effect: {
      type: 'shield_breach',
      strength: 30,
    },
  },
  {
    name: 'PP Restore',
    description: 'Instantly restore PP to your vault',
    type: 'defense',
    rarity: 'common',
    truthMetalCost: 150,
    uses: 2,
    maxUses: 2,
    effect: {
      type: 'pp_restore',
      strength: 50,
    },
  },
  {
    name: 'Teleport PP',
    description: 'Instantly steal PP from opponent\'s vault',
    type: 'utility',
    rarity: 'rare',
    truthMetalCost: 300,
    uses: 1,
    maxUses: 1,
    effect: {
      type: 'teleport_pp',
      strength: 25,
    },
  },
  {
    name: 'Double XP',
    description: 'Double XP gained from this battle',
    type: 'utility',
    rarity: 'epic',
    truthMetalCost: 500,
    uses: 1,
    maxUses: 1,
    effect: {
      type: 'double_xp',
      strength: 2, // multiplier
    },
  },
]; 