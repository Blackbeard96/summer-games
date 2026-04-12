import type { Move } from '../types/battle';

export function isLevel2ManifestBattleMove(move: Pick<Move, 'id' | 'effectKey'>): boolean {
  return move.effectKey === 'level2_manifest' || (typeof move.id === 'string' && move.id.startsWith('l2-manifest::'));
}

/**
 * Label for skill cards. Level 2 Meta skills affect the live class session, not a single raid target.
 */
export function formatBattleMoveTargetLabel(move: Pick<Move, 'id' | 'effectKey' | 'targetType'>): string {
  if (isLevel2ManifestBattleMove(move)) return 'class wide';
  const t = move.targetType;
  if (!t) return '';
  return t.replace(/_/g, ' ');
}
