/**
 * Season 1 — Flow State / energies / goals / battle pass / skill cards.
 * All Firestore payloads should tolerate missing fields (use defaults from season1PlayerHydration).
 */

import type { Timestamp } from 'firebase/firestore';
import type { BattlePassIntroStep } from './missions';

/** Live event modes (Season 1 taxonomy). */
export type LiveEventModeType =
  | 'class_flow'
  | 'battle_royale'
  | 'quiz'
  | 'reflection'
  | 'goal_setting'
  | 'neutral_flow';

/** Timed goal sprint for Class Flow — stored on inSessionRooms.classFlowSprint */
export type ClassFlowSprintStatus = 'live' | 'closed';

export interface ClassFlowSprintState {
  id: string;
  title: string;
  description?: string;
  durationSeconds: number;
  startedAt: Timestamp | Date;
  endsAt: Timestamp | Date;
  status: ClassFlowSprintStatus;
  hostUid: string;
  /** Passed to trackParticipation (Participation Power / movesEarned scaling) */
  rewardParticipationPoints: number;
  /** Bonus vault PP (students + users + vault cap) */
  rewardVaultPP: number;
  rewardXP: number;
  markedCompleteUids: string[];
  rewardsGrantedUids: string[];
}

export type EnergyType = 'kinetic' | 'mental' | 'emotional' | 'spiritual';

export type GoalTimeframeType = 'class' | 'day' | 'three_day' | 'week';

export type GoalStatus = 'active' | 'completed' | 'failed' | 'expired';

export interface EnergiesMap {
  kinetic: number;
  mental: number;
  emotional: number;
  spiritual: number;
}

export interface EnergyLevelsMap {
  kinetic: number;
  mental: number;
  emotional: number;
  spiritual: number;
}

export interface EnergyXPMap {
  kinetic: number;
  mental: number;
  emotional: number;
  spiritual: number;
}

export interface FlowStateStatus {
  inFlow: boolean;
  awakenedFlow: boolean;
  currentMode?: string;
  enteredAt?: Timestamp | Date | null;
}

export interface ParticipationStreaksProfile {
  currentParticipationStreak: number;
  highestParticipationStreak: number;
}

export interface ManifestSkillLevelProgress {
  currentLevel: number;
  unlockedLevels: number[];
  /** Player-chosen config per level (optional, hydrated from Firestore). */
  customizationsByLevel?: Record<number, Record<string, unknown>>;
}

export interface Season1BattlePassProgress {
  currentSeasonId?: string;
  currentTier: number;
  battlePassXP: number;
  claimedRewardIds: string[];
}

/** Nested under students/{uid}.season1 */
export interface Season1PlayerSlice {
  energies: EnergiesMap;
  energyLevels: EnergyLevelsMap;
  energyXP: EnergyXPMap;
  activeGoalByTimeframe?: Partial<Record<GoalTimeframeType, string>>;
  activeGoalId?: string;
  flowState: FlowStateStatus;
  streaks: ParticipationStreaksProfile;
  unlockedManifestSkillLevels: Record<string, ManifestSkillLevelProgress>;
  ownedSkillCards: string[];
  equippedSkillCards: string[];
  battlePass: Season1BattlePassProgress;
}

export interface Goal {
  id: string;
  playerId: string;
  title: string;
  description: string;
  category?: string;
  energyType?: EnergyType;
  timeframeType: GoalTimeframeType;
  createdAt: Timestamp | Date;
  startAt: Timestamp | Date;
  endAt: Timestamp | Date;
  status: GoalStatus;
  targetMetricType?: string;
  targetValue?: number;
  resultSummary?: string;
  alignmentScore?: number;
  rewardsApplied?: boolean;
  consequencesApplied?: boolean;
}

export interface GoalLinkedResponse {
  id: string;
  playerId: string;
  goalId: string;
  modeType: LiveEventModeType;
  promptId?: string;
  responseValue: string | number | boolean;
  responseText?: string;
  wasCorrect?: boolean;
  participationPointsEarned: number;
  energyEarned?: Partial<EnergiesMap>;
  timestamp: Timestamp | Date;
}

