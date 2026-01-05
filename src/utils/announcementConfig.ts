/**
 * Announcement configuration for rollout management
 * Each announcement has a unique ID that persists across rollouts
 */

export const ROLLOUT_ANNOUNCEMENTS = {
  CHAPTER2_PARTIAL_OPEN: 'chapter2_partial_open_2026_01_04',
} as const;

export type AnnouncementId = typeof ROLLOUT_ANNOUNCEMENTS[keyof typeof ROLLOUT_ANNOUNCEMENTS];

/**
 * Get the current announcement IDs that should be shown
 * This allows us to control which announcements are active
 */
export function getActiveAnnouncements(): AnnouncementId[] {
  return [
    ROLLOUT_ANNOUNCEMENTS.CHAPTER2_PARTIAL_OPEN,
  ];
}


