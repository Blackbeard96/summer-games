/**
 * Skill Card activation events: dedupe + queue rules (pure) and a tiny module-level bus so battle
 * code (callbacks, services) can announce confirmed activations without React context plumbing.
 */
import type { SkillArtInput } from './skillArtworkDefaults';

export type SkillActivationSide = 'self' | 'ally' | 'enemy';

export interface SkillActivationEvent {
  /** Stable id from the confirmed action (doc id, log index, turn key). Used for dedupe. */
  id: string;
  skill: SkillArtInput & { name: string };
  /** Display name shown on the card (admin overrides already applied by the caller when wanted). */
  skillDisplayName?: string;
  actorName: string;
  actorUid?: string | null;
  side?: SkillActivationSide;
  targetName?: string | null;
}

/** Spec timing: 0.3s entrance + 0.4s reveal + 1.4s display + 0.4s exit. */
export const SKILL_CARD_DURATION_MS = 2500;
/** Used while more cards are waiting so the queue never lags far behind the battle. */
export const SKILL_CARD_ACCELERATED_MS = 1250;
export const SKILL_CARD_REDUCED_MOTION_MS = 1800;
export const SKILL_CARD_MAX_PENDING = 3;
/** Same actor + same skill inside this window is treated as one activation (double hooks). */
export const SKILL_CARD_SOFT_DEDUPE_MS = 1500;

export interface SkillActivationDedupeState {
  seenIds: string[];
  recentSoft: Record<string, number>;
}

const MAX_SEEN_IDS = 300;

export const createDedupeState = (): SkillActivationDedupeState => ({ seenIds: [], recentSoft: {} });

const softKey = (e: SkillActivationEvent) =>
  `${(e.actorUid || e.actorName || '').toLowerCase()}|${(e.skill.id || e.skill.name || '').toLowerCase()}`;

/** Returns true when the event should be shown; records it either way. */
export const acceptActivation = (
  state: SkillActivationDedupeState,
  event: SkillActivationEvent,
  now: number
): boolean => {
  if (!event?.id || !event.skill?.name) return false;
  if (state.seenIds.includes(event.id)) return false;
  state.seenIds.push(event.id);
  if (state.seenIds.length > MAX_SEEN_IDS) state.seenIds.splice(0, state.seenIds.length - MAX_SEEN_IDS);

  const key = softKey(event);
  const last = state.recentSoft[key];
  state.recentSoft[key] = now;
  Object.keys(state.recentSoft).forEach((k) => {
    if (now - state.recentSoft[k] > SKILL_CARD_SOFT_DEDUPE_MS * 4) delete state.recentSoft[k];
  });
  return !(last !== undefined && now - last < SKILL_CARD_SOFT_DEDUPE_MS);
};

/** Appends in confirmed order; drops the oldest waiting cards past the cap. */
export const enqueuePending = (pending: SkillActivationEvent[], event: SkillActivationEvent): SkillActivationEvent[] => {
  const next = [...pending, event];
  return next.length > SKILL_CARD_MAX_PENDING ? next.slice(next.length - SKILL_CARD_MAX_PENDING) : next;
};

export const getCardDuration = (pendingCount: number, reducedMotion: boolean): number => {
  if (reducedMotion) return pendingCount > 0 ? SKILL_CARD_ACCELERATED_MS : SKILL_CARD_REDUCED_MOTION_MS;
  return pendingCount > 0 ? SKILL_CARD_ACCELERATED_MS : SKILL_CARD_DURATION_MS;
};

type BusMessage = { kind: 'show'; event: SkillActivationEvent } | { kind: 'clear'; keepCurrent: boolean };
const subscribers = new Set<(msg: BusMessage) => void>();
const busDedupe = createDedupeState();

export const subscribeSkillActivations = (fn: (msg: BusMessage) => void): (() => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};

/** Announce a confirmed, successful skill activation. Never throws; visual only. */
export const emitSkillActivation = (event: SkillActivationEvent): boolean => {
  try {
    if (!acceptActivation(busDedupe, event, Date.now())) return false;
    subscribers.forEach((fn) => fn({ kind: 'show', event }));
    return true;
  } catch (error) {
    console.warn('[skillActivation] emit failed', error);
    return false;
  }
};

/** Mark ids as already seen (e.g. history present on first snapshot) so they never replay. */
export const markSkillActivationsSeen = (ids: string[]) => {
  ids.forEach((id) => {
    if (id && !busDedupe.seenIds.includes(id)) busDedupe.seenIds.push(id);
  });
  if (busDedupe.seenIds.length > MAX_SEEN_IDS) busDedupe.seenIds.splice(0, busDedupe.seenIds.length - MAX_SEEN_IDS);
};

/**
 * Drop waiting cards (battle ended / player left). `keepCurrent` lets the final card finish
 * (e.g. the finishing blow) instead of vanishing mid-animation.
 */
export const clearSkillActivations = (options: { keepCurrent?: boolean } = {}) => {
  subscribers.forEach((fn) => fn({ kind: 'clear', keepCurrent: !!options.keepCurrent }));
};
