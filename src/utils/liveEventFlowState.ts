/**
 * Live Event Flow State — unified streak for consecutive successful participation
 * (correct quiz answers, sprint/objective rewards via trackParticipation, host-awarded participation).
 * Centralizes threshold crossing and player-row field updates mirrored from SessionStats.
 */

export const FLOW_STATE_SUCCESS_THRESHOLD = 3;

/** Fields stored on inSessionRooms.players[] for UI + animation sync */
export interface LiveEventFlowStateFields {
  successStreak: number;
  flowStateActive: boolean;
  /** Epoch ms when flow was last entered (still in flow = last activation time) */
  flowStateActivatedAt: number | null;
  /** Increments only when crossing into flow; clients use to run entry animation once */
  flowStateNonce: number;
}

export type FlowStateEvalResult = LiveEventFlowStateFields & {
  /** True only on transition from streak < threshold to >= threshold */
  flowEntered: boolean;
};

function num(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

/**
 * Compute next flow fields for a session player row after a successful streak increment.
 * prevStreak = consecutiveParticipationAwards before this award; nextStreak after (+1).
 */
export function evaluateFlowStateAfterSuccess(
  prevRow: Record<string, unknown>,
  prevStreak: number,
  nextStreak: number
): FlowStateEvalResult {
  const prevNonce = num(prevRow.flowStateNonce);
  const wasInFlow = prevStreak >= FLOW_STATE_SUCCESS_THRESHOLD;
  const nowInFlow = nextStreak >= FLOW_STATE_SUCCESS_THRESHOLD;
  const flowEntered = !wasInFlow && nowInFlow;
  const flowStateNonce = flowEntered ? prevNonce + 1 : prevNonce;
  const prevAt = prevRow.flowStateActivatedAt;
  const prevAtNum = typeof prevAt === 'number' ? prevAt : num(prevAt);
  const flowStateActivatedAt = nowInFlow
    ? flowEntered
      ? Date.now()
      : prevAtNum > 0
        ? prevAtNum
        : Date.now()
    : null;

  return {
    successStreak: nextStreak,
    flowStateActive: nowInFlow,
    flowStateActivatedAt,
    flowStateNonce,
    flowEntered,
  };
}

/** After wrong answer / streak break — clear flow; preserve nonce (no replay of old entry FX). */
export function mergeFlowClearIntoRow(row: Record<string, unknown>): LiveEventFlowStateFields {
  return {
    successStreak: 0,
    flowStateActive: false,
    flowStateActivatedAt: null,
    flowStateNonce: num(row.flowStateNonce),
  };
}
