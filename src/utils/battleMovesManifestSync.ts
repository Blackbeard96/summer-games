/**
 * Keep battleMoves unlock flags aligned with the player's chosen Manifest (and elemental access).
 * Manifest selection historically only wrote students/users.manifest — combat still uses battleMoves.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { MOVE_TEMPLATES, type Move } from '../types/battle';
import { hasElementalMoveAccess } from './elementalAccess';
import { stripUndefinedDeep } from './firestoreSanitize';

function isTemplateMoveId(id: string | undefined): boolean {
  return typeof id === 'string' && /^move_\d+$/.test(id);
}

/** Drop keys with undefined values so move rows stay writable to Firestore. */
function omitUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** Canonical id form used by MOVE_TEMPLATES.manifestType and MANIFESTS.id */
export function normalizeManifestId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  return id.length > 0 ? id : null;
}

export type BuildBattleMovesOptions = {
  existingMoves?: Move[];
  canUseElemental?: boolean;
  userElement?: string;
};

/**
 * Pure rebuild of template slots for a Manifest (no Firestore).
 * Always unlocks system vault skills + matching Manifest skills (+ L1 elementals when eligible).
 */
export function buildBattleMovesForManifest(
  manifestId: string,
  options: BuildBattleMovesOptions = {}
): Move[] {
  const mid = normalizeManifestId(manifestId);
  if (!mid) return [];

  const existingMoves = options.existingMoves || [];
  const canUseElemental = options.canUseElemental === true;
  const userElement = (options.userElement || '').toString().toLowerCase();

  const extraMoves = existingMoves.filter(
    (m) => m && !isTemplateMoveId(m.id) && m.category !== 'manifest'
  );

  const templateMoves: Move[] = MOVE_TEMPLATES.map((template, index) => {
    const moveId = `move_${index + 1}`;
    const existing =
      existingMoves.find((m) => m.id === moveId) ||
      existingMoves.find(
        (m) =>
          m.category === template.category &&
          (m.manifestType || '').toString().toLowerCase() ===
            (template.manifestType || '').toString().toLowerCase() &&
          m.name === template.name
      );

    const templateManifest = (template.manifestType || '').toString().toLowerCase();
    const isUnlocked =
      template.category === 'system' ||
      (template.category === 'manifest' && templateManifest === mid) ||
      (canUseElemental &&
        template.category === 'elemental' &&
        template.level === 1 &&
        !!userElement &&
        (template.elementalAffinity || '').toString().toLowerCase() === userElement);

    // Firestore rejects undefined fields, so optional stats are only set when present.
    return omitUndefinedFields({
      ...template,
      id: moveId,
      unlocked: isUnlocked,
      currentCooldown: 0,
      masteryLevel: existing?.masteryLevel ?? 1,
      level: existing?.level ?? template.level,
      damage: existing?.damage ?? template.damage,
      shieldBoost: existing?.shieldBoost ?? template.shieldBoost,
      healing: existing?.healing ?? template.healing,
      ppSteal: existing?.ppSteal ?? template.ppSteal,
      debuffStrength: existing?.debuffStrength ?? template.debuffStrength,
      buffStrength: existing?.buffStrength ?? template.buffStrength,
    }) as Move;
  });

  return [...templateMoves, ...extraMoves];
}

/** Manifest-only skill rows for fight menus when Firestore unlocks are missing. */
export function getManifestSkillsFromTemplates(manifestId: string): Move[] {
  const mid = normalizeManifestId(manifestId);
  if (!mid) return [];
  return buildBattleMovesForManifest(mid).filter(
    (m) => m.category === 'manifest' && m.unlocked
  );
}

