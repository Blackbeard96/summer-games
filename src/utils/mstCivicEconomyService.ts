/**
 * MST Civic Economy — tax settings, civic roles, ledger, bounties, shutdown, job pay.
 * Admin-triggered collection; Firestore rules restrict writes to staff/admin.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  MstCivicBounty,
  MstCivicPlayerState,
  MstCivicRoleAssignment,
  MstCivicTaxLedgerEntry,
  MstCivicTaxSettings,
  CivicSeatFreedom,
  CivicTaxLedgerStatus,
  CivicTaxStatus,
} from '../types/mstCivicEconomy';
import { createPPLedgerEntryCivic } from './assessmentGoalsFirestore';

const TAX_SETTINGS = 'mstCivicTaxSettings';
const ROLES = 'mstCivicRoleAssignments';
const LEDGER = 'mstCivicTaxLedger';
const BOUNTIES = 'mstCivicBounties';
const PLAYER = 'mstCivicPlayerState';

const SETTINGS_DOC = 'config';

export function defaultTaxSettings(): MstCivicTaxSettings {
  return {
    baseWeeklyTaxPp: 50,
    collectionDayOfWeek: 1,
    collectionHour: 9,
    collectionMinute: 0,
    automaticDeductionEnabled: false,
    gracePeriodHours: 24,
    shutdownPenaltyHours: 9,
    restrictSeatOnUnpaid: true,
    createBountyOnDefault: true,
  };
}

function taxSettingsRef() {
  return doc(db, TAX_SETTINGS, SETTINGS_DOC);
}

export async function getTaxSettings(): Promise<MstCivicTaxSettings> {
  const snap = await getDoc(taxSettingsRef());
  if (!snap.exists()) return defaultTaxSettings();
  return { ...defaultTaxSettings(), ...(snap.data() as MstCivicTaxSettings) };
}

export async function saveTaxSettings(
  patch: Partial<MstCivicTaxSettings>
): Promise<{ ok: boolean; error?: string }> {
  try {
    await setDoc(
      taxSettingsRef(),
      { ...patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listRoleAssignments(): Promise<MstCivicRoleAssignment[]> {
  const snap = await getDocs(collection(db, ROLES));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MstCivicRoleAssignment, 'id'>) }));
}

export async function saveRoleAssignment(
  row: Omit<MstCivicRoleAssignment, 'id'> & { id?: string }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    if (row.id) {
      await setDoc(
        doc(db, ROLES, row.id),
        { ...row, id: row.id, updatedAt: serverTimestamp() },
        { merge: true }
      );
      return { ok: true, id: row.id };
    }
    const ref = await addDoc(collection(db, ROLES), {
      ...row,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteRoleAssignment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await deleteDoc(doc(db, ROLES, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function weekIdFromDate(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

export function nextTaxCollectionMs(settings: MstCivicTaxSettings, fromMs: number): number {
  const from = new Date(fromMs);
  const dow = ((settings.collectionDayOfWeek % 7) + 7) % 7;
  const d = new Date(from);
  d.setHours(settings.collectionHour, settings.collectionMinute, 0, 0);
  for (let i = 0; i < 21; i++) {
    if (d.getDay() === dow && d.getTime() > fromMs) return d.getTime();
    d.setDate(d.getDate() + 1);
    d.setHours(settings.collectionHour, settings.collectionMinute, 0, 0);
  }
  return fromMs + 7 * 86400000;
}

function bestDiscountForStudent(studentId: string, roles: MstCivicRoleAssignment[]): number {
  let best = 0;
  roles.forEach((r) => {
    if (!r.active || r.studentId !== studentId) return;
    best = Math.max(best, Math.min(100, Math.max(0, Math.floor(r.taxDiscountPercent || 0))));
  });
  return best;
}

function roleForStudent(studentId: string, roles: MstCivicRoleAssignment[]): MstCivicRoleAssignment | null {
  const active = roles.filter((r) => r.active && r.studentId === studentId);
  if (active.length === 0) return null;
  return active.sort((a, b) => (b.payRatePp || 0) - (a.payRatePp || 0))[0];
}

export async function getPlayerState(studentId: string): Promise<MstCivicPlayerState | null> {
  const snap = await getDoc(doc(db, PLAYER, studentId));
  if (!snap.exists()) return null;
  return snap.data() as MstCivicPlayerState;
}

export async function refreshShutdownIfExpired(studentId: string): Promise<void> {
  const ref = doc(db, PLAYER, studentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as MstCivicPlayerState;
  const end = data.shutdownEndsAt as Timestamp | undefined;
  if (!end || !end.toMillis) return;
  if (end.toMillis() > Date.now()) return;
  await updateDoc(ref, {
    taxStatus: data.taxDefaultWeekId ? 'defaulted' : 'paid',
    shutdownEndsAt: null,
    updatedAt: serverTimestamp(),
  });
}

async function writePlayerState(studentId: string, patch: Partial<MstCivicPlayerState>) {
  await setDoc(
    doc(db, PLAYER, studentId),
    {
      studentId,
      ...patch,
      updatedAt: serverTimestamp(),
    } as Record<string, unknown>,
    { merge: true }
  );
}

export type TaxRunResult = {
  ok: boolean;
  error?: string;
  processed: number;
  paid: number;
  defaulted: number;
  weekId: string;
  /** True when automatic collection is off and run was not forced (no-op). */
  skipped?: boolean;
};

