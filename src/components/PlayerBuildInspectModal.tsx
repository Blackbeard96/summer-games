import React, { useEffect, useState } from 'react';
import type { Move } from '../types/battle';
import { getRRCandyDisplayName } from '../utils/rrCandyMoves';
import {
  fetchPlayerBuildInspectData,
  type PlayerInspectData,
} from '../utils/playerBuildInspect';

export type PlayerInspectTab = 'loadout' | 'artifacts';

export interface PlayerBuildInspectModalProps {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  /** When set (e.g. Live Event), prefer session loadout snapshot from `inSessionRooms/.../players`. */
  sessionId?: string | null;
  rosterDisplayName?: string;
  rosterPhotoURL?: string;
  rosterPowerLevel?: number | null;
  /** Subtitle under the player name (default matches Live Event copy). */
  viewerSubtitle?: string;
}

const PlayerBuildInspectModal: React.FC<PlayerBuildInspectModalProps> = ({
  open,
  onClose,
  playerId,
  sessionId,
  rosterDisplayName,
  rosterPhotoURL,
  rosterPowerLevel,
  viewerSubtitle = 'Loadout & artifacts',
}) => {
  const [tab, setTab] = useState<PlayerInspectTab>('loadout');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerInspectData | null>(null);

  useEffect(() => {
    if (!open || !playerId) {
      if (!open) {
        setData(null);
        setError(null);
      }
      return;
    }
    let cancelled = false;
    setTab('loadout');
    setLoading(true);
    setError(null);
    setData({
      userId: playerId,
      displayName: rosterDisplayName || 'Player',
      photoURL: rosterPhotoURL,
      powerLevel: rosterPowerLevel ?? null,
      loadout: null,
      artifacts: [],
      skillLevelsById: {},
    });

    fetchPlayerBuildInspectData(playerId, {
      sessionId,
      roster: {
        displayName: rosterDisplayName,
        photoURL: rosterPhotoURL,
        powerLevel: rosterPowerLevel,
      },
    })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        console.error('PlayerBuildInspectModal load failed:', e);
        if (!cancelled) setError("Could not load this player's loadout/artifacts right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, playerId, sessionId, rosterDisplayName, rosterPhotoURL, rosterPowerLevel]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 10001,
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
          maxWidth: '720px',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          padding: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {data?.photoURL ? (
              <img
                src={data.photoURL}
                alt={data.displayName}
                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                {(data?.displayName || 'P').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{data?.displayName || 'Player'}</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{viewerSubtitle}</div>
              {data?.powerLevel != null && (
                <div
                  title={`Power Level = ${data.powerLevel}`}
                  style={{ fontSize: '0.78rem', color: '#8b5cf6', fontWeight: 600, marginTop: '0.15rem' }}
                >
                  ⚡ PL {data.powerLevel}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '1rem', cursor: 'pointer', color: '#6b7280', fontWeight: 700 }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setTab('loadout')}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '0.45rem',
              border: '1px solid #cbd5e1',
              background: tab === 'loadout' ? '#e0e7ff' : '#f8fafc',
              color: tab === 'loadout' ? '#312e81' : '#334155',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Loadout
          </button>
          <button
            type="button"
            onClick={() => setTab('artifacts')}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '0.45rem',
              border: '1px solid #cbd5e1',
              background: tab === 'artifacts' ? '#dcfce7' : '#f8fafc',
              color: tab === 'artifacts' ? '#14532d' : '#334155',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Artifacts
          </button>
        </div>

        {loading && <div style={{ color: '#475569', fontSize: '0.9rem' }}>Loading player build...</div>}
        {!loading && error && (
          <div
            style={{
              color: '#b91c1c',
              fontSize: '0.9rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.5rem',
              padding: '0.6rem',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && tab === 'loadout' && (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {(() => {
              const grouped = data?.loadout
                ? [
                    { title: 'Manifest', skills: data.loadout.manifest || [] },
                    { title: 'Elemental', skills: data.loadout.elemental || [] },
                    { title: 'RR Candy', skills: data.loadout.rrCandy || [] },
                    { title: 'Artifact Skills', skills: data.loadout.artifact || [] },
                  ]
                : [];
              if (!data?.loadout) {
                return (
                  <div style={{ fontSize: '0.88rem', color: '#6b7280' }}>
                    No session loadout snapshot found for this player yet.
                  </div>
                );
              }
              return grouped.map((group) => (
                <div key={group.title} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.6rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1f2937', marginBottom: '0.35rem' }}>{group.title}</div>
                  {group.skills.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>None equipped</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      {group.skills.map((skill: Move) => (
                        <div
                          key={String(skill.id || `${group.title}-${skill.name}`)}
                          style={{
                            fontSize: '0.8rem',
                            color: '#334155',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                          }}
                        >
                          <span>
                            {group.title === 'RR Candy'
                              ? getRRCandyDisplayName(skill)
                              : String(skill.name || skill.id || 'Unknown Move')}
                          </span>
                          <span style={{ color: '#64748b' }}>
                            Lv.
                            {Math.max(
                              1,
                              Number(data?.skillLevelsById?.[String(skill.id)]) ||
                                Number((skill?.artifactGrant as { artifactLevel?: number } | undefined)?.artifactLevel) ||
                                Number(skill?.masteryLevel) ||
                                Number(skill?.level) ||
                                1
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        )}

        {!loading && !error && tab === 'artifacts' && (
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {!data || data.artifacts.length === 0 ? (
              <div style={{ fontSize: '0.88rem', color: '#6b7280' }}>No equipped artifacts found.</div>
            ) : (
              data.artifacts.map((artifact) => (
                <div
                  key={`${artifact.slot}-${artifact.name}`}
                  style={{ border: '1px solid #dcfce7', borderRadius: '0.5rem', padding: '0.55rem', background: '#f0fdf4' }}
                >
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    {artifact.image ? (
                      <img
                        src={artifact.image}
                        alt={artifact.name}
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '0.5rem',
                          objectFit: 'cover',
                          border: '1px solid #bbf7d0',
                          background: 'white',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '0.5rem',
                          border: '1px dashed #86efac',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#166534',
                          fontSize: '1.1rem',
                          background: 'white',
                        }}
                      >
                        🧩
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700 }}>
                        {artifact.slot}
                      </div>
                      <div style={{ fontSize: '0.92rem', color: '#14532d', fontWeight: 700 }}>{artifact.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#15803d' }}>
                        Level: {artifact.level ?? '-'} {artifact.rarity ? `• ${artifact.rarity}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
                    {artifact.perks.length === 0 ? (
                      <div style={{ fontSize: '0.76rem', color: '#64748b' }}>Perks: None listed</div>
                    ) : (
                      artifact.perks.map((perk) => (
                        <div
                          key={`${artifact.slot}-${perk.id}`}
                          style={{ background: 'white', border: '1px solid #dcfce7', borderRadius: '0.45rem', padding: '0.4rem' }}
                        >
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>{perk.label}</div>
                          {perk.description && (
                            <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: '0.2rem' }}>{perk.description}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerBuildInspectModal;
