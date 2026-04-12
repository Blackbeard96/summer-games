import type { LegacyRRCandyType } from './rrCandyUtils';

/** Canonical config ids used in system_config and skill_state. */
export type RRCandyConfigId = 'konfig' | 'on_off' | 'up_down';

/** Map chapter / artifact candyChoice values to config document ids. */
export function legacyCandyTypeToConfigId(
  candyType: LegacyRRCandyType | (string & {}) | null | undefined
): RRCandyConfigId | null {
  if (!candyType) return null;
  const n = String(candyType).toLowerCase().replace(/_/g, '-');
  if (n === 'on-off' || n === 'onoff') return 'on_off';
  if (n === 'up-down' || n === 'updown') return 'up_down';
  if (n === 'config' || n === 'konfig') return 'konfig';
  return null;
}

/** Battle Move id from catalog skillId (underscores → hyphens). */
export function rrCandyBattleMoveIdFromSkillId(skillId: string): string {
  return `rr-candy-${skillId.replace(/_/g, '-')}`;
}