export async function runWeeklyTaxCollection(options?: {
  force?: boolean;
  weekIdOverride?: string;
}): Promise<TaxRunResult> {
  try {
  const settings = await getTaxSettings();
  const weekId = options?.weekIdOverride || weekIdFromDate(new Date());
  if (!options?.force && !settings.automaticDeductionEnabled) {
    return { ok: true, skipped: true, processed: 0, paid: 0, defaulted: 0, weekId };
  }
  if (!options?.force && settings.lastProcessedWeekId === weekId) {
    return { ok: true, processed: 0, paid: 0, defaulted: 0, weekId };
  }

  const roles = await listRoleAssignments();
  const studentsSnap = await getDocs(collection(db, 'students'));
  const students = studentsSnap.docs.map((d) => ({
    id: d.id,
    name: (d.data().displayName as string) || d.id,
  }));

  let paid = 0;
  let defaulted = 0;
  const nextTax = nextTaxCollectionMs(settings, Date.now());

  for (const s of students) {
    const discount = bestDiscountForStudent(s.id, roles);
    const base = Math.max(0, Math.floor(settings.baseWeeklyTaxPp || 0));
    const finalTax = Math.max(0, Math.floor((base * (100 - discount)) / 100));
    const roleRow = roleForStudent(s.id, roles);

    const vaultRef = doc(db, 'vaults', s.id);
    const studentRef = doc(db, 'students', s.id);
    let ppBefore = 0;
    let ppAfter = 0;
    let collected = 0;
    const statusBox = { v: 'paid' as CivicTaxLedgerStatus };

    await runTransaction(db, async (tx) => {
      const vSnap = await tx.get(vaultRef);
      const stSnap = await tx.get(studentRef);
      if (!vSnap.exists()) {
        ppBefore = 0;
        ppAfter = 0;
        statusBox.v = finalTax > 0 ? 'defaulted' : 'paid';
        return;
      }
      ppBefore = Math.max(0, Math.floor(Number(vSnap.data().currentPP) || 0));
      if (finalTax === 0) {
        ppAfter = ppBefore;
        statusBox.v = 'paid';
        return;
      }
      collected = Math.min(finalTax, ppBefore);
      ppAfter = ppBefore - collected;
      statusBox.v = collected >= finalTax ? 'paid' : 'defaulted';
      tx.update(vaultRef, { currentPP: ppAfter });
      if (stSnap.exists()) {
        tx.update(studentRef, { powerPoints: ppAfter });
      }
    });

    const status = statusBox.v;

    if (finalTax > 0 && collected > 0) {
      await createPPLedgerEntryCivic(
        s.id,
        -collected,
        `Weekly civic tax (${weekId}) — ${status === 'paid' ? 'paid in full' : 'partial toward default'}`,
        weekId
      );
    }

    const ledgerId = `${weekId}_${s.id}`;
    const entry: Omit<MstCivicTaxLedgerEntry, 'id'> = {
      studentId: s.id,
      studentName: s.name,
      baseTax: base,
      roleDiscount: discount,
      finalTaxOwed: finalTax,
      ppBalanceBefore: ppBefore,
      ppBalanceAfter: ppAfter,
      status,
      paidAt: status === 'paid' || collected > 0 ? Timestamp.now() : null,
      defaultedAt: status === 'defaulted' ? Timestamp.now() : null,
      weekId,
      nextTaxDate: nextTax,
    };
    await setDoc(doc(db, LEDGER, ledgerId), {
      ...entry,
      id: ledgerId,
      createdAt: serverTimestamp(),
    });

    if (status === 'defaulted') {
      defaulted++;
      const seat: CivicSeatFreedom =
        settings.restrictSeatOnUnpaid ? 'restricted' : 'active';
      await writePlayerState(s.id, {
        displayName: s.name,
        jobRole: roleRow?.roleType ?? null,
        jobPayRatePp: roleRow?.payRatePp ?? 0,
        taxDiscountPercent: discount,
        weeklyTaxOwed: finalTax,
        taxStatus: 'defaulted',
        nextTaxDate: nextTax,
        seatFreedom: seat,
        activeBounty: settings.createBountyOnDefault,
        taxDefaultWeekId: weekId,
      });
      if (settings.createBountyOnDefault) {
        const b: MstCivicBounty = {
          studentId: s.id,
          active: true,
          reason: 'tax_default',
          weekId,
          createdAt: Timestamp.now(),
        };
        await setDoc(doc(db, BOUNTIES, s.id), b);
      }
    } else {
      if (status === 'paid') paid++;
      const dueSoonMs = nextTax - (settings.gracePeriodHours || 24) * 3600000;
      const taxStatus: CivicTaxStatus =
        Date.now() > dueSoonMs ? 'due_soon' : 'paid';
      await writePlayerState(s.id, {
        displayName: s.name,
        jobRole: roleRow?.roleType ?? null,
        jobPayRatePp: roleRow?.payRatePp ?? 0,
        taxDiscountPercent: discount,
        weeklyTaxOwed: finalTax,
        taxStatus,
        nextTaxDate: nextTax,
        seatFreedom: 'active',
        activeBounty: false,
        taxDefaultWeekId: null,
        shutdownEndsAt: null,
      });
    }
  }

  await setDoc(
    taxSettingsRef(),
    {
      lastProcessedWeekId: weekId,
      lastRunAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    processed: students.length,
    paid,
    defaulted,
    weekId,
  };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      processed: 0,
      paid: 0,
      defaulted: 0,
      weekId: options?.weekIdOverride || weekIdFromDate(new Date()),
    };
  }
}

