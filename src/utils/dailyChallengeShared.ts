import type { Move } from '../types/battle';
import { getMoveNameSync } from './moveOverrides';

/** Applied to stored challenge rewardPP / rewardXP / rewardTruthMetal for display and grants. */
export const DAILY_CHALLENGE_REWARD_MULTIPLIER = 10;

export function scaledDailyChallengeRewardPP(raw: number | undefined): number {
  return Math.max(0, Math.floor((raw ?? 0) * DAILY_CHALLENGE_REWARD_MULTIPLIER));
}

export function scaledDailyChallengeRewardXP(raw: number | undefined): number {
  return Math.max(0, Math.floor((raw ?? 0) * DAILY_CHALLENGE_REWARD_MULTIPLIER));
}

export function scaledDailyChallengeRewardTruthMetal(raw: number | undefined): number {
  return Math.max(0, Math.floor((raw ?? 0) * DAILY_CHALLENGE_REWARD_MULTIPLIER));
}

const NUMBER_WORD_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * Prefer a target parsed from the challenge title (e.g. "THREE (3)") so UI and Firestore progress
 * stay aligned when the stored `target` field is wrong.
 */
export function getEffectiveDailyChallengeTarget(challenge: { title?: string; target?: number }): number {
  const title = challenge.title ?? '';

  const parenMatch = title.match(/\((\d+)\)/);
  if (parenMatch) {
    const extractedTarget = parseInt(parenMatch[1], 10);
    if (extractedTarget > 0) return extractedTarget;
  }

  const titleLower = title.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORD_MAP)) {
    if (titleLower.includes(word)) {
      const digitMatch = title.match(/\b(\d+)\b/);
      if (digitMatch && parseInt(digitMatch[1], 10) === num) {
        return num;
      }
    }
  }

  const stored = challenge.target;
  if (typeof stored === 'number' && Number.isFinite(stored) && stored > 0) {
    return Math.floor(stored);
  }
  return 1;
}

export function normalizeDailyChallengeTypeKey(t: string): string {
  return String(t)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
}

/**
 * Maps event keys from `updateChallengeProgressByType` to normalized admin/Firestore type variants.
 */
const EVENT_CHALLENGE_SYNONYMS: Record<string, string[]> = {
  defeat_enemies: ['defeat_enemy', 'defeat_opponents', 'kill_enemies', 'enemies_defeated', 'defeat', 'defeat_enemy_units'],
  use_elemental_move: [
    'use_elemental_moves',
    'elemental_move',
    'elemental_moves',
    'elemental',
    'use_element',
    'use_3_elemental_moves',
    'three_elemental_moves',
  ],
  use_manifest_ability: [
    'use_manifest_abilities',
    'manifest_ability',
    'manifest_abilities',
    'manifest',
    'use_manifest',
    'use_your_manifest_abilities',
  ],
  attack_vault: ['vault_attack', 'attack_a_vault', 'attack_vaults'],
  use_action_card: ['use_action_cards', 'action_card', 'action_cards'],
  win_battle: ['win_battles', 'win_a_battle', 'battle_win'],
  earn_pp: ['earn_power_points', 'earn_pp_total', 'gain_pp'],
  /** Profile XP (`students.xp`) — see `playerProgressionRewards.grantPlayerProfileXp` / `mirrorProfileXpToProgressionSystems`. */
  earn_xp: [
    'earn_experience',
    'gain_xp',
    'gain_experience',
    'earn_profile_xp',
    'xp_earned',
    'collect_xp',
  ],
  /** Counts once per finalized Live Event session for roster participants (see `finalizeSessionStats`). */
  participate_live_event: [
    'live_event',
    'live_events',
    'join_live_event',
    'live_session',
    'in_session',
    'class_session',
  ],
  use_health_potion: ['use_health_potions', 'health_potion', 'use_potion'],
};

export function dailyChallengeStoredTypeMatchesEvent(
  storedType: string | undefined,
  eventChallengeType: string
): boolean {
  if (!storedType) return false;
  const ns = normalizeDailyChallengeTypeKey(storedType);
  const ne = normalizeDailyChallengeTypeKey(eventChallengeType);
  if (ns === ne) return true;
  const synonyms = EVENT_CHALLENGE_SYNONYMS[ne];
  if (synonyms?.some((s) => normalizeDailyChallengeTypeKey(s) === ns)) return true;

  // Admin text / legacy: full sentence saved as `type`, or title pasted into type field
  if (ne === 'use_manifest_ability' && ns.includes('manifest')) return true;
  if (ne === 'use_elemental_move' && ns.includes('elemental')) return true;

  return false;
}

const MANIFEST_NAME_SNIPPETS = [
  'read the room',
  'emotional read',
  'pattern shield',
  'team read',
  'environment read',
  'reality rewrite',
  'narrative barrier',
  'story weave',
  'world rewrite',
  'illusion strike',
  'mirage shield',
  'visual deception',
  'reality illusion',
  'flow strike',
  'rhythm guard',
  'team flow',
  'athletic mastery',
  'harmonic blast',
  'melody shield',
  'chorus power',
  'song of power',
  'pattern break',
  'strategy matrix',
  'game mastery',
  'ultimate strategy',
  'precision strike',
  'memory shield',
  'perfect observation',
  'omniscient view',
  'emotional resonance',
  'empathic barrier',
  'group empathy',
  'universal connection',
  'tool strike',
  'construct shield',
  'creative mastery',
  'divine creation',
  'energy feast',
  'nourishing barrier',
  'feast of power',
  'divine nourishment',
  // Display / VFX / override aliases (getMoveNameSync) — still manifest-branch skills
  'room scan',
  'self read',
  'narrative weave',
  'strike counter',
  'foresight',
  'evasive calibration',
  'system redirect',
];

export function moveCountsForDailyElementalChallenge(
  move: Pick<Move, 'category' | 'elementalAffinity'>
): boolean {
  if (move.category === 'elemental') return true;
  if (move.elementalAffinity && move.category !== 'manifest') return true;
  return false;
}

export function moveCountsForDailyManifestChallenge(
  move: Pick<
    Move,
    'category' | 'manifestType' | 'id' | 'name' | 'rrCandySkillId' | 'rrCandyNodeId' | 'effectKey'
  >
): boolean {
  if (move.category === 'manifest') return true;
  if (move.manifestType) return true;
  if (move.rrCandySkillId || move.rrCandyNodeId) return true;
  const id = move.id || '';
  if (id.startsWith('rr-candy') || id.startsWith('rrCandy')) return true;
  if (move.effectKey === 'level2_manifest') return true;

  const idLower = (move.id || '').toLowerCase();
  if (idLower.startsWith('l2-manifest::') || idLower.includes('manifest-')) return true;

  const raw = (move.name || '').trim();
  const resolved = raw ? (getMoveNameSync(raw) || '').trim() : '';
  const combined = `${raw} ${resolved}`.toLowerCase();
  if (combined && MANIFEST_NAME_SNIPPETS.some((p) => combined.includes(p))) return true;
  return false;
}
