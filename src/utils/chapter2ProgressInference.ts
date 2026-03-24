/**
 * Infer Chapter 2 challenge completion when `users.chapters.2.challenges` was wiped
 * but canonical progress still exists (squad, rival, artifacts, RR Candy unlock).
 * Keeps ChapterDetail / journey UI aligned with real game state.
 */

import { getRRCandyStatus } from './rrCandyUtils';

function mergedArtifacts(userProgress: any, studentData?: any): Record<string, unknown> {
  const u = userProgress?.artifacts;
  const s = studentData?.artifacts;
  const uo = u && typeof u === 'object' && !Array.isArray(u) ? (u as Record<string, unknown>) : {};
  const so = s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
  return { ...so, ...uo };
}

function userProgressWithMergedArtifacts(userProgress: any, studentData?: any) {
  return {
    ...userProgress,
    artifacts: mergedArtifacts(userProgress, studentData)
  };
}

/**
 * True if this challenge is completed in Firestore OR we can infer it from profile/squad/artifacts.
 */
export function isChapter2ChallengeEffectivelyComplete(
  challengeId: string,
  chapterProgress: any,
  userProgress: any,
  studentData?: any
): boolean {
  const c = chapterProgress?.challenges?.[challengeId];
  if (c?.isCompleted === true || c?.status === 'approved') return true;

  switch (challengeId) {
    case 'ch2-team-formation':
      return !!(userProgress?.team?.id || userProgress?.squad?.id);
    case 'ch2-rival-selection':
      return !!userProgress?.rival || !!userProgress?.rivals?.chosen;
    case 'ch2-team-trial': {
      const a = mergedArtifacts(userProgress, studentData);
      return (
        a['captains-helmet'] === true ||
        a['captain-helmet'] === true ||
        a['captains_helmet'] === true
      );
    }
    case 'ep2-its-all-a-game':
      return getRRCandyStatus(userProgressWithMergedArtifacts(userProgress, studentData)).unlocked;
    default:
      return false;
  }
}
