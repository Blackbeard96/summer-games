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
  type: 'vault_attack' | 'shield_buff' | 'pp_trade' | 'mastery_challenge';
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
    cost: 0,
    damage: 8,
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
    cost: 0,
    shieldBoost: 15,
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
    cost: 0,
    damage: 12,
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
    cost: 0,
    shieldBoost: 18,
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
    cost: 0,
    damage: 10,
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
    cost: 0,
    shieldBoost: 12,
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
    cost: 0,
    damage: 14,
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
    cost: 0,
    shieldBoost: 16,
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
    cost: 0,
    damage: 11,
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
    cost: 0,
    shieldBoost: 14,
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
    cost: 0,
    damage: 16,
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
    cost: 0,
    shieldBoost: 25,
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
    cost: 0,
    damage: 13,
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
    cost: 0,
    shieldBoost: 17,
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
    cost: 0,
    damage: 9,
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
    cost: 0,
    shieldBoost: 13,
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
    cost: 0,
    damage: 15,
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
    cost: 0,
    shieldBoost: 22,
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
    cost: 0,
    damage: 12,
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
    cost: 0,
    shieldBoost: 16,
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
    cost: 0,
    damage: 8,
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
    cost: 0,
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
    cost: 0,
    damage: 12,
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
    cost: 0,
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
    cost: 10,
    damage: 6,
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
    cost: 18,
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
    cost: 22,
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
    cost: 30,
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
    cost: 8,
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
    cost: 12,
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
    cost: 20,
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
    cost: 28,
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
    cost: 10,
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
    cost: 15,
    damage: 10,
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
    cost: 25,
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
    cost: 35,
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
    cost: 12,
    damage: 8,
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
    cost: 15,
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
    cost: 22,
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
    cost: 35,
    damage: 25,
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
    cost: 8,
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
    cost: 15,
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
    cost: 20,
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
    cost: 30,
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
    cost: 10,
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
    cost: 12,
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
    cost: 18,
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
    cost: 25,
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
    cost: 12,
    damage: 10,
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
    cost: 15,
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
    cost: 20,
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
    cost: 28,
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
    cost: 20,
    damage: 5,
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
    cost: 15,
    shieldBoost: 20,
    cooldown: 2,
    targetType: 'self',
  },
];

// Move damage and PP steal values for new elemental system
export const MOVE_DAMAGE_VALUES: Record<string, { shieldDamage: number; ppSteal: number }> = {
  // Manifest Moves (Reading)
  'Emotional Read': { shieldDamage: 8, ppSteal: 0 },
  'Pattern Shield': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Writing)
  'Reality Rewrite': { shieldDamage: 12, ppSteal: 0 },
  'Narrative Barrier': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Drawing)
  'Illusion Strike': { shieldDamage: 10, ppSteal: 0 },
  'Mirage Shield': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Athletics)
  'Flow Strike': { shieldDamage: 14, ppSteal: 0 },
  'Rhythm Guard': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Singing)
  'Harmonic Blast': { shieldDamage: 11, ppSteal: 0 },
  'Melody Shield': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Gaming)
  'Pattern Break': { shieldDamage: 16, ppSteal: 8 },
  'Strategy Matrix': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Observation)
  'Precision Strike': { shieldDamage: 13, ppSteal: 0 },
  'Memory Shield': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Empathy)
  'Emotional Resonance': { shieldDamage: 9, ppSteal: 0 },
  'Empathic Barrier': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Creating)
  'Tool Strike': { shieldDamage: 15, ppSteal: 0 },
  'Construct Shield': { shieldDamage: 0, ppSteal: 0 },
  
  // Manifest Moves (Cooking)
  'Energy Feast': { shieldDamage: 12, ppSteal: 0 },
  'Nourishing Barrier': { shieldDamage: 0, ppSteal: 0 },
  
  // Fire Elemental Moves
  'Ember Jab': { shieldDamage: 8, ppSteal: 7 },
  'Flame Dash': { shieldDamage: 0, ppSteal: 0 },
  'Wildfire': { shieldDamage: 8, ppSteal: 0 },
  'Inferno Screen': { shieldDamage: 0, ppSteal: 0 },
  
  // Water Elemental Moves
  'Ripple': { shieldDamage: 4, ppSteal: 0 },
  'Tide Mend': { shieldDamage: 0, ppSteal: 0 },
  'Undertow': { shieldDamage: 0, ppSteal: 0 },
  'Mist Veil': { shieldDamage: 0, ppSteal: 0 },
  
  // Air Elemental Moves
  'Gust': { shieldDamage: 0, ppSteal: 0 },
  'Quickening': { shieldDamage: 0, ppSteal: 0 },
  'Crosswind': { shieldDamage: 0, ppSteal: 0 },
  'Vacuum Seal': { shieldDamage: 0, ppSteal: 0 },
  
  // Earth Elemental Moves
  'Pebbleguard': { shieldDamage: 0, ppSteal: 0 },
  'Seismic Tap': { shieldDamage: 7, ppSteal: 0 },
  'Bulwark': { shieldDamage: 0, ppSteal: 0 },
  'Bedrock Lock': { shieldDamage: 0, ppSteal: 0 },
  
  // Lightning Elemental Moves
  'Spark': { shieldDamage: 5, ppSteal: 0 },
  'Overclock': { shieldDamage: 0, ppSteal: 0 },
  'Arc Net': { shieldDamage: 0, ppSteal: 0 },
  'Thunderbreak': { shieldDamage: 18, ppSteal: 0 },
  
  // Light Elemental Moves
  'Glint': { shieldDamage: 0, ppSteal: 0 },
  'Radiance': { shieldDamage: 0, ppSteal: 0 },
  'Beacon': { shieldDamage: 0, ppSteal: 0 },
  'Solar Aegis': { shieldDamage: 0, ppSteal: 0 },
  
  // Shadow Elemental Moves
  'Veilstep': { shieldDamage: 0, ppSteal: 0 },
  'Dread Whisper': { shieldDamage: 0, ppSteal: 0 },
  'Umbral Chain': { shieldDamage: 0, ppSteal: 0 },
  'Blackout': { shieldDamage: 0, ppSteal: 0 },
  
  // Metal Elemental Moves
  'Truth Edge': { shieldDamage: 8, ppSteal: 0 },
  'Refraction': { shieldDamage: 0, ppSteal: 0 },
  'Integrity Field': { shieldDamage: 0, ppSteal: 0 },
  'Truth Lock': { shieldDamage: 0, ppSteal: 0 },
  
  // System Moves
  'Vault Hack': { shieldDamage: 5, ppSteal: 8 },
  'Shield Restoration': { shieldDamage: 0, ppSteal: 0 },
};

// Action card damage values
export const ACTION_CARD_DAMAGE_VALUES: Record<string, { shieldDamage: number; ppSteal: number }> = {
  'Shield Breaker': { shieldDamage: 22, ppSteal: 0 },
  'PP Restore': { shieldDamage: 0, ppSteal: 0 }, // Self-heal
  'Teleport PP': { shieldDamage: 0, ppSteal: 25 },
  'Double XP': { shieldDamage: 0, ppSteal: 0 }, // Utility
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