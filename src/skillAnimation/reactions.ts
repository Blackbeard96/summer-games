import type { Move } from '../types/battle';
import type { SkillTargetReaction } from './types';

/** Pick a CSS-friendly reaction for impact phase (visual only). */
export function resolveTargetReaction(move: Move): SkillTargetReaction {
  if (move.healing || move.shieldBoost) {
    if (move.shieldBoost) return 'shieldHit';
    return 'healed';
  }
  if (move.buffType) return 'buffed';
  if (move.debuffType === 'shock' || move.elementalAffinity === 'lightning') return 'shockJitter';
  if (move.debuffType) return 'debuffed';
  if (move.type === 'attack' || move.damage) return 'flinch';
  return 'none';
}

export const REACTION_CLASS: Record<SkillTargetReaction, string> = {
  none: '',
  flinch: 'mst-react-flinch',
  shieldHit: 'mst-react-shield',
  stagger: 'mst-react-stagger',
  healed: 'mst-react-heal',
  buffed: 'mst-react-buff',
  debuffed: 'mst-react-debuff',
  shockJitter: 'mst-react-shock',
};
