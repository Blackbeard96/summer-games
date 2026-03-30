import type { Move } from '../types/battle';
import type { AnimationTier, SkillAnimationProfile, SkillVfxConfig, VfxQuality } from './types';
import { getRegistryConfigByMoveName } from './registry';
import { getTemplate } from './templates';
import { scaleTimingsForTier, tierShakeLevel } from './tierScaling';

function moveLevelToTier(move: Move): AnimationTier {
  const L = Math.max(1, Math.min(5, move.level || 1));
  if (move.category === 'elemental') {
    return Math.min(4, L) as AnimationTier;
  }
  return Math.min(4, Math.max(1, Math.round((L / 5) * 4))) as AnimationTier;
}

function mapTargetType(move: Move): SkillAnimationProfile['targetType'] {
  const t = move.targetType;
  if (t === 'self') return 'self';
  if (t === 'team') return 'team';
  if (t === 'enemy_team' || t === 'all') return 'allEnemies';
  if (t === 'single' || t === 'enemy') return 'singleEnemy';
  return 'singleEnemy';
}

function deriveElement(move: Move): SkillAnimationProfile['element'] | undefined {
  const a = move.elementalAffinity;
  if (!a) return undefined;
  if (a === 'metal') return 'truth';
  return a as SkillAnimationProfile['element'];
}

/** Default config when no registry entry — keeps battles working with sensible generic motion. */
export function deriveSkillVfxFromMove(move: Move): SkillVfxConfig {
  const tier = moveLevelToTier(move);
  const targetType = mapTargetType(move);
  const element = deriveElement(move);
  const manifest = move.manifestType;

  let templateId: Parameters<typeof getTemplate>[0] = 'quickProjectile';
  if (move.type === 'defense' || move.shieldBoost) templateId = 'selfBarrier';
  else if (move.healing && move.targetType === 'team') templateId = 'teamShieldPulse';
  else if (move.healing) templateId = 'healPulse';
  else if (move.type === 'reveal' || move.type === 'utility') templateId = 'targetScan';
  else if (move.category === 'system') templateId = 'glitchPulse';
  else if (move.type === 'control') templateId = 'debuffPulse';
  else if (move.elementalAffinity && move.type === 'attack') templateId = tier >= 3 ? 'heavyProjectile' : 'quickProjectile';

  const t = getTemplate(templateId);
  const profile: SkillAnimationProfile = {
    ...t.profile,
    tier,
    targetType,
    tone: move.type === 'support' ? 'supportive' : move.type === 'attack' ? 'aggressive' : 'clean',
    element: element ?? t.profile.element,
    manifest: manifest ?? t.profile.manifest,
  };

  return {
    id: move.id,
    name: move.name,
    templateId,
    profile,
    timings: { ...t.timings },
    vfx: { ...t.vfxKeys },
    camera: { shake: tierShakeLevel(tier), panToTarget: move.type === 'attack' && targetType === 'singleEnemy' },
    ui: { showSkillName: true, showElementBadge: !!element },
    log: { prependCastLine: false },
  };
}

export function resolveSkillVfxConfig(move: Move, quality: VfxQuality = 'high'): SkillVfxConfig {
  const reg = getRegistryConfigByMoveName(move.name);
  const base = reg
    ? {
        ...reg,
        profile: {
          ...reg.profile,
          element: reg.profile.element ?? deriveElement(move),
          manifest: reg.profile.manifest ?? move.manifestType,
          tier: reg.profile.tier ?? moveLevelToTier(move),
          targetType: reg.profile.targetType ?? mapTargetType(move),
        },
      }
    : deriveSkillVfxFromMove(move);

  const scaledTimings = scaleTimingsForTier(base.timings, base.profile.tier, quality);
  return {
    ...base,
    timings: scaledTimings,
    camera: {
      ...base.camera,
      shake: base.camera?.shake ?? tierShakeLevel(base.profile.tier),
    },
  };
}
