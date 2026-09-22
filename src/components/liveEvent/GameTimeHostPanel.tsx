/**
 * Host / Admin Game Time roster for a Live Event session.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import type { InSessionRoom } from '../../types/inSession';
import {
  buildGameTimeRoster,
  setGameTimeStatus,
  type GameTimeStatus,
} from '../../utils/liveEventGameTimeService';
import {
  getStudentPeriodProgress,
  listWorkPeriodsForClass,
} from '../../utils/workBoardService';
import type { WorkPeriodProgress } from '../../types/workBoard';

interface GameTimeHostPanelProps {
  sessionId: string;
  isHost: boolean;
}

const GameTimeHostPanel: React.FC<GameTimeHostPanelProps> = ({ sessionId, isHost }) => {
  const [session, setSession] = useState<InSessionRoom | null>(null);
  const [progressByUid, setProgressByUid] = useState<Record<string, WorkPeriodProgress>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'inSessionRooms', sessionId), (snap) => {
      if (snap.exists()) setSession({ id: snap.id, ...(snap.data() as Omit<InSessionRoom, 'id'>) });
      else setSession(null);
    });
    return () => unsub();
  }, [sessionId]);

  const roster = useMemo(
    () => (session ? buildGameTimeRoster(session) : []),
    [session]
  );

  useEffect(() => {
    if (!session?.classId || !session.players?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const periods = await listWorkPeriodsForClass(session.classId!);
        const open = periods.find((p) => p.status === 'open') || periods[0];
        if (!open) return;
        const entries = await Promise.all(
          session.players.map(async (p) => {
            try {
              const prog = await getStudentPeriodProgress({
                periodId: open.id,
                studentId: p.userId,
                classId: session.classId!,
              });
              return [p.userId, prog] as const;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        const map: Record<string, WorkPeriodProgress> = {};
        for (const e of entries) {
          if (e) map[e[0]] = e[1];
        }
        setProgressByUid(map);
      } catch (e) {
        console.warn('[GameTimeHostPanel] work progress load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) return null;

  const gt = session.gameTime?.status || 'closed';

  const setStatus = async (status: GameTimeStatus) => {
    if (!isHost) return;
    setBusy(true);
    try {
      await setGameTimeStatus(sessionId, status);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to update Game Time');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.92)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        borderRadius: 12,
        padding: '0.85rem',
        marginBottom: '0.75rem',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>Game Time</strong>{' '}
          <span style={{ opacity: 0.85 }}>({gt})</span>
          {' · '}
          <span style={{ color: '#7dd3fc', fontWeight: 600 }}>
            {(session.liveEventMode || 'class_flow').replace(/_/g, ' ')}
          </span>
        </div>
        {isHost && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={() => setStatus('open')}>
              Open
            </button>
            <button type="button" disabled={busy} onClick={() => setStatus('paused')}>
              Pause
            </button>
            <button type="button" disabled={busy} onClick={() => setStatus('ended')}>
              End
            </button>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: 6 }}>Player</th>
              <th>Mode</th>
              <th>Declared W</th>
              <th>Done W</th>
              <th>Req %</th>
              <th>PP</th>
              <th>Floor</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((row) => {
              const prog = progressByUid[row.userId];
              const reqPct =
                prog?.requiredCompletionRate == null
                  ? '—'
                  : `${Math.round(prog.requiredCompletionRate * 100)}%`;
              return (
                <tr key={row.userId} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: 6 }}>{row.displayName}</td>
                  <td>{row.participationMode}</td>
                  <td>{prog?.declaredW ?? '—'}</td>
                  <td>{prog?.completedW ?? '—'}</td>
                  <td>{reqPct}</td>
                  <td>{row.powerPoints}</td>
                  <td>{row.protectionFloor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GameTimeHostPanel;
