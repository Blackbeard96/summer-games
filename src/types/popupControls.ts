/**
 * Admin kill-switches for login / home popups and global notifiers.
 * Stored at adminSettings/popupControls. Missing fields default to ON.
 */

export const POPUP_CONTROLS_DOC = 'popupControls';

export type PopupControlKey =
  | 'enableDailyGeneratorModal'
  | 'enableChapter2Announcement'
  | 'enableSquadCheckInReminder'
  | 'enableSkillLoadoutTutorial'
  | 'enableSeason0Intro'
  | 'enableBattlePassIntroAuto'
  | 'enableAssessmentGoalReminder'
  | 'enableAssessmentGoalResultModal'
  | 'enableRewardNotifications'
  | 'enableSquadInvitePopup'
  | 'enableBattleInvitePopup'
  | 'enableLiveEventJoinBanner'
  | 'enableWelcomeTutorial';

export type PopupControls = Record<PopupControlKey, boolean>;

export interface PopupControlMeta {
  key: PopupControlKey;
  label: string;
  description: string;
  group: 'Login queue' | 'Home intros' | 'Global notifiers';
}

/** Default: all popups enabled (preserves current player experience). */
export const DEFAULT_POPUP_CONTROLS: PopupControls = {
  enableDailyGeneratorModal: true,
  enableChapter2Announcement: true,
  enableSquadCheckInReminder: true,
  enableSkillLoadoutTutorial: true,
  enableSeason0Intro: true,
  enableBattlePassIntroAuto: true,
  enableAssessmentGoalReminder: true,
  enableAssessmentGoalResultModal: true,
  enableRewardNotifications: true,
  enableSquadInvitePopup: true,
  enableBattleInvitePopup: true,
  enableLiveEventJoinBanner: true,
  enableWelcomeTutorial: true,
};

export const POPUP_CONTROL_META: PopupControlMeta[] = [
  {
    key: 'enableDailyGeneratorModal',
    label: 'Daily Generator Earnings',
    description: 'Shows vault generator PP/shield earnings on first login of the day.',
    group: 'Login queue',
  },
  {
    key: 'enableChapter2Announcement',
    label: 'Chapter / Rollout Announcements',
    description: 'Carousel for unseen announcements (e.g. Chapter 2 partial open).',
    group: 'Login queue',
  },
  {
    key: 'enableSquadCheckInReminder',
    label: 'Squad Check-In Reminder',
    description: 'Daily reminder to check in with the squad.',
    group: 'Login queue',
  },
  {
    key: 'enableSkillLoadoutTutorial',
    label: 'Skill Loadout Tutorial',
    description: 'One-time tutorial for players who have not completed it yet.',
    group: 'Login queue',
  },
  {
    key: 'enableSeason0Intro',
    label: 'Season 0 Intro',
    description: 'Auto-opens Season 0 / Timu Island intro for players who have not seen it.',
    group: 'Home intros',
  },
  {
    key: 'enableBattlePassIntroAuto',
    label: 'Battle Pass Intro (auto)',
    description: 'Auto-opens the active battle pass intro video/slides on Home. Manual replay from Power Card still works.',
    group: 'Home intros',
  },
  {
    key: 'enableAssessmentGoalReminder',
    label: 'Assessment Goal Reminder',
    description: 'Reminds students to set goals on open assessments after login.',
    group: 'Global notifiers',
  },
  {
    key: 'enableAssessmentGoalResultModal',
    label: 'Assessment Goal Result',
    description: 'Shows graded assessment goal result notifications.',
    group: 'Global notifiers',
  },
  {
    key: 'enableRewardNotifications',
    label: 'Reward / PP Notifications',
    description: 'Badge unlock and PP approval reward popups.',
    group: 'Global notifiers',
  },
  {
    key: 'enableSquadInvitePopup',
    label: 'Squad Invite Popup',
    description: 'Incoming squad invitation prompts.',
    group: 'Global notifiers',
  },
  {
    key: 'enableBattleInvitePopup',
    label: 'Battle Invite Popup',
    description: 'Incoming battle / Island Raid invitation prompts.',
    group: 'Global notifiers',
  },
  {
    key: 'enableLiveEventJoinBanner',
    label: 'Live Event Join Banner',
    description: 'Bottom banner when a class Live Event is active.',
    group: 'Global notifiers',
  },
  {
    key: 'enableWelcomeTutorial',
    label: 'Welcome / Navigation Tutorial',
    description: 'Legacy welcome tutorial auto-trigger (TutorialManager).',
    group: 'Global notifiers',
  },
];
