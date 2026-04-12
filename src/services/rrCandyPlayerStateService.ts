/**
 * Player RR Candy skill-tree state on players/{uid}/skill_state/main.
 * Unlocks still come from chapter progress (rrCandyUtils); this stores learned tree node ids per candy.
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { PlayerSkillState } from '../types/skillSystem';
import { getRRCandyConfig } from './rrCandyConfigService';
import { legacyCandyTypeToConfigId } from '../utils/rrCandyConfigMapping';
import {
  analyzeRRCandyDoc,
  getMergedRRCandyStatus,
  normalizeLegacyRRCandyTypeInput,
  skillStateImpliesKonfigCandy,
  type RRCandyStatus,
} from '../utils/rrCandyUtils';

const KONFIG_ID = 'konfig' as const;
export const RR_CANDY_STARTER_MIGRATION_V1 = 'rrCandyStarterNodesV1' as const;

function normalizeRRCandySkillState(
  raw: PlayerSkillState['rrCandySkillState'] | undefined
): NonNullable<PlayerSkillState['rrCandySkillState']> {
  if (!raw || typeof raw !== 'object') return {};
  const out: NonNullable<PlayerSkillState['rrCandySkillState']> = {};
  for (const [k, v] of Object.entries(raw)) {
    const ids = Array.isArray(v?.learnedNodeIds)
      ? Array.from(new Set(v.learnedNodeIds.map(String)))
      : [];
    out[k] = { learnedNodeIds: ids };
  }
  return out;
}

export async function getPlayerRRCandyState(userId: string): Promise<{
  rrCandySkillState: NonNullable<PlayerSkillState['rrCandySkillState']>;
  migrations: NonNullable<PlayerSkillState['migrations']>;
}> {
  const ref = doc(db, 'players', userId, 'skill_state', 'main');
  const snap = await getDoc(ref);
  const data: Partial<PlayerSkillState> = snap.exists() ? (snap.data() as PlayerSkillState) : {};
  return {
    rrCandySkillState: normalizeRRCandySkillState(data.rrCandySkillState),
    migrations: data.migrations || {},
  };
}

export function playerHasCandyUnlocked(status: RRCandyStatus, candyId: string): boolean {
  if (!status.unlocked || !status.candyType) return false;
  return legacyCandyTypeToConfigId(status.candyType) === candyId;
}

/**
 * One-time v1: players with Konfig (legacy type `config`, or explicit `konfig` label) receive starter nodes + migration flag.
 * Uses raw users + students docs so we do not depend on getRRCandyStatusAsync (which runs before skill_state exists on first load).
 */
export async function migrateExistingKonfigOwners(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const studentRef = doc(db, 'students', userId);
  const [userDoc, studentDoc] = await Promise.all([getDoc(userRef), getDoc(studentRef)]);
  const userData = userDoc.exists() ? userDoc.data() : {};
  const studentData = studentDoc.exists() ? studentDoc.data() : null;

  const merged = getMergedRRCandyStatus(userData, studentData);
  const u = analyzeRRCandyDoc(userData);
  const s = analyzeRRCandyDoc(studentData ?? {});

  const explicitKonfig =
    normalizeLegacyRRCandyTypeInput(u.explicitCandyStr) === 'config' ||
    normalizeLegacyRRCandyTypeInput(s.explicitCandyStr) === 'config';

  const ref = doc(db, 'players', userId, 'skill_state', 'main');
  const snap = await getDoc(ref);
  const data: Partial<PlayerSkillState> = snap.exists() ? (snap.data() as PlayerSkillState) : {};

  let hasKonfigCandy = merged.candyType === 'config' || explicitKonfig;
  if (
    !hasKonfigCandy &&
    merged.unlocked &&
    merged.candyType === 'on-off' &&
    skillStateImpliesKonfigCandy(data as Record<string, unknown>)
  ) {
    hasKonfigCandy = true;
    console.log(
      'migrateExistingKonfigOwners: treating as Konfig (Vibration law progress; chapter likely defaulted on-off)'
    );
  }

  if (!merged.unlocked || !hasKonfigCandy) return;
  const migrations = { ...(data.migrations || {}) };
  if (migrations[RR_CANDY_STARTER_MIGRATION_V1] === true) return;

  const config = await getRRCandyConfig();
  const konfig = config.candies.find((c) => c.id === KONFIG_ID);
  const starterIds =
    konfig?.starterNodeIds?.length
      ? Array.from(new Set(konfig.starterNodeIds))
      : ['konfig_node_01', 'konfig_node_02'];

  const rr = normalizeRRCandySkillState(data.rrCandySkillState);
  const learned = new Set(rr[KONFIG_ID]?.learnedNodeIds || []);
  starterIds.forEach((id) => learned.add(id));

  const nextRr: NonNullable<PlayerSkillState['rrCandySkillState']> = {
    ...rr,
    [KONFIG_ID]: { learnedNodeIds: Array.from(learned) },
  };
  migrations[RR_CANDY_STARTER_MIGRATION_V1] = true;

  const patch = {
    rrCandySkillState: nextRr,
    migrations,
    lastUpdated: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      unlockedNodeIds: Array.isArray(data.unlockedNodeIds) ? data.unlockedNodeIds : [],
      equippedSkillIds: Array.isArray(data.equippedSkillIds) ? data.equippedSkillIds : [],
      skillUpgrades: data.skillUpgrades && typeof data.skillUpgrades === 'object' ? data.skillUpgrades : {},
      version: data.version || 'v1',
      ...patch,
    } as unknown as PlayerSkillState);
  } else {
    await updateDoc(ref, patch as any);
  }
}

/** Grant current starterNodeIds from config for a candy (no-op if candy missing / inactive). */
export async function grantStarterNodesForCandy(userId: string, candyId: string): Promise<void> {
  const config = await getRRCandyConfig();
  const candy = config.candies.find((c) => c.id === candyId);
  if (!candy?.isActive) return;
  const starters = Array.from(new Set(candy.starterNodeIds || []));
  if (starters.length === 0) return;

  const ref = doc(db, 'players', userId, 'skill_state', 'main');
  const snap = await getDoc(ref);
  const data: Partial<PlayerSkillState> = snap.exists() ? (snap.data() as PlayerSkillState) : {};
  const rr = normalizeRRCandySkillState(data.rrCandySkillState);
  const learned = new Set(rr[candyId]?.learnedNodeIds || []);
  starters.forEach((id) => learned.add(id));
  const nextRr = { ...rr, [candyId]: { learnedNodeIds: Array.from(learned) } };
  const patch = { rrCandySkillState: nextRr, lastUpdated: serverTimestamp() };
  if (!snap.exists()) {
    await setDoc(ref, {
      unlockedNodeIds: [],
      equippedSkillIds: [],
      skillUpgrades: {},
      version: 'v1',
      ...patch,
    } as unknown as PlayerSkillState);
  } else {
    await updateDoc(ref, patch as any);
  }
}
