import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MANIFESTS, type PlayerManifest } from '../types/manifest';
import { syncBattleMovesForManifest } from './battleMovesManifestSync';

/**
 * Load the player's current manifest from `students` (falls back to `users`).
 */
function coercePlayerManifest(raw: unknown): PlayerManifest | null {
  if (raw && typeof raw === 'object' && typeof (raw as PlayerManifest).manifestId === 'string') {
    const m = raw as PlayerManifest;
    return {
      ...m,
      manifestId: m.manifestId.trim().toLowerCase(),
    };
  }
  if (typeof raw === 'string' && raw.trim()) {
    const id = raw.trim().toLowerCase();
    const def = MANIFESTS.find((m) => m.id === id);
    if (!def) return null;
    return {
      manifestId: id,
      currentLevel: 1,
      xp: 0,
      catalyst: def.catalyst,
      veil: 'Fear of inadequacy',
      signatureMove: def.signatureMove,
      unlockedLevels: [1],
      lastAscension: null,
      abilityUsage: {},
      moveUsage: {},
      unclaimedMilestones: {},
    };
  }
  return null;
}

export async function loadPlayerManifest(userId: string): Promise<PlayerManifest | null> {
  try {
    const studentSnap = await getDoc(doc(db, 'students', userId));
    if (studentSnap.exists()) {
      const coerced = coercePlayerManifest(studentSnap.data()?.manifest);
      if (coerced) return coerced;
    }
  } catch (e) {
    console.warn('[loadPlayerManifest] students read failed:', e);
  }
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const coerced = coercePlayerManifest(userSnap.data()?.manifest);
      if (coerced) return coerced;
    }
  } catch (e) {
    console.warn('[loadPlayerManifest] users read failed:', e);
  }
  return null;
}

/**
 * Persist a manifest pick to `students` + `users`, preserving progress when switching.
 * Also rebuilds battleMoves unlocks so combat skills match the chosen Manifest.
 */
export async function savePlayerManifestSelection(
  userId: string,
  manifestId: string,
  existingManifest: PlayerManifest | null,
  options?: { skipConfirm?: boolean }
): Promise<PlayerManifest> {
  const normalizedId = manifestId.trim().toLowerCase();
  const manifest = MANIFESTS.find((m) => m.id === normalizedId);
  if (!manifest) {
    throw new Error(`Unknown manifest: ${manifestId}`);
  }

  const isFirstTimeSelection = !existingManifest?.manifestId;
  const newPlayerManifest: PlayerManifest = {
    manifestId: normalizedId,
    currentLevel: existingManifest?.currentLevel || 1,
    xp: existingManifest?.xp || 0,
    catalyst: manifest.catalyst,
    veil: existingManifest?.veil || 'Fear of inadequacy',
    signatureMove: manifest.signatureMove,
    unlockedLevels: existingManifest?.unlockedLevels || [1],
    lastAscension: isFirstTimeSelection
      ? serverTimestamp()
      : existingManifest?.lastAscension || serverTimestamp(),
    abilityUsage: existingManifest?.abilityUsage || {},
    moveUsage: existingManifest?.moveUsage || {},
    unclaimedMilestones: existingManifest?.unclaimedMilestones || {},
  };

  if (
    !options?.skipConfirm &&
    !isFirstTimeSelection &&
    existingManifest &&
    existingManifest.manifestId !== manifestId
  ) {
    const fromName =
      MANIFESTS.find((m) => m.id === existingManifest.manifestId)?.name ||
      existingManifest.manifestId;
    const confirmChange = window.confirm(
      `⚠️ Warning: You are changing your manifest from "${fromName}" to "${manifest.name}".\n\n` +
        `Your current level (${existingManifest.currentLevel}), XP (${existingManifest.xp}), and unlocked levels will be preserved.\n\n` +
        `Continue?`
    );
    if (!confirmChange) {
      throw new Error('Manifest change cancelled');
    }
  }

  await setDoc(doc(db, 'students', userId), { manifest: newPlayerManifest }, { merge: true });
  await setDoc(doc(db, 'users', userId), { manifest: newPlayerManifest }, { merge: true });

  try {
    await syncBattleMovesForManifest(userId, normalizedId);
  } catch (moveErr) {
    console.error('Error syncing battle moves after manifest selection:', moveErr);
    throw new Error(
      'Saved your Manifest, but battle skills could not be updated. Try again or contact an admin.'
    );
  }

  try {
    const { recalculatePowerLevel } = await import('../services/recalculatePowerLevel');
    await recalculatePowerLevel(userId);
  } catch (plError) {
    console.error('Error recalculating power level after manifest selection:', plError);
  }

  return newPlayerManifest;
}
