/**
 * Shared Battle Debug Logger
 * 
 * Centralized logging for battle actions across all modes:
 * - Live Events (In-Session)
 * - Island Raids
 * - Player Journey Battles
 * - Vault Siege
 * - Practice/Training
 * 
 * Usage:
 *   import { battleDebug } from '../utils/battleDebug';
 *   battleDebug('skill-click', { mode, skillId, cost });
 */

const DEBUG_BATTLE = process.env.REACT_APP_DEBUG_BATTLE === 'true' || 
                     process.env.REACT_APP_DEBUG === 'true' ||
                     process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true';

export type BattleMode = 'liveEvent' | 'islandRaid' | 'playerJourney' | 'vaultSiege' | 'practice' | 'unknown';

export interface BattleDebugPayload {
  mode?: BattleMode;
  battleId?: string;
  eventId?: string;
  raidId?: string;
  sessionId?: string;
  actorUid?: string;
  targetUid?: string;
  skillId?: string;
  moveId?: string;
  cost?: number;
  cooldown?: number;
  actionPayload?: any;
  writePath?: string;
  actionId?: string;
  status?: string;
  error?: any;
  [key: string]: any;
}

/**
 * Log battle action with consistent formatting
 */
export function battleDebug(tag: string, payload: BattleDebugPayload = {}): void {
  if (!DEBUG_BATTLE) return;

  const timestamp = new Date().toISOString();
  const mode = payload.mode || 'unknown';
  const emoji = getEmojiForTag(tag);
  
  // Always log to console (even if DEBUG_BATTLE is false, we want to see errors)
  const logLevel = tag.includes('error') || tag.includes('failed') ? 'error' : 'log';
  const logMethod = logLevel === 'error' ? console.error : console.log;
  
  logMethod(`${emoji} [BattleDebug:${tag}]`, {
    timestamp,
    mode,
    ...payload
  });
}

/**
 * Log battle action ALWAYS (even if DEBUG_BATTLE is false)
 * Use for critical debugging that should always be visible
 */
export function battleDebugAlways(tag: string, payload: BattleDebugPayload = {}): void {
  const timestamp = new Date().toISOString();
  const mode = payload.mode || 'unknown';
  const emoji = getEmojiForTag(tag);
  
  console.log(`${emoji} [BattleDebug:${tag}]`, {
    timestamp,
    mode,
    ...payload
  });
}

/**
 * Log battle error with consistent formatting
 */
export function battleError(tag: string, error: any, payload: BattleDebugPayload = {}): void {
  const timestamp = new Date().toISOString();
  const mode = payload.mode || 'unknown';
  
  console.error(`❌ [BattleError:${tag}]`, {
    timestamp,
    mode,
    error: error?.message || error,
    errorCode: error?.code,
    errorStack: error?.stack,
    ...payload
  });
  
  // Also show toast if available
  if (typeof window !== 'undefined' && (window as any).toast) {
    (window as any).toast.error(`Battle Error: ${tag} - ${error?.message || error}`);
  }
}

/**
 * Get emoji for debug tag
 */
function getEmojiForTag(tag: string): string {
  const emojiMap: Record<string, string> = {
    'skill-click': '🎯',
    'target-click': '🎯',
    'action-submit': '📤',
    'firestore-write': '💾',
    'firestore-write-error': '❌',
    'resolver-fired': '⚙️',
    'state-updated': '✅',
    'battle-log-written': '📝',
    'validation-failed': '⚠️',
    'permission-denied': '🚫',
    'transaction-conflict': '🔄',
    'mode-gating': '🚪',
    'path-mismatch': '📍',
  };
  
  return emojiMap[tag] || '🔍';
}

/**
 * Detect battle mode from context
 */
export function detectBattleMode(context: {
  isInSession?: boolean;
  sessionId?: string;
  gameId?: string;
  battleId?: string;
  isIslandRaid?: boolean;
  isVaultSiege?: boolean;
}): BattleMode {
  if (context.isInSession || context.sessionId) {
    return 'liveEvent';
  }
  if (context.isIslandRaid || context.gameId) {
    return 'islandRaid';
  }
  if (context.isVaultSiege) {
    return 'vaultSiege';
  }
  if (context.battleId) {
    return 'playerJourney';
  }
  return 'unknown';
}

/**
 * Get Firestore path for battle actions based on mode
 */
export function getBattleActionPath(mode: BattleMode, contextIds: {
  sessionId?: string;
  gameId?: string;
  battleId?: string;
  eventId?: string;
}): string {
  switch (mode) {
    case 'liveEvent':
      if (contextIds.sessionId) {
        return `inSessionRooms/${contextIds.sessionId}`;
      }
      if (contextIds.eventId) {
        return `liveEvents/${contextIds.eventId}`;
      }
      throw new Error('Live Event mode requires sessionId or eventId');
    
    case 'islandRaid':
      if (contextIds.gameId) {
        return `islandRaidBattleRooms/${contextIds.gameId}`;
      }
      throw new Error('Island Raid mode requires gameId');
    
    case 'playerJourney':
      if (contextIds.battleId) {
        return `journeyBattles/${contextIds.battleId}`;
      }
      throw new Error('Player Journey mode requires battleId');
    
    case 'vaultSiege':
      return `vaultSieges/${contextIds.battleId || 'unknown'}`;
    
    default:
      throw new Error(`Unknown battle mode: ${mode}`);
  }
}

/**
 * Get Firestore collection path for actions subcollection
 */
export function getActionsCollectionPath(mode: BattleMode, contextIds: {
  sessionId?: string;
  gameId?: string;
  battleId?: string;
  eventId?: string;
}): string {
  const basePath = getBattleActionPath(mode, contextIds);
  return `${basePath}/actions`;
}

/**
 * Get Firestore collection path for battle log
 */
export function getBattleLogPath(mode: BattleMode, contextIds: {
  sessionId?: string;
  gameId?: string;
  battleId?: string;
  eventId?: string;
}): string {
  const basePath = getBattleActionPath(mode, contextIds);
  return `${basePath}/battleLog`;
}

