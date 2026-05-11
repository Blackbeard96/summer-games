/**
 * MST battle + Live Event “battle energy” taxonomy (Physical / Mental / Emotional / Spiritual).
 * Season 1 Firestore still uses legacy kinetic|mental|emotional|spiritual — use converters below.
 */

import type { EnergyType, LiveEventModeType } from '../types/season1';

export const ENERGY_TYPES = {
  PHYSICAL: 'Physical',
  MENTAL: 'Mental',
  EMOTIONAL: 'Emotional',
  SPIRITUAL: 'Spiritual',
} as const;

export type BattleEnergyType = (typeof ENERGY_TYPES)[keyof typeof ENERGY_TYPES];

/** Canonical Live Event mode / alias → battle energy (display + analytics). */
export const LIVE_EVENT_ENERGY_TYPES: Record<string, BattleEnergyType> = {
  class_flow: ENERGY_TYPES.PHYSICAL,
  battle_royale: ENERGY_TYPES.PHYSICAL,
  /** Team BR uses same Physical work bucket as FFA BR (combat + quiz layer). */
  team_battle_royale: ENERGY_TYPES.PHYSICAL,
  quiz: ENERGY_TYPES.MENTAL,
  reflection: ENERGY_TYPES.EMOTIONAL,
  goals: ENERGY_TYPES.SPIRITUAL,
  goal_setting: ENERGY_TYPES.SPIRITUAL,
  /** Default when host has not picked Neutral override yet — real value comes from neutralFlowEnergyType. */
  neutral_flow: ENERGY_TYPES.PHYSICAL,
  /** Assessment type aliases (same energy as corresponding live modes). */
  live_event_quiz: ENERGY_TYPES.MENTAL,
  live_reflection: ENERGY_TYPES.EMOTIONAL,
  live_goal_setting: ENERGY_TYPES.SPIRITUAL,
  weekly_deliverable: ENERGY_TYPES.PHYSICAL,
};

export function battleEnergyDisplayLabel(energy: BattleEnergyType): string {
  return `${energy} Energy`;
}

export function season1EnergyTypeToBattleEnergy(e: EnergyType): BattleEnergyType {
  if (e === 'kinetic') return ENERGY_TYPES.PHYSICAL;
  if (e === 'mental') return ENERGY_TYPES.MENTAL;
  if (e === 'emotional') return ENERGY_TYPES.EMOTIONAL;
  return ENERGY_TYPES.SPIRITUAL;
}

export function battleEnergyToSeason1Energy(e: BattleEnergyType): EnergyType {
  if (e === ENERGY_TYPES.PHYSICAL) return 'kinetic';
  if (e === ENERGY_TYPES.MENTAL) return 'mental';
  if (e === ENERGY_TYPES.EMOTIONAL) return 'emotional';
  return 'spiritual';
}

export function getBattleEnergyTypeForLiveEventMode(
  mode: LiveEventModeType | string | undefined,
  neutralSeason1Override?: EnergyType
): BattleEnergyType {
  const m = (mode || 'class_flow') as string;
  if (m === 'neutral_flow') {
    return season1EnergyTypeToBattleEnergy(neutralSeason1Override || 'kinetic');
  }
  return LIVE_EVENT_ENERGY_TYPES[m] ?? ENERGY_TYPES.PHYSICAL;
}

/** Single live-event mode string → work / battle energy (uses `LIVE_EVENT_ENERGY_TYPES`). */
export function getEnergyTypeForLiveEvent(
  eventType: string | undefined,
  neutralSeason1Override?: EnergyType
): BattleEnergyType {
  return getBattleEnergyTypeForLiveEventMode(eventType, neutralSeason1Override);
}

/** Assessment `type` and optional stored `energyType` on the assessment doc → work energy. */
export function getEnergyTypeForAssessmentType(
  assessmentType: string | undefined,
  storedEnergyType?: string | undefined
): BattleEnergyType {
  return resolveAssessmentEnergyType({ type: assessmentType, energyType: storedEnergyType });
}

/**
 * Normalize Firestore or UI strings to a canonical BattleEnergyType.
 * Accepts canonical names, assessment aliases, and Season 1 kinetic/mental/… keys.
 */
