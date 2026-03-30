import type { AnimationTier, SkillAnimationProfile, SkillVfxConfig } from './types';
import { getTemplate, type TemplateId } from './templates';

export function buildSkillVfxFromTemplate(
  id: string,
  displayName: string,
  templateId: TemplateId,
  patch: {
    profile?: Partial<SkillAnimationProfile>;
    timings?: Partial<SkillVfxConfig['timings']>;
    vfx?: Partial<NonNullable<SkillVfxConfig['vfx']>>;
    ui?: SkillVfxConfig['ui'];
    sfx?: SkillVfxConfig['sfx'];
    camera?: SkillVfxConfig['camera'];
    artifactVisual?: SkillVfxConfig['artifactVisual'];
    log?: SkillVfxConfig['log'];
  } = {}
): SkillVfxConfig {
  const t = getTemplate(templateId);
  const tier = (patch.profile?.tier ?? t.profile.tier) as AnimationTier;
  return {
    id,
    name: displayName,
    templateId,
    profile: { ...t.profile, ...patch.profile, tier },
    timings: { ...t.timings, ...patch.timings },
    vfx: { ...t.vfxKeys, ...patch.vfx },
    ui: patch.ui,
    sfx: patch.sfx,
    camera: patch.camera,
    artifactVisual: patch.artifactVisual,
    log: patch.log,
  };
}
