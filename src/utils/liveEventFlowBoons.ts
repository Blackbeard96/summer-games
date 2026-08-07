/**
 * Flow State boon definitions, merging, and streak-threshold detection.
 */

import {
  DEFAULT_LIVE_EVENT_FLOW_STATE_BOONS,
  FLOW_BOON_THRESHOLDS,
  type FlowBoonId,
  type FlowBoonThreshold,
  type LiveEventFlowStateBoons,
} from '../types/liveEventFlowBoons';

export { FLOW_BOON_THRESHOLDS };

export type FlowBoonOption = {
  id: FlowBoonId;
  title: string;
  description: string;
};

const STREAK3_OPTIONS: FlowBoonOption[] = [
  {
    id: 'bonus_participation_points',
    title: '+3 Participation Points',
    description: 'Gain 3 Participation Points immediately (moves / participation power).',
  },
  {
    id: 'increase_power_points_300',
    title: '+300 Power Points',
    description: 'Gain 300 Power Points immediately for this Live Event.',
  },
];

const STREAK5_OPTIONS: FlowBoonOption[] = [
  {
    id: 'pp_multiplier_1_5',
    title: '×1.5 Live Event PP',
    description: 'Multiply Power Points earned from Live Event rewards by 1.5.',
  },
  {
    id: 'question_multiplier_1_5',
    title: '×1.5 Question Points',
    description: 'Multiply points from correct quiz answers only (not PP payouts).',
  },
  {
    id: 'damage_boost_10',
    title: '+10% Skill Damage',
    description: 'All your skills deal 10% more damage for the rest of this event.',
  },
];

const STREAK9_OPTIONS: FlowBoonOption[] = [
  {
    id: 'pp_multiplier_2',
    title: '×2 Live Event PP',
    description: 'Multiply Power Points earned from Live Event rewards by 2 (replaces ×1.5).',
  },
  {
    id: 'damage_boost_20',
    title: '+20% Skill Damage',
    description: 'All your skills deal 20% more damage (replaces +10%).',
  },
  {
    id: 'increase_power_points_1000',
    title: '+1000 Power Points',
    description: 'Gain 1000 Power Points immediately for this Live Event.',
  },
];

export function getFlowBoonOptionsForThreshold(threshold: FlowBoonThreshold): FlowBoonOption[] {
  if (threshold === 3) return STREAK3_OPTIONS;
  if (threshold === 5) return STREAK5_OPTIONS;
  return STREAK9_OPTIONS;
}

export function isValidBoonForThreshold(threshold: FlowBoonThreshold, boonId: FlowBoonId): boolean {
  return getFlowBoonOptionsForThreshold(threshold).some((o) => o.id === boonId);
}

function num(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function parseClaimed(raw: unknown): FlowBoonThreshold[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<FlowBoonThreshold>();
  for (const v of raw) {
    const n = num(v);
    if (n === 3 || n === 5 || n === 9) set.add(n);
  }
  return Array.from(set);
}

/** Parse flowState from a session player row (defensive). */
export function parseFlowStateFromPlayerRow(row: Record<string, unknown> | null | undefined): LiveEventFlowStateBoons {
  const base = DEFAULT_LIVE_EVENT_FLOW_STATE_BOONS();
  if (!row || typeof row !== 'object') return base;
  const raw = row.flowState;
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      activated: row.flowStateActive === true,
    };
  }
  const fs = raw as Record<string, unknown>;
  const selectedBoons: LiveEventFlowStateBoons['selectedBoons'] = {};
  const sel = fs.selectedBoons;
  if (sel && typeof sel === 'object') {
    for (const t of FLOW_BOON_THRESHOLDS) {
      const key = `streak${t}` as const;
      const v = (sel as Record<string, unknown>)[key];
      if (typeof v === 'string') selectedBoons[key] = v as FlowBoonId;
    }
  }
  const ppM = Number(fs.ppMultiplier);
  const qpM = Number(fs.questionPointMultiplier);
  const dmg = Number(fs.damageBoostPercent);
  const pending = num(fs.pendingThreshold);
  const pendingThreshold: FlowBoonThreshold | null =
    pending === 3 || pending === 5 || pending === 9 ? pending : null;

  return {
    activated: fs.activated === true || row.flowStateActive === true,
    selectedBoons,
    ppMultiplier: ppM === 2 ? 2 : ppM === 1.5 ? 1.5 : 1,
    questionPointMultiplier: qpM === 1.5 ? 1.5 : 1,
    damageBoostPercent: dmg >= 20 ? 20 : dmg >= 10 ? 10 : 0,
    claimedThresholds: parseClaimed(fs.claimedThresholds),
    pendingThreshold,
  };
}

