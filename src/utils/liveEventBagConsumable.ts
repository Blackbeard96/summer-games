/**
 * Use heal/shield consumables from the student's bag during a Live Event: applies to session HP/shields,
 * removes one stack from inventory, decrements movesEarned (participation move), syncs vault mirror.
 */

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchMergedMarketplaceCatalog } from './marketplaceStoreMerge';
import { resolveConsumableEffectForItem } from './marketplaceConsumableUtils';
import {
  applyConsumableEffectToSessionPlayer,
  type SessionPlayerMutable,
} from './consumableEffectResolver';
import { syncLiveEventPlayerVault } from './liveEventMktService';
import { debugError } from './inSessionDebug';

function sessionIsActive(status: unknown): boolean {
  return status === 'live' || status === 'active';
}

function markOneArtifactUsedInUsersArray(artifacts: unknown, artifactName: string): unknown[] {
  const raw = artifacts;
  let list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null
      ? Object.values(raw as Record<string, unknown>).filter(
          (val) =>
            typeof val === 'object' &&
            val !== null &&
            ((val as { name?: string }).name || (val as { id?: string }).id)
        )
      : [];
  let found = false;
  return list.map((artifact: unknown) => {
    if (found) return artifact;
    if (typeof artifact === 'string') {
      if (artifact === artifactName) {
        found = true;
        return {
          id: artifactName.toLowerCase().replace(/\s+/g, '-'),
          name: artifactName,
          used: true,
          usedAt: new Date(),
          isLegacy: true,
        };
      }
      return artifact;
    }
    const a = artifact as { name?: string; used?: boolean | null };
    const isNotUsed = a.used === false || a.used === undefined || a.used === null;
    if (a.name === artifactName && isNotUsed) {
      found = true;
      return { ...a, used: true, usedAt: new Date() };
    }
    return artifact;
  });
}

export async function applyLiveEventBagConsumable(
  sessionId: string,
  userId: string,
  displayName: string,
  artifactName: string
): Promise<{ ok: boolean; error?: string; logLine?: string }> {
  const catalog = await fetchMergedMarketplaceCatalog();
  const listing = catalog.find((x) => x.name === artifactName);
  const effect = listing ? resolveConsumableEffectForItem(listing) : null;
  if (!effect) {
    return { ok: false, error: 'Unknown item — add this consumable in Artifacts Admin.' };
  }
  if (effect.effectType !== 'restore_health' && effect.effectType !== 'restore_shields') {
    return {
      ok: false,
      error: 'This item is not a battle heal/shield consumable for Live Events.',
    };
  }
  const itemName = listing?.name || artifactName;

  let hpAfter: number | undefined;
  let shieldAfter: number | undefined;
  let logLineOut: string | undefined;

  try {
    await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const studentRef = doc(db, 'students', userId);
      const usersRef = doc(db, 'users', userId);

      const sessionSnap = await transaction.get(sessionRef);
      const studentSnap = await transaction.get(studentRef);
      const usersSnap = await transaction.get(usersRef);

      if (!sessionSnap.exists()) throw new Error('Session not found');
      if (!studentSnap.exists()) throw new Error('Student profile not found');

      const data = sessionSnap.data();
      if (!sessionIsActive(data.status)) throw new Error('Session is not active');

      const inventory = [...(studentSnap.data().inventory || [])];
      const invIdx = inventory.indexOf(artifactName);
      if (invIdx < 0) throw new Error(`No ${artifactName} in your bag`);

      const players = [...(data.players || [])];
      const pIdx = players.findIndex((p: { userId?: string }) => p.userId === userId);
      if (pIdx < 0) throw new Error('You are not in this session');

      const row = { ...players[pIdx] } as unknown as SessionPlayerMutable;
      if (row.eliminated === true) {
        throw new Error('Eliminated players cannot use heal/shield items — use a Revive Potion.');
      }

      const movesAvail = Math.max(0, Math.floor(Number(row.movesEarned) || 0));
      if (movesAvail < 1) {
        throw new Error('No moves available — earn participation to use items.');
      }

      const applied = applyConsumableEffectToSessionPlayer({
        player: row,
        effect: { ...effect, targetScope: 'self' },
        buyerDisplayName: displayName,
        itemName,
      });
      if (!applied.ok || !applied.logLine) {
        throw new Error(applied.error || 'Could not apply item');
      }

      inventory.splice(invIdx, 1);
      transaction.update(studentRef, { inventory });

      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        const nextArtifacts = markOneArtifactUsedInUsersArray(usersData.artifacts, artifactName);
        transaction.update(usersRef, { artifacts: nextArtifacts });
      }

      const mergedRow = {
        ...(applied.player as SessionPlayerMutable),
        movesEarned: movesAvail - 1,
      };
      players[pIdx] = mergedRow as (typeof players)[number];

      const battleLog = [...(data.battleLog || [])];
      const outcome = applied.logLine.replace(/^🛒 .*? at MST MKT /, '').trim();
      logLineOut = `📦 ${displayName} used ${itemName} from their bag${outcome ? `. ${outcome}` : '.'}`;
      battleLog.push(logLineOut);

      transaction.update(sessionRef, {
        players,
        battleLog,
        updatedAt: serverTimestamp(),
      });

      hpAfter = applied.hpAfter;
      shieldAfter = applied.shieldAfter;
    });

    await syncLiveEventPlayerVault(userId, hpAfter, shieldAfter);
    return { ok: true, logLine: logLineOut };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugError('liveEventBag', 'applyLiveEventBagConsumable', e);
    return { ok: false, error: msg };
  }
}
