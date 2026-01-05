/**
 * Types for In Session Actions
 */

import { Timestamp } from 'firebase/firestore';

export type ActionType = 'ATTACK' | 'SKILL' | 'ITEM' | 'VAULT' | 'SYSTEM';

export interface SessionAction {
  id: string;
  type: ActionType;
  actorUid: string;
  targetUid?: string; // Optional for AoE or self-targeting
  skillId?: string;
  payload: {
    damage?: number;
    healing?: number;
    shieldDamage?: number;
    shieldBoost?: number;
    ppCost?: number;
    [key: string]: any; // Additional action-specific data
  };
  createdAt: Timestamp | any;
  clientNonce: string; // Prevent duplicate sends
  resolved: boolean;
  resolvedAt?: Timestamp | any;
  resolvedBy?: string; // UID of host who resolved
  result?: {
    success: boolean;
    message: string;
    [key: string]: any;
  };
}



