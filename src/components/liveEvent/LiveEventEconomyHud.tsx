/**
 * Live Event economy / feedback HUD: PP released (session-wide), local player stats, compact action feed.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { SessionStats } from '../../types/inSessionStats';

const HUD_COLLAPSED_STORAGE_KEY = 'liveEventEconomyHudCollapsed';

interface Props {
  sessionId: string;
  currentUserId: string | undefined;
  /** Recent battle log lines (newest at end); parent passes slice from subscription */
  battleLogTail: string[];
  /** Local player row from session.players */
  flowStateActive?: boolean;
  successStreak?: number;
  sessionPp?: number;
}

const LiveEventEconomyHud: React.FC<Props> = ({
  sessionId,
  currentUserId,
  battleLogTail,
  flowStateActive,
  successStreak,
  sessionPp,
}) => {
  const [ppReleasedTotal, setPpReleasedTotal] = useState(0);
  const [myStats, setMyStats] = useState<SessionStats | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(HUD_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(HUD_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!sessionId) return;
    const col = collection(db, 'inSessionRooms', sessionId, 'stats');
    const unsub = onSnapshot(col, (snap) => {
      let sum = 0;
      snap.forEach((d) => {
        const s = d.data() as SessionStats;
        sum += Math.max(0, Math.floor(Number(s.ppEarned) || 0));
      });
      setPpReleasedTotal(sum);
    });
    return () => unsub();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !currentUserId) {
      setMyStats(null);
      return;
    }
    const ref = doc(db, 'inSessionRooms', sessionId, 'stats', currentUserId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMyStats(null);
        return;
      }
      setMyStats(snap.data() as SessionStats);
    });
    return () => unsub();
  }, [sessionId, currentUserId]);

  const feed = useMemo(() => battleLogTail.slice(-12), [battleLogTail]);

  const ppEarnedMe = myStats ? Math.max(0, Math.floor(Number(myStats.ppEarned) || 0)) : 0;
  const ppSpentMe = myStats ? Math.max(0, Math.floor(Number(myStats.ppSpent) || 0)) : 0;

  if (collapsed) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 100,
          left: 12,
          zIndex: 55,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            borderRadius: '0.5rem',
            padding: '0.4rem 0.65rem',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#38bdf8',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          }}
        >
          Show event info
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 100,
        left: 12,
        zIndex: 55,
        width: 300,
        maxWidth: 'calc(100vw - 24px)',
        fontSize: '0.72rem',
        color: '#e2e8f0',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={{
            background: 'rgba(51, 65, 85, 0.85)',
            border: '1px solid #64748b',
            color: '#e2e8f0',
            borderRadius: '0.25rem',
            fontSize: '0.65rem',
            cursor: 'pointer',
            padding: '0.15rem 0.45rem',
            fontWeight: 600,
          }}
        >
          Hide event info
        </button>
      </div>
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.65rem',
          marginBottom: '0.35rem',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontWeight: 800, letterSpacing: '0.06em', color: '#38bdf8', marginBottom: '0.25rem' }}>
          PP RELEASED THIS EVENT
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{ppReleasedTotal} PP</div>
        <button
          type="button"
          onClick={() => setBreakdownOpen((o) => !o)}
          style={{
            marginTop: '0.35rem',
            background: 'rgba(51, 65, 85, 0.8)',
            border: '1px solid #64748b',
            color: '#e2e8f0',
            borderRadius: '0.25rem',
            fontSize: '0.65rem',
            cursor: 'pointer',
            padding: '0.2rem 0.45rem',
          }}
        >
          {breakdownOpen ? 'Hide' : 'Show'} breakdown
        </button>
        {breakdownOpen ? (
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1rem', color: '#94a3b8', lineHeight: 1.4 }}>
            <li>Total PP credited in session stats (all players): participation, quiz, eliminations, bonuses.</li>
            <li>Your stats doc: earned {ppEarnedMe} PP · spent {ppSpentMe} PP (session accounting).</li>
            <li>Session row PP (spendable in-room): {sessionPp ?? '—'}</li>
          </ul>
        ) : null}
      </div>

      <div
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(167, 139, 250, 0.35)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.65rem',
          marginBottom: '0.35rem',
        }}
      >
        <div style={{ fontWeight: 700, color: '#c4b5fd' }}>Your event resources</div>
        <div style={{ marginTop: '0.2rem' }}>
          Streak: <strong>{successStreak ?? 0}</strong>
          {flowStateActive ? (
            <span style={{ marginLeft: '0.35rem', color: '#38bdf8', fontWeight: 800 }}>· FLOW STATE</span>
          ) : null}
        </div>
        <div>
          PP (session row): <strong>{sessionPp ?? '—'}</strong>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          borderRadius: '0.5rem',
          padding: '0.45rem 0.55rem',
          maxHeight: 140,
          overflowY: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: '0.25rem' }}>Event feed</div>
        {feed.length === 0 ? (
          <div style={{ color: '#64748b' }}>No log lines yet.</div>
        ) : (
          feed.map((line, i) => (
            <div
              key={`${i}-${line.slice(0, 24)}`}
              style={{
                borderBottom: '1px solid rgba(51,65,85,0.5)',
                padding: '0.2rem 0',
                lineHeight: 1.35,
                color: '#cbd5e1',
              }}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LiveEventEconomyHud;
