import type { Timestamp } from 'firebase/firestore';

/**
 * Dynamic co-op / reinforcement model for `islandRaidBattleRooms` (Missions + Island Raids).
 * Optional fields — omit for legacy solo / lobby-only rooms (backward compatible).
 *
 * Turn timing: new humans join at the next Firestore-visible roster update; the battle engine
 * already recomputes multiplayer turn batches from `allies` + `participantMoves`. Do not
 * mutate `players` during an in-flight local animation — use the transaction service from UI
 * boundaries only.
 */

export type CoopBattleMode = 'mission' | 'islandRaid';

export type CoopParticipantType = 'player' | 'allyNpc' | 'enemyNpc';

export type CoopParticipantTeam = 'allies' | 'enemies';

export type CoopParticipantStatus = 'active' | 'down' | 'left' | 'defeated';

export type CoopJoinWindowRule = 'anytime' | 'betweenRounds' | 'beforeWaveStart';

/** Mission / raid admin-configurable co-op (stored on battle room root). */
export interface CoopBattleRoomExtension {
  /** High-level source for analytics / rules. */
  coopBattleMode?: CoopBattleMode;
  /** Original creator (host); may transfer on leave. */
  hostPlayerId?: string;
  /** Max human UIDs on `players` (default DEFAULT_MAX_ALLIED_PARTICIPANTS). */
  participantCap?: number;
  /** Any signed-in client may read the doc (see firestore.rules). */
  joinableMidBattle?: boolean;
  /** If true, clients must not auto-join on mount; use Join CTA. */
  requireExplicitJoin?: boolean;
  joinWindowRule?: CoopJoinWindowRule;
  /** Monotonic round counter for “joined at round” bookkeeping (optional). */
  roundNumber?: number;
  /** Append-only friendly strings for clients + logs. */
  battleEventLog?: string[];
  /** Stable participant rows keyed by `participantId` (userId for players, synthetic for NPC). */
  participantRecords?: Record<string, CoopParticipantRecord>;
  /** Allied NPC instances (first-class for engine: isAI + battleMoves). */
  npcAllies?: NpcAllyBattleInstance[];
  /** Optional tallies for contribution / rewards (increment over time). */
  participantContributions?: Record<string, CoopContributionTally>;
}

export interface CoopParticipantRecord {
  participantId: string;
  type: CoopParticipantType;
  userId: string | null;
  sourceId?: string;
  displayName: string;
  team: CoopParticipantTeam;
  joinedAtRound?: number;
  joinedAtTurn?: number;
  status: CoopParticipantStatus;
  avatarUrl?: string | null;
  aiControlled?: boolean;
  canReceiveRewards?: boolean;
  contributed?: boolean;
  /** Server time when joined (Firestore Timestamp serialized). */
  joinedAt?: Timestamp | { seconds: number; nanoseconds: number };
}

export interface NpcAllyBattleInstance {
  participantId: string;
  templateId: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  currentPP: number;
  maxPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  /** Minimal move set for BattleEngine AI ally path (`battleMoves` on ally row). */
  battleMoves?: Array<{
    id: string;
    name: string;
    type: 'attack' | 'defense' | 'utility' | 'support' | 'control';
    damage?: number;
    shieldBoost?: number;
    healing?: number;
    cooldown?: number;
    cost?: number;
    description?: string;
  }>;
  aiProfile?: 'aggressive' | 'defensive' | 'support' | 'balanced';
}

export interface CoopContributionTally {
  turnsActed?: number;
  damageDealt?: number;
  healingDone?: number;
  shieldingDone?: number;
  roundsPresent?: number;
}

export interface MissionBattleCoopConfig {
  allowPlayerJoinMidBattle?: boolean;
  allowNpcAllies?: boolean;
  maxAlliedParticipants?: number;
  /** Ids referencing mission ally pool / templates (future). */
  allyPool?: string[];
  joinWindowRule?: CoopJoinWindowRule;
  /** If set, only these template ids may be summoned. */
  npcAllyTemplateIds?: string[];
}

export interface IslandRaidCoopConfig {
  allowReinforcements?: boolean;
  autoFillWithNpcIfPlayerLeaves?: boolean;
  maxRaidParticipants?: number;
  raidAllyPool?: string[];
}
