/**
 * Actions service for In Session mode
 * Manages battle action pipeline and resolution
 */

import { db } from '../firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  getDocs
} from 'firebase/firestore';
import { debug, debugError } from './inSessionDebug';

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
  createdAt: any; // Firestore Timestamp
  clientNonce: string; // Prevent duplicate sends
  resolved: boolean;
  resolvedAt?: any; // Firestore Timestamp
  resolvedBy?: string; // UID of host who resolved
  result?: {
    success: boolean;
    message: string;
    [key: string]: any;
  };
}

/**
 * Submit an action to the session
 */
export async function submitAction(
  sessionId: string,
  action: Omit<SessionAction, 'id' | 'createdAt' | 'resolved'>
): Promise<string | null> {
  try {
    const actionsRef = collection(db, 'inSessionRooms', sessionId, 'actions');
    
    const actionData = {
      ...action,
      createdAt: serverTimestamp(),
      resolved: false
    };
    
    const docRef = await addDoc(actionsRef, actionData);
    
    debug('inSessionActions', `Action submitted: ${action.type} by ${action.actorUid}`, {
      actionId: docRef.id,
      skillId: action.skillId,
      targetUid: action.targetUid
    });
    
    return docRef.id;
  } catch (error) {
    debugError('inSessionActions', `Error submitting action`, error);
    return null;
  }
}

/**
 * Resolve an action (host/admin only)
 */
export async function resolveAction(
  sessionId: string,
  actionId: string,
  result: {
    success: boolean;
    message: string;
    [key: string]: any;
  },
  resolvedBy: string
): Promise<boolean> {
  try {
    const actionRef = doc(db, 'inSessionRooms', sessionId, 'actions', actionId);
    const actionDoc = await getDoc(actionRef);
    
    if (!actionDoc.exists()) {
      debugError('inSessionActions', `Action ${actionId} not found`);
      return false;
    }
    
    const actionData = actionDoc.data() as SessionAction;
    
    if (actionData.resolved) {
      debug('inSessionActions', `Action ${actionId} already resolved`);
      return false;
    }
    
    await updateDoc(actionRef, {
      resolved: true,
      resolvedAt: serverTimestamp(),
      resolvedBy,
      result
    });
    
    debug('inSessionActions', `Action ${actionId} resolved by ${resolvedBy}`, result);
    
    return true;
  } catch (error) {
    debugError('inSessionActions', `Error resolving action ${actionId}`, error);
    return false;
  }
}

/**
 * Get pending (unresolved) actions
 */
export async function getPendingActions(sessionId: string): Promise<SessionAction[]> {
  try {
    const actionsRef = collection(db, 'inSessionRooms', sessionId, 'actions');
    const q = query(
      actionsRef,
      where('resolved', '==', false),
      orderBy('createdAt', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as SessionAction));
  } catch (error) {
    debugError('inSessionActions', `Error getting pending actions`, error);
    return [];
  }
}

/**
 * Subscribe to actions for a session
 */
export function subscribeToActions(
  sessionId: string,
  callback: (actions: SessionAction[]) => void,
  includeResolved: boolean = false
): Unsubscribe {
  debug('inSessionActions', `Subscribing to actions for session ${sessionId}`);
  
  const actionsRef = collection(db, 'inSessionRooms', sessionId, 'actions');
  
  let q;
  if (includeResolved) {
    q = query(actionsRef, orderBy('createdAt', 'desc'), limit(100));
  } else {
    q = query(
      actionsRef,
      where('resolved', '==', false),
      orderBy('createdAt', 'asc')
    );
  }
  
  return onSnapshot(
    q,
    (snapshot) => {
      const actions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SessionAction));
      
      debug('inSessionActions', `Actions update: ${actions.length} actions`, {
        pending: actions.filter(a => !a.resolved).length,
        resolved: actions.filter(a => a.resolved).length
      });
      
      callback(actions);
    },
    (error) => {
      debugError('inSessionActions', 'Error in actions subscription', error);
      callback([]);
    }
  );
}

/**
 * Generate a unique client nonce for action deduplication
 */
export function generateClientNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if an action with this nonce already exists (prevent duplicates)
 */
export async function checkDuplicateAction(
  sessionId: string,
  clientNonce: string
): Promise<boolean> {
  try {
    const actionsRef = collection(db, 'inSessionRooms', sessionId, 'actions');
    const q = query(actionsRef, where('clientNonce', '==', clientNonce), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    debugError('inSessionActions', `Error checking duplicate action`, error);
    return false;
  }
}



