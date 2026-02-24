/**
 * Battle Adapter Interface
 * 
 * This provides a unified interface for battle actions across all modes.
 * Each battle mode implements this adapter to ensure consistent behavior.
 */

import type { Move } from '../types/battle';
import { resolveSkillAction, type ActorState, type TargetState, type BattleContext, type ResolvedSkillAction } from './battleSkillResolver';
import { formatBattleLogEntry } from './battleSkillResolver';

export type BattleMode = 'arena' | 'live_event' | 'raid' | 'vault' | 'journey' | 'practice';

export interface BattleAction {
  actorUid: string;
  targetUid: string;
  skill: Move;
  traceId?: string;
}

export interface BattleLogEntry {
  text: string;
  type: 'action' | 'system' | 'status' | 'reward';
  actorUid?: string;
  targetUid?: string;
  skillId?: string;
  actionId?: string;
  createdAt: Date;
}

export interface AppliedActionResult {
  success: boolean;
  message: string;
  resolvedAction: ResolvedSkillAction;
  logEntries: BattleLogEntry[];
  stateChanges?: {
    actorHpBefore?: number;
    actorHpAfter?: number;
    actorShieldBefore?: number;
    actorShieldAfter?: number;
    actorPpBefore?: number;
    actorPpAfter?: number;
    targetHpBefore?: number;
    targetHpAfter?: number;
    targetShieldBefore?: number;
    targetShieldAfter?: number;
    targetPpBefore?: number;
    targetPpAfter?: number;
  };
}

/**
 * Battle Adapter Interface
 * 
 * All battle modes must implement this interface to ensure:
 * - Consistent skill resolution
 * - Consistent log formatting
 * - Consistent state updates
 */
export interface BattleAdapter {
  mode: BattleMode;
  
  /**
   * Get the root Firestore reference for this battle mode
   */
  getRootRef(): { type: 'doc' | 'collection'; path: string };
  
  /**
   * Get actor state (the player using the skill)
   */
  getActorState(uid: string): Promise<ActorState>;
  
  /**
   * Get target state (the target of the skill)
   */
  getTargetState(targetId: string): Promise<TargetState>;
  
  /**
   * Apply a resolved action to the battle state
   * This is the AUTHORITATIVE update - all modes must use this
   */
  applyAction(action: BattleAction, resolved: ResolvedSkillAction): Promise<AppliedActionResult>;
  
  /**
   * Write a log entry to the battle log
   */
  writeLog(entry: BattleLogEntry): Promise<void>;
  
  /**
   * Subscribe to state updates
   */
  subscribeState(callback: (updates: any) => void): () => void;
  
  /**
   * Subscribe to log updates
   */
  subscribeLog(callback: (entries: BattleLogEntry[]) => void): () => void;
}

/**
 * Resolve and apply a battle action using the unified resolver
 * 
 * This is the CANONICAL function that all battle modes should use.
 * It:
 * 1. Gets actor and target state
 * 2. Resolves the skill action using the unified resolver
 * 3. Applies the action via the adapter
 * 4. Writes log entries
 * 
 * This ensures ALL modes use the same calculation and application logic.
 */
export async function resolveAndApplyAction(
  adapter: BattleAdapter,
  action: BattleAction,
  context: BattleContext
): Promise<AppliedActionResult> {
  // Get actor and target state
  const actor = await adapter.getActorState(action.actorUid);
  const target = await adapter.getTargetState(action.targetUid);
  
  // Resolve the skill action using the unified resolver
  const resolved = await resolveSkillAction(actor, target, action.skill, context);
  
  // Apply the action via the adapter
  const result = await adapter.applyAction(action, resolved);
  
  // Write log entries
  for (const logEntry of result.logEntries) {
    await adapter.writeLog(logEntry);
  }
  
  return result;
}


