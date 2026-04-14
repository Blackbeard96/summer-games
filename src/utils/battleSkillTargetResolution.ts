/**
 * Shared skill **target classification** for battle UIs and engines (Live Events, arena, raids).
 * Execution still happens in `BattleEngine` / `applyInSessionMove`; this module only answers
 * “does the player need to pick themselves vs someone else?” consistently.
 */

import type { Move } from '../types/battle';

const SKILL_DEBUG = process.env.REACT_APP_DEBUG_PROGRESSION === 'true';

export function skillTargetDebugLog(tag: string, payload: Record<string, unknown>): void {
  if (!SKILL_DEBUG) return;
  console.log(`[skillTarget:${tag}]`, { ts: new Date().toISOString(), ...payload });
}

function hasSummonEffect(move: Pick<Move, 'statusEffects'>): boolean {
  return (
    Array.isArray(move.statusEffects) &&
    move.statusEffects.some((e) => e && (e as { type?: string }).type === 'summon')
  );
}

/**
 * True when the acting player must be the target (self row / own card), including:
 * legacy shield/heal fields, `targetType === 'self'`, summons, and Level 2 manifest rows merged with `targetType: 'self'`.
 */
export function isSelfDirectedBattleMove(move: Pick<Move, 'id' | 'effectKey' | 'shieldBoost' | 'healing' | 'targetType' | 'statusEffects'> | null | undefined): boolean {
  if (!move) return false;
  if (move.shieldBoost || move.healing || move.targetType === 'self' || hasSummonEffect(move)) {
    return true;
  }
  if (move.effectKey === 'level2_manifest' || (typeof move.id === 'string' && move.id.startsWith('l2-manifest::'))) {
    return String(move.targetType) === 'self';
  }
  return false;
}

/**
 * Live Event roster: valid click target for the currently selected skill.
 * - Self-directed: only the actor’s card.
 * - Otherwise: any other player’s card (existing Live Event rule: click another student).
 */
export function isValidLiveEventRosterTarget(params: {
  actorUid: string | undefined;
  candidateUid: string;
  move: Pick<Move, 'id' | 'effectKey' | 'shieldBoost' | 'healing' | 'targetType' | 'statusEffects'> | null | undefined;
}): boolean {
  const { actorUid, candidateUid, move } = params;
  if (!move || !actorUid) return false;
  if (isSelfDirectedBattleMove(move)) return candidateUid === actorUid;
  return candidateUid !== actorUid;
}
