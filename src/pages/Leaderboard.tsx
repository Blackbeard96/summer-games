import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getLevelFromXP } from '../utils/leveling';
import { fetchLiveEventPlacementAggregates } from '../utils/liveEventPlacementAggregation';
import { fetchSquadLeaderboardRows, type SquadLeaderboardRow } from '../utils/squadLeaderboardAggregation';
import PlayerBuildInspectModal from '../components/PlayerBuildInspectModal';

interface Student {
  id: string;
  displayName?: string;
  photoURL?: string;
  xp?: number;
  powerPoints?: number;
  powerLevel?: number | null;
  manifestationType?: string;
  storyChapter?: number;
}

type MainTab = 'students' | 'squads' | 'livePlacements';
type SquadSort = 'powerLevel' | 'xp' | 'powerPoints';
type PlacementSort = 'top3' | 'firstPlace';

const tabBtnBase: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  borderRadius: '0.5rem',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  border: '2px solid transparent',
};

const Leaderboard = () => {
  const [mainTab, setMainTab] = useState<MainTab>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [sortBy, setSortBy] = useState<'xp' | 'powerLevel'>('xp');
  const [squads, setSquads] = useState<SquadLeaderboardRow[]>([]);
  const [squadSort, setSquadSort] = useState<SquadSort>('powerLevel');
  const [placementSort, setPlacementSort] = useState<PlacementSort>('top3');
  const [placementByUid, setPlacementByUid] = useState<Record<string, { top3: number; firstPlace: number }>>({});
  const [placementLoading, setPlacementLoading] = useState(false);
  const [squadsLoading, setSquadsLoading] = useState(false);
  const [squadMembersModalSquad, setSquadMembersModalSquad] = useState<SquadLeaderboardRow | null>(null);
  const [buildInspectOpen, setBuildInspectOpen] = useState(false);
  const [buildInspectPlayerId, setBuildInspectPlayerId] = useState<string | null>(null);
  const [buildInspectRoster, setBuildInspectRoster] = useState<{
    displayName?: string;
    photoURL?: string;
    powerLevel?: number | null;
  } | null>(null);

  const openBuildInspect = (student: Student) => {
    setBuildInspectPlayerId(student.id);
    setBuildInspectRoster({
      displayName: student.displayName,
      photoURL: student.photoURL,
      powerLevel: student.powerLevel ?? null,
    });
    setBuildInspectOpen(true);
  };

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const q =
          sortBy === 'powerLevel'
            ? query(collection(db, 'students'), orderBy('powerLevel', 'desc'))
            : query(collection(db, 'students'), orderBy('xp', 'desc'));
        const snapshot = await getDocs(q);
        let list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Student[];

        if (sortBy === 'powerLevel') {
          const withPL = list
            .filter((s) => s.powerLevel !== null && s.powerLevel !== undefined)
            .sort((a, b) => (b.powerLevel || 0) - (a.powerLevel || 0));
          const withoutPL = list.filter((s) => s.powerLevel === null || s.powerLevel === undefined);
          list = [...withPL, ...withoutPL];
        }

        setStudents(list);
      } catch (error) {
        console.warn('Leaderboard: Error sorting by powerLevel, falling back to XP:', error);
        const q = query(collection(db, 'students'), orderBy('xp', 'desc'));
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Student[];
        setStudents(list);
      }
    };
    fetchStudents();
  }, [sortBy]);

  useEffect(() => {
    if (mainTab !== 'squads') return;
    let cancelled = false;
    setSquadsLoading(true);
    fetchSquadLeaderboardRows()
      .then((rows) => {
        if (!cancelled) setSquads(rows);
      })
      .catch((e) => console.warn('Leaderboard: squads fetch failed', e))
      .finally(() => {
        if (!cancelled) setSquadsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mainTab]);

  useEffect(() => {
    if (mainTab !== 'livePlacements') return;
    let cancelled = false;
    setPlacementLoading(true);
    fetchLiveEventPlacementAggregates()
      .then((agg) => {
        if (!cancelled) setPlacementByUid(agg);
      })
      .catch((e) => console.warn('Leaderboard: placement rollup fetch failed', e))
      .finally(() => {
        if (!cancelled) setPlacementLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mainTab]);

  const sortedSquads = useMemo(() => {
    const copy = [...squads];
    copy.sort((a, b) => {
      if (squadSort === 'powerLevel') return b.totalPl - a.totalPl;
      if (squadSort === 'xp') return b.totalXp - a.totalXp;
      return b.totalPp - a.totalPp;
    });
    return copy;
  }, [squads, squadSort]);

  type SquadModalMember = {
    uid: string;
    displayName: string;
    photoURL?: string;
    xp: number;
    powerLevel?: number | null;
    manifestationType?: string;
  };

  const squadModalMemberRows: SquadModalMember[] = useMemo(() => {
    if (!squadMembersModalSquad) return [];
    const byId = new Map(students.map((s) => [s.id, s]));
    const rows: SquadModalMember[] = squadMembersModalSquad.membersPreview.map((preview) => {
      const st = byId.get(preview.uid);
      return {
        uid: preview.uid,
        displayName: st?.displayName || preview.displayName || 'Student',
        photoURL: st?.photoURL || preview.photoURL,
        xp: st?.xp ?? 0,
        powerLevel: st?.powerLevel,
        manifestationType: st?.manifestationType,
      };
    });
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return rows;
  }, [squadMembersModalSquad, students]);

  useEffect(() => {
    if (!squadMembersModalSquad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSquadMembersModalSquad(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [squadMembersModalSquad]);

  const placementRows = useMemo(() => {
    const withData = students
      .map((s) => {
        const p = placementByUid[s.id] || { top3: 0, firstPlace: 0 };
        return { student: s, ...p };
      })
      .filter((row) => row.top3 > 0 || row.firstPlace > 0);

    withData.sort((a, b) => {
      if (placementSort === 'top3') {
        if (b.top3 !== a.top3) return b.top3 - a.top3;
        // Do not tie-break with firstPlace: when everyone ties on top3 (common), that
        // reproduced the 1st-place order and made the two toggles look identical.
        return (a.student.displayName || '').localeCompare(b.student.displayName || '');
      }
      if (b.firstPlace !== a.firstPlace) return b.firstPlace - a.firstPlace;
      if (b.top3 !== a.top3) return b.top3 - a.top3;
      return (a.student.displayName || '').localeCompare(b.student.displayName || '');
    });
    return withData;
  }, [students, placementByUid, placementSort]);

  const getManifestationColor = (type: string) => {
    const colors: { [key: string]: string } = {
      Fire: '#dc2626',
      Water: '#2563eb',
      Earth: '#16a34a',
      Air: '#7c3aed',
      Imposition: '#fbbf24',
      Memory: '#a78bfa',
      Intelligence: '#34d399',
      Dimensional: '#60a5fa',
      Truth: '#f87171',
      Creation: '#f59e0b',
    };
    return colors[type] || '#6b7280';
  };

  const mainTabButton = (tab: MainTab, label: string, activeGradient: string, idleColor: string) => {
    const active = mainTab === tab;
    return (
      <button
        type="button"
        onClick={() => setMainTab(tab)}
        style={{
          ...tabBtnBase,
          background: active ? activeGradient : `${idleColor}33`,
          color: active ? 'white' : idleColor,
          borderColor: active ? idleColor : `${idleColor}88`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Xiotein School Leaderboard
        </h1>
        <p
          style={{
            fontSize: '1.1rem',
            color: '#6b7280',
            maxWidth: '640px',
            margin: '0 auto',
          }}
        >
          The most powerful manifestors at Xiotein School. Compare students, squads, and live event podium
          finishes.
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            justifyContent: 'center',
            marginTop: '1.25rem',
          }}
        >
          {mainTabButton(
            'students',
            'Students',
            'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            '#f59e0b'
          )}
          {mainTabButton(
            'squads',
            'Squads',
            'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
            '#0ea5e9'
          )}
          {mainTabButton(
            'livePlacements',
            'Live event placements',
            'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
            '#a855f7'
          )}
        </div>
      </div>

      {mainTab === 'students' && (
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSortBy('xp')}
              style={{
                padding: '0.5rem 1rem',
                background:
                  sortBy === 'xp' ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'rgba(251, 191, 36, 0.2)',
                color: sortBy === 'xp' ? 'white' : '#fbbf24',
                border: `2px solid ${sortBy === 'xp' ? '#f59e0b' : 'rgba(251, 191, 36, 0.5)'}`,
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Sort by XP
            </button>
            <button
              type="button"
              onClick={() => setSortBy('powerLevel')}
              style={{
                padding: '0.5rem 1rem',
                background:
                  sortBy === 'powerLevel'
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
                    : 'rgba(139, 92, 246, 0.2)',
                color: sortBy === 'powerLevel' ? 'white' : '#8b5cf6',
                border: `2px solid ${sortBy === 'powerLevel' ? '#a78bfa' : 'rgba(139, 92, 246, 0.5)'}`,
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Sort by Power Level ⚡
            </button>
          </div>
        </div>
      )}

      {mainTab === 'squads' && (
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            Combined totals across all squad members (from student profiles).
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {(
              [
                ['powerLevel', 'Combined PL ⚡', '#8b5cf6'],
                ['xp', 'Combined XP', '#f59e0b'],
                ['powerPoints', 'Combined PP', '#34d399'],
              ] as const
            ).map(([key, label, color]) => {
              const active = squadSort === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSquadSort(key)}
                  style={{
                    ...tabBtnBase,
                    background: active ? `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` : `${color}22`,
                    color: active ? 'white' : color,
                    borderColor: active ? color : `${color}66`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mainTab === 'livePlacements' && (
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            Counts from live event quiz leaderboards (sessions finalized after this feature ships). Top 3 = any
            podium finish; 1st = wins.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setPlacementSort('top3')}
              style={{
                ...tabBtnBase,
                background:
                  placementSort === 'top3'
                    ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)'
                    : 'rgba(168, 85, 247, 0.2)',
                color: placementSort === 'top3' ? 'white' : '#7c3aed',
                borderColor: placementSort === 'top3' ? '#7c3aed' : 'rgba(124, 58, 237, 0.5)',
              }}
            >
              Most top-3 finishes
            </button>
            <button
              type="button"
              onClick={() => setPlacementSort('firstPlace')}
              style={{
                ...tabBtnBase,
                background:
                  placementSort === 'firstPlace'
                    ? 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
                    : 'rgba(251, 191, 36, 0.2)',
                color: placementSort === 'firstPlace' ? 'white' : '#d97706',
                borderColor: placementSort === 'firstPlace' ? '#d97706' : 'rgba(217, 119, 6, 0.5)',
              }}
            >
              Most 1st-place finishes
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          borderRadius: '1rem',
          padding: '1.5rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
        }}
      >
        {mainTab === 'students' && (
          <>
            {students.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>
                No students have manifested yet.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {students.map((student, index) => (
                  <div
                    key={student.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1rem',
                      background:
                        index === 0
                          ? 'rgba(251, 191, 36, 0.2)'
                          : index === 1
                            ? 'rgba(156, 163, 175, 0.2)'
                            : index === 2
                              ? 'rgba(180, 83, 9, 0.2)'
                              : 'rgba(255,255,255,0.1)',
                      border:
                        index === 0
                          ? '1px solid rgba(251, 191, 36, 0.5)'
                          : index === 1
                            ? '1px solid rgba(156, 163, 175, 0.5)'
                            : index === 2
                              ? '1px solid rgba(180, 83, 9, 0.5)'
                              : '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '0.5rem',
                      color: 'white',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        minWidth: '60px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color:
                            index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#b45309' : 'white',
                        }}
                      >
                        #{index + 1}
                      </span>
                      {index < 3 && <span style={{ fontSize: '1.5rem' }}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>}
                    </div>

                    <img
                      src={
                        student.photoURL ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName || '?')}&background=4f46e5&color=fff&size=48`
                      }
                      alt=""
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginBottom: '0.25rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#fbbf24' }}>
                          {student.displayName || 'Unnamed Student'} (Lv. {getLevelFromXP(student.xp || 0)})
                        </span>
                        {student.manifestationType && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.2rem 0.4rem',
                              background: getManifestationColor(student.manifestationType),
                              color: 'white',
                              borderRadius: '0.25rem',
                              fontWeight: 'bold',
                            }}
                          >
                            {student.manifestationType}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          fontSize: '0.875rem',
                          opacity: 0.8,
                        }}
                      >
                        <span>Level {getLevelFromXP(student.xp || 0)}</span>
                        <span>Chapter {student.storyChapter || 1}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openBuildInspect(student)}
                      title="View loadout and equipped artifacts"
                      style={{
                        flexShrink: 0,
                        alignSelf: 'center',
                        fontSize: '0.65rem',
                        padding: '0.35rem 0.55rem',
                        borderRadius: '0.375rem',
                        border: '1px solid rgba(56, 189, 248, 0.45)',
                        background: 'rgba(15, 23, 42, 0.6)',
                        color: '#e0f2fe',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      View build
                    </button>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '0.25rem',
                      }}
                    >
                      {sortBy === 'powerLevel' &&
                      student.powerLevel !== null &&
                      student.powerLevel !== undefined ? (
                        <div
                          style={{
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            color: '#8b5cf6',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          ⚡ PL: {student.powerLevel}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            color: '#fbbf24',
                          }}
                        >
                          {student.xp || 0} XP
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: '#34d399',
                        }}
                      >
                        {student.powerPoints || 0} PP
                      </div>
                      {sortBy === 'xp' &&
                        student.powerLevel !== null &&
                        student.powerLevel !== undefined && (
                          <div
                            style={{
                              fontSize: '0.875rem',
                              color: '#8b5cf6',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            ⚡ PL: {student.powerLevel}
                          </div>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {mainTab === 'squads' && (
          <>
            {squadsLoading ? (
              <p style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>Loading squads…</p>
            ) : sortedSquads.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>No squads yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {sortedSquads.map((squad, index) => (
                  <div
                    key={squad.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1rem',
                      background:
                        index === 0
                          ? 'rgba(251, 191, 36, 0.2)'
                          : index === 1
                            ? 'rgba(156, 163, 175, 0.2)'
                            : index === 2
                              ? 'rgba(180, 83, 9, 0.2)'
                              : 'rgba(255,255,255,0.1)',
                      border:
                        index === 0
                          ? '1px solid rgba(251, 191, 36, 0.5)'
                          : index === 1
                            ? '1px solid rgba(156, 163, 175, 0.5)'
                            : index === 2
                              ? '1px solid rgba(180, 83, 9, 0.5)'
                              : '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '0.5rem',
                      color: 'white',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '60px' }}>
                      <span
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color:
                            index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#b45309' : 'white',
                        }}
                      >
                        #{index + 1}
                      </span>
                      {index < 3 && <span style={{ fontSize: '1.5rem' }}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>}
                    </div>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        flexShrink: 0,
                      }}
                    >
                      {(squad.abbreviation || squad.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => setSquadMembersModalSquad(squad)}
                        title="View squad members"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          font: 'inherit',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            color: '#38bdf8',
                            textDecoration: 'underline',
                            textDecorationColor: 'rgba(56, 189, 248, 0.45)',
                            textUnderlineOffset: '3px',
                          }}
                        >
                          {squad.name}
                        </div>
                        <div style={{ fontSize: '0.875rem', opacity: 0.8, color: 'rgba(255,255,255,0.85)', marginTop: '0.15rem' }}>
                          {squad.memberCount} members
                        </div>
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#8b5cf6' }}>⚡ {squad.totalPl} PL</div>
                      <div style={{ fontSize: '0.875rem', color: '#fbbf24' }}>{squad.totalXp} XP</div>
                      <div style={{ fontSize: '0.875rem', color: '#34d399' }}>{squad.totalPp} PP</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {mainTab === 'livePlacements' && (
          <>
            {placementLoading ? (
              <p style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>Loading placement history…</p>
            ) : placementRows.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>
                No live event podium data yet. Finish a live session with a scored quiz to record ranks.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {placementRows.map((row, index) => {
                  const student = row.student;
                  return (
                    <div
                      key={student.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        background:
                          index === 0
                            ? 'rgba(251, 191, 36, 0.2)'
                            : index === 1
                              ? 'rgba(156, 163, 175, 0.2)'
                              : index === 2
                                ? 'rgba(180, 83, 9, 0.2)'
                                : 'rgba(255,255,255,0.1)',
                        border:
                          index === 0
                            ? '1px solid rgba(251, 191, 36, 0.5)'
                            : index === 1
                              ? '1px solid rgba(156, 163, 175, 0.5)'
                              : index === 2
                                ? '1px solid rgba(180, 83, 9, 0.5)'
                                : '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '0.5rem',
                        color: 'white',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '60px' }}>
                        <span
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 'bold',
                            color:
                              index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#b45309' : 'white',
                          }}
                        >
                          #{index + 1}
                        </span>
                        {index < 3 && (
                          <span style={{ fontSize: '1.5rem' }}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
                        )}
                      </div>
                      <img
                        src={
                          student.photoURL ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName || '?')}&background=4f46e5&color=fff&size=48`
                        }
                        alt=""
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#e9d5ff' }}>
                            {student.displayName || 'Unnamed Student'}
                          </span>
                          {student.manifestationType && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.2rem 0.4rem',
                                background: getManifestationColor(student.manifestationType),
                                color: 'white',
                                borderRadius: '0.25rem',
                                fontWeight: 'bold',
                              }}
                            >
                              {student.manifestationType}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openBuildInspect(student)}
                        title="View loadout and equipped artifacts"
                        style={{
                          flexShrink: 0,
                          alignSelf: 'center',
                          fontSize: '0.65rem',
                          padding: '0.35rem 0.55rem',
                          borderRadius: '0.375rem',
                          border: '1px solid rgba(56, 189, 248, 0.45)',
                          background: 'rgba(15, 23, 42, 0.6)',
                          color: '#e0f2fe',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View build
                      </button>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: '0.2rem',
                        }}
                      >
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fbbf24' }}>
                          🥇 {row.firstPlace}{' '}
                          <span style={{ fontWeight: 'normal', opacity: 0.85, fontSize: '0.85rem' }}>1st</span>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#a78bfa' }}>
                          Top 3: <strong>{row.top3}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <PlayerBuildInspectModal
        open={buildInspectOpen}
        onClose={() => {
          setBuildInspectOpen(false);
          setBuildInspectPlayerId(null);
          setBuildInspectRoster(null);
        }}
        playerId={buildInspectPlayerId}
        rosterDisplayName={buildInspectRoster?.displayName}
        rosterPhotoURL={buildInspectRoster?.photoURL}
        rosterPowerLevel={buildInspectRoster?.powerLevel ?? null}
        viewerSubtitle="Leaderboard — loadout & artifacts"
      />

      {squadMembersModalSquad && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="squad-members-modal-title"
          onClick={() => setSquadMembersModalSquad(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: '1rem',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              boxShadow: '0 25px 50px rgba(0,0,0,0.45)',
              maxWidth: '420px',
              width: '100%',
              maxHeight: 'min(80vh, 560px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div>
                <h2
                  id="squad-members-modal-title"
                  style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 'bold' }}
                >
                  {squadMembersModalSquad.name}
                </h2>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                  {squadModalMemberRows.length} member{squadModalMemberRows.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSquadMembersModalSquad(null)}
                aria-label="Close"
                style={{
                  flexShrink: 0,
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '0.375rem',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '0.75rem', overflowY: 'auto', flex: 1 }}>
              {squadModalMemberRows.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', margin: '1rem 0' }}>No members listed for this squad.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {squadModalMemberRows.map((m) => (
                    <li
                      key={m.uid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.65rem 0.75rem',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <img
                        src={
                          m.photoURL ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=0ea5e9&color=fff&size=40`
                        }
                        alt=""
                        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>{m.displayName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                          Lv. {getLevelFromXP(m.xp)}
                          {m.powerLevel != null && m.powerLevel !== undefined ? ` · ⚡ ${m.powerLevel} PL` : ''}
                        </div>
                      </div>
                      {m.manifestationType && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.15rem 0.35rem',
                            background: getManifestationColor(m.manifestationType),
                            color: 'white',
                            borderRadius: '0.25rem',
                            fontWeight: 'bold',
                            flexShrink: 0,
                          }}
                        >
                          {m.manifestationType}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openBuildInspect({
                            id: m.uid,
                            displayName: m.displayName,
                            photoURL: m.photoURL,
                            powerLevel: m.powerLevel ?? null,
                          });
                        }}
                        title="View loadout and equipped artifacts"
                        style={{
                          flexShrink: 0,
                          fontSize: '0.6rem',
                          padding: '0.3rem 0.45rem',
                          borderRadius: '0.35rem',
                          border: '1px solid rgba(56, 189, 248, 0.45)',
                          background: 'rgba(15, 23, 42, 0.75)',
                          color: '#e0f2fe',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View build
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
