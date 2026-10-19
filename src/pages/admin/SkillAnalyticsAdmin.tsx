import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { listAcademicSkills } from '../../utils/academicSkillService';
import {
  getClassPlayerSkillMastery,
  getClassSkillAnalytics,
  syncSkillMasteryFromAttemptHistory,
  SkillHistorySyncResult,
} from '../../utils/masteryService';
import { AcademicSkill, PlayerSkillMastery } from '../../types/academicSkills';
import MasteryBadge from '../../components/skills/MasteryBadge';
import SkillAnswerDetailPanel from '../../components/skills/SkillAnswerDetailPanel';
import { getMasteryBand } from '../../utils/masteryCalculations';
import { loadPlayerNames } from '../../utils/skillAnswerBreakdown';
import { skillAppliesToClass } from '../../utils/skillClassScope';
import {
  buildPlayerSkillSummaries,
  formatLastPracticed,
  PlayerSkillSummary,
  PlayerSort,
  sortPlayerSummaries,
  trendLabel,
} from '../../utils/skillPlayerView';

type AnalyticsView = 'skill' | 'player';

const SkillAnalyticsAdmin: React.FC = () => {
  const [skills, setSkills] = useState<AcademicSkill[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string; students: string[] }[]>([]);
  const [classId, setClassId] = useState('');
  const [category, setCategory] = useState('all');
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof getClassSkillAnalytics>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<SkillHistorySyncResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [view, setView] = useState<AnalyticsView>('skill');
  const [masteryByUser, setMasteryByUser] = useState<Map<string, PlayerSkillMastery[]>>(new Map());
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerSort, setPlayerSort] = useState<PlayerSort>('name');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [showUnexplored, setShowUnexplored] = useState(false);
  /** Answer drill-down for one player's skill (By player view). */
  const [playerSkillDetail, setPlayerSkillDetail] = useState<{ skillId: string; userId: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [skillRows, classSnap] = await Promise.all([
          listAcademicSkills({ activeOnly: true }),
          getDocs(collection(db, 'classrooms')),
        ]);
        setSkills(skillRows);
        const classes = classSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || d.id,
            students: Array.isArray(data.students) ? data.students.filter((x: unknown) => typeof x === 'string') : [],
          };
        });
        classes.sort((a, b) => a.name.localeCompare(b.name));
        setClassrooms(classes);
        if (classes[0]) setClassId(classes[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, []);

  useEffect(() => {
    if (!classId) return;
    const classroom = classrooms.find((c) => c.id === classId);
    if (!classroom) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSyncResult(null);
      try {
        const sync = await syncSkillMasteryFromAttemptHistory(classroom.students, (done, total) => {
          if (!cancelled) setSyncProgress({ done, total });
        });
        if (cancelled) return;
        setSyncResult(sync);
        setSyncProgress(null);
        const [mastery, names] = await Promise.all([
          getClassPlayerSkillMastery(classroom.students),
          loadPlayerNames(classroom.students),
        ]);
        const analytics = await getClassSkillAnalytics({ classStudentIds: classroom.students, masteryByUser: mastery });
        if (!cancelled) {
          setRows(analytics);
          setMasteryByUser(mastery);
          setPlayerNames(names);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Analytics failed');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSyncProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, classrooms, refreshKey]);

  const skillName = useMemo(() => {
    const map: Record<string, AcademicSkill> = {};
    skills.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [skills]);

  const filtered = rows
    .filter((r) => {
      if (!skillAppliesToClass(skillName[r.skillId], classId)) return false;
      if (category === 'all') return true;
      return (skillName[r.skillId]?.category || 'Uncategorized') === category;
    })
    .sort((a, b) => b.classMastery - a.classMastery);

  const selectedClassroom = classrooms.find((c) => c.id === classId);
  const closeSkillDetail = useCallback(() => setSelectedSkillId(null), []);

  const categories = useMemo(() => {
    const set = new Set(skills.map((s) => s.category || 'Uncategorized'));
    return Array.from(set).sort();
  }, [skills]);

  const inCategory = useCallback(
    (skillId: string) =>
      skillAppliesToClass(skillName[skillId], classId) &&
      (category === 'all' || (skillName[skillId]?.category || 'Uncategorized') === category),
    [category, skillName, classId]
  );

  const playerRows = useMemo(() => {
    if (!selectedClassroom) return [] as PlayerSkillSummary[];
    const all = buildPlayerSkillSummaries(selectedClassroom.students, playerNames, masteryByUser, inCategory);
    const q = playerSearch.trim().toLowerCase();
    return sortPlayerSummaries(q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all, playerSort);
  }, [selectedClassroom, playerNames, masteryByUser, inCategory, playerSearch, playerSort]);

  const skillsInCategory = useMemo(() => skills.filter((s) => inCategory(s.id)), [skills, inCategory]);
  const closePlayerSkillDetail = useCallback(() => setPlayerSkillDetail(null), []);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto', color: '#f4f0e6' }}>
      <h1 className="mst-display" style={{ margin: 0, color: 'var(--mst-gold-bright)', fontSize: '1.75rem' }}>
        Skill Analytics
      </h1>
      <p style={{ margin: '0.35rem 0 1rem', color: '#9ca3af', fontSize: '0.9rem' }}>
        {view === 'skill'
          ? 'Class-wide academic mastery from tagged CFU questions. Click a skill to see how each player answered.'
          : 'Each player’s mastery across every skill. Click a player to see all of their skill levels.'}
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <div role="tablist" aria-label="View Skill Analytics by" style={{ display: 'inline-flex', borderRadius: '0.45rem', overflow: 'hidden', border: '1px solid rgba(212,168,79,0.35)' }}>
          {(['skill', 'player'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              style={{
                padding: '0.55rem 0.9rem',
                border: 'none',
                background: view === v ? 'rgba(212,168,79,0.25)' : '#05070d',
                color: view === v ? '#f0c96a' : '#d1d5db',
                fontWeight: view === v ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {v === 'skill' ? 'By skill' : 'By player'}
            </button>
          ))}
        </div>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          style={selectStyle}
        >
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.students.length})
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading || !classId}
          style={{ ...selectStyle, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          ↻ Re-sync CFU history
        </button>
        {view === 'player' && (
          <>
            <input
              type="search"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players…"
              aria-label="Search players"
              style={{ ...selectStyle, minWidth: 180 }}
            />
            <select value={playerSort} onChange={(e) => setPlayerSort(e.target.value as PlayerSort)} style={selectStyle} aria-label="Sort players">
              <option value="name">Sort: Name</option>
              <option value="mastery-desc">Sort: Highest mastery</option>
              <option value="mastery-asc">Sort: Lowest mastery</option>
            </select>
          </>
        )}
      </div>

      {syncResult && !loading && (
        <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Scanned {syncResult.attemptsScanned} CFU attempt{syncResult.attemptsScanned === 1 ? '' : 's'} from{' '}
          {syncResult.studentsScanned} student{syncResult.studentsScanned === 1 ? '' : 's'}
          {syncResult.evidenceAdded > 0 ? ` · added ${syncResult.evidenceAdded} skill answers from history` : ''}
          {syncResult.errors > 0 ? ` · ${syncResult.errors} student(s) could not be synced` : ''}
        </div>
      )}
      {error && <div style={{ color: '#fca5a5', marginBottom: '0.75rem' }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#9ca3af' }}>
          {syncProgress
            ? `Syncing CFU history into skill mastery… ${syncProgress.done}/${syncProgress.total} students`
            : 'Calculating class mastery…'}
        </div>
      ) : view === 'player' ? (
        playerRows.length === 0 ? (
          <div style={{ color: '#9ca3af' }}>
            {playerSearch.trim() ? 'No players match that search.' : 'This class has no students yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(212,168,79,0.35)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'rgba(212,168,79,0.1)', color: '#f0c96a' }}>
                  <th style={th}>Player</th>
                  <th style={th}>Avg Mastery</th>
                  <th style={th}>Mastered/Strong</th>
                  <th style={th}>Developing</th>
                  <th style={th}>Weak/Critical</th>
                  <th style={th}>Skills Explored</th>
                  <th style={th}>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((p) => {
                  const expanded = expandedPlayerId === p.userId;
                  const toggle = () => setExpandedPlayerId(expanded ? null : p.userId);
                  const exploredIds = new Set(p.skills.map((s) => s.skillId));
                  const unexplored = skillsInCategory.filter((s) => !exploredIds.has(s.id));
                  return (
                    <React.Fragment key={p.userId}>
                      <tr
                        tabIndex={0}
                        aria-expanded={expanded}
                        title="Show all of this player's skill mastery levels"
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                        style={{
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          background: expanded ? 'rgba(212,168,79,0.08)' : undefined,
                        }}
                      >
                        <td style={td}>
                          <span style={{ color: '#9ca3af', marginRight: 6 }}>{expanded ? '▾' : '▸'}</span>
                          <span style={{ fontWeight: 700, color: '#f0c96a' }}>{p.name}</span>
                        </td>
                        <td style={td}>
                          {p.avgMastery === null ? (
                            <MasteryBadge band="unexplored" />
                          ) : (
                            <MasteryBadge band={getMasteryBand(p.avgMastery, 1)} score={p.avgMastery} showScore />
                          )}
                        </td>
                        <td style={td}>{p.masteredStrong}</td>
                        <td style={td}>{p.developing}</td>
                        <td style={td}>{p.weakCritical}</td>
                        <td style={td}>
                          {p.explored} / {skillsInCategory.length}
                        </td>
                        <td style={td}>{p.attempts}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0 0.75rem 1rem 2rem', background: 'rgba(212,168,79,0.04)' }}>
                            {p.skills.length === 0 ? (
                              <div style={{ color: '#9ca3af', padding: '0.75rem 0' }}>
                                {p.name} hasn’t answered any skill-tagged CFU questions
                                {category === 'all' ? '' : ' in this category'} yet.
                              </div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', marginTop: '0.5rem' }}>
                                <thead>
                                  <tr style={{ color: '#9ca3af' }}>
                                    <th style={subTh}>Skill</th>
                                    <th style={subTh}>Mastery</th>
                                    <th style={subTh}>Correct</th>
                                    <th style={subTh}>Recent accuracy</th>
                                    <th style={subTh}>Trend</th>
                                    <th style={subTh}>Last practiced</th>
                                    <th style={subTh} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.skills.map((s) => {
                                    const skill = skillName[s.skillId];
                                    const trend = trendLabel(s.trend);
                                    return (
                                      <tr key={s.skillId} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={subTd}>
                                          <div style={{ fontWeight: 600, color: '#f4f0e6' }}>{skill?.name || s.skillId}</div>
                                          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{skill?.category || '—'}</div>
                                        </td>
                                        <td style={subTd}>
                                          <MasteryBadge band={s.band} score={s.masteryScore} showScore />
                                        </td>
                                        <td style={subTd}>
                                          {s.correctAttempts ?? 0} / {s.totalAttempts}
                                        </td>
                                        <td style={subTd}>
                                          {typeof s.recentAccuracy === 'number' ? `${Math.round(s.recentAccuracy)}%` : '—'}
                                        </td>
                                        <td style={{ ...subTd, color: trend?.color || '#9ca3af' }}>{trend?.text || '—'}</td>
                                        <td style={subTd}>{formatLastPracticed(s.lastPracticed || s.updatedAt)}</td>
                                        <td style={subTd}>
                                          <button
                                            type="button"
                                            onClick={() => setPlayerSkillDetail({ skillId: s.skillId, userId: p.userId, name: p.name })}
                                            style={{ ...selectStyle, padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                          >
                                            See answers
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                            {unexplored.length > 0 && (
                              <div style={{ marginTop: '0.75rem' }}>
                                <button
                                  type="button"
                                  onClick={() => setShowUnexplored((v) => !v)}
                                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                                >
                                  {showUnexplored ? '▾' : '▸'} {unexplored.length} unexplored skill{unexplored.length === 1 ? '' : 's'}
                                </button>
                                {showUnexplored && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                    {unexplored.map((s) => (
                                      <span
                                        key={s.id}
                                        style={{
                                          fontSize: '0.75rem',
                                          padding: '2px 8px',
                                          borderRadius: 999,
                                          background: 'rgba(156,163,175,0.12)',
                                          color: '#9ca3af',
                                        }}
                                      >
                                        {s.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9ca3af' }}>
          No skill mastery data yet for this class. Students haven't answered any skill-tagged CFU questions
          (solo or in a Live Event).
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(212,168,79,0.35)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'rgba(212,168,79,0.1)', color: '#f0c96a' }}>
                <th style={th}>Skill</th>
                <th style={th}>Class Mastery</th>
                <th style={th}>Mastered/Strong</th>
                <th style={th}>Developing</th>
                <th style={th}>Weak/Critical</th>
                <th style={th}>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const skill = skillName[r.skillId];
                const band = getMasteryBand(r.classMastery, r.attempts > 0 ? 1 : 0);
                return (
                  <tr
                    key={r.skillId}
                    tabIndex={0}
                    title="See how each player answered"
                    onClick={() => setSelectedSkillId(r.skillId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSkillId(r.skillId);
                      }
                    }}
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: '#f0c96a', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                        {skill?.name || r.skillId}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {skill?.category || '—'}
                      </div>
                    </td>
                    <td style={td}>
                      <MasteryBadge band={band} score={r.classMastery} showScore />
                    </td>
                    <td style={td}>{r.masteredStrong}</td>
                    <td style={td}>{r.developing}</td>
                    <td style={td}>{r.weakCritical}</td>
                    <td style={td}>{r.attempts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedSkillId && selectedClassroom && (
        <SkillAnswerDetailPanel
          skillId={selectedSkillId}
          skill={skillName[selectedSkillId]}
          classStudentIds={selectedClassroom.students}
          className={selectedClassroom.name}
          onClose={closeSkillDetail}
        />
      )}
      {playerSkillDetail && (
        <SkillAnswerDetailPanel
          skillId={playerSkillDetail.skillId}
          skill={skillName[playerSkillDetail.skillId]}
          classStudentIds={[playerSkillDetail.userId]}
          className={playerSkillDetail.name}
          onClose={closePlayerSkillDetail}
        />
      )}
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderRadius: '0.45rem',
  border: '1px solid rgba(212,168,79,0.35)',
  background: '#05070d',
  color: '#f4f0e6',
};

const th: React.CSSProperties = { textAlign: 'left', padding: '0.75rem', fontWeight: 700 };
const td: React.CSSProperties = { padding: '0.75rem', color: '#e5e7eb' };
const subTh: React.CSSProperties = { textAlign: 'left', padding: '0.45rem 0.5rem', fontWeight: 600, fontSize: '0.75rem' };
const subTd: React.CSSProperties = { padding: '0.45rem 0.5rem', color: '#e5e7eb', verticalAlign: 'middle' };

export default SkillAnalyticsAdmin;
