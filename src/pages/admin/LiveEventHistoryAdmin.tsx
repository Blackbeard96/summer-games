/**
 * Admin — Live Event History & Analytics (Mission Control aesthetic)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import type {
  LiveEventParticipantRecord,
  LiveEventQuestionRecord,
  LiveEventSessionRecord,
  LiveEventSkillAggregate,
  LiveEventTimelineEntry,
} from '../../types/liveEventHistory';
import {
  archiveLiveEventHistorySession,
  backfillLiveEventHistoryFromRoom,
  downloadTextFile,
  exportParticipantsCsv,
  exportQuestionsCsv,
  exportSkillsCsv,
  formatDuration,
  formatEventDate,
  getLiveEventParticipants,
  getLiveEventQuestions,
  getLiveEventSession,
  getLiveEventTimelinePage,
  listLiveEventSessions,
  unarchiveLiveEventHistorySession,
} from '../../utils/liveEventHistoryService';

const GOLD = '#C9A227';
const NAVY = '#070b16';
const PANEL = '#0d1528';
const PANEL_BORDER = 'rgba(201, 162, 39, 0.28)';

const styles = {
  root: {
    minHeight: '70vh',
    background: `radial-gradient(ellipse at top, #121a2e 0%, ${NAVY} 55%)`,
    color: '#e8eefc',
    borderRadius: 12,
    padding: '1.25rem 1.5rem 2rem',
    border: `1px solid ${PANEL_BORDER}`,
    boxShadow: '0 0 40px rgba(201, 162, 39, 0.08)',
  } as React.CSSProperties,
  title: {
    fontFamily: '"Cinzel", "Palatino Linotype", Palatino, serif',
    fontSize: '1.65rem',
    letterSpacing: '0.06em',
    color: GOLD,
    margin: 0,
    textShadow: '0 0 18px rgba(201, 162, 39, 0.35)',
  } as React.CSSProperties,
  sub: { color: '#9aa8c7', fontSize: '0.9rem', marginTop: 6 } as React.CSSProperties,
  filters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 18,
    marginBottom: 16,
  },
  input: {
    background: PANEL,
    border: `1px solid ${PANEL_BORDER}`,
    color: '#e8eefc',
    borderRadius: 8,
    padding: '0.55rem 0.75rem',
    fontSize: '0.875rem',
    minWidth: 140,
  } as React.CSSProperties,
  btn: {
    background: `linear-gradient(180deg, #1a2438 0%, #10182a 100%)`,
    border: `1px solid ${PANEL_BORDER}`,
    color: GOLD,
    borderRadius: 8,
    padding: '0.55rem 0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.85rem',
  } as React.CSSProperties,
  btnPrimary: {
    background: `linear-gradient(180deg, #3a2f12 0%, #1f1808 100%)`,
    border: `1px solid ${GOLD}`,
    color: GOLD,
    borderRadius: 8,
    padding: '0.55rem 0.9rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.85rem',
    boxShadow: '0 0 16px rgba(201, 162, 39, 0.2)',
  } as React.CSSProperties,
  card: {
    background: PANEL,
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 12,
    padding: '1rem 1.15rem',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
  } as React.CSSProperties,
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    margin: '1rem 0',
  } as React.CSSProperties,
  stat: {
    background: 'rgba(7, 11, 22, 0.65)',
    border: `1px solid rgba(201, 162, 39, 0.18)`,
    borderRadius: 10,
    padding: '0.85rem 1rem',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left' as const,
    color: GOLD,
    borderBottom: `1px solid ${PANEL_BORDER}`,
    padding: '0.5rem 0.4rem',
    fontWeight: 600,
  },
  td: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '0.55rem 0.4rem',
  },
  chip: {
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: 999,
    border: `1px solid ${PANEL_BORDER}`,
    color: GOLD,
    fontSize: '0.7rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  section: { marginTop: 22 } as React.CSSProperties,
  h3: {
    color: GOLD,
    fontSize: '1rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    margin: '0 0 10px',
  } as React.CSSProperties,
};

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.stat}>
      <div style={{ fontSize: '0.7rem', color: '#8b9bb8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: 4, color: '#f5f7ff' }}>{value}</div>
    </div>
  );
}

function isBattleType(t: string) {
  return t === 'battle_royale' || t === 'team_battle_royale' || t === 'class_flow';
}

const LiveEventHistoryAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [rows, setRows] = useState<LiveEventSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [eventType, setEventType] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortKey, setSortKey] = useState<'date' | 'participants' | 'accuracy'>('date');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<LiveEventSessionRecord | null>(null);
  const [participants, setParticipants] = useState<LiveEventParticipantRecord[]>([]);
  const [questions, setQuestions] = useState<LiveEventQuestionRecord[]>([]);
  const [timeline, setTimeline] = useState<LiveEventTimelineEntry[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | undefined>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [backfillId, setBackfillId] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLiveEventSessions({
        search,
        classId: classId || undefined,
        eventType: eventType || undefined,
        includeArchived,
        limit: 100,
      });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [search, classId, eventType, includeArchived]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'classrooms'));
        const list = snap.docs
          .map((d) => ({ id: d.id, name: String(d.data().name || d.id) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setClassrooms(list);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (sortKey === 'participants') {
      copy.sort((a, b) => (b.participantCount || 0) - (a.participantCount || 0));
    } else if (sortKey === 'accuracy') {
      copy.sort(
        (a, b) => (b.overview?.averageAccuracy || 0) - (a.overview?.averageAccuracy || 0)
      );
    }
    return copy;
  }, [rows, sortKey]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setPlayerId(null);
    setDetailLoading(true);
    setTimeline([]);
    setTimelineCursor(undefined);
    try {
      const [s, p, q] = await Promise.all([
        getLiveEventSession(id),
        getLiveEventParticipants(id),
        getLiveEventQuestions(id),
      ]);
      setSession(s);
      setParticipants(p);
      setQuestions(q);
      const page = await getLiveEventTimelinePage(id, 40);
      setTimeline(page);
      if (page.length) setTimelineCursor(page[page.length - 1].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open event');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadMoreTimeline = async () => {
    if (!selectedId) return;
    const page = await getLiveEventTimelinePage(selectedId, 40, timelineCursor);
    if (!page.length) return;
    setTimeline((prev) => [...prev, ...page]);
    setTimelineCursor(page[page.length - 1].id);
  };

  const selectedPlayer = participants.find((p) => p.userId === playerId) || null;
  const skills: LiveEventSkillAggregate[] = session?.skillPerformance || [];

  const onArchive = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await archiveLiveEventHistorySession(selectedId, currentUser?.uid);
      await loadList();
      await openDetail(selectedId);
    } finally {
      setBusy(false);
    }
  };

  const onUnarchive = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await unarchiveLiveEventHistorySession(selectedId);
      await loadList();
      await openDetail(selectedId);
    } finally {
      setBusy(false);
    }
  };

  const onBackfill = async () => {
    const id = backfillId.trim();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const rec = await backfillLiveEventHistoryFromRoom(id);
      if (!rec) {
        setError('Room not found or missing sessionSummary. End the Live Event first.');
      } else {
        setBackfillId('');
        await loadList();
        await openDetail(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed');
    } finally {
      setBusy(false);
    }
  };

  if (selectedId && session) {
    const o = session.overview || {};
    const battle = isBattleType(session.eventType);

    return (
      <div style={styles.root}>
        <button type="button" style={styles.btn} onClick={() => setSelectedId(null)}>
          ← Back to History
        </button>

        <div style={{ marginTop: 16 }}>
          <div style={styles.chip}>{session.eventType.replace(/_/g, ' ')}</div>
          <h1 style={{ ...styles.title, marginTop: 8 }}>{session.eventName}</h1>
          <p style={styles.sub}>
            {session.className} · {formatEventDate(session.endedAt || session.startedAt)} ·{' '}
            {formatDuration(session.duration)} · {session.status}
          </p>
        </div>

        {/* Event Summary */}
        <div
          style={{
            ...styles.card,
            cursor: 'default',
            marginTop: 16,
            background: 'linear-gradient(135deg, rgba(201,162,39,0.08), rgba(13,21,40,0.9))',
          }}
        >
          <h3 style={styles.h3}>Event Summary</h3>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, color: '#d5deef' }}>
            {o.studentsJoined != null && o.studentsAssigned != null
              ? `${o.studentsJoined} / ${o.studentsAssigned} students participated`
              : `${session.participantCount} participants`}
            {typeof o.averageAccuracy === 'number' ? ` · ${o.averageAccuracy}% avg accuracy` : ''}
            {typeof o.completionRate === 'number' ? ` · ${o.completionRate}% completion` : ''}
            {session.duration != null ? ` · ${formatDuration(session.duration)}` : ''}
          </p>
          {session.winnerNames?.length ? (
            <p style={{ margin: '0 0 8px', color: GOLD }}>Winner: {session.winnerNames.join(', ')}</p>
          ) : null}
          {o.weakestSkillName ? (
            <p style={{ margin: 0, color: '#f0b4b4' }}>
              Weakest skill: {o.weakestSkillName} — {o.weakestSkillAccuracy}%
            </p>
          ) : null}
          {battle ? (
            <p style={{ margin: '8px 0 0', color: '#9aa8c7' }}>
              Battle: {o.totalDamage ?? 0} damage · {o.totalEliminations ?? 0} eliminations ·{' '}
              {o.totalMovesUsed ?? 0} moves
            </p>
          ) : null}
        </div>

        <div style={styles.statGrid}>
          <StatCard label="Participants" value={session.participantCount} />
          <StatCard
            label="Avg Accuracy"
            value={typeof o.averageAccuracy === 'number' ? `${o.averageAccuracy}%` : '—'}
          />
          <StatCard
            label="Completion"
            value={typeof o.completionRate === 'number' ? `${o.completionRate}%` : '—'}
          />
          <StatCard label="Duration" value={formatDuration(session.duration)} />
          {battle ? (
            <>
              <StatCard label="Total Damage" value={o.totalDamage ?? '—'} />
              <StatCard label="Eliminations" value={o.totalEliminations ?? '—'} />
              <StatCard label="Moves Used" value={o.totalMovesUsed ?? '—'} />
              <StatCard label="PP Spent" value={o.totalPpSpent ?? '—'} />
            </>
          ) : null}
        </div>

        {(session.insights || []).length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.h3}>Insights</h3>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#c5d0e6', lineHeight: 1.6 }}>
              {(session.insights || []).map((ins, i) => (
                <li key={i}>{ins}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            style={styles.btnPrimary}
            onClick={() =>
              downloadTextFile(
                `${session.eventSessionId}-players.csv`,
                exportParticipantsCsv(session, participants)
              )
            }
          >
            Export Players CSV
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() =>
              downloadTextFile(`${session.eventSessionId}-questions.csv`, exportQuestionsCsv(questions))
            }
          >
            Export Questions
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() =>
              downloadTextFile(`${session.eventSessionId}-skills.csv`, exportSkillsCsv(skills))
            }
          >
            Export Skills
          </button>
          {session.status === 'archived' ? (
            <button type="button" style={styles.btn} disabled={busy} onClick={() => void onUnarchive()}>
              Unarchive
            </button>
          ) : (
            <button type="button" style={styles.btn} disabled={busy} onClick={() => void onArchive()}>
              Archive
            </button>
          )}
        </div>

        {detailLoading ? (
          <p style={{ color: '#9aa8c7' }}>Loading detail…</p>
        ) : playerId && selectedPlayer ? (
          <div style={styles.section}>
            <button type="button" style={styles.btn} onClick={() => setPlayerId(null)}>
              ← Back to leaderboard
            </button>
            <h2 style={{ ...styles.title, fontSize: '1.25rem', marginTop: 12 }}>
              {selectedPlayer.playerName}
            </h2>
            <p style={styles.sub}>
              Placement #{selectedPlayer.placement ?? '—'} · Score {selectedPlayer.score ?? '—'}
            </p>
            <div style={styles.statGrid}>
              <StatCard label="Correct" value={selectedPlayer.questionsCorrect ?? '—'} />
              <StatCard label="Incorrect" value={selectedPlayer.questionsIncorrect ?? '—'} />
              <StatCard label="Unanswered" value={selectedPlayer.questionsUnanswered ?? '—'} />
              <StatCard
                label="Accuracy"
                value={
                  typeof selectedPlayer.accuracy === 'number' ? `${selectedPlayer.accuracy}%` : '—'
                }
              />
              {battle ? (
                <>
                  <StatCard label="Damage Dealt" value={selectedPlayer.damageDealt ?? '—'} />
                  <StatCard label="Damage Taken" value={selectedPlayer.damageTaken ?? '—'} />
                  <StatCard label="Healing" value={selectedPlayer.healingDone ?? '—'} />
                  <StatCard label="Eliminations" value={selectedPlayer.eliminations ?? '—'} />
                </>
              ) : null}
              <StatCard
                label="PP"
                value={(selectedPlayer.ppEarned || 0) + (selectedPlayer.quizPp || 0) || '—'}
              />
              <StatCard label="XP" value={selectedPlayer.xpEarned ?? '—'} />
              <StatCard label="Battle Pass XP" value={selectedPlayer.battlePassXpEarned ?? '—'} />
              <StatCard label="Disconnects" value={selectedPlayer.disconnectCount ?? 0} />
            </div>
            {selectedPlayer.skillsUsed?.length ? (
              <div style={styles.section}>
                <h3 style={styles.h3}>Moves Used</h3>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Move</th>
                      <th style={styles.th}>Count</th>
                      <th style={styles.th}>Damage</th>
                      <th style={styles.th}>Healing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlayer.skillsUsed.map((s) => (
                      <tr key={s.skillId}>
                        <td style={styles.td}>{s.skillName}</td>
                        <td style={styles.td}>{s.count}</td>
                        <td style={styles.td}>{s.totalDamage ?? '—'}</td>
                        <td style={styles.td}>{s.totalHealing ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div style={styles.section}>
              <h3 style={styles.h3}>Leaderboard</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Player</th>
                    <th style={styles.th}>Score</th>
                    <th style={styles.th}>Accuracy</th>
                    <th style={styles.th}>Correct</th>
                    {battle ? <th style={styles.th}>Elims</th> : null}
                    <th style={styles.th}>Rewards</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => (
                    <tr
                      key={p.userId}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setPlayerId(p.userId)}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background =
                          'rgba(201,162,39,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                      }}
                    >
                      <td style={styles.td}>{p.placement ?? '—'}</td>
                      <td style={{ ...styles.td, color: GOLD }}>{p.playerName}</td>
                      <td style={styles.td}>{p.score ?? '—'}</td>
                      <td style={styles.td}>
                        {typeof p.accuracy === 'number' ? `${p.accuracy}%` : '—'}
                      </td>
                      <td style={styles.td}>
                        {p.questionsCorrect != null
                          ? `${p.questionsCorrect}${
                              p.questionsAnswered != null ? ` / ${p.questionsAnswered}` : ''
                            }`
                          : '—'}
                      </td>
                      {battle ? <td style={styles.td}>{p.eliminations ?? 0}</td> : null}
                      <td style={styles.td}>
                        +{(p.ppEarned || 0) + (p.quizPp || 0)} PP
                        {p.xpEarned ? ` · +${p.xpEarned} XP` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {questions.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.h3}>Question Analytics</h3>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Q</th>
                      <th style={styles.th}>Prompt</th>
                      <th style={styles.th}>Diff</th>
                      <th style={styles.th}>Skills</th>
                      <th style={styles.th}>Correct</th>
                      <th style={styles.th}>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q, idx) => (
                      <tr key={q.questionId}>
                        <td style={styles.td}>{idx + 1}</td>
                        <td style={styles.td}>
                          {q.highMiss ? (
                            <span style={{ color: '#f5a5a5', marginRight: 6 }}>⚠ HIGH-MISS</span>
                          ) : null}
                          {q.prompt || q.questionId}
                        </td>
                        <td style={styles.td}>{q.difficulty || '—'}</td>
                        <td style={styles.td}>{(q.skillNames || []).join(', ') || '—'}</td>
                        <td style={styles.td}>
                          {q.correct}/{q.studentsAnswered}
                        </td>
                        <td style={styles.td}>{q.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {skills.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.h3}>Skill Performance</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {skills.map((s) => (
                    <div
                      key={s.skillId}
                      style={{
                        ...styles.chip,
                        borderRadius: 8,
                        padding: '0.45rem 0.75rem',
                        background:
                          (s.accuracy || 0) < 50
                            ? 'rgba(180,60,60,0.15)'
                            : 'rgba(201,162,39,0.08)',
                      }}
                    >
                      {s.skillName || s.skillId}: {s.accuracy}%
                    </div>
                  ))}
                </div>
              </div>
            )}

            {battle && (session.moveUsage || []).length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.h3}>Move Usage</h3>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Move</th>
                      <th style={styles.th}>Uses</th>
                      <th style={styles.th}>Damage</th>
                      <th style={styles.th}>Healing</th>
                      <th style={styles.th}>Eff. / use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(session.moveUsage || []).slice(0, 20).map((m) => (
                      <tr key={m.moveId}>
                        <td style={styles.td}>{m.moveName}</td>
                        <td style={styles.td}>{m.uses}</td>
                        <td style={styles.td}>{m.totalDamage ?? '—'}</td>
                        <td style={styles.td}>{m.totalHealing ?? '—'}</td>
                        <td style={styles.td}>{m.effectivenessPerUse ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: '0.75rem', color: '#8b9bb8' }}>
                  Effectiveness = (damage + healing + shield) ÷ uses
                </p>
              </div>
            )}

            <div style={styles.section}>
              <h3 style={styles.h3}>Rewards Audit</h3>
              <p style={{ color: '#9aa8c7', marginTop: 0 }}>
                Total PP {o.totalPpAwarded ?? 0} · XP {o.totalXpAwarded ?? 0} · Battle Pass XP{' '}
                {o.totalBattlePassXp ?? 0}
              </p>
            </div>

            <div style={styles.section}>
              <h3 style={styles.h3}>Event Timeline</h3>
              <div
                style={{
                  maxHeight: 280,
                  overflow: 'auto',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: 8,
                  padding: 12,
                  border: `1px solid ${PANEL_BORDER}`,
                }}
              >
                {timeline.length === 0 ? (
                  <p style={{ color: '#8b9bb8', margin: 0 }}>No timeline entries stored.</p>
                ) : (
                  timeline.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '0.35rem 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ color: GOLD, minWidth: 72 }}>
                        {new Date(t.atMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      <span style={{ color: '#c5d0e6' }}>{t.label}</span>
                    </div>
                  ))
                )}
              </div>
              {(session.timelineCount || 0) > timeline.length ? (
                <button type="button" style={{ ...styles.btn, marginTop: 8 }} onClick={() => void loadMoreTimeline()}>
                  Load more timeline
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>Live Event History</h1>
      <p style={styles.sub}>
        Permanent mission records — learning, participation, gameplay, and growth after every event.
      </p>

      <div style={styles.filters}>
        <input
          style={{ ...styles.input, minWidth: 200 }}
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={styles.input} value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select style={styles.input} value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">All types</option>
          <option value="quiz">Quiz</option>
          <option value="battle_royale">Battle Royale</option>
          <option value="team_battle_royale">Team BR</option>
          <option value="class_flow">Class Flow</option>
          <option value="neutral_flow">Neutral Flow</option>
          <option value="exam">Exam</option>
          <option value="reflection">Reflection</option>
          <option value="goals">Goals</option>
        </select>
        <select
          style={styles.input}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
        >
          <option value="date">Sort: Date</option>
          <option value="participants">Sort: Participants</option>
          <option value="accuracy">Sort: Accuracy</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#9aa8c7' }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
        <button type="button" style={styles.btnPrimary} onClick={() => void loadList()}>
          Refresh
        </button>
      </div>

      <div style={{ ...styles.filters, marginTop: 0 }}>
        <input
          style={{ ...styles.input, minWidth: 260 }}
          placeholder="Backfill room ID (ended session)…"
          value={backfillId}
          onChange={(e) => setBackfillId(e.target.value)}
        />
        <button type="button" style={styles.btn} disabled={busy} onClick={() => void onBackfill()}>
          Import from room
        </button>
      </div>

      {error ? <p style={{ color: '#f5a5a5' }}>{error}</p> : null}
      {loading ? <p style={{ color: '#9aa8c7' }}>Loading history…</p> : null}

      {!loading && sortedRows.length === 0 ? (
        <p style={{ color: '#9aa8c7' }}>
          No completed Live Events archived yet. End a Live Event (or backfill an ended room ID) to
          create the first history record.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sortedRows.map((r) => (
            <div
              key={r.eventSessionId}
              style={styles.card}
              onClick={() => void openDetail(r.eventSessionId)}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = GOLD;
                el.style.boxShadow = '0 0 22px rgba(201, 162, 39, 0.18)';
                el.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = PANEL_BORDER;
                el.style.boxShadow = 'none';
                el.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={styles.chip}>{r.eventType.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 8, color: '#f5f7ff' }}>
                    {r.eventName}
                  </div>
                  <div style={{ color: '#9aa8c7', marginTop: 4, fontSize: '0.85rem' }}>
                    {r.className} · {formatEventDate(r.endedAt || r.startedAt)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', color: '#c5d0e6', fontSize: '0.85rem' }}>
                  <div>{r.participantCount} Participants</div>
                  <div>{r.questionCount ?? r.overview?.questionCount ?? '—'} Questions</div>
                  <div>{formatDuration(r.duration)}</div>
                  <div style={{ color: GOLD, marginTop: 4 }}>
                    {typeof r.overview?.averageAccuracy === 'number'
                      ? `${r.overview.averageAccuracy}% accuracy`
                      : r.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveEventHistoryAdmin;
