import type { Season, Season1BattlePassProgress } from '../types/season1';
import type { BattlePassIntroStep } from '../types/missions';
import { mergeSeason1FromStudentData } from './season1PlayerHydration';
import { compactCardProgress, season0CompactSegment } from './battlePassTierMath';

/**
 * XP that unlocks deployed-pass tiers only — reads `students/{uid}.season1.battlePass`.
 * Profile XP is not used (prevents instant max tier from unrelated progression).
 */
export function deployedBattlePassXpForSeason(activeSeasonId: string, bp: Season1BattlePassProgress): number {
  if (bp.currentSeasonId !== activeSeasonId) return 0;
  return Math.max(0, Math.floor(Number(bp.battlePassXP) || 0));
}

export type HomeBattlePassDisplay = {
  deployedActive: boolean;
  seasonSubtitle: string;
  battlePassTier: number;
  maxTier: number;
  battlePassXP: number;
  /** Progress bar fill (Season 0 and deployed pass) */
  progressPercentOverride?: number;
  battlePassXpInSegment: number;
  battlePassXpSegmentSpan: number;
  battlePassXpSegmentComplete: boolean;
  /** Deployed season has hero video and/or intro slides (Home + battle pass page) */
  battlePassIntroAvailable: boolean;
  battlePassIntroVideoUrl?: string;
  battlePassIntroSequence?: BattlePassIntroStep[];
};

export function computeHomeBattlePassDisplay(
  studentData: Record<string, unknown> | undefined,
  activeSeason: Season | null,
  season0MaxTier: number,
  calculateTierSeason0: (xp: number) => number
): HomeBattlePassDisplay {
  const profileXp = Math.max(0, Number(studentData?.xp) || 0);
  const s1 = mergeSeason1FromStudentData(studentData?.season1 as Record<string, unknown> | undefined);
  const bp = s1.battlePass;

  if (activeSeason && Array.isArray(activeSeason.tiers) && activeSeason.tiers.length > 0) {
    const xp = deployedBattlePassXpForSeason(activeSeason.id, bp);
    const r = compactCardProgress(xp, activeSeason.tiers);
    const introVideo = activeSeason.seasonIntroVideoUrl?.trim();
    const introSteps = activeSeason.introSequence;
    const battlePassIntroAvailable =
      !!introVideo || !!(introSteps && introSteps.length > 0);
    return {
      deployedActive: true,
      seasonSubtitle: activeSeason.name?.trim() || 'Battle Pass',
      battlePassTier: r.currentTier,
      maxTier: r.maxTier,
      battlePassXP: xp,
      progressPercentOverride: r.progressPercent,
      battlePassXpInSegment: r.xpInSegment,
      battlePassXpSegmentSpan: r.xpSegmentSpan,
      battlePassXpSegmentComplete: r.isComplete,
      battlePassIntroAvailable,
      battlePassIntroVideoUrl: introVideo || undefined,
      battlePassIntroSequence: introSteps?.length ? introSteps : undefined,
    };
  }

  const tier = calculateTierSeason0(profileXp);
  const seg = season0CompactSegment(profileXp, season0MaxTier, tier);
  return {
    deployedActive: false,
    seasonSubtitle: 'Season 0 Battle Pass',
    battlePassTier: tier,
    maxTier: season0MaxTier,
    battlePassXP: profileXp,
    progressPercentOverride: seg.progressPercent,
    battlePassXpInSegment: seg.xpInSegment,
    battlePassXpSegmentSpan: seg.xpSegmentSpan,
    battlePassXpSegmentComplete: seg.isComplete,
    battlePassIntroAvailable: false,
    battlePassIntroVideoUrl: undefined,
    battlePassIntroSequence: undefined,
  };
}
