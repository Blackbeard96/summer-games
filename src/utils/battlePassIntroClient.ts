/** Client backup so the season intro auto-open does not repeat if Firestore write fails or student doc is missing. */
const LS_PREFIX = 'xiotein.battlePassIntroDismissed';

function key(uid: string, seasonId: string): string {
  return `${LS_PREFIX}:${uid}:${seasonId}`;
}

export function isBattlePassIntroDismissedLocally(uid: string | undefined, seasonId: string | null | undefined): boolean {
  if (!uid || !seasonId?.trim()) return false;
  try {
    return localStorage.getItem(key(uid, seasonId.trim())) === '1';
  } catch {
    return false;
  }
}

export function markBattlePassIntroDismissedLocally(uid: string, seasonId: string): void {
  const sid = String(seasonId || '').trim();
  if (!uid || !sid) return;
  try {
    localStorage.setItem(key(uid, sid), '1');
  } catch {
    /* ignore quota / private mode */
  }
}