export function normalizeEnergyType(value: string | undefined | null): BattleEnergyType {
  if (value == null || value === '') return ENERGY_TYPES.MENTAL;
  const v = String(value).trim();
  if (
    v === ENERGY_TYPES.PHYSICAL ||
    v === ENERGY_TYPES.MENTAL ||
    v === ENERGY_TYPES.EMOTIONAL ||
    v === ENERGY_TYPES.SPIRITUAL
  ) {
    return v;
  }
  const lower = v.toLowerCase();
  if (lower === 'kinetic') return ENERGY_TYPES.PHYSICAL;
  if (lower === 'mental') return ENERGY_TYPES.MENTAL;
  if (lower === 'emotional') return ENERGY_TYPES.EMOTIONAL;
  if (lower === 'spiritual') return ENERGY_TYPES.SPIRITUAL;
  return inferEnergyTypeForAssessment(v);
}

export function inferEnergyTypeForLiveEvent(room: {
  energyType?: string;
  liveEventMode?: string;
  energyTypeAwarded?: EnergyType | string;
  neutralFlowEnergyType?: EnergyType;
}): BattleEnergyType {
  const raw = room.energyType;
  if (raw === ENERGY_TYPES.PHYSICAL || raw === ENERGY_TYPES.MENTAL || raw === ENERGY_TYPES.EMOTIONAL || raw === ENERGY_TYPES.SPIRITUAL) {
    return raw;
  }
  if (room.liveEventMode === 'neutral_flow' && room.neutralFlowEnergyType) {
    return season1EnergyTypeToBattleEnergy(room.neutralFlowEnergyType);
  }
  if (room.liveEventMode) {
    return getBattleEnergyTypeForLiveEventMode(
      room.liveEventMode,
      room.liveEventMode === 'neutral_flow' ? (room.neutralFlowEnergyType as EnergyType | undefined) : undefined
    );
  }
  const awarded = room.energyTypeAwarded;
  if (awarded === 'kinetic' || awarded === 'mental' || awarded === 'emotional' || awarded === 'spiritual') {
    return season1EnergyTypeToBattleEnergy(awarded);
  }
  return ENERGY_TYPES.PHYSICAL;
}

/** Goal / assessment type → battle energy (includes legacy academic types). */
export function inferEnergyTypeForAssessment(assessmentType: string | undefined): BattleEnergyType {
  if (!assessmentType) return ENERGY_TYPES.MENTAL;
  if (
    assessmentType === ENERGY_TYPES.PHYSICAL ||
    assessmentType === ENERGY_TYPES.MENTAL ||
    assessmentType === ENERGY_TYPES.EMOTIONAL ||
    assessmentType === ENERGY_TYPES.SPIRITUAL
  ) {
    return assessmentType;
  }
  const direct = LIVE_EVENT_ENERGY_TYPES[assessmentType];
  if (direct) return direct;
  switch (assessmentType) {
    case 'written_assessment':
    case 'test':
    case 'exam':
    case 'quiz':
    case 'habits':
    case 'story-goal':
      return ENERGY_TYPES.SPIRITUAL;
    case 'weekly_deliverable':
      return ENERGY_TYPES.PHYSICAL;
    case 'reflection':
    case 'live_reflection':
      return ENERGY_TYPES.EMOTIONAL;
    default:
      // TODO: tighten mapping if new assessment types are added without a live-event key.
      return ENERGY_TYPES.MENTAL;
  }
}

export function resolveAssessmentEnergyType(a: { energyType?: string; type?: string }): BattleEnergyType {
  return inferEnergyTypeForAssessment(a.energyType ?? a.type);
}

export type MoveEnergyInferenceInput = {
  energyType?: BattleEnergyType;
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  type?: string;
  manifestType?: string;
  elementalAffinity?: string;
  damage?: number;
  healing?: number;
  shieldBoost?: number;
  ppSteal?: number;
  debuffType?: string;
  buffType?: string;
  effectKey?: string;
  rrCandyNodeId?: string;
  rrCandySkillId?: string;
  skillEffects?: ReadonlyArray<{ type?: string }>;
};

