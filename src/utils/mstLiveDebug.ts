/**
 * Classroom Live Event diagnostics.
 * Enable: localStorage.setItem('MST_LIVE_DEBUG', '1') or REACT_APP_DEBUG_LIVE_EVENTS=true
 * Disable: localStorage.removeItem('MST_LIVE_DEBUG')
 */

export type MstLiveLogPhase =
  | 'JOIN'
  | 'START'
  | 'QUESTION'
  | 'ANSWER'
  | 'ATTACK'
  | 'SKILL'
  | 'ITEM'
  | 'REVIVE'
  | 'ELIMINATION'
  | 'PLACEMENT'
  | 'REWARD'
  | 'BATTLE PASS'
  | 'DAILY'
  | 'RECONNECT'
  | 'ERROR';

function isEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.REACT_APP_DEBUG_LIVE_EVENTS === 'true') {
    return true;
  }
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('MST_LIVE_DEBUG') === '1';
  } catch {
    return false;
  }
}

/** Structured Live Event log — no emails/tokens. Safe for classroom console. */
export function mstLiveLog(
  phase: MstLiveLogPhase,
  message: string,
  meta?: Record<string, unknown>
): void {
  if (!isEnabled()) return;
  const safe: Record<string, unknown> = {};
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue;
      if (typeof v === 'string' && (k.toLowerCase().includes('email') || k.toLowerCase().includes('token'))) {
        continue;
      }
      safe[k] = v;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[MST LIVE][${phase}] ${message}`, safe);
}

export function mstLiveError(
  phase: MstLiveLogPhase,
  message: string,
  err?: unknown,
  meta?: Record<string, unknown>
): void {
  const detail =
    err && typeof err === 'object' && 'code' in err
      ? { code: (err as { code?: string }).code, message: (err as { message?: string }).message }
      : err instanceof Error
        ? { message: err.message }
        : { err: String(err ?? '') };
  // Always log errors so classroom issues are visible even without the flag
  // eslint-disable-next-line no-console
  console.error(`[MST LIVE][${phase}] ${message}`, { ...meta, ...detail });
}
