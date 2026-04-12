import {
  LEVEL2_IMPACT_AREA_LABELS,
  LEVEL2_IMPACT_LABELS,
  LEVEL2_MANIFEST_TYPE_LABELS,
  LEVEL2_RESULT_LABELS,
  LEVEL2_TARGET_LABELS,
} from '../data/level2ManifestSkillConfig';
import type {
  Level2ManifestImpact,
  Level2ManifestImpactArea,
  Level2ManifestResult,
  Level2ManifestTarget,
  Level2ManifestTypeCategory,
} from '../types/level2Manifest';

export function formatLevel2ResultClause(params: {
  impactArea?: Level2ManifestImpactArea | null;
  resultMagnitude?: number | null;
  result: Level2ManifestResult;
}): string {
  const area = params.impactArea ?? 'pp';
  const mag = params.resultMagnitude;
  if (typeof mag === 'number' && Number.isFinite(mag)) {
    if (area === 'pp') return `${Math.round(mag)} PP`;
    if (area === 'player_skills' || area === 'cooldowns') {
      const t = Math.max(1, Math.min(4, Math.floor(mag)));
      return `${t} turn${t === 1 ? '' : 's'}`;
    }
  }
  return LEVEL2_RESULT_LABELS[params.result];
}

export function buildLevel2SkillDescription(params: {
  skillName: string;
  manifestType: Level2ManifestTypeCategory;
  target: Level2ManifestTarget;
  impact: Level2ManifestImpact;
  impactArea?: Level2ManifestImpactArea | null;
  result: Level2ManifestResult;
  resultMagnitude?: number | null;
}): string {
  const t = LEVEL2_MANIFEST_TYPE_LABELS[params.manifestType];
  const tgt = LEVEL2_TARGET_LABELS[params.target];
  const im = LEVEL2_IMPACT_LABELS[params.impact];
  const res = formatLevel2ResultClause({
    impactArea: params.impactArea,
    resultMagnitude: params.resultMagnitude,
    result: params.result,
  });
  const area =
    params.impactArea && LEVEL2_IMPACT_AREA_LABELS[params.impactArea]
      ? LEVEL2_IMPACT_AREA_LABELS[params.impactArea]
      : null;
  const scope = area ? `${im} on ${area}` : im;
  return `${params.skillName} — ${t}, ${tgt}: ${scope} (${res}). Live Events only · Meta / Flow tuned.`;
}

export function validateLevel2SkillName(name: string): string | null {
  const t = name.trim();
  if (t.length < 2) return 'Name must be at least 2 characters.';
  if (t.length > 40) return 'Name must be 40 characters or less.';
  if (!/^[\w\s\-–—'.:]+$/i.test(t)) return 'Use letters, numbers, spaces, colons, and simple punctuation only.';
  return null;
}
