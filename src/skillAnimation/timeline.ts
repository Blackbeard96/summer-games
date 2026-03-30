import type { SkillVfxConfig, SkillAnimationRuntimeEvent, VfxQuality } from './types';
import { vfxDensityScale } from './vfxQuality';

export interface TimelineEntry {
  atMs: number;
  event: SkillAnimationRuntimeEvent;
}

export interface BuiltTimeline {
  entries: TimelineEntry[];
  /** End of aftereffect; parent should call gameplay resolve after this + small padding. */
  totalMs: number;
}

/**
 * Monotonic timeline for hooking UI/SFX. Gameplay resolution stays after totalMs (see SkillAnimationLayer).
 */
export function buildSkillAnimationTimeline(
  config: SkillVfxConfig,
  quality: VfxQuality
): BuiltTimeline {
  const t = config.timings;
  const scale = 1 / Math.max(0.45, vfxDensityScale(quality));
  const ms = (n: number) => Math.max(0, Math.round(n * scale));

  const entries: TimelineEntry[] = [];
  let c = 0;
  const add = (delta: number, event: SkillAnimationRuntimeEvent) => {
    c += delta;
    entries.push({ atMs: c, event });
  };
  const wait = (delta: number) => {
    c += delta;
  };

  const cast = ms(t.castMs);
  add(cast * 0.25, 'onCastStart');
  add(cast * 0.35, 'onCastCharge');
  add(cast * 0.4, 'onCastRelease');

  const man = ms(t.manifestationMs ?? 0);
  if (man > 0) {
    wait(Math.max(20, man * 0.45));
    entries.push({ atMs: c, event: 'onManifestationPeak' });
    wait(Math.max(0, man * 0.55));
  }

  const travel = ms(t.travelMs ?? 0);
  if (travel > 0) {
    add(travel * 0.15, 'onProjectileSpawn');
    add(travel * 0.85, 'onProjectileHit');
  } else {
    add(30, 'onProjectileSpawn');
    add(45, 'onProjectileHit');
  }

  add(ms(t.impactDelayMs ?? 40), 'onEffectApply');

  const after = ms(t.afterMs ?? 200);
  add(Math.max(50, after * 0.4), 'onAfterEffectStart');
  wait(Math.max(80, after * 0.6));

  return { entries, totalMs: c + 80 };
}

export function getTimelineTotalMs(built: BuiltTimeline): number {
  return built.totalMs;
}
