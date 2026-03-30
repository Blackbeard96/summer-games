/**
 * Per-skill VFX registry (by stable move name). Add new rows here to opt into the full timeline.
 * Moves not listed still resolve via deriveSkillVfxFromMove() in resolveSkillVfxConfig.ts.
 *
 * Name mappings (requested vs in-repo):
 * - "Self Read" / "Room Scan" → Read the Room (reading L1-style scan)
 * - "Sketch Shield" → Pattern Shield (drawing manifest barrier)
 * - "Harmony Chorus" → Harmonic Blast (singing)
 * - "Hotfix" / "Safe Harbor" → not in repo; use Vault Hack + Shield Restoration as RR/system / support samples
 */

import type { SkillVfxConfig } from './types';
import { buildSkillVfxFromTemplate } from './buildConfig';

const REGISTRY_BY_NAME: Record<string, SkillVfxConfig> = {
  'Read the Room': buildSkillVfxFromTemplate('read-the-room', 'Read the Room', 'roomScan', {
    profile: { manifest: 'reading', tier: 1, tone: 'tactical' },
    log: { prependCastLine: true, castLineTemplate: '📖 %a focuses — %s' },
    artifactVisual: { prop: 'compass', tint: '#38bdf8' },
  }),
  'Pattern Shield': buildSkillVfxFromTemplate('pattern-shield', 'Pattern Shield', 'singleTargetShield', {
    profile: { manifest: 'drawing', tier: 1, tone: 'supportive' },
    log: { prependCastLine: true, castLineTemplate: '✏️ %a sketches — %s' },
    artifactVisual: { prop: 'pen', tint: '#a78bfa' },
  }),
  'Harmonic Blast': buildSkillVfxFromTemplate('harmonic-blast', 'Harmonic Blast', 'beam', {
    profile: { manifest: 'singing', tier: 2, tone: 'mystic' },
    timings: { travelMs: 280 },
    log: { prependCastLine: true, castLineTemplate: '🎵 %a resonates — %s' },
    artifactVisual: { prop: 'mic', tint: '#f472b6' },
  }),
  'Strategy Matrix': buildSkillVfxFromTemplate('strategy-matrix', 'Strategy Matrix', 'loadoutReveal', {
    profile: { manifest: 'gaming', tier: 3, tone: 'tactical' },
    log: { prependCastLine: true, castLineTemplate: '🎮 %a calculates — %s' },
    artifactVisual: { prop: 'hudLens', tint: '#22d3ee' },
  }),
  'Vault Hack': buildSkillVfxFromTemplate('vault-hack', 'Vault Hack', 'glitchPulse', {
    profile: { tier: 2, tone: 'clean', targetType: 'singleEnemy' },
    log: { prependCastLine: true, castLineTemplate: '⚙️ %a executes — %s' },
    artifactVisual: { prop: 'card', tint: '#94a3b8' },
  }),
  'Shield Restoration': buildSkillVfxFromTemplate('shield-restoration', 'Shield Restoration', 'healPulse', {
    profile: { tier: 2, tone: 'supportive', targetType: 'self' },
    log: { prependCastLine: true, castLineTemplate: '🛡️ %a restores — %s' },
  }),
  'Ember Jab': buildSkillVfxFromTemplate('ember-jab', 'Ember Jab', 'quickProjectile', {
    profile: { element: 'fire', tier: 1, tone: 'aggressive' },
    log: { prependCastLine: true, castLineTemplate: '🔥 %a strikes — %s' },
    artifactVisual: { prop: 'gauntlet', tint: '#f97316' },
  }),
  Wildfire: buildSkillVfxFromTemplate('wildfire', 'Wildfire', 'aoeBurst', {
    profile: { element: 'fire', tier: 3, tone: 'aggressive' },
    camera: { shake: 'medium', panToTarget: true },
    log: { prependCastLine: true, castLineTemplate: '🔥 %a unleashes — %s' },
  }),
  'Mist Veil': buildSkillVfxFromTemplate('mist-veil', 'Mist Veil', 'selfBarrier', {
    profile: { element: 'water', tier: 2, tone: 'mystic' },
    log: { prependCastLine: true, castLineTemplate: '💧 %a shrouds — %s' },
  }),
  'Truth Lock': buildSkillVfxFromTemplate('truth-lock', 'Truth Lock', 'lockoutSeal', {
    profile: { element: 'truth', tier: 3, tone: 'tactical' },
    log: { prependCastLine: true, castLineTemplate: '◇ %a seals — %s' },
    artifactVisual: { prop: 'ring', tint: '#e2e8f0' },
  }),
};

/** Placeholder configs for skills not yet in data files (opt-in when you add the moves). */
export const PLACEHOLDER_SKILL_ANIM_IDS: Record<string, string> = {
  Hotfix: 'Use template glitchPulse + system tone when move exists',
  'Safe Harbor': 'Use teamShieldPulse or healPulse when move exists',
};

export function getRegistryConfigByMoveName(name: string): SkillVfxConfig | undefined {
  return REGISTRY_BY_NAME[name];
}
