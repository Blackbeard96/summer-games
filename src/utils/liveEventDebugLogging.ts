/**
 * Centralized, easy-to-disable logging for MST Live Events (awards, work stats, skills).
 *
 * Enable: `REACT_APP_LIVE_EVENT_DEBUG=true`
 * Silence in dev: `REACT_APP_LIVE_EVENT_DEBUG=false`
 *
 * Do not log emails, full auth tokens, or payment data — only ids, counts, and reasons.
 */

/**
 * Opt-in tracing for MST Live Event testing.
 * Set `REACT_APP_LIVE_EVENT_DEBUG=true` in `.env` (then restart dev server).
 */
export const LIVE_EVENT_DEBUG =
  typeof process !== 'undefined' && process.env.REACT_APP_LIVE_EVENT_DEBUG === 'true';

export function truncateId(id: string | undefined, max = 14): string {
  if (!id) return '';
  if (id.length <= max) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function liveEventAwardDebug(payload: Record<string, unknown>): void {
  if (!LIVE_EVENT_DEBUG) return;
  console.log('[LiveEvent Award Debug]', { ts: new Date().toISOString(), ...payload });
}

export function workStatsDebug(payload: Record<string, unknown>): void {
  if (!LIVE_EVENT_DEBUG) return;
  console.log('[WorkStats Debug]', { ts: new Date().toISOString(), ...payload });
}

export function skillUseDebug(payload: Record<string, unknown>): void {
  if (!LIVE_EVENT_DEBUG) return;
  console.log('[SkillUse Debug]', { ts: new Date().toISOString(), ...payload });
}

export function liveEventSkillEffectDebug(payload: Record<string, unknown>): void {
  if (!LIVE_EVENT_DEBUG) return;
  console.log('[LiveEvent SkillEffect Debug]', { ts: new Date().toISOString(), ...payload });
}