export interface BattlePassReward {
  id: string;
  rewardType: 'xp' | 'pp' | 'artifact' | 'item' | 'skill_card' | 'truth_metal' | 'ability';
  rewardRefId?: string;
  quantity?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  displayName: string;
  description: string;
  iconUrl?: string;
}

/**
 * Player picks `pickCount` reward(s) from `options` (e.g. pick 1 of 3). Stored in tier `rewards` next to flat rewards.
 */
export interface BattlePassRewardChoiceGroup {
  id: string;
  pickCount: number;
  displayName?: string;
  description?: string;
  options: BattlePassReward[];
}

export type BattlePassTierRewardEntry = BattlePassReward | BattlePassRewardChoiceGroup;

export function isBattlePassChoiceGroup(e: BattlePassTierRewardEntry): e is BattlePassRewardChoiceGroup {
  return e != null && typeof e === 'object' && 'options' in e && Array.isArray((e as BattlePassRewardChoiceGroup).options);
}

export interface BattlePassTier {
  id: string;
  tierNumber: number;
  requiredXP: number;
  rewards: BattlePassTierRewardEntry[];
}

export interface Season {
  /** Document id under `seasons/{id}`. */
  id: string;
  name: string;
  theme: string;
  active: boolean;
  startAt: Timestamp | Date;
  endAt: Timestamp | Date;
  description: string;
  /**
   * Which game/content season this pass is tied to (e.g. Flow Season 1).
   * Clients can filter or theme UI; use presets from admin or a custom key.
   */
  linkedGameSeasonKey?: string;
  featuredHero?: string;
  homeBannerImage?: string;
  /** Optional full-season intro video (Storage download URL or external). */
  seasonIntroVideoUrl?: string;
  seasonIntroVideoStoragePath?: string;
  /** Ordered slides + inline videos (mission-builder–compatible steps). */
  introSequence?: BattlePassIntroStep[];
  tiers: BattlePassTier[];
}

export interface SkillCardEffectConfig {
  /** Opaque effect payload — interpreted by battle / live-event resolvers. */
  effectId?: string;
  powerBand?: number;
  durationTurns?: number;
  payload?: Record<string, unknown>;
}

export interface SkillCard {
  id: string;
  name: string;
  description: string;
  rarity: BattlePassReward['rarity'];
  energyType: EnergyType;
  skillType: 'attack' | 'boost' | 'shield' | 'heal' | 'disrupt' | 'utility';
  effectConfig: SkillCardEffectConfig;
  participationCost?: number;
  energyCost?: number;
  cooldown?: number;
  targetRules?: Record<string, unknown>;
  iconUrl?: string;
  active?: boolean;
}

export type SkillPaymentMode =
  | 'participation_only'
  | 'energy_only'
  | 'either'
  | 'both';

/** Optional extension on Move (types/battle.ts) — keep optional for backwards compatibility. */
export interface Season1SkillCost {
  participationCost?: number;
  energyCost?: number;
  energyType?: EnergyType;
  paymentMode: SkillPaymentMode;
}

export interface ManifestSkillLevelConfig {
  level: number;
  unlockCostPP: number;
  maxTargets: number;
  availableChoicePool?: string[];
  effectConstraints?: Record<string, unknown>;
  rarityOrPowerBand?: string;
  description: string;
}

export interface ManifestSkillDefinition {
  id: string;
  manifestType: string;
  baseSkillName: string;
  currentUnlockedLevel: number;
  availableUpgradeChoicesByLevel?: Record<number, string[]>;
  customizations?: Record<string, unknown>;
  levelConfigs: Record<string, ManifestSkillLevelConfig>;
}

export type BattleLogEntryType =
  | 'participation'
  | 'skill_use'
  | 'streak_started'
  | 'streak_updated'
  | 'streak_broken'
  | 'energy_gained'
  | 'goal_progress'
  | 'elimination'
  | 'system';

export interface BattleLogEntry {
  id: string;
  battleId?: string;
  eventId?: string;
  type: BattleLogEntryType;
  actorId: string;
  actorName: string;
  targetIds?: string[];
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp | Date;
}

export interface LiveEventSeason1Settings {
  mode: LiveEventModeType;
  title?: string;
  hostId?: string;
  energyTypeAwarded: EnergyType;
  goalLinkingEnabled: boolean;
  active: boolean;
  createdAt?: Timestamp | Date;
}