async function equipManifestPreferredLoadout(userId: string, nextMoves: Move[]): Promise<void> {
  try {
    const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
    const skillStateSnap = await getDoc(skillStateRef);
    const unlockedForFight = nextMoves.filter(
      (m) =>
        m.unlocked &&
        !(
          m.category === 'system' &&
          (m.name === 'Vault Hack' || m.name === 'Shield Restoration')
        )
    );
    const preferredIds = [
      ...unlockedForFight.filter((m) => m.category === 'manifest'),
      ...unlockedForFight.filter((m) => m.category !== 'manifest'),
    ]
      .map((m) => m.id)
      .slice(0, 6);

    const existingEquipped: string[] =
      skillStateSnap.exists() && Array.isArray(skillStateSnap.data()?.equippedSkillIds)
        ? skillStateSnap.data()!.equippedSkillIds
        : [];
    const unlockedIds = new Set(nextMoves.filter((m) => m.unlocked).map((m) => m.id));
    const kept = existingEquipped.filter((id) => unlockedIds.has(id));
    const keptHasManifest = kept.some((id) => {
      const move = nextMoves.find((m) => m.id === id);
      return move?.category === 'manifest' && move.unlocked;
    });

    // Elementals unlock after Element awakening; merge them into an existing Manifest loadout
    // so Fight menus don't stay stuck on pre-Element equippedSkillIds (e.g. Tool Strike only).
    const missingElementals = unlockedForFight
      .filter((m) => m.category === 'elemental' && !kept.includes(m.id))
      .map((m) => m.id);
    const keptWithElementals =
      missingElementals.length > 0
        ? [...kept, ...missingElementals].slice(0, 6)
        : kept;

    const nextEquipped =
      preferredIds.length > 0 && (!keptHasManifest || kept.length === 0)
        ? preferredIds
        : keptWithElementals;

    if (
      !skillStateSnap.exists() ||
      nextEquipped.length !== existingEquipped.length ||
      nextEquipped.some((id, i) => id !== existingEquipped[i])
    ) {
      await setDoc(
        skillStateRef,
        {
          equippedSkillIds: nextEquipped,
          lastUpdated: serverTimestamp(),
          version: 'v1',
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn('[syncBattleMovesForManifest] could not update equippedSkillIds', e);
  }
}

/**
 * Rebuild template-slot unlocks so only system moves + the active manifest (and eligible elementals) are unlocked.
 * Preserves mastery / damage on matching template slots; keeps non-template moves (RR Candy, L2, artifacts).
 * Still returns built moves if the Firestore write fails (so battle can proceed offline of skill state).
 */
export async function syncBattleMovesForManifest(
  userId: string,
  manifestId: string
): Promise<Move[]> {
  const mid = normalizeManifestId(manifestId);
  if (!mid) return [];

  let existingMoves: Move[] = [];
  let canUseElemental = false;
  let userElement = '';

  try {
    const studentSnap = await getDoc(doc(db, 'students', userId));
    const studentData = studentSnap.exists() ? studentSnap.data() : {};
    canUseElemental = hasElementalMoveAccess(studentData as Record<string, unknown>);
    userElement = (
      (studentData.artifacts as Record<string, unknown> | undefined)?.chosen_element ||
      studentData.elementalAffinity ||
      ''
    )
      .toString()
      .toLowerCase();

    const movesRef = doc(db, 'battleMoves', userId);
    const movesDoc = await getDoc(movesRef);
    existingMoves = movesDoc.exists() ? ((movesDoc.data()?.moves as Move[]) || []) : [];
  } catch (e) {
    console.warn('[syncBattleMovesForManifest] could not load student/battleMoves:', e);
  }

  const nextMoves = buildBattleMovesForManifest(mid, {
    existingMoves,
    canUseElemental,
    userElement,
  });

  try {
    await setDoc(
      doc(db, 'battleMoves', userId),
      stripUndefinedDeep({ moves: nextMoves }) as { moves: Move[] },
      { merge: true }
    );
  } catch (e) {
    console.warn(
      '[syncBattleMovesForManifest] write failed; returning in-memory moves so fight remains playable:',
      e
    );
  }

  await equipManifestPreferredLoadout(userId, nextMoves);
  return nextMoves;
}

/**
 * Ensure the player has Manifest battle skills ready before a mission/demo fight.
 * Call this when starting a battle from MissionRunner (and similar demo flows).
 */
export async function ensureManifestSkillsForBattle(userId: string): Promise<Move[]> {
  const { loadPlayerManifest } = await import('./playerManifestSelection');
  const manifest = await loadPlayerManifest(userId);
  if (!manifest?.manifestId) {
    console.warn('[ensureManifestSkillsForBattle] no manifest for', userId);
    return [];
  }
  return syncBattleMovesForManifest(userId, manifest.manifestId);
}
