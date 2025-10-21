// Battle System Types for Nine Knowings MST

export interface Vault {
  id: string;
  ownerId: string;
  capacity: number;
  currentPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  overshield: number; // Additional shield from Shield artifact that absorbs next attack
  firewall: number; // 0-100, chance to nullify vault attacks
  lastUpgrade: Date;
  debtStatus: boolean;
  debtAmount: number;
  lastDuesPaid: Date;
  movesRemaining: number; // Daily moves remaining
  maxMovesPerDay: number; // Maximum moves per day
  lastMoveReset: Date; // When moves were last reset
}

export interface Move {
  id: string;
  name: string;
  description: string;
  category: 'manifest' | 'elemental' | 'system';
  type: 'attack' | 'defense' | 'utility' | 'support' | 'control' | 'mobility' | 'stealth' | 'reveal' | 'cleanse';
  elementalAffinity?: 'fire' | 'water' | 'air' | 'earth' | 'lightning' | 'light' | 'shadow' | 'metal';
  manifestType?: 'reading' | 'writing' | 'drawing' | 'athletics' | 'singing' | 'gaming' | 'observation' | 'empathy' | 'creating' | 'cooking';
  level: number; // 1-4 for elemental moves, 1-5 for others
  cost: number; // PP cost
  damage?: number;
  ppSteal?: number; // PP stolen from target
  healing?: number;
  shieldBoost?: number;
  debuffType?: 'burn' | 'soak' | 'shock' | 'root' | 'stun' | 'silence' | 'dread' | 'vault_hack' | 'shield_break' | 'pp_drain' | 'move_lock' | 'dodge' | 'accuracy' | 'confusion';
  debuffStrength?: number;
  buffType?: 'crit' | 'dodge' | 'fortify' | 'stealth' | 'accuracy' | 'speed' | 'immunity';
  buffStrength?: number;
  duration?: number; // How many turns the effect lasts
  cooldown: number; // Turns before can be used again
  currentCooldown: number;
  unlocked: boolean;
  masteryLevel: number; // 1-5, affects power
  targetType?: 'self' | 'single' | 'team' | 'enemy' | 'enemy_team' | 'all';
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
    type: 'shield_breach' | 'pp_restore' | 'teleport_pp' | 'reverse_dues' | 'double_xp' | 'move_disrupt' | 'shield_restore';
    strength: number;
    duration?: number;
  };
  imageUrl?: string;
  unlocked: boolean;
  masteryLevel: number; // 1-5, affects power
  upgradeCost: number; // PP cost to upgrade to next level
  nextLevelEffect?: {
    strength: number;
    duration?: number;
  };
}

export interface ManifestMilestone {
  id: string;
  manifestType: 'reading' | 'writing' | 'drawing' | 'athletics' | 'singing' | 'gaming' | 'observation' | 'empathy' | 'creating' | 'cooking';
  level: number; // 1-5, corresponds to move levels
  name: string;
  description: string;
  requirements: {
    level1MovesUsed: number; // Number of times Level 1 moves must be used
    masteryLevel: number; // Minimum mastery level required
    movesUnlocked: number; // Number of moves that must be unlocked
    battlesWon: number; // Number of battles won with this manifest
    ppEarned: number; // PP earned through this manifest's moves
  };
  rewards: {
    xp: number;
    pp: number;
    newMoveUnlocked: boolean;
    masteryBonus: number;
  };
  completed: boolean;
  completedAt?: Date;
}

export interface ElementalMilestone {
  id: string;
  elementalType: 'fire' | 'water' | 'air' | 'earth' | 'lightning' | 'light' | 'shadow' | 'metal';
  level: number; // 1-4, corresponds to elemental move levels
  name: string;
  description: string;
  requirements: {
    level1MovesUsed: number; // Number of times Level 1 elemental moves must be used
    masteryLevel: number; // Minimum mastery level required
    movesUnlocked: number; // Number of elemental moves that must be unlocked
    battlesWon: number; // Number of battles won with this element
    ppEarned: number; // PP earned through this element's moves
  };
  rewards: {
    xp: number;
    pp: number;
    newMoveUnlocked: boolean;
    masteryBonus: number;
  };
  completed: boolean;
  completedAt?: Date;
}

export interface PlayerManifestProgress {
  userId: string;
  manifestType: 'reading' | 'writing' | 'drawing' | 'athletics' | 'singing' | 'gaming' | 'observation' | 'empathy' | 'creating' | 'cooking';
  currentLevel: number;
  totalXp: number;
  masteryLevel: number;
  movesUnlocked: number;
  battlesWon: number;
  ppEarned: number;
  level1MovesUsed: number; // Track how many times Level 1 moves have been used
  milestones: ManifestMilestone[];
  lastUpdated: Date;
}

export interface PlayerElementalProgress {
  userId: string;
  elementalType: 'fire' | 'water' | 'air' | 'earth' | 'lightning' | 'light' | 'shadow' | 'metal';
  currentLevel: number;
  totalXp: number;
  masteryLevel: number;
  movesUnlocked: number;
  battlesWon: number;
  ppEarned: number;
  level1MovesUsed: number; // Track how many times Level 1 elemental moves have been used
  milestones: ElementalMilestone[];
  lastUpdated: Date;
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
  type: 'shield_boost' | 'pp_regen' | 'damage_boost' | 'energy_regen' | 'crit' | 'dodge' | 'fortify' | 'stealth' | 'accuracy' | 'speed' | 'immunity';
  strength: number;
  duration: number;
  remainingTurns: number;
  source: string; // move or action card that applied it
}

export interface Debuff {
  id: string;
  type: 'shield_break' | 'pp_drain' | 'move_lock' | 'vulnerability' | 'burn' | 'soak' | 'shock' | 'root' | 'stun' | 'silence' | 'dread' | 'vault_hack' | 'dodge' | 'accuracy' | 'confusion';
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
  type: 'vault_attack' | 'shield_buff' | 'pp_trade' | 'mastery_challenge' | 'move_restore';
  targetUserId?: string;
  moveId?: string;
  actionCardId?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  resolvedAt?: Date;
  result?: any;
}

