/**
 * Skill Analytics "By player" view (pure): one row per student with their mastery across skills.
 */

import type { PlayerSkillMastery, SkillMasteryBand } from '../types/academicSkills';
import { getMasteryBand } from './masteryCalculations';

export interface PlayerSkillSummary {
  userId: string;
  name: string;
  /** Skills with at least one answer, strongest first. */
  skills: Array<PlayerSkillMastery & { band: SkillMasteryBand }>;
  explored: number;
  masteredStrong: number;
  developing: number;
  weakCritical: number;
  /** Mean mastery across explored skills; null when nothing explored. */
  avgMastery: number | null;
  attempts: number;
}

export function buildPlayerSkillSummaries(
  studentIds: string[],
  names: Map<string, string>,
  masteryByUser: Map<string, PlayerSkillMastery[]>,
  includeSkill: (skillId: string) => boolean = () => true
): PlayerSkillSummary[] {
  return studentIds.map((userId) => {
    const skills = (masteryByUser.get(userId) || [])
      .filter((m) => m.totalAttempts > 0 && includeSkill(m.skillId))
      .map((m) => ({ ...m, band: getMasteryBand(m.masteryScore, m.totalAttempts) }))
      .sort((a, b) => b.masteryScore - a.masteryScore);
    const count = (bands: SkillMasteryBand[]) => skills.filter((s) => bands.includes(s.band)).length;
    return {
      userId,
      name: names.get(userId) || userId.slice(0, 8),
      skills,
      explored: skills.length,
      masteredStrong: count(['mastered', 'strong']),
      developing: count(['developing']),
      weakCritical: count(['weak', 'critical']),
      avgMastery:
        skills.length > 0
          ? Math.round((skills.reduce((sum, s) => sum + s.masteryScore, 0) / skills.length) * 10) / 10
          : null,
      attempts: skills.reduce((sum, s) => sum + (s.totalAttempts || 0), 0),
    };
  });
}

export function formatLastPracticed(value: unknown): string {
  const t = value as { toDate?: () => Date; seconds?: number } | null | undefined;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value)
        : t?.toDate
          ? t.toDate()
          : typeof t?.seconds === 'number'
            ? new Date(t.seconds * 1000)
            : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
}

export function trendLabel(trend: number[] | undefined): { text: string; color: string } | null {
  if (!trend || trend.length < 2) return null;
  const delta = Math.round(trend[trend.length - 1] - trend[0]);
  if (delta === 0) return { text: '→ steady', color: '#9ca3af' };
  return delta > 0 ? { text: `↑ +${delta}`, color: '#6ee7b7' } : { text: `↓ ${delta}`, color: '#fca5a5' };
}

export type PlayerSort = 'name' | 'mastery-desc' | 'mastery-asc';

export function sortPlayerSummaries(rows: PlayerSkillSummary[], sort: PlayerSort): PlayerSkillSummary[] {
  const byName = (a: PlayerSkillSummary, b: PlayerSkillSummary) => a.name.localeCompare(b.name);
  if (sort === 'name') return [...rows].sort(byName);
  const dir = sort === 'mastery-desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    // Students with nothing explored always sink to the bottom.
    if (a.avgMastery === null || b.avgMastery === null) {
      return a.avgMastery === b.avgMastery ? byName(a, b) : a.avgMastery === null ? 1 : -1;
    }
    return (a.avgMastery - b.avgMastery) * dir || byName(a, b);
  });
}