export function getNewlyReachedBoonThresholds(
  prevStreak: number,
  nextStreak: number,
  claimed: FlowBoonThreshold[]
): FlowBoonThreshold[] {
  const claimedSet = new Set(claimed);
  const out: FlowBoonThreshold[] = [];
  for (const t of FLOW_BOON_THRESHOLDS) {
    if (prevStreak < t && nextStreak >= t && !claimedSet.has(t)) out.push(t);
  }
  return out;
}

/** Next threshold that still needs a boon pick (streak already reached, not claimed). */
export function getNextUnclaimedBoonThreshold(
  successStreak: number,
  flow: LiveEventFlowStateBoons
): FlowBoonThreshold | null {
  const claimed = new Set(flow.claimedThresholds);
  for (const t of FLOW_BOON_THRESHOLDS) {
    if (successStreak >= t && !claimed.has(t)) return t;
  }
  return null;
}

export function mergeFlowBoonSelection(
  prev: LiveEventFlowStateBoons,
  threshold: FlowBoonThreshold,
  boonId: FlowBoonId
): LiveEventFlowStateBoons {
  const selectedBoons = { ...prev.selectedBoons, [`streak${threshold}`]: boonId };
  let ppMultiplier = prev.ppMultiplier;
  let questionPointMultiplier = prev.questionPointMultiplier;
  let damageBoostPercent = prev.damageBoostPercent;

  switch (boonId) {
    case 'pp_multiplier_1_5':
      ppMultiplier = 1.5;
      break;
    case 'pp_multiplier_2':
      ppMultiplier = 2;
      break;
    case 'question_multiplier_1_5':
      questionPointMultiplier = 1.5;
      break;
    case 'damage_boost_10':
      damageBoostPercent = 10;
      break;
    case 'damage_boost_20':
      damageBoostPercent = 20;
      break;
    default:
      break;
  }

  const claimedSet = new Set(prev.claimedThresholds);
  claimedSet.add(threshold);

  return {
    activated: true,
    selectedBoons,
    ppMultiplier,
    questionPointMultiplier,
    damageBoostPercent,
    claimedThresholds: Array.from(claimedSet).sort((a, b) => a - b),
    pendingThreshold: null,
  };
}

export function flowStateToFirestore(fs: LiveEventFlowStateBoons): Record<string, unknown> {
  return {
    activated: fs.activated,
    selectedBoons: fs.selectedBoons,
    ppMultiplier: fs.ppMultiplier,
    questionPointMultiplier: fs.questionPointMultiplier,
    damageBoostPercent: fs.damageBoostPercent,
    claimedThresholds: fs.claimedThresholds,
    pendingThreshold: fs.pendingThreshold ?? null,
  };
}

export function applyFlowQuestionPointMultiplier(basePoints: number, flow: LiveEventFlowStateBoons): number {
  if (basePoints <= 0 || flow.questionPointMultiplier <= 1) return basePoints;
  return Math.floor(basePoints * flow.questionPointMultiplier);
}

export function applyFlowPpRewardMultiplier(basePp: number, flow: LiveEventFlowStateBoons): number {
  if (basePp <= 0 || flow.ppMultiplier <= 1) return basePp;
  return Math.floor(basePp * flow.ppMultiplier);
}

export function getFlowDamageMultiplier(flow: LiveEventFlowStateBoons): number {
  const pct = flow.damageBoostPercent;
  if (pct <= 0) return 1;
  return 1 + pct / 100;
}

export function getFlowBoonDisplayLabel(boonId: FlowBoonId): string {
  const all = [...STREAK3_OPTIONS, ...STREAK5_OPTIONS, ...STREAK9_OPTIONS];
  return all.find((o) => o.id === boonId)?.title ?? boonId;
}

export function getFlowBoonSelectionFeedback(boonId: FlowBoonId): string {
  switch (boonId) {
    case 'bonus_participation_points':
      return 'You selected +3 Participation Points.';
    case 'increase_power_points_300':
      return 'You selected +300 Power Points.';
    case 'pp_multiplier_1_5':
      return 'You selected ×1.5 Live Event PP rewards.';
    case 'question_multiplier_1_5':
      return 'You selected ×1.5 Question Points.';
    case 'damage_boost_10':
      return 'You selected +10% Skill Damage.';
    case 'pp_multiplier_2':
      return 'You selected ×2 Live Event PP rewards.';
    case 'damage_boost_20':
      return 'You selected +20% Skill Damage.';
    case 'increase_power_points_1000':
      return 'You selected +1000 Power Points.';
    default:
      return 'Flow boon selected.';
  }
}