export interface VaultSiegeAttack {
  id: string;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  moveId?: string;
  moveName?: string;
  actionCardId?: string;
  actionCardName?: string;
  damage: number;
  ppStolen: number;
  shieldDamage: number;
  message: string;
  timestamp: Date;
  targetVaultBefore: {
    currentPP: number;
    shieldStrength: number;
  };
  targetVaultAfter: {
    currentPP: number;
    shieldStrength: number;
  };
  // Track PP stolen for restoration purposes
  ppStolenFromTarget: number;
  ppStolenDate: Date;
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

// Move Templates - New Elemental System
export const MOVE_TEMPLATES: Omit<Move, 'id' | 'unlocked' | 'currentCooldown' | 'masteryLevel'>[] = [
  // Manifest Moves (Specific to each manifest)
  // Reading Manifest
  {
    name: 'Emotional Read',
    description: 'Read target\'s emotions to predict their next move',
    category: 'manifest',
    type: 'attack',
    manifestType: 'reading',
    level: 1,
    cost: 1,
    damage: 8,
    ppSteal: 0,
    debuffType: 'accuracy',
    debuffStrength: 20,
    duration: 2,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Pattern Shield',
    description: 'Create a barrier based on reading enemy patterns',
    category: 'manifest',
    type: 'defense',
    manifestType: 'reading',
    level: 1,
    cost: 1,
    shieldBoost: 15,
    ppSteal: 0,
    buffType: 'dodge',
    buffStrength: 25,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Writing Manifest
  {
    name: 'Reality Rewrite',
    description: 'Rewrite the battle narrative to your advantage',
    category: 'manifest',
    type: 'attack',
    manifestType: 'writing',
    level: 1,
    cost: 1,
    damage: 12,
    ppSteal: 0,
    debuffType: 'confusion',
    debuffStrength: 30,
    duration: 2,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Narrative Barrier',
    description: 'Create a protective story around yourself',
    category: 'manifest',
    type: 'defense',
    manifestType: 'writing',
    level: 1,
    cost: 1,
    shieldBoost: 18,
    ppSteal: 0,
    buffType: 'fortify',
    buffStrength: 20,
    duration: 3,
    cooldown: 4,
    targetType: 'self',
  },
  
  // Drawing Manifest
  {
    name: 'Illusion Strike',
    description: 'Attack through visual deception',
    category: 'manifest',
    type: 'attack',
    manifestType: 'drawing',
    level: 1,
    cost: 1,
    damage: 10,
    ppSteal: 0,
    debuffType: 'accuracy',
    debuffStrength: 35,
    duration: 2,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Mirage Shield',
    description: 'Create an illusory barrier that confuses attackers',
    category: 'manifest',
    type: 'defense',
    manifestType: 'drawing',
    level: 1,
    cost: 1,
    shieldBoost: 12,
    ppSteal: 0,
    buffType: 'stealth',
    buffStrength: 30,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Athletics Manifest
  {
    name: 'Flow Strike',
    description: 'A perfectly timed attack using movement mastery',
    category: 'manifest',
    type: 'attack',
    manifestType: 'athletics',
    level: 1,
    cost: 1,
    damage: 14,
    ppSteal: 0,
    buffType: 'speed',
    buffStrength: 25,
    duration: 1,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Rhythm Guard',
    description: 'Dance-like defensive stance that flows with attacks',
    category: 'manifest',
    type: 'defense',
    manifestType: 'athletics',
    level: 1,
    cost: 1,
    shieldBoost: 16,
    ppSteal: 0,
    buffType: 'dodge',
    buffStrength: 40,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Singing Manifest
  {
    name: 'Harmonic Blast',
    description: 'Attack using emotional resonance',
    category: 'manifest',
    type: 'attack',
    manifestType: 'singing',
    level: 1,
    cost: 1,
    damage: 11,
    ppSteal: 0,
    debuffType: 'silence',
    debuffStrength: 25,
    duration: 2,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Melody Shield',
    description: 'Create a protective barrier through song',
    category: 'manifest',
    type: 'defense',
    manifestType: 'singing',
    level: 1,
    cost: 1,
    shieldBoost: 14,
    ppSteal: 0,
    buffType: 'immunity',
    buffStrength: 20,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Gaming Manifest
  {
    name: 'Pattern Break',
    description: 'Exploit enemy patterns for maximum damage',
    category: 'manifest',
    type: 'attack',
    manifestType: 'gaming',
    level: 1,
    cost: 1,
    damage: 16,
    ppSteal: 8,
    debuffType: 'stun',
    debuffStrength: 15,
    duration: 1,
    cooldown: 4,
    targetType: 'single',
  },
  {
    name: 'Strategy Matrix',
    description: 'Create a defensive grid based on tactical analysis',
    category: 'manifest',
    type: 'defense',
    manifestType: 'gaming',
    level: 1,
    cost: 1,
    shieldBoost: 25,
    ppSteal: 0,
    buffType: 'accuracy',
    buffStrength: 30,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Observation Manifest
  {
    name: 'Precision Strike',
    description: 'Perfectly aimed attack using enhanced observation',
    category: 'manifest',
    type: 'attack',
    manifestType: 'observation',
    level: 1,
    cost: 1,
    damage: 13,
    ppSteal: 0,
    buffType: 'accuracy',
    buffStrength: 50,
    duration: 1,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Memory Shield',
    description: 'Create a barrier from remembered defensive patterns',
    category: 'manifest',
    type: 'defense',
    manifestType: 'observation',
    level: 1,
    cost: 1,
    shieldBoost: 17,
    ppSteal: 0,
    buffType: 'fortify',
    buffStrength: 25,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Empathy Manifest
  {
    name: 'Emotional Resonance',
    description: 'Attack by amplifying target\'s negative emotions',
    category: 'manifest',
    type: 'attack',
    manifestType: 'empathy',
    level: 1,
    cost: 1,
    damage: 9,
    ppSteal: 0,
    debuffType: 'dread',
    debuffStrength: 40,
    duration: 3,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Empathic Barrier',
    description: 'Create a shield that reflects emotional energy',
    category: 'manifest',
    type: 'defense',
    manifestType: 'empathy',
    level: 1,
    cost: 1,
    shieldBoost: 13,
    ppSteal: 0,
    buffType: 'immunity',
    buffStrength: 35,
    duration: 2,
    cooldown: 3,
    targetType: 'self',
  },
  
  // Creating Manifest
  {
    name: 'Tool Strike',
    description: 'Attack using instantly crafted weapons',
    category: 'manifest',
    type: 'attack',
    manifestType: 'creating',
    level: 1,
    cost: 1,
    damage: 15,
    ppSteal: 0,
    buffType: 'crit',
    buffStrength: 25,
    duration: 1,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Construct Shield',
    description: 'Build a protective barrier from available materials',
    category: 'manifest',
    type: 'defense',
    manifestType: 'creating',
    level: 1,
    cost: 1,
    shieldBoost: 22,
    ppSteal: 0,
    buffType: 'fortify',
    buffStrength: 30,
    duration: 3,
    cooldown: 4,
    targetType: 'self',
  },
  
  // Cooking Manifest
  {
    name: 'Energy Feast',
    description: 'Attack by manipulating energy through food',
    category: 'manifest',
    type: 'attack',
    manifestType: 'cooking',
    level: 1,
    cost: 1,
    damage: 12,
    ppSteal: 0,
    healing: 8,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Nourishing Barrier',
    description: 'Create a healing shield that restores health',
    category: 'manifest',
    type: 'defense',
    manifestType: 'cooking',
    level: 1,
    cost: 1,
    shieldBoost: 16,
    ppSteal: 0,
    healing: 12,
    cooldown: 4,
    targetType: 'self',
  },
  
  // Fire Elemental Moves
  {
    name: 'Ember Jab',
    description: 'Hit + Burn (small DoT) + PP steal',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'fire',
    level: 1,
    cost: 1,
    damage: 8,
    ppSteal: 7,
    debuffType: 'burn',
    debuffStrength: 3,
    duration: 2,
    cooldown: 1,
    targetType: 'single',
  },
  {
    name: 'Flame Dash',
    description: 'Gap-close; next attack +crit',
    category: 'elemental',
    type: 'mobility',
    elementalAffinity: 'fire',
    level: 2,
    cost: 1,
    ppSteal: 0,
    buffType: 'crit',
    buffStrength: 50,
    duration: 1,
    cooldown: 3,
    targetType: 'self',
  },
  {
    name: 'Wildfire',
    description: 'Spread Burn; enemies −shield regen',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'fire',
    level: 3,
    cost: 1,
    damage: 12,
    ppSteal: 0,
    debuffType: 'burn',
    debuffStrength: 5,
    duration: 3,
    cooldown: 4,
    targetType: 'enemy_team',
  },
  {
    name: 'Inferno Screen',
    description: 'Team +crit; Burn immunity 2 turns',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'fire',
    level: 4,
    cost: 1,
    ppSteal: 0,
    buffType: 'crit',
    buffStrength: 30,
    duration: 2,
    cooldown: 5,
    targetType: 'team',
  },
  
  // Water Elemental Moves
  {
    name: 'Ripple',
    description: 'Hit + Soak (−fire power)',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'water',
    level: 1,
    cost: 1,
    damage: 6,
    ppSteal: 0,
    debuffType: 'soak',
    debuffStrength: 25,
    duration: 2,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Tide Mend',
    description: 'Heal ally; cleanse 1',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'water',
    level: 2,
    cost: 1,
    ppSteal: 0,
    healing: 20,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Undertow',
    description: 'Delay target\'s next action (−1 move)',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'water',
    level: 3,
    cost: 1,
    ppSteal: 0,
    debuffType: 'move_lock',
    debuffStrength: 1,
    duration: 1,
    cooldown: 4,
    targetType: 'single',
  },
  {
    name: 'Mist Veil',
    description: 'Team dodge up; cloak vs scouting',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'water',
    level: 4,
    cost: 1,
    ppSteal: 0,
    buffType: 'dodge',
    buffStrength: 40,
    duration: 2,
    cooldown: 5,
    targetType: 'team',
  },
  
  // Air Elemental Moves
  {
    name: 'Gust',
    description: 'Displace (interrupt channel)',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'air',
    level: 1,
    cost: 1,
    ppSteal: 0,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Quickening',
    description: '+speed; next basic free',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'air',
    level: 2,
    cost: 1,
    ppSteal: 0,
    buffType: 'speed',
    buffStrength: 50,
    duration: 1,
    cooldown: 3,
    targetType: 'self',
  },
  {
    name: 'Crosswind',
    description: 'Push all enemies; cancel charging moves',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'air',
    level: 3,
    cost: 1,
    ppSteal: 0,
    cooldown: 4,
    targetType: 'enemy_team',
  },
  {
    name: 'Vacuum Seal',
    description: 'Silence 1–2 targets\' Elemental kit 1 turn',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'air',
    level: 4,
    cost: 1,
    ppSteal: 0,
    debuffType: 'silence',
    debuffStrength: 1,
    duration: 1,
    cooldown: 5,
    targetType: 'enemy_team',
  },
  
  // Earth Elemental Moves
  {
    name: 'Pebbleguard',
    description: 'Gain Fortify (−incoming)',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'earth',
    level: 1,
    cost: 1,
    ppSteal: 0,
    buffType: 'fortify',
    buffStrength: 20,
    duration: 2,
    cooldown: 2,
    targetType: 'self',
  },
  {
    name: 'Seismic Tap',
    description: 'Hit; apply Root if target moved last turn',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'earth',
    level: 2,
    cost: 1,
    damage: 10,
    ppSteal: 0,
    debuffType: 'root',
    debuffStrength: 1,
    duration: 1,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Bulwark',
    description: 'Shields to allies',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'earth',
    level: 3,
    cost: 1,
    ppSteal: 0,
    shieldBoost: 25,
    cooldown: 4,
    targetType: 'team',
  },
  {
    name: 'Bedrock Lock',
    description: 'Enemy team −dodge; your team +resist 2 turns',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'earth',
    level: 4,
    cost: 1,
    ppSteal: 0,
    debuffType: 'dodge',
    debuffStrength: -30,
    buffType: 'immunity',
    buffStrength: 50,
    duration: 2,
    cooldown: 5,
    targetType: 'all',
  },
  
  // Lightning Elemental Moves
  {
    name: 'Spark',
    description: 'Chance to Shock (fumble)',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'lightning',
    level: 1,
    cost: 1,
    damage: 8,
    ppSteal: 0,
    debuffType: 'shock',
    debuffStrength: 30,
    duration: 1,
    cooldown: 1,
    targetType: 'single',
  },
  {
    name: 'Overclock',
    description: 'Refund energy on next move',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'lightning',
    level: 2,
    cost: 1,
    ppSteal: 0,
    buffType: 'speed',
    buffStrength: 100,
    duration: 1,
    cooldown: 3,
    targetType: 'self',
  },
  {
    name: 'Arc Net',
    description: 'Multi-Shock—each target 30–40% fumble chance',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'lightning',
    level: 3,
    cost: 1,
    ppSteal: 0,
    debuffType: 'shock',
    debuffStrength: 35,
    duration: 2,
    cooldown: 4,
    targetType: 'enemy_team',
  },
  {
    name: 'Thunderbreak',
    description: 'Big burst; Shocked targets take bonus',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'lightning',
    level: 4,
    cost: 1,
    damage: 25,
    ppSteal: 0,
    cooldown: 5,
    targetType: 'enemy_team',
  },
  
  // Light Elemental Moves
  {
    name: 'Glint',
    description: 'Reveal 1 buff; +accuracy this turn',
    category: 'elemental',
    type: 'reveal',
    elementalAffinity: 'light',
    level: 1,
    cost: 1,
    ppSteal: 0,
    buffType: 'accuracy',
    buffStrength: 50,
    duration: 1,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Radiance',
    description: 'Cleanse ally; slight heal',
    category: 'elemental',
    type: 'cleanse',
    elementalAffinity: 'light',
    level: 2,
    cost: 1,
    ppSteal: 0,
    healing: 15,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Beacon',
    description: 'Team +accuracy; reveal hidden enemies',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'light',
    level: 3,
    cost: 1,
    ppSteal: 0,
    buffType: 'accuracy',
    buffStrength: 40,
    duration: 2,
    cooldown: 4,
    targetType: 'team',
  },
  {
    name: 'Solar Aegis',
    description: 'Barrier that converts % damage to healing',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'light',
    level: 4,
    cost: 1,
    ppSteal: 0,
    shieldBoost: 30,
    duration: 3,
    cooldown: 5,
    targetType: 'team',
  },
  
  // Shadow Elemental Moves
  {
    name: 'Veilstep',
    description: 'Hidden; next hit crits',
    category: 'elemental',
    type: 'stealth',
    elementalAffinity: 'shadow',
    level: 1,
    cost: 1,
    ppSteal: 0,
    buffType: 'stealth',
    buffStrength: 1,
    duration: 1,
    cooldown: 2,
    targetType: 'self',
  },
  {
    name: 'Dread Whisper',
    description: 'Apply Dread (−crit/−resolve)',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'shadow',
    level: 2,
    cost: 1,
    ppSteal: 0,
    debuffType: 'dread',
    debuffStrength: 25,
    duration: 2,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Umbral Chain',
    description: 'Stun 1 (breaks on heavy hit)',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'shadow',
    level: 3,
    cost: 1,
    ppSteal: 0,
    debuffType: 'stun',
    debuffStrength: 1,
    duration: 1,
    cooldown: 4,
    targetType: 'single',
  },
  {
    name: 'Blackout',
    description: 'Enemy accuracy down; hide your PP totals',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'shadow',
    level: 4,
    cost: 1,
    ppSteal: 0,
    debuffType: 'accuracy',
    debuffStrength: -40,
    duration: 2,
    cooldown: 5,
    targetType: 'enemy_team',
  },
  
  // Metal (Truth) Elemental Moves
  {
    name: 'Truth Edge',
    description: 'Damage + expose 1 passive',
    category: 'elemental',
    type: 'attack',
    elementalAffinity: 'metal',
    level: 1,
    cost: 1,
    damage: 10,
    ppSteal: 0,
    cooldown: 2,
    targetType: 'single',
  },
  {
    name: 'Refraction',
    description: 'Copy the last used move (weaker)',
    category: 'elemental',
    type: 'utility',
    elementalAffinity: 'metal',
    level: 2,
    cost: 1,
    ppSteal: 0,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Integrity Field',
    description: 'Immunity to taunt/deception',
    category: 'elemental',
    type: 'support',
    elementalAffinity: 'metal',
    level: 3,
    cost: 1,
    ppSteal: 0,
    buffType: 'immunity',
    buffStrength: 100,
    duration: 2,
    cooldown: 4,
    targetType: 'team',
  },
  {
    name: 'Truth Lock',
    description: 'Target cannot use System moves 1–2 turns',
    category: 'elemental',
    type: 'control',
    elementalAffinity: 'metal',
    level: 4,
    cost: 1,
    ppSteal: 0,
    debuffType: 'move_lock',
    debuffStrength: 2,
    duration: 2,
    cooldown: 5,
    targetType: 'single',
  },
  
  // System Moves
  {
    name: 'Vault Hack',
    description: 'Attempt to steal PP from opponent\'s vault',
    category: 'system',
    type: 'attack',
    level: 1,
    cost: 1,
    damage: 5,
    ppSteal: 8,
    debuffType: 'vault_hack',
    debuffStrength: 10,
    cooldown: 3,
    targetType: 'single',
  },
  {
    name: 'Shield Restoration',
    description: 'Restore vault shields',
    category: 'system',
    type: 'support',
    level: 1,
    cost: 1,
    ppSteal: 0,
    shieldBoost: 20,
    cooldown: 2,
    targetType: 'self',
  },
];

// Move damage values (combined shield damage + PP steal)
export const MOVE_DAMAGE_VALUES: Record<string, { damage: number }> = {
  // Manifest Moves (Reading)
  'Emotional Read': { damage: 13 }, // 8 + 5
  'Pattern Shield': { damage: 0 },
  
  // Manifest Moves (Writing)
  'Reality Rewrite': { damage: 12 }, // 12 + 0
  'Narrative Barrier': { damage: 0 },
  
  // Manifest Moves (Drawing)
  'Illusion Strike': { damage: 10 }, // 10 + 0
  'Mirage Shield': { damage: 0 },
  
  // Manifest Moves (Athletics)
  'Flow Strike': { damage: 14 }, // 14 + 0
  'Rhythm Guard': { damage: 0 },
  
  // Manifest Moves (Singing)
  'Harmonic Blast': { damage: 11 }, // 11 + 0
  'Melody Shield': { damage: 0 },
  
  // Manifest Moves (Gaming)
  'Pattern Break': { damage: 24 }, // 16 + 8
  'Strategy Matrix': { damage: 0 },
  
  // Manifest Moves (Observation)
  'Precision Strike': { damage: 13 }, // 13 + 0
  'Memory Shield': { damage: 0 },
  
  // Manifest Moves (Empathy)
  'Emotional Resonance': { damage: 9 }, // 9 + 0
  'Empathic Barrier': { damage: 0 },
  
  // Manifest Moves (Creating)
  'Tool Strike': { damage: 15 }, // 15 + 0
  'Construct Shield': { damage: 0 },
  
  // Manifest Moves (Cooking)
  'Energy Feast': { damage: 12 }, // 12 + 0
  'Nourishing Barrier': { damage: 0 },
  
  // Fire Elemental Moves
  'Ember Jab': { damage: 15 }, // 8 + 7
  'Flame Dash': { damage: 0 },
  'Wildfire': { damage: 8 }, // 8 + 0
  'Inferno Screen': { damage: 0 },
  
  // Water Elemental Moves
  'Ripple': { damage: 4 }, // 4 + 0
  'Tide Mend': { damage: 0 },
  'Undertow': { damage: 0 },
  'Mist Veil': { damage: 0 },
  
  // Air Elemental Moves
  'Gust': { damage: 0 },
  'Quickening': { damage: 0 },
  'Crosswind': { damage: 0 },
  'Vacuum Seal': { damage: 0 },
  
  // Earth Elemental Moves
  'Pebbleguard': { damage: 0 },
  'Seismic Tap': { damage: 7 }, // 7 + 0
  'Bulwark': { damage: 0 },
  'Bedrock Lock': { damage: 0 },
  
  // Lightning Elemental Moves
  'Spark': { damage: 5 }, // 5 + 0
  'Overclock': { damage: 0 },
  'Arc Net': { damage: 0 },
  'Thunderbreak': { damage: 18 }, // 18 + 0
  
  // Light Elemental Moves
  'Glint': { damage: 0 },
  'Radiance': { damage: 0 },
  'Beacon': { damage: 0 },
  'Solar Aegis': { damage: 0 },
  
  // Shadow Elemental Moves
  'Veilstep': { damage: 0 },
  'Dread Whisper': { damage: 0 },
  'Umbral Chain': { damage: 0 },
  'Blackout': { damage: 0 },
  
  // Metal Elemental Moves
  'Truth Edge': { damage: 8 }, // 8 + 0
  'Refraction': { damage: 0 },
  'Integrity Field': { damage: 0 },
  'Truth Lock': { damage: 0 },
  
  // System Moves
  'Vault Hack': { damage: 13 }, // 5 + 8
  'Shield Restoration': { damage: 0 },
};

// Action card damage values (combined shield damage + PP steal)
export const ACTION_CARD_DAMAGE_VALUES: Record<string, { damage: number | { min: number; max: number } }> = {
  'Shield Breaker': { damage: { min: 18, max: 26 } }, // 22 ± 4
  'Shield Restore': { damage: 0 }, // Self-heal
  'Teleport PP': { damage: { min: 20, max: 30 } }, // 25 ± 5
  'Double XP': { damage: 0 }, // Utility
};

// PP Range for each move (for display purposes)
export const MOVE_PP_RANGES: Record<string, { min: number; max: number }> = {
  'Manifest Strike': { min: 3, max: 7 },
  'Vault Hack': { min: 5, max: 10 },
  'Shield Boost': { min: 0, max: 0 }, // No PP gain for defensive moves
  'Elemental Burst': { min: 8, max: 15 },
};

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
      strength: 22, // Average of 15-30 range
    },
    masteryLevel: 1,
    upgradeCost: 100,
    nextLevelEffect: {
      strength: 30,
    },
  },
  {
    name: 'Shield Restore',
    description: 'Instantly restore 10 points to your shield',
    type: 'defense',
    rarity: 'common',
    truthMetalCost: 150,
    uses: 2,
    maxUses: 2,
    effect: {
      type: 'shield_restore',
      strength: 10,
    },
    masteryLevel: 1,
    upgradeCost: 100,
    nextLevelEffect: {
      strength: 15,
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
    masteryLevel: 1,
    upgradeCost: 150,
    nextLevelEffect: {
      strength: 35,
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
    masteryLevel: 1,
    upgradeCost: 200,
    nextLevelEffect: {
      strength: 3, // triple XP
    },
  },
]; 

// Elemental Milestone Templates
export const ELEMENTAL_MILESTONE_TEMPLATES: Record<string, ElementalMilestone[]> = {
  fire: [
    {
      id: 'fire_1',
      elementalType: 'fire',
      level: 1,
      name: 'Flame Initiate',
      description: 'Master the basics of fire manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'fire_2',
      elementalType: 'fire',
      level: 2,
      name: 'Blaze Master',
      description: 'Unlock advanced fire techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'fire_3',
      elementalType: 'fire',
      level: 3,
      name: 'Inferno Lord',
      description: 'Achieve mastery in fire warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  water: [
    {
      id: 'water_1',
      elementalType: 'water',
      level: 1,
      name: 'Wave Initiate',
      description: 'Master the basics of water manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'water_2',
      elementalType: 'water',
      level: 2,
      name: 'Tide Master',
      description: 'Unlock advanced water techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'water_3',
      elementalType: 'water',
      level: 3,
      name: 'Ocean Lord',
      description: 'Achieve mastery in water warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  air: [
    {
      id: 'air_1',
      elementalType: 'air',
      level: 1,
      name: 'Breeze Initiate',
      description: 'Master the basics of air manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'air_2',
      elementalType: 'air',
      level: 2,
      name: 'Wind Master',
      description: 'Unlock advanced air techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'air_3',
      elementalType: 'air',
      level: 3,
      name: 'Storm Lord',
      description: 'Achieve mastery in air warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  earth: [
    {
      id: 'earth_1',
      elementalType: 'earth',
      level: 1,
      name: 'Stone Initiate',
      description: 'Master the basics of earth manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'earth_2',
      elementalType: 'earth',
      level: 2,
      name: 'Mountain Master',
      description: 'Unlock advanced earth techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'earth_3',
      elementalType: 'earth',
      level: 3,
      name: 'Tectonic Lord',
      description: 'Achieve mastery in earth warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  lightning: [
    {
      id: 'lightning_1',
      elementalType: 'lightning',
      level: 1,
      name: 'Spark Initiate',
      description: 'Master the basics of lightning manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'lightning_2',
      elementalType: 'lightning',
      level: 2,
      name: 'Thunder Master',
      description: 'Unlock advanced lightning techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'lightning_3',
      elementalType: 'lightning',
      level: 3,
      name: 'Storm Lord',
      description: 'Achieve mastery in lightning warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  light: [
    {
      id: 'light_1',
      elementalType: 'light',
      level: 1,
      name: 'Glow Initiate',
      description: 'Master the basics of light manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'light_2',
      elementalType: 'light',
      level: 2,
      name: 'Radiance Master',
      description: 'Unlock advanced light techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'light_3',
      elementalType: 'light',
      level: 3,
      name: 'Solar Lord',
      description: 'Achieve mastery in light warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  shadow: [
    {
      id: 'shadow_1',
      elementalType: 'shadow',
      level: 1,
      name: 'Shade Initiate',
      description: 'Master the basics of shadow manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'shadow_2',
      elementalType: 'shadow',
      level: 2,
      name: 'Umbral Master',
      description: 'Unlock advanced shadow techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'shadow_3',
      elementalType: 'shadow',
      level: 3,
      name: 'Void Lord',
      description: 'Achieve mastery in shadow warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  metal: [
    {
      id: 'metal_1',
      elementalType: 'metal',
      level: 1,
      name: 'Iron Initiate',
      description: 'Master the basics of metal manipulation',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'metal_2',
      elementalType: 'metal',
      level: 2,
      name: 'Steel Master',
      description: 'Unlock advanced metal techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'metal_3',
      elementalType: 'metal',
      level: 3,
      name: 'Truth Lord',
      description: 'Achieve mastery in metal warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ]
}; 

// Move Upgrade Templates - Defines how moves scale with levels 1-4
export const MOVE_UPGRADE_TEMPLATES: Record<string, {
  level1: { damage?: number; ppSteal?: number; debuffStrength?: number; buffStrength?: number; shieldBoost?: number; healing?: number };
  level2: { damage?: number; ppSteal?: number; debuffStrength?: number; buffStrength?: number; shieldBoost?: number; healing?: number };
  level3: { damage?: number; ppSteal?: number; debuffStrength?: number; buffStrength?: number; shieldBoost?: number; healing?: number };
  level4: { damage?: number; ppSteal?: number; debuffStrength?: number; buffStrength?: number; shieldBoost?: number; healing?: number };
}> = {
  // Manifest Moves (Reading)
  'Emotional Read': {
    level1: { damage: 8, ppSteal: 0, debuffStrength: 20 },
    level2: { damage: 12, ppSteal: 3, debuffStrength: 30 },
    level3: { damage: 16, ppSteal: 6, debuffStrength: 40 },
    level4: { damage: 20, ppSteal: 10, debuffStrength: 50 }
  },
  'Pattern Shield': {
    level1: { shieldBoost: 15, buffStrength: 25 },
    level2: { shieldBoost: 22, buffStrength: 35 },
    level3: { shieldBoost: 30, buffStrength: 45 },
    level4: { shieldBoost: 40, buffStrength: 60 }
  },
  
  // Manifest Moves (Writing)
  'Reality Rewrite': {
    level1: { damage: 12, ppSteal: 0, debuffStrength: 30 },
    level2: { damage: 18, ppSteal: 5, debuffStrength: 45 },
    level3: { damage: 24, ppSteal: 10, debuffStrength: 60 },
    level4: { damage: 32, ppSteal: 15, debuffStrength: 80 }
  },
  'Narrative Barrier': {
    level1: { shieldBoost: 18, buffStrength: 20 },
    level2: { shieldBoost: 26, buffStrength: 30 },
    level3: { shieldBoost: 35, buffStrength: 40 },
    level4: { shieldBoost: 45, buffStrength: 55 }
  },
  
  // Manifest Moves (Drawing)
  'Illusion Strike': {
    level1: { damage: 10, ppSteal: 0, debuffStrength: 35 },
    level2: { damage: 15, ppSteal: 4, debuffStrength: 50 },
    level3: { damage: 20, ppSteal: 8, debuffStrength: 65 },
    level4: { damage: 26, ppSteal: 12, debuffStrength: 85 }
  },
  'Mirage Shield': {
    level1: { shieldBoost: 12, buffStrength: 30 },
    level2: { shieldBoost: 18, buffStrength: 40 },
    level3: { shieldBoost: 25, buffStrength: 50 },
    level4: { shieldBoost: 35, buffStrength: 65 }
  },
  
  // Manifest Moves (Athletics)
  'Flow Strike': {
    level1: { damage: 14, ppSteal: 0, buffStrength: 25 },
    level2: { damage: 20, ppSteal: 5, buffStrength: 35 },
    level3: { damage: 26, ppSteal: 10, buffStrength: 45 },
    level4: { damage: 34, ppSteal: 15, buffStrength: 60 }
  },
  'Rhythm Guard': {
    level1: { shieldBoost: 16, buffStrength: 40 },
    level2: { shieldBoost: 24, buffStrength: 50 },
    level3: { shieldBoost: 32, buffStrength: 60 },
    level4: { shieldBoost: 42, buffStrength: 75 }
  },
  
  // Manifest Moves (Singing)
  'Harmonic Blast': {
    level1: { damage: 11, ppSteal: 0, debuffStrength: 25 },
    level2: { damage: 16, ppSteal: 4, debuffStrength: 35 },
    level3: { damage: 21, ppSteal: 8, debuffStrength: 45 },
    level4: { damage: 28, ppSteal: 12, debuffStrength: 60 }
  },
  'Melody Shield': {
    level1: { shieldBoost: 14, buffStrength: 20 },
    level2: { shieldBoost: 21, buffStrength: 30 },
    level3: { shieldBoost: 28, buffStrength: 40 },
    level4: { shieldBoost: 38, buffStrength: 55 }
  },
  
  // Manifest Moves (Gaming)
  'Pattern Break': {
    level1: { damage: 16, ppSteal: 8, debuffStrength: 15 },
    level2: { damage: 22, ppSteal: 12, debuffStrength: 25 },
    level3: { damage: 28, ppSteal: 16, debuffStrength: 35 },
    level4: { damage: 36, ppSteal: 20, debuffStrength: 50 }
  },
  'Strategy Matrix': {
    level1: { shieldBoost: 25, buffStrength: 30 },
    level2: { shieldBoost: 35, buffStrength: 40 },
    level3: { shieldBoost: 45, buffStrength: 50 },
    level4: { shieldBoost: 60, buffStrength: 65 }
  },
  
  // Manifest Moves (Observation)
  'Precision Strike': {
    level1: { damage: 13, ppSteal: 0, buffStrength: 50 },
    level2: { damage: 19, ppSteal: 5, buffStrength: 60 },
    level3: { damage: 25, ppSteal: 10, buffStrength: 70 },
    level4: { damage: 33, ppSteal: 15, buffStrength: 85 }
  },
  'Memory Shield': {
    level1: { shieldBoost: 17, buffStrength: 25 },
    level2: { shieldBoost: 25, buffStrength: 35 },
    level3: { shieldBoost: 33, buffStrength: 45 },
    level4: { shieldBoost: 43, buffStrength: 60 }
  },
  
  // Manifest Moves (Empathy)
  'Emotional Resonance': {
    level1: { damage: 9, ppSteal: 0, debuffStrength: 40 },
    level2: { damage: 14, ppSteal: 4, debuffStrength: 55 },
    level3: { damage: 19, ppSteal: 8, debuffStrength: 70 },
    level4: { damage: 25, ppSteal: 12, debuffStrength: 90 }
  },
  'Empathic Barrier': {
    level1: { shieldBoost: 13, buffStrength: 35 },
    level2: { shieldBoost: 20, buffStrength: 45 },
    level3: { shieldBoost: 27, buffStrength: 55 },
    level4: { shieldBoost: 37, buffStrength: 70 }
  },
  
  // Manifest Moves (Creating)
  'Tool Strike': {
    level1: { damage: 15, ppSteal: 0, buffStrength: 25 },
    level2: { damage: 21, ppSteal: 5, buffStrength: 35 },
    level3: { damage: 27, ppSteal: 10, buffStrength: 45 },
    level4: { damage: 35, ppSteal: 15, buffStrength: 60 }
  },
  'Construct Shield': {
    level1: { shieldBoost: 22, buffStrength: 30 },
    level2: { shieldBoost: 30, buffStrength: 40 },
    level3: { shieldBoost: 38, buffStrength: 50 },
    level4: { shieldBoost: 48, buffStrength: 65 }
  },
  
  // Manifest Moves (Cooking)
  'Energy Feast': {
    level1: { damage: 12, ppSteal: 0, healing: 8 },
    level2: { damage: 18, ppSteal: 4, healing: 12 },
    level3: { damage: 24, ppSteal: 8, healing: 16 },
    level4: { damage: 32, ppSteal: 12, healing: 20 }
  },
  'Nourishing Barrier': {
    level1: { shieldBoost: 16, healing: 12 },
    level2: { shieldBoost: 24, healing: 18 },
    level3: { shieldBoost: 32, healing: 24 },
    level4: { shieldBoost: 42, healing: 30 }
  },
  
  // Fire Elemental Moves
  'Ember Jab': {
    level1: { damage: 8, ppSteal: 7, debuffStrength: 3 },
    level2: { damage: 12, ppSteal: 10, debuffStrength: 5 },
    level3: { damage: 16, ppSteal: 13, debuffStrength: 7 },
    level4: { damage: 20, ppSteal: 16, debuffStrength: 10 }
  },
  'Flame Dash': {
    level1: { buffStrength: 50 },
    level2: { buffStrength: 60 },
    level3: { buffStrength: 70 },
    level4: { buffStrength: 85 }
  },
  'Wildfire': {
    level1: { damage: 12, ppSteal: 0, debuffStrength: 5 },
    level2: { damage: 18, ppSteal: 5, debuffStrength: 8 },
    level3: { damage: 24, ppSteal: 10, debuffStrength: 11 },
    level4: { damage: 30, ppSteal: 15, debuffStrength: 15 }
  },
  'Inferno Screen': {
    level1: { buffStrength: 30 },
    level2: { buffStrength: 40 },
    level3: { buffStrength: 50 },
    level4: { buffStrength: 65 }
  },
  
  // Water Elemental Moves
  'Ripple': {
    level1: { damage: 6, ppSteal: 0, debuffStrength: 25 },
    level2: { damage: 9, ppSteal: 3, debuffStrength: 35 },
    level3: { damage: 12, ppSteal: 6, debuffStrength: 45 },
    level4: { damage: 16, ppSteal: 9, debuffStrength: 60 }
  },
  'Tide Mend': {
    level1: { healing: 20 },
    level2: { healing: 28 },
    level3: { healing: 36 },
    level4: { healing: 45 }
  },
  'Undertow': {
    level1: { debuffStrength: 1 },
    level2: { debuffStrength: 1 },
    level3: { debuffStrength: 2 },
    level4: { debuffStrength: 2 }
  },
  'Mist Veil': {
    level1: { buffStrength: 40 },
    level2: { buffStrength: 50 },
    level3: { buffStrength: 60 },
    level4: { buffStrength: 75 }
  },
  
  // Air Elemental Moves
  'Gust': {
    level1: {},
    level2: {},
    level3: {},
    level4: {}
  },
  'Quickening': {
    level1: { buffStrength: 50 },
    level2: { buffStrength: 60 },
    level3: { buffStrength: 70 },
    level4: { buffStrength: 85 }
  },
  'Crosswind': {
    level1: {},
    level2: {},
    level3: {},
    level4: {}
  },
  'Vacuum Seal': {
    level1: { debuffStrength: 1 },
    level2: { debuffStrength: 1 },
    level3: { debuffStrength: 2 },
    level4: { debuffStrength: 2 }
  },
  
  // Earth Elemental Moves
  'Pebbleguard': {
    level1: { buffStrength: 20 },
    level2: { buffStrength: 30 },
    level3: { buffStrength: 40 },
    level4: { buffStrength: 55 }
  },
  'Seismic Tap': {
    level1: { damage: 10, ppSteal: 0, debuffStrength: 1 },
    level2: { damage: 15, ppSteal: 4, debuffStrength: 1 },
    level3: { damage: 20, ppSteal: 8, debuffStrength: 2 },
    level4: { damage: 26, ppSteal: 12, debuffStrength: 2 }
  },
  'Bulwark': {
    level1: { shieldBoost: 25 },
    level2: { shieldBoost: 35 },
    level3: { shieldBoost: 45 },
    level4: { shieldBoost: 60 }
  },
  'Bedrock Lock': {
    level1: { debuffStrength: -30, buffStrength: 50 },
    level2: { debuffStrength: -35, buffStrength: 60 },
    level3: { debuffStrength: -40, buffStrength: 70 },
    level4: { debuffStrength: -45, buffStrength: 85 }
  },
  
  // Lightning Elemental Moves
  'Spark': {
    level1: { damage: 8, ppSteal: 0, debuffStrength: 30 },
    level2: { damage: 12, ppSteal: 4, debuffStrength: 40 },
    level3: { damage: 16, ppSteal: 8, debuffStrength: 50 },
    level4: { damage: 20, ppSteal: 12, debuffStrength: 65 }
  },
  'Overclock': {
    level1: { buffStrength: 100 },
    level2: { buffStrength: 120 },
    level3: { buffStrength: 140 },
    level4: { buffStrength: 170 }
  },
  'Arc Net': {
    level1: { debuffStrength: 35 },
    level2: { debuffStrength: 45 },
    level3: { debuffStrength: 55 },
    level4: { debuffStrength: 70 }
  },
  'Thunderbreak': {
    level1: { damage: 25, ppSteal: 0 },
    level2: { damage: 35, ppSteal: 8 },
    level3: { damage: 45, ppSteal: 16 },
    level4: { damage: 55, ppSteal: 24 }
  },
  
  // Light Elemental Moves
  'Glint': {
    level1: { buffStrength: 50 },
    level2: { buffStrength: 60 },
    level3: { buffStrength: 70 },
    level4: { buffStrength: 85 }
  },
  'Radiance': {
    level1: { healing: 15 },
    level2: { healing: 22 },
    level3: { healing: 29 },
    level4: { healing: 37 }
  },
  'Beacon': {
    level1: { buffStrength: 40 },
    level2: { buffStrength: 50 },
    level3: { buffStrength: 60 },
    level4: { buffStrength: 75 }
  },
  'Solar Aegis': {
    level1: { shieldBoost: 30 },
    level2: { shieldBoost: 40 },
    level3: { shieldBoost: 50 },
    level4: { shieldBoost: 65 }
  },
  
  // Shadow Elemental Moves
  'Veilstep': {
    level1: { buffStrength: 1 },
    level2: { buffStrength: 1 },
    level3: { buffStrength: 2 },
    level4: { buffStrength: 2 }
  },
  'Dread Whisper': {
    level1: { debuffStrength: 25 },
    level2: { debuffStrength: 35 },
    level3: { debuffStrength: 45 },
    level4: { debuffStrength: 60 }
  },
  'Umbral Chain': {
    level1: { debuffStrength: 1 },
    level2: { debuffStrength: 1 },
    level3: { debuffStrength: 2 },
    level4: { debuffStrength: 2 }
  },
  'Blackout': {
    level1: { debuffStrength: -40 },
    level2: { debuffStrength: -45 },
    level3: { debuffStrength: -50 },
    level4: { debuffStrength: -60 }
  },
  
  // Metal Elemental Moves
  'Truth Edge': {
    level1: { damage: 10, ppSteal: 0 },
    level2: { damage: 15, ppSteal: 5 },
    level3: { damage: 20, ppSteal: 10 },
    level4: { damage: 26, ppSteal: 15 }
  },
  'Refraction': {
    level1: {},
    level2: {},
    level3: {},
    level4: {}
  },
  'Integrity Field': {
    level1: { buffStrength: 100 },
    level2: { buffStrength: 100 },
    level3: { buffStrength: 100 },
    level4: { buffStrength: 100 }
  },
  'Truth Lock': {
    level1: { debuffStrength: 2 },
    level2: { debuffStrength: 2 },
    level3: { debuffStrength: 3 },
    level4: { debuffStrength: 3 }
  },
  
  // System Moves
  'Vault Hack': {
    level1: { damage: 5, ppSteal: 8, debuffStrength: 10 },
    level2: { damage: 8, ppSteal: 12, debuffStrength: 15 },
    level3: { damage: 11, ppSteal: 16, debuffStrength: 20 },
    level4: { damage: 14, ppSteal: 20, debuffStrength: 25 }
  },
  'Shield Restoration': {
    level1: { shieldBoost: 20 },
    level2: { shieldBoost: 28 },
    level3: { shieldBoost: 36 },
    level4: { shieldBoost: 45 }
  }
}; 

// Manifest Milestone Templates
export const MANIFEST_MILESTONE_TEMPLATES: Record<string, ManifestMilestone[]> = {
  reading: [
    {
      id: 'reading_1',
      manifestType: 'reading',
      level: 1,
      name: 'Novice Reader',
      description: 'Master the basics of emotional reading',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'reading_2',
      manifestType: 'reading',
      level: 2,
      name: 'Emotional Scholar',
      description: 'Unlock advanced reading techniques',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'reading_3',
      manifestType: 'reading',
      level: 3,
      name: 'Mind Reader',
      description: 'Achieve mastery in psychological warfare',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  writing: [
    {
      id: 'writing_1',
      manifestType: 'writing',
      level: 1,
      name: 'Story Weaver',
      description: 'Begin crafting narrative reality',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'writing_2',
      manifestType: 'writing',
      level: 2,
      name: 'Reality Author',
      description: 'Manipulate the fabric of battle',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'writing_3',
      manifestType: 'writing',
      level: 3,
      name: 'Narrative Master',
      description: 'Become the architect of victory',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ],
  gaming: [
    {
      id: 'gaming_1',
      manifestType: 'gaming',
      level: 1,
      name: 'Strategy Novice',
      description: 'Learn the fundamentals of tactical thinking',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 1,
        movesUnlocked: 1,
        battlesWon: 0,
        ppEarned: 0
      },
      rewards: {
        xp: 50,
        pp: 25,
        newMoveUnlocked: true,
        masteryBonus: 1
      },
      completed: false
    },
    {
      id: 'gaming_2',
      manifestType: 'gaming',
      level: 2,
      name: 'Tactical Expert',
      description: 'Master advanced strategic maneuvers',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 2,
        movesUnlocked: 2,
        battlesWon: 3,
        ppEarned: 100
      },
      rewards: {
        xp: 100,
        pp: 50,
        newMoveUnlocked: true,
        masteryBonus: 2
      },
      completed: false
    },
    {
      id: 'gaming_3',
      manifestType: 'gaming',
      level: 3,
      name: 'Strategic Grandmaster',
      description: 'Achieve ultimate tactical supremacy',
      requirements: {
        level1MovesUsed: 9,
        masteryLevel: 3,
        movesUnlocked: 3,
        battlesWon: 7,
        ppEarned: 250
      },
      rewards: {
        xp: 200,
        pp: 100,
        newMoveUnlocked: true,
        masteryBonus: 3
      },
      completed: false
    }
  ]
  // Add other manifest types as needed...
};