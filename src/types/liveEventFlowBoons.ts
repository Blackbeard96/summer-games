/**
 * Live Event Flow State — streak boon selections (thresholds 3 / 5 / 9 on successStreak).
 */

export const FLOW_BOON_THRESHOLDS = [3, 5, 9] as const;
export type FlowBoonThreshold = (typeof FLOW_BOON_THRESHOLDS)[number];

export type FlowBoonStreak3Id = 'bonus_participation_points' | 'increase_power_points_300';
export type FlowBoonStreak5Id = 'pp_multiplier_1_5' | 'question_multiplier_1_5' | 'damage_boost_10';
export type FlowBoonStreak9Id = 'pp_multiplier_2' | 'damage_boost_20' | 'increase_power_points_1000';

export type FlowBoonId = FlowBoonStreak3Id | FlowBoonStreak5Id | FlowBoonStreak9Id;

export interface LiveEventFlowStateBoons {
  activated: boolean;
  selectedBoons: Partial<Record<`streak${FlowBoonThreshold}`, FlowBoonId>>;
  ppMultiplier: 1 | 1.5 | 2;
  questionPointMultiplier: 1 | 1.5;
  damageBoostPercent: 0 | 10 | 20;
  claimedThresholds: FlowBoonThreshold[];
  /** Smallest unclaimed threshold the player must pick a boon for (client modal). */
  pendingThreshold?: FlowBoonThreshold | null;
}

export const DEFAULT_LIVE_EVENT_FLOW_STATE_BOONS = (): LiveEventFlowStateBoons => ({
  activated: false,
  selectedBoons: {},
  ppMultiplier: 1,
  questionPointMultiplier: 1,
  damageBoostPercent: 0,
  claimedThresholds: [],
  pendingThreshold: null,
});
