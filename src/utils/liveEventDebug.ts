/**
 * Deep Debugging System for Live Events Skills
 * Provides traceId-based pipeline tracing and Firestore debug mirror
 */

import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

export type DebugStage = 
  | 'selected' 
  | 'targeted' 
  | 'submitted' 
  | 'written' 
  | 'resolved' 
  | 'state_applied' 
  | 'rendered' 
  | 'error';

export interface DebugActionDoc {
  traceId: string;
  actorUid: string;
  targetUid: string;
  skillId: string;
  skillName?: string;
  createdAt: Timestamp;
  stage: DebugStage;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  paths?: {
    actionPath?: string;
    statePath?: string;
    logPath?: string;
  };
  metadata?: {
    [key: string]: any;
  };
}

/**
 * Generate a unique trace ID for tracking an action through the pipeline
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILLS === 'true' ||
         process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' ||
         process.env.REACT_APP_DEBUG === 'true';
}

/**
 * Write a debug action document to Firestore
 */
export async function writeDebugAction(
  classId: string,
  eventId: string,
  traceId: string,
  stage: DebugStage,
  data: {
    actorUid: string;
    targetUid: string;
    skillId: string;
    skillName?: string;
    error?: {
      code: string;
      message: string;
      stack?: string;
    };
    paths?: {
      actionPath?: string;
      statePath?: string;
      logPath?: string;
    };
    metadata?: { [key: string]: any };
  }
): Promise<void> {
  if (!isDebugMode()) {
    return; // Skip if debug mode is disabled
  }

  try {
    const debugActionRef = doc(
      db,
      'classrooms',
      classId,
      'liveEvents',
      eventId,
      'debugActions',
      traceId
    );

    const debugDoc: DebugActionDoc = {
      traceId,
      actorUid: data.actorUid,
      targetUid: data.targetUid,
      skillId: data.skillId,
      skillName: data.skillName,
      createdAt: serverTimestamp() as Timestamp,
      stage,
      error: data.error,
      paths: data.paths,
      metadata: data.metadata
    };

    // Use setDoc with merge to update stage as pipeline advances
    await setDoc(debugActionRef, debugDoc, { merge: true });

    if (isDebugMode()) {
      console.log(`[LiveEventDebug] 📝 Debug action written: ${stage}`, {
        traceId,
        classId,
        eventId,
        stage,
        path: `classrooms/${classId}/liveEvents/${eventId}/debugActions/${traceId}`
      });
    }
  } catch (error) {
    // Don't fail the actual action if debug write fails
    console.error('[LiveEventDebug] ❌ Failed to write debug action:', error);
  }
}

/**
 * Log a pipeline stage with traceId
 */
export function traceStage(
  stage: DebugStage,
  traceId: string,
  message: string,
  payload: { [key: string]: any },
  fileLocation?: { file: string; line?: number }
): void {
  if (!isDebugMode()) {
    return;
  }

  const location = fileLocation 
    ? `[${fileLocation.file}${fileLocation.line ? `:${fileLocation.line}` : ''}]`
    : '';

  console.log(`[LiveEventDebug] 🔍 Stage ${stage.toUpperCase()}: ${message}`, {
    traceId,
    stage,
    ...payload,
    location,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log an error with traceId
 */
export function traceError(
  traceId: string,
  error: Error | any,
  context: { [key: string]: any }
): void {
  const errorInfo = {
    code: error?.code || 'UNKNOWN',
    message: error?.message || String(error),
    stack: error?.stack,
    ...context
  };

  console.error(`[LiveEventDebug] ❌ ERROR in pipeline:`, {
    traceId,
    error: errorInfo,
    timestamp: new Date().toISOString()
  });

  // Show toast to user
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('liveEventDebugError', {
      detail: { traceId, error: errorInfo }
    }));
  }
}