export async function runWeeklyJobPayroll(): Promise<{ ok: boolean; paid: number; error?: string }> {
  return runJobPayrollForFrequency('weekly');
}

export async function runDailyJobPayroll(): Promise<{ ok: boolean; paid: number; error?: string }> {
  return runJobPayrollForFrequency('daily');
}

async function runJobPayrollForFrequency(
  frequency: 'daily' | 'weekly'
): Promise<{ ok: boolean; paid: number; error?: string }> {
  try {
    const roles = (await listRoleAssignments()).filter((r) => r.active && r.payFrequency === frequency);
    let paid = 0;
    const periodKey = frequency === 'weekly' ? weekIdFromDate(new Date()) : new Date().toISOString().slice(0, 10);
    for (const r of roles) {
      const amt = Math.max(0, Math.floor(r.payRatePp || 0));
      if (amt <= 0) continue;
      const vaultRef = doc(db, 'vaults', r.studentId);
      const studentRef = doc(db, 'students', r.studentId);
      let credited = 0;
      await runTransaction(db, async (tx) => {
        const vSnap = await tx.get(vaultRef);
        if (!vSnap.exists()) return;
        const cur = Math.max(0, Number(vSnap.data().currentPP) || 0);
        const cap = Math.max(cur, Number(vSnap.data().capacity) || 1000);
        const next = Math.min(cap, cur + amt);
        credited = next - cur;
        if (credited <= 0) return;
        tx.update(vaultRef, { currentPP: next });
        const st = await tx.get(studentRef);
        if (st.exists()) tx.update(studentRef, { powerPoints: next });
      });
      if (credited > 0) {
        await createPPLedgerEntryCivic(
          r.studentId,
          credited,
          `Civic job pay — ${r.roleType} (${frequency})`,
          `job-${frequency}-${periodKey}-${r.studentId}`
        );
        paid++;
      }
    }
    return { ok: true, paid };
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function forgiveDefault(studentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const qy = query(collection(db, LEDGER), where('studentId', '==', studentId), where('status', '==', 'defaulted'));
    const snap = await getDocs(qy);
    for (const d of snap.docs) {
      await updateDoc(d.ref, { status: 'forgiven' as CivicTaxLedgerStatus });
    }
    await deleteDoc(doc(db, BOUNTIES, studentId)).catch(() => {});
    await writePlayerState(studentId, {
      taxStatus: 'paid',
      seatFreedom: 'active',
      activeBounty: false,
      taxDefaultWeekId: null,
      shutdownEndsAt: null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function manualCollectTax(
  studentId: string,
  weekId: string
): Promise<{ ok: boolean; error?: string }> {
  const settings = await getTaxSettings();
  const roles = await listRoleAssignments();
  const discount = bestDiscountForStudent(studentId, roles);
  const base = Math.max(0, Math.floor(settings.baseWeeklyTaxPp || 0));
  const finalTax = Math.max(0, Math.floor((base * (100 - discount)) / 100));
  const vaultRef = doc(db, 'vaults', studentId);
  const studentRef = doc(db, 'students', studentId);
  let collected = 0;
  let ppBefore = 0;
  let ppAfter = 0;
  let name = studentId;
  await runTransaction(db, async (tx) => {
    const vSnap = await tx.get(vaultRef);
    const stSnap = await tx.get(studentRef);
    if (stSnap.exists()) name = (stSnap.data().displayName as string) || name;
    ppBefore = vSnap.exists() ? Math.max(0, Math.floor(Number(vSnap.data().currentPP) || 0)) : 0;
    collected = Math.min(finalTax, ppBefore);
    ppAfter = ppBefore - collected;
    if (vSnap.exists()) tx.update(vaultRef, { currentPP: ppAfter });
    if (stSnap.exists()) tx.update(studentRef, { powerPoints: ppAfter });
  });
  if (collected > 0) {
    await createPPLedgerEntryCivic(studentId, -collected, `Manual civic tax collection (${weekId})`, weekId);
  }
  const id = `${weekId}_${studentId}`;
  await setDoc(
    doc(db, LEDGER, id),
    {
      id,
      studentId,
      studentName: name,
      baseTax: base,
      roleDiscount: discount,
      finalTaxOwed: finalTax,
      ppBalanceBefore: ppBefore,
      ppBalanceAfter: ppAfter,
      status: collected >= finalTax ? 'paid' : 'unpaid',
      weekId,
      nextTaxDate: nextTaxCollectionMs(settings, Date.now()),
      createdAt: serverTimestamp(),
    } as Record<string, unknown>,
    { merge: true }
  );
  return { ok: true };
}

export async function manualTriggerBounty(studentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const b: MstCivicBounty = {
      studentId,
      active: true,
      reason: 'tax_default',
      createdAt: Timestamp.now(),
    };
    await setDoc(doc(db, BOUNTIES, studentId), b);
    await writePlayerState(studentId, { activeBounty: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function onVaultDestroyedTaxBountyTarget(targetUid: string): Promise<void> {
  const bountySnap = await getDoc(doc(db, BOUNTIES, targetUid));
  if (!bountySnap.exists() || !bountySnap.data().active) return;
  const settings = await getTaxSettings();
  const hours = Math.max(1, Math.floor(settings.shutdownPenaltyHours || 9));
  const ends = Date.now() + hours * 3600000;
  await writePlayerState(targetUid, {
    taxStatus: 'shutdown',
    shutdownEndsAt: Timestamp.fromMillis(ends),
    activeBounty: false,
  });
  await setDoc(
    doc(db, BOUNTIES, targetUid),
    { active: false, clearedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function listTaxLedgerForWeek(weekId: string): Promise<MstCivicTaxLedgerEntry[]> {
  const qy = query(collection(db, LEDGER), where('weekId', '==', weekId));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MstCivicTaxLedgerEntry, 'id'>) }));
}

export async function listActiveDefaults(): Promise<MstCivicPlayerState[]> {
  const snap = await getDocs(collection(db, PLAYER));
  return snap.docs
    .map((d) => d.data() as MstCivicPlayerState)
    .filter(
      (p) =>
        p.taxStatus === 'defaulted' ||
        p.taxStatus === 'shutdown' ||
        p.activeBounty === true ||
        (p.taxStatus === 'unpaid' && !!p.taxDefaultWeekId)
    );
}
