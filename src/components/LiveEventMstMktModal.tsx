import React, { useEffect, useState } from 'react';
import type { SessionPlayer } from '../utils/inSessionService';
import {
  fetchLiveEventMstCatalog,
  purchaseLiveEventMstMktItem,
  type LiveEventMstRuntimeItem,
} from '../utils/liveEventMktService';
import { resolveConsumableEffectForItem } from '../utils/marketplaceConsumableUtils';
import { previewConsumableEffectSentence } from '../types/consumableEffects';

export interface LiveEventMstMktModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  currentPlayer: SessionPlayer | null;
  currentUserId: string;
  displayName: string;
  /** Needed for Revive: pick eliminated teammate (or use Bag for more control). */
  sessionPlayers?: SessionPlayer[];
  /** After a successful buy (e.g. refresh bag inventory from Firestore). */
  onPurchaseComplete?: () => void;
  /** Account-wide Truth Metal shard count (users + students); informational in MST MKT. */
  truthMetalShardsTotal?: number;
}

function itemDisabled(item: LiveEventMstRuntimeItem, player: SessionPlayer | null): string | null {
  if (!player) return 'Not in session';
  const price = item.liveEventMkt?.pricePp ?? 0;
  const pp = player.powerPoints ?? 0;
  if (pp < price) return `Need ${price} PP (you have ${pp})`;
  const eff = resolveConsumableEffectForItem(item);
  if (!eff) return 'Invalid item';
  const eliminated = player.eliminated === true;
  if (eff.effectType === 'revive_eliminated_self') {
    return null;
  }
  if (eliminated) return 'Eliminated — use a Revive consumable';
  return null;
}

const LiveEventMstMktModal: React.FC<LiveEventMstMktModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  currentPlayer,
  currentUserId,
  displayName,
  sessionPlayers = [],
  onPurchaseComplete,
  truthMetalShardsTotal,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [items, setItems] = useState<LiveEventMstRuntimeItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Per listing: '' = save for later; uid = revive that eliminated player (buyer must be alive). */
  const [revivePickByItem, setRevivePickByItem] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchLiveEventMstCatalog()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load shop');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const pp = currentPlayer?.powerPoints ?? 0;
  const buyerEliminated = currentPlayer?.eliminated === true;
  const eliminatedOthers = sessionPlayers.filter(
    (p) => p.userId !== currentUserId && p.eliminated === true
  );

  const buy = async (itemId: string) => {
    const row = items.find((i) => i.id === itemId);
    const eff = row ? resolveConsumableEffectForItem(row) : null;
    const pick = revivePickByItem[itemId] ?? '';
    const mstOpts =
      eff?.effectType === 'revive_eliminated_self' && !buyerEliminated
        ? { reviveTargetUid: pick || undefined }
        : undefined;

    setBusyId(itemId);
    try {
      const res = await purchaseLiveEventMstMktItem(
        sessionId,
        currentUserId,
        displayName,
        itemId,
        mstOpts
      );
      if (!res.ok) {
        alert(res.error || 'Purchase failed');
        return;
      }
      onPurchaseComplete?.();
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mst-mkt-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        zIndex: 10002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 40%, #0f172a 100%)',
          borderRadius: '1rem',
          border: '2px solid rgba(251, 191, 36, 0.45)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div>
            <h2 id="mst-mkt-title" style={{ margin: 0, color: '#fef3c7', fontSize: '1.35rem', fontWeight: 800 }}>
              🛒 MST MKT
            </h2>
            <p style={{ margin: '0.35rem 0 0', color: '#c4b5fd', fontSize: '0.85rem' }}>
              Spend <strong style={{ color: '#34d399' }}>PP you earn in this battle</strong>—participation, quiz streaks,
              eliminations, and host Par. Pt. awards all add to your session balance so you can shop before the event ends.
              Items are configured in Admin → Artifacts → Marketplace.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.1)',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '1.2rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginTop: '1rem',
            padding: '0.65rem 0.85rem',
            borderRadius: '0.5rem',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(251, 191, 36, 0.25)',
            color: '#fde68a',
            fontWeight: 700,
            fontSize: '0.95rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <span>Your session PP: {pp.toLocaleString()}</span>
          {typeof truthMetalShardsTotal === 'number' ? (
            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#c4b5fd' }}>
              💎 Truth Metal shards (account): {truthMetalShardsTotal.toLocaleString()}
            </span>
          ) : null}
        </div>

        {loading && (
          <p style={{ color: '#94a3b8', marginTop: '1rem', textAlign: 'center' }}>Loading catalog…</p>
        )}
        {loadError && (
          <p style={{ color: '#fca5a5', marginTop: '1rem', textAlign: 'center' }}>{loadError}</p>
        )}
        {!loading && !loadError && items.length === 0 && (
          <p style={{ color: '#94a3b8', marginTop: '1rem', textAlign: 'center' }}>
            No Live Event listings. Enable <strong>Live Event MKT</strong> on consumables in Artifacts Admin.
          </p>
        )}

        <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item) => {
            const reason = itemDisabled(item, currentPlayer);
            const disabled = !!reason || busyId !== null;
            const eff = resolveConsumableEffectForItem(item);
            const effectHint = eff ? previewConsumableEffectSentence(eff) : '';
            const price = item.liveEventMkt?.pricePp ?? 0;
            const isRevive = eff?.effectType === 'revive_eliminated_self';
            const showReviveTarget = isRevive && !buyerEliminated && eliminatedOthers.length > 0;

            return (
              <li
                key={item.id}
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '0.65rem',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '1rem' }}>{item.name}</span>
                  <span style={{ color: '#fbbf24', fontWeight: 800, whiteSpace: 'nowrap' }}>{price} PP</span>
                </div>
                <p style={{ margin: '0.35rem 0 0', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.45 }}>
                  {item.description}
                </p>
                {effectHint ? (
                  <p style={{ margin: '0.35rem 0 0.65rem', color: '#a5b4fc', fontSize: '0.75rem' }}>{effectHint}</p>
                ) : null}
                {isRevive && buyerEliminated ? (
                  <p style={{ margin: '0 0 0.5rem', color: '#86efac', fontSize: '0.75rem' }}>
                    You’re eliminated — this purchase revives you.
                  </p>
                ) : null}
                {showReviveTarget ? (
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.8rem' }}>
                    Revive who?
                    <select
                      value={revivePickByItem[item.id] ?? ''}
                      onChange={(e) =>
                        setRevivePickByItem((m) => ({ ...m, [item.id]: e.target.value }))
                      }
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: 6,
                        padding: '0.4rem',
                        borderRadius: 6,
                        background: '#1e293b',
                        color: '#f1f5f9',
                        border: '1px solid #475569',
                      }}
                    >
                      <option value="">Save for later (no effect yet)</option>
                      {eliminatedOthers.map((p) => (
                        <option key={p.userId} value={p.userId}>
                          {p.displayName || p.userId}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isRevive && !buyerEliminated && eliminatedOthers.length === 0 ? (
                  <p style={{ margin: '0 0 0.5rem', color: '#fcd34d', fontSize: '0.75rem' }}>
                    No eliminated classmates — purchase saves the potion until you’re eliminated (or use your Bag to revive
                    others later).
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => buy(item.id)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.55 : 1,
                    background: disabled ? 'rgba(148, 163, 184, 0.35)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: disabled ? '#e2e8f0' : '#1c1917',
                  }}
                >
                  {busyId === item.id ? 'Processing…' : reason || 'Purchase'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default LiveEventMstMktModal;
