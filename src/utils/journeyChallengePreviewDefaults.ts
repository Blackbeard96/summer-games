/**
 * Bundled Player Journey preview images (public/images).
 * Used when no admin override exists in journeyChallengeMedia / missions.
 */

export const DEFAULT_JOURNEY_CHALLENGE_PREVIEW_IMAGES: Record<string, string> = {
  'ep1-touch-truth-metal': '/images/Ch1-3_Preview.png',
  'ch2-team-formation': '/images/Ch2-1 _ Preview_Timu Island.png',
  'ch2-rival-selection': '/images/Ch2-2_Preview_Home.png',
  'ch2-team-trial': '/images/Ch2-3_Preview_SquadUp.png',
  'ep2-its-all-a-game': '/images/Ch2-4_Preview_RRCandy.png',
  'ch2-5-imposition-test': '/images/Ch2-5_Preview.png',
};

export function getDefaultJourneyChallengePreviewUrl(
  challengeId: string | null | undefined
): string | undefined {
  if (!challengeId) return undefined;
  return DEFAULT_JOURNEY_CHALLENGE_PREVIEW_IMAGES[challengeId];
}

/** Prefer admin/Firestore media, then bundled static assets. */
export function resolveJourneyChallengePreviewUrl(
  challengeId: string | null | undefined,
  media?: { previewImageUrl?: string; modalImageUrl?: string } | null
): string | undefined {
  return (
    media?.previewImageUrl ||
    media?.modalImageUrl ||
    getDefaultJourneyChallengePreviewUrl(challengeId)
  );
}
