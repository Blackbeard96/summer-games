/**
 * MST MKT — host-opened shop during Live Events. Items and effects come from merged marketplace catalog (admin).
 */

import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { debug, debugError } from './inSessionDebug';
import { clearLiveEventEliminationStats, reviveEliminatedSessionPlayerRow } from './liveEventRevive';
import { fetchMergedMarketplaceCatalog } from './marketplaceStoreMerge';
import { liveEventMstListableItems } from './marketplaceConsumableUtils';
import type { MarketplaceStoreArtifact } from '../data/marketplaceArtifactsCatalog';
import { applyConsumableEffectToSessionPlayer, type SessionPlayerMutable } from './consumableEffectResolver';
import { resolveConsumableEffectForItem } from './marketplaceConsumableUtils';
import type { ConsumableEffect } from '../types/consumableEffects';

function normalizeConsumableEffectForMstSession(effect: ConsumableEffect): ConsumableEffect {
  if (effect.effectType === 'restore_health' || effect.effectType === 'restore_shields') {
    return { ...effect, targetScope: 'self' as const };
  }
  return effect;
}

export type PurchaseLiveEventMstOptions = {
  /** For Revive: eliminated teammate uid. Omit or same as buyer = stash (no combat) if buyer is alive; ignored if buyer is eliminated (always self). */
  reviveTargetUid?: string;
};

export type LiveEventMstRuntimeItem = MarketplaceStoreArtifact & {
  liveEventMkt: NonNullable<MarketplaceStoreArtifact['liveEventMkt']>;
};

export async function fetchLiveEventMstCatalog(): Promise<LiveEventMstRuntimeItem[]> {
  const merged = await fetchMergedMarketplaceCatalog();
  return liveEventMstListableItems(merged) as LiveEventMstRuntimeItem[];
}

