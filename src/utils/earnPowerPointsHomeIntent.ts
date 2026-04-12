/** Fired on `window` so `PowerCardOverlay` can switch tabs without a full reload. */
export const POWER_CARD_SET_TAB_EVENT = 'xiotein:powerCardSetTab';

export type PowerCardBroadcastTabId =
  | 'live'
  | 'daily'
  | 'battlepass'
  | 'battle'
  | 'journey'
  | 'market';

const TAB_IDS: PowerCardBroadcastTabId[] = [
  'live',
  'daily',
  'battlepass',
  'battle',
  'journey',
  'market',
];

/** Persist tab + notify Power Card when already on Home. */
export function broadcastPowerCardTab(tab: PowerCardBroadcastTabId): void {
  if (!TAB_IDS.includes(tab)) return;
  try {
    localStorage.setItem('powerCardActiveTab', tab);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(POWER_CARD_SET_TAB_EVENT, { detail: tab }));
}

/** After landing on `/home`, highlight the NPC mission hub (Sonido, Zeke, etc.). */
export const HOME_HUB_MISSIONS_INTENT_KEY = 'xiotein_highlightHomeHubMissions_v1';

export function requestHomeHubMissionsHighlight(): void {
  try {
    sessionStorage.setItem(HOME_HUB_MISSIONS_INTENT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeHomeHubMissionsHighlight(): boolean {
  try {
    if (sessionStorage.getItem(HOME_HUB_MISSIONS_INTENT_KEY) === '1') {
      sessionStorage.removeItem(HOME_HUB_MISSIONS_INTENT_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
