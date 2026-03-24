import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { applyRevivePotionInLiveEvent, isRevivePotionName } from '../utils/liveEventRevive';
import {
  consumeOneArtifactFromInventory,
  refundOneArtifactToInventory
} from '../utils/artifactInventoryConsume';

interface BagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onArtifactUsed?: () => void;
  /** When set, Revive Potion can target eliminated classmates in this Live Event session. */
  liveSessionId?: string;
  sessionPlayers?: Array<{ userId: string; displayName: string; eliminated?: boolean }>;
}

// Items that can be used during battle (non–live-event-specific)
const BATTLE_USABLE_ITEMS = ['Health Potion (25)', 'Double PP Boost'];

// Mapping of artifact names to their images
const artifactImages: Record<string, string> = {
  'Health Potion (25)': '/images/Health Potion - 25.png',
  'Double PP Boost': '/images/Double PP.png',
  'Revive Potion': '/images/Revive Potion.png',
  'Revivie Potion': '/images/Revive Potion.png'
};

const BagModal: React.FC<BagModalProps> = ({
  isOpen,
  onClose,
  onArtifactUsed,
  liveSessionId,
  sessionPlayers = []
}) => {
  const { currentUser } = useAuth();
  const { inventory, activateArtifact, loading, refreshInventory } = useBattle();
  const [reviveTargetUid, setReviveTargetUid] = useState<string>('');

  const eliminatedOthers = useMemo(() => {
    if (!currentUser || !liveSessionId) return [];
    return sessionPlayers.filter(
      (p) => p.userId !== currentUser.uid && p.eliminated === true
    );
  }, [sessionPlayers, currentUser, liveSessionId]);

  useEffect(() => {
    if (!isOpen) return;
    if (eliminatedOthers.length === 1) {
      setReviveTargetUid(eliminatedOthers[0].userId);
    } else {
      setReviveTargetUid('');
    }
  }, [isOpen, eliminatedOthers]);

  if (!isOpen) return null;

  const artifactCounts: Record<string, number> = {};
  inventory.forEach((item) => {
    const isBattle = BATTLE_USABLE_ITEMS.includes(item);
    const isRevive = !!liveSessionId && isRevivePotionName(item);
    if (isBattle || isRevive) {
      artifactCounts[item] = (artifactCounts[item] || 0) + 1;
    }
  });

  const handleUseRevive = async (exactArtifactName: string) => {
    if (!currentUser || !liveSessionId) {
      alert('Revive Potion can only be used during a Live Event.');
      return;
    }
    if (eliminatedOthers.length === 0) {
      alert('There are no eliminated teammates to revive.');
      return;
    }
    const targetUid =
      eliminatedOthers.length === 1 ? eliminatedOthers[0].userId : reviveTargetUid;
    if (!targetUid) {
      alert('Choose a teammate to revive.');
      return;
    }
    const target = eliminatedOthers.find((p) => p.userId === targetUid);
    if (!target) {
      alert('Invalid target.');
      return;
    }
    const actorName = currentUser.displayName || 'Player';
    if (
      !window.confirm(
        `Use Revive Potion on ${target.displayName}? They will return at 50% max HP.`
      )
    ) {
      return;
    }

    const consumed = await consumeOneArtifactFromInventory(currentUser.uid, exactArtifactName);
    if (!consumed) {
      alert('Could not consume Revive Potion from your inventory. Try refreshing.');
      return;
    }

    const result = await applyRevivePotionInLiveEvent(
      liveSessionId,
      currentUser.uid,
      actorName,
      target.userId,
      target.displayName || 'Player'
    );

    if (!result.ok) {
      await refundOneArtifactToInventory(currentUser.uid, exactArtifactName);
      await refreshInventory();
      alert(result.error || 'Could not revive. Your potion was returned.');
      return;
    }

    await refreshInventory();
    onArtifactUsed?.();
    setReviveTargetUid('');
    onClose();
  };

  const handleUseArtifact = async (artifactName: string) => {
    if (isRevivePotionName(artifactName)) {
      await handleUseRevive(artifactName);
      return;
    }
    if (
      window.confirm(`Use ${artifactName}? This will count as your move and end your turn.`)
    ) {
      await activateArtifact(artifactName, onArtifactUsed);
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          border: '3px solid #4f46e5',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.5rem' }}>🎒 Your Bag</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>Loading...</div>
        ) : Object.keys(artifactCounts).length === 0 ? (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎒</div>
            <div style={{ marginBottom: '0.5rem' }}>No usable items in your bag for this mode.</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              In battle: Health Potions and Double PP Boost.
              {liveSessionId ? ' In Live Events: Revive Potion also appears here.' : ''}
              <br />
              Other items are available from your Profile.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(artifactCounts).map(([artifactName, count]) => {
              const imageUrl = artifactImages[artifactName];
              const isRevive = isRevivePotionName(artifactName);
              const showRevivePick = isRevive && eliminatedOthers.length > 1;

              return (
                <div
                  key={artifactName}
                  style={{
                    backgroundColor: '#16213e',
                    border: '2px solid #4f46e5',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                      {imageUrl ? (
                        <div
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            border: '2px solid #4f46e5',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#0f172a'
                          }}
                        >
                          <img
                            src={imageUrl}
                            alt={artifactName}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = '<span style="font-size: 2rem;">💚</span>';
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '0.5rem',
                            border: '2px solid #4f46e5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#0f172a',
                            fontSize: '2rem',
                            flexShrink: 0
                          }}
                        >
                          {isRevive ? '💚' : '📦'}
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                          {artifactName}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Quantity: {count}</div>
                        {isRevive && (
                          <div style={{ color: '#86efac', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                            Live Event: pick an eliminated teammate (not yourself). They return at 50% max HP.
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUseArtifact(artifactName)}
                      disabled={loading || (isRevive && eliminatedOthers.length > 1 && !reviveTargetUid)}
                      style={{
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 1rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        opacity: loading ? 0.5 : 1,
                        transition: 'all 0.2s',
                        flexShrink: 0,
                        alignSelf: 'flex-start'
                      }}
                    >
                      Use
                    </button>
                  </div>
                  {showRevivePick && (
                    <select
                      value={reviveTargetUid}
                      onChange={(e) => setReviveTargetUid(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        background: '#0f172a',
                        color: '#fff',
                        border: '1px solid #4f46e5'
                      }}
                    >
                      <option value="">Choose eliminated teammate…</option>
                      {eliminatedOthers.map((p) => (
                        <option key={p.userId} value={p.userId}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BagModal;