export async function setLiveEventMstMktOpen(sessionId: string, open: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await updateDoc(doc(db, 'inSessionRooms', sessionId), {
      mstMktOpen: open,
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugError('liveEventMkt', 'setLiveEventMstMktOpen', e);
    return { ok: false, error: msg };
  }
}

function sessionIsActive(status: unknown): boolean {
  return status === 'live' || status === 'active';
}

async function syncBuyerVault(
  uid: string,
  hp: number | undefined,
  shield: number | undefined
): Promise<void> {
  if (hp === undefined && shield === undefined) return;
  try {
    const vaultRef = doc(db, 'vaults', uid);
    const updates: { vaultHealth?: number; shieldStrength?: number } = {};
    if (hp !== undefined) updates.vaultHealth = Math.max(0, hp);
    if (shield !== undefined) updates.shieldStrength = Math.max(0, shield);
    if (Object.keys(updates).length > 0) {
      await updateDoc(vaultRef, updates);
    }
  } catch (e) {
    debugError('liveEventMkt', 'syncBuyerVault', e);
  }
}

export async function purchaseLiveEventMstMktItem(
  sessionId: string,
  buyerUid: string,
  buyerDisplayName: string,
  storeItemId: string,
  options?: PurchaseLiveEventMstOptions
): Promise<{ ok: boolean; error?: string; logLine?: string }> {
  let logLineOut: string | undefined;
  let hpAfter: number | undefined;
  let shieldAfter: number | undefined;
  let needsEliminationClear = false;
  let eliminationClearUid: string | undefined;

  try {
    const catalog = await fetchMergedMarketplaceCatalog();
    const listing = catalog.find((x) => x.id === storeItemId);
    if (!listing?.liveEventMkt?.enabled || (listing.liveEventMkt.pricePp ?? 0) <= 0) {
      return { ok: false, error: 'Item is not sold in Live Event MST MKT' };
    }
    const effect = resolveConsumableEffectForItem(listing);
    if (!effect) {
      return { ok: false, error: 'Item has no valid consumable effect' };
    }
    const costPp = listing.liveEventMkt.pricePp;
    const itemName = listing.name || storeItemId;

    await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await transaction.get(sessionRef);
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }
      const data = sessionDoc.data();
      if (!sessionIsActive(data.status)) {
        throw new Error('Session is not active');
      }
      if (data.mstMktOpen !== true) {
        throw new Error('MST MKT is closed');
      }

      const players = [...(data.players || [])];
      const idx = players.findIndex((p: { userId?: string }) => p.userId === buyerUid);
      if (idx < 0) {
        throw new Error('You are not in this session');
      }

      const row = { ...players[idx] } as unknown as SessionPlayerMutable;

      const pp = Number(row.powerPoints) || 0;
      if (pp < costPp) {
        throw new Error(`Not enough PP (need ${costPp}, have ${pp})`);
      }

      const battleLog = [...(data.battleLog || [])];

      if (effect.effectType === 'revive_eliminated_self') {
        const hpPct = Math.max(1, Math.min(100, Math.floor(effect.amount)));
        const buyerEliminated = row.eliminated === true;
        const pick = options?.reviveTargetUid;

        if (buyerEliminated) {
          const revived = { ...row } as Parameters<typeof reviveEliminatedSessionPlayerRow>[0];
          const newHp = reviveEliminatedSessionPlayerRow(revived, hpPct);
          const maxHp = revived.maxHp ?? 100;
          revived.powerPoints = pp - costPp;
          players[idx] = revived as (typeof players)[number];
          logLineOut = `🛒 ${buyerDisplayName} bought ${itemName} from MST MKT and returned at ${newHp}/${maxHp} HP!`;
          hpAfter = revived.hp;
          shieldAfter = revived.shield;
          needsEliminationClear = true;
          eliminationClearUid = buyerUid;
        } else if (pick && pick !== buyerUid) {
          const tIdx = players.findIndex((p: { userId?: string }) => p.userId === pick);
          if (tIdx < 0) throw new Error('Revive target is not in this session');
          const targetRow = { ...(players[tIdx] as Record<string, unknown>) } as Parameters<
            typeof reviveEliminatedSessionPlayerRow
          >[0];
          if (!targetRow.eliminated) throw new Error('That player is not eliminated');
          const tName = (targetRow.displayName as string) || 'Player';
          const newHp = reviveEliminatedSessionPlayerRow(targetRow, hpPct);
          const maxHp = targetRow.maxHp ?? 100;
          players[tIdx] = targetRow as (typeof players)[number];
          const buyerNext = { ...row, powerPoints: pp - costPp };
          players[idx] = buyerNext as (typeof players)[number];
          logLineOut = `🛒 ${buyerDisplayName} bought ${itemName} from MST MKT for ${tName}! They return at ${newHp}/${maxHp} HP.`;
          hpAfter = targetRow.hp;
          shieldAfter = targetRow.shield;
          needsEliminationClear = true;
          eliminationClearUid = pick;
        } else {
          const applied = applyConsumableEffectToSessionPlayer({
            player: row,
            effect,
            buyerDisplayName,
            itemName,
          });
          if (!applied.ok || !applied.logLine) {
            throw new Error(applied.error || 'Could not apply consumable effect');
          }
          logLineOut = applied.logLine;
          const nextRow = { ...applied.player, powerPoints: pp - costPp };
          players[idx] = nextRow as (typeof players)[number];
        }
      } else {
        const applied = applyConsumableEffectToSessionPlayer({
          player: row,
          effect: normalizeConsumableEffectForMstSession(effect),
          buyerDisplayName,
          itemName,
        });

        if (!applied.ok || !applied.logLine) {
          throw new Error(applied.error || 'Could not apply consumable effect');
        }

        logLineOut = applied.logLine;
        needsEliminationClear = applied.needsEliminationClear === true;
        eliminationClearUid = needsEliminationClear ? buyerUid : undefined;
        hpAfter = applied.hpAfter;
        shieldAfter = applied.shieldAfter;

        const nextRow = { ...applied.player, powerPoints: pp - costPp };
        players[idx] = nextRow as (typeof players)[number];
      }

      battleLog.push(logLineOut!);

      transaction.update(sessionRef, {
        players,
        battleLog,
        updatedAt: serverTimestamp(),
      });
    });

    if (needsEliminationClear && eliminationClearUid) {
      await clearLiveEventEliminationStats(sessionId, eliminationClearUid);
    }

    const vaultUid = eliminationClearUid || buyerUid;
    await syncBuyerVault(vaultUid, hpAfter, shieldAfter);

    debug('liveEventMkt', `Purchase ${storeItemId} by ${buyerUid}`);
    return { ok: true, logLine: logLineOut };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugError('liveEventMkt', 'purchaseLiveEventMstMktItem', e);
    return { ok: false, error: msg };
  }
}
