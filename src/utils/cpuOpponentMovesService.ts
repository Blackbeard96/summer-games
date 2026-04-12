/**
 * Load admin CPU opponent definitions (Firestore + default merge) and scale stats/moves for battles.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CPUOpponent } from '../components/CPUOpponentMovesAdmin';
import { DEFAULT_OPPONENTS } from '../components/CPUOpponentMovesAdmin';

export async function loadMergedCpuOpponents(): Promise<CPUOpponent[]> {
  try {
    const ref = doc(db, 'adminSettings', 'cpuOpponentMoves');
    const snap = await getDoc(ref);
    if (!snap.exists()) return DEFAULT_OPPONENTS.map((o) => ({ ...o, moves: o.moves.map((m) => ({ ...m })) }));
    const data = snap.data();
    if (!data.opponents || !Array.isArray(data.opponents)) {
      return DEFAULT_OPPONENTS.map((o) => ({ ...o, moves: o.moves.map((m) => ({ ...m })) }));
    }
    const fromFs = data.opponents as CPUOpponent[];
    const existingIds = new Set(fromFs.map((o) => o.id));
    const extra = DEFAULT_OPPONENTS.filter((o) => !existingIds.has(o.id));
    return [...fromFs, ...extra];
  } catch (e) {
    console.warn('cpuOpponentMovesService: loadMergedCpuOpponents failed', e);
    return DEFAULT_OPPONENTS.map((o) => ({ ...o, moves: o.moves.map((m) => ({ ...m })) }));
  }
}

function scaleRound(n: number | undefined, mult: number): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return n;
  return Math.max(0, Math.round(n * mult));
}

/** Deep-clone a CPU move and scale numeric combat values by difficulty multiplier. */
export function scaleCpuOpponentMove(move: Record<string, unknown>, mult: number): Record<string, unknown> {
  const m = JSON.parse(JSON.stringify(move)) as Record<string, unknown>;
  if (typeof m.baseDamage === 'number') m.baseDamage = scaleRound(m.baseDamage, mult) ?? 0;
  const dr = m.damageRange as { min?: number; max?: number } | undefined;
  if (dr) {
    if (dr.min !== undefined) dr.min = scaleRound(dr.min, mult)!;
    if (dr.max !== undefined) dr.max = scaleRound(dr.max, mult)!;
  }
  const hr = m.healingRange as { min?: number; max?: number } | undefined;
  if (hr) {
    if (hr.min !== undefined) hr.min = scaleRound(hr.min, mult)!;
    if (hr.max !== undefined) hr.max = scaleRound(hr.max, mult)!;
  }
  const cm = m.counterMove as Record<string, unknown> | undefined;
  if (cm && typeof cm === 'object') {
    if (typeof cm.damage === 'number') cm.damage = scaleRound(cm.damage as number, mult);
    const cdr = cm.damageRange as { min?: number; max?: number } | undefined;
    if (cdr) {
      if (cdr.min !== undefined) cdr.min = scaleRound(cdr.min, mult)!;
      if (cdr.max !== undefined) cdr.max = scaleRound(cdr.max, mult)!;
    }
  }
  const dRed = m.damageReduction as { amount?: number; percentage?: number } | undefined;
  if (dRed && typeof dRed.amount === 'number') dRed.amount = scaleRound(dRed.amount, mult)!;
  const fxList = (m.statusEffects as unknown[]) || (m.statusEffect ? [m.statusEffect] : []);
  for (const fx of fxList) {
    if (!fx || typeof fx !== 'object') continue;
    const e = fx as Record<string, unknown>;
    if (typeof e.damagePerTurn === 'number') e.damagePerTurn = scaleRound(e.damagePerTurn as number, mult);
    if (typeof e.ppLossPerTurn === 'number') e.ppLossPerTurn = scaleRound(e.ppLossPerTurn as number, mult);
    if (typeof e.ppStealPerTurn === 'number') e.ppStealPerTurn = scaleRound(e.ppStealPerTurn as number, mult);
    if (typeof e.healPerTurn === 'number') e.healPerTurn = scaleRound(e.healPerTurn as number, mult);
  }
  return m;
}

export function scaleCpuOpponentMoves(moves: Record<string, unknown>[], mult: number): Record<string, unknown>[] {
  return moves.map((mv) => scaleCpuOpponentMove(mv, mult));
}

/**
 * Map admin CPU move rows to the shape BattleEngine expects when selecting / executing moves.
 */
/** Representative damage for IslandRaidEnemy.damage from scaled CPU moves. */
export function estimateDamageFromCpuMoves(moves: any[]): number {
  for (const m of moves) {
    if (m?.type === 'heal') continue;
    const dr = m?.damageRange as { min?: number; max?: number } | undefined;
    if (dr && dr.min != null && dr.max != null) {
      return Math.max(1, Math.round((Number(dr.min) + Number(dr.max)) / 2));
    }
    if (typeof m?.baseDamage === 'number' && m.baseDamage > 0) {
      return Math.round(m.baseDamage);
    }
  }
  return 10;
}

export function mapCpuMovesToBattleEngineFormat(moves: any[]): any[] {
  return moves.map((move: any) => {
    let baseDamage = move.baseDamage || 0;
    let damageRange = move.damageRange;
    if (damageRange && damageRange.min !== undefined && damageRange.max !== undefined) {
      // keep
    } else if (baseDamage > 0) {
      damageRange = { min: baseDamage, max: baseDamage };
    }
    const moveName = move.name || 'Unknown Move';
    return {
      id: move.id || String(moveName).toLowerCase().replace(/\s+/g, '-'),
      name: moveName,
      type: move.type || 'attack',
      baseDamage,
      damageRange,
      healingRange: move.healingRange,
      shieldBoost: move.shieldBoost,
      ppSteal: move.ppSteal,
      statusEffects: move.statusEffects || (move.statusEffect ? [move.statusEffect] : []),
      priority: move.priority,
      level: move.level || 1,
      masteryLevel: move.masteryLevel || 1,
      description: move.description || '',
      damageReduction: move.damageReduction,
      counterMove: move.counterMove,
      duration: move.duration,
      elementalAffinity: move.elementalAffinity,
    };
  });
}