export function inferEnergyTypeForMove(move: MoveEnergyInferenceInput): BattleEnergyType {
  if (
    move.energyType === ENERGY_TYPES.PHYSICAL ||
    move.energyType === ENERGY_TYPES.MENTAL ||
    move.energyType === ENERGY_TYPES.EMOTIONAL ||
    move.energyType === ENERGY_TYPES.SPIRITUAL
  ) {
    return move.energyType;
  }

  const id = String(move.id || '').toLowerCase();
  if (
    id.startsWith('rr-candy-') ||
    id.includes('rr-candy') ||
    Boolean(move.rrCandyNodeId) ||
    Boolean(move.rrCandySkillId)
  ) {
    return ENERGY_TYPES.SPIRITUAL;
  }

  if (move.effectKey === 'level2_manifest' || id.startsWith('l2-manifest::')) {
    return ENERGY_TYPES.SPIRITUAL;
  }

  const desc = `${move.description || ''} ${move.name || ''}`.toLowerCase();

  const mentalDebuffs = new Set(['silence', 'confuse', 'drain', 'move_lock', 'vault_hack', 'pp_drain']);
  const emotionalDebuffs = new Set(['dread', 'shield_break']);
  const dt = move.debuffType ? String(move.debuffType) : '';
  if (mentalDebuffs.has(dt)) return ENERGY_TYPES.MENTAL;
  if (emotionalDebuffs.has(dt) || dt === 'soak') return ENERGY_TYPES.EMOTIONAL;

  const bt = move.buffType ? String(move.buffType) : '';
  if (bt === 'accuracy' || bt === 'crit') return ENERGY_TYPES.MENTAL;
  if (bt === 'dodge' || bt === 'speed') return ENERGY_TYPES.PHYSICAL;
  if (bt === 'fortify' || bt === 'stealth' || bt === 'immunity') return ENERGY_TYPES.EMOTIONAL;

  if (move.skillEffects?.length) {
    for (const fx of move.skillEffects) {
      const t = String(fx.type || '').toLowerCase();
      if (t.includes('truth') || t.includes('ascend') || t.includes('reality')) return ENERGY_TYPES.SPIRITUAL;
      if (t.includes('shield') || t.includes('aura') || t.includes('morale')) return ENERGY_TYPES.EMOTIONAL;
      if (t.includes('cooldown') || t.includes('cost') || t.includes('deny') || t.includes('focus')) {
        return ENERGY_TYPES.MENTAL;
      }
    }
  }

  if (typeof move.healing === 'number' && move.healing > 0) return ENERGY_TYPES.PHYSICAL;
  if (typeof move.damage === 'number' && move.damage > 0 && move.type === 'attack') return ENERGY_TYPES.PHYSICAL;

  if (typeof move.shieldBoost === 'number' && move.shieldBoost > 0) return ENERGY_TYPES.EMOTIONAL;

  if (move.category === 'manifest' && move.manifestType) {
    const mt = move.manifestType.toLowerCase();
    if (mt === 'reading' || mt === 'observation' || mt === 'gaming') return ENERGY_TYPES.MENTAL;
    if (mt === 'empathy' || mt === 'singing') return ENERGY_TYPES.EMOTIONAL;
    if (mt === 'athletics' || mt === 'cooking') return ENERGY_TYPES.PHYSICAL;
    if (mt === 'writing' || mt === 'drawing' || mt === 'creating') return ENERGY_TYPES.SPIRITUAL;
  }

  if (move.category === 'elemental') {
    if (move.type === 'attack' && (move.damage || 0) > 0) return ENERGY_TYPES.PHYSICAL;
    if (move.shieldBoost || move.type === 'defense') return ENERGY_TYPES.EMOTIONAL;
    return ENERGY_TYPES.MENTAL;
  }

  if (move.category === 'system') {
    if (dt === 'vault_hack' || (move.ppSteal || 0) > 0) return ENERGY_TYPES.MENTAL;
    if (move.shieldBoost) return ENERGY_TYPES.EMOTIONAL;
    if (desc.includes('global') || desc.includes('law') || desc.includes('reality')) return ENERGY_TYPES.SPIRITUAL;
  }

  if (move.type === 'control' || move.type === 'reveal') return ENERGY_TYPES.MENTAL;
  if (move.type === 'support' && !move.shieldBoost) return ENERGY_TYPES.MENTAL;

  // TODO: revisit ambiguous utility / stealth skills when damage formulas split by energy.
  return ENERGY_TYPES.PHYSICAL;
}

export function getResolvedMoveEnergyType(move: MoveEnergyInferenceInput): BattleEnergyType {
  return inferEnergyTypeForMove(move);
}
