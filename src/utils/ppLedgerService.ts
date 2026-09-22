import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { PPLedgerEntry, PPLedgerSourceType } from '../types/assessmentGoals';

export type RecordPPChangeInput = {
  studentId: string;
  amount: number;
  sourceType: PPLedgerSourceType;
  sourceId?: string;
  notes?: string;
  assessmentId?: string;
  goalScore?: number;
  actualScore?: number;
  outcome?: PPLedgerEntry['outcome'];
};

const SOURCE_LABELS: Record<PPLedgerSourceType, string> = {
  assessmentGoal: 'Assessment Goal',
  civicEconomy: 'Civic Economy',
  scorekeeper: 'Scorekeeper',
  liveEvent: 'Live Event',
  siege: 'Vault Siege',
  marketplace: 'Marketplace',
  classroom: 'Classroom',
  workBoard: 'Work Board',
  vaultUpgrade: 'Vault Upgrade',
  generator: 'PP Generator',
  skillUpgrade: 'Skill Upgrade',
  battlePass: 'Battle Pass',
  other: 'Other',
};

export function formatPPLedgerSourceLabel(sourceType: PPLedgerSourceType | string): string {
  return SOURCE_LABELS[sourceType as PPLedgerSourceType] || 'PP Change';
}

/** Firestore rejects `undefined` field values — strip them before write. */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function createdAtMs(entry: { createdAt?: unknown }): number {
  const c = entry.createdAt as { toMillis?: () => number; seconds?: number } | null;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  if (c && typeof c.seconds === 'number') return c.seconds * 1000;
  return 0;
}

function historyCollection(studentId: string) {
  return collection(db, 'students', studentId, 'ppHistory');
}

/**
 * Append-only PP change log for Player Profile.
 * Writes to students/{id}/ppHistory (owner-readable) and mirrors to ppLedger when possible.
 */
export async function recordPPChange(input: RecordPPChangeInput): Promise<string | null> {
  const amount = Math.trunc(Number(input.amount) || 0);
  if (!input.studentId || amount === 0) return null;

  const entryId = doc(historyCollection(input.studentId)).id;
  const entry = omitUndefined({
    id: entryId,
    studentId: input.studentId,
    sourceType: input.sourceType,
    sourceId: input.sourceId || input.sourceType,
    amount,
    createdAt: Timestamp.now(),
    notes: input.notes,
    assessmentId: input.assessmentId,
    goalScore: input.goalScore,
    actualScore: input.actualScore,
    outcome: input.outcome,
  }) as PPLedgerEntry;

  try {
    await setDoc(doc(db, 'students', input.studentId, 'ppHistory', entryId), entry);
  } catch (err) {
    console.warn('[ppLedger] students/ppHistory write failed', err);
    // Fall through — still try top-level ledger
  }

  try {
    await setDoc(doc(db, 'ppLedger', entryId), entry);
  } catch (err) {
    console.warn('[ppLedger] ppLedger mirror failed (non-fatal)', err);
  }

  return entryId;
}

async function loadFromStudentHistory(studentId: string, cap: number): Promise<PPLedgerEntry[]> {
  try {
    const q = query(historyCollection(studentId), orderBy('createdAt', 'desc'), limit(cap));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PPLedgerEntry));
  } catch (err) {
    console.warn('[ppLedger] ppHistory ordered query failed, fallback', err);
    try {
      const snapshot = await getDocs(query(historyCollection(studentId), limit(40)));
      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as PPLedgerEntry))
        .sort((a, b) => createdAtMs(b) - createdAtMs(a))
        .slice(0, cap);
    } catch (e2) {
      console.warn('[ppLedger] ppHistory fallback failed', e2);
      return [];
    }
  }
}

async function loadFromTopLevelLedger(studentId: string, cap: number): Promise<PPLedgerEntry[]> {
  const ledgerRef = collection(db, 'ppLedger');
  try {
    const q = query(
      ledgerRef,
      where('studentId', '==', studentId),
      orderBy('createdAt', 'desc'),
      limit(cap)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PPLedgerEntry));
  } catch {
    try {
      const snapshot = await getDocs(query(ledgerRef, where('studentId', '==', studentId), limit(40)));
      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as PPLedgerEntry))
        .sort((a, b) => createdAtMs(b) - createdAtMs(a))
        .slice(0, cap);
    } catch {
      return [];
    }
  }
}

/** Recent Vault Siege PP gains (attacker) — backfills Profile when ledger write was missed. */
async function loadSiegeGainsAsLedger(studentId: string, cap: number): Promise<PPLedgerEntry[]> {
  try {
    const attacksRef = collection(db, 'vaultSiegeAttacks');
    let docs;
    try {
      const q = query(
        attacksRef,
        where('attackerId', '==', studentId),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      docs = (await getDocs(q)).docs;
    } catch {
      const snapshot = await getDocs(query(attacksRef, where('attackerId', '==', studentId), limit(30)));
      docs = snapshot.docs.sort((a, b) => {
        const ta = a.data().timestamp?.toMillis?.() ?? 0;
        const tb = b.data().timestamp?.toMillis?.() ?? 0;
        return tb - ta;
      });
    }

    const rows: PPLedgerEntry[] = [];
    for (const d of docs) {
      const data = d.data();
      const amount = Math.trunc(
        Number(data.ppStolenFromTarget ?? data.ppStolen ?? data.ppGained ?? 0) || 0
      );
      if (amount <= 0) continue;
      const targetName = data.targetName || 'opponent';
      const createdAt = data.timestamp || data.ppStolenDate || Timestamp.now();
      rows.push({
        id: `siege-hist:${d.id}`,
        studentId,
        sourceType: 'siege',
        sourceId: `siege:${data.targetId || d.id}`,
        amount,
        createdAt,
        notes: data.liveEventSiege
          ? `Live Event Siege vs ${targetName}`
          : `Vault Siege vs ${targetName}`,
      });
      if (rows.length >= cap) break;
    }
    return rows;
  } catch (err) {
    console.warn('[ppLedger] siege history backfill failed', err);
    return [];
  }
}

function mergeUniqueEntries(groups: PPLedgerEntry[][], cap: number): PPLedgerEntry[] {
  const seen = new Set<string>();
  const merged: PPLedgerEntry[] = [];
  const flat = groups.flat().sort((a, b) => createdAtMs(b) - createdAtMs(a));
  for (const e of flat) {
    // Dedupe: same source+amount within 2 minutes, or same id
    const ms = createdAtMs(e);
    const softKey = `${e.sourceType}:${e.amount}:${Math.floor(ms / 120000)}:${e.notes || ''}`;
    if (seen.has(e.id) || seen.has(softKey)) continue;
    seen.add(e.id);
    seen.add(softKey);
    merged.push(e);
    if (merged.length >= cap) break;
  }
  return merged;
}

/** Most recent PP changes for Profile (ledger + siege battle-history backfill). */
export async function getRecentPPChanges(
  studentId: string,
  maxEntries = 10
): Promise<PPLedgerEntry[]> {
  if (!studentId) return [];
  const cap = Math.max(1, Math.min(50, maxEntries));

  const [fromHistory, fromLedger, fromSieges] = await Promise.all([
    loadFromStudentHistory(studentId, cap),
    loadFromTopLevelLedger(studentId, cap),
    loadSiegeGainsAsLedger(studentId, cap),
  ]);

  return mergeUniqueEntries([fromHistory, fromLedger, fromSieges], cap);
}
