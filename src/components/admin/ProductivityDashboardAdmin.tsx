import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import type { ProductivityRankLabel, ProductivityStatDoc } from '../../utils/productivityTracking';
import {
  getProductivityRank,
  getWeekId,
  tsMs,
} from '../../utils/productivityTracking';

type Classroom = { id: string; name: string; students: string[] };

type StudentLite = {
  id: string;
  displayName?: string;
  email?: string;
};

type Row = StudentLite & ProductivityStatDoc & { productivityRankSort: number; cohortRank?: number | null };

const RANK_ORDER: ProductivityRankLabel[] = [
  'Flow State',
  'Ascended',
  'Focused',
  'Consistent',
  'Initiate',
  'Dormant',
];

const rankFilterOptions: Array<ProductivityRankLabel | 'all'> = [
  'all',
  'Flow State',
  'Ascended',
  'Focused',
  'Consistent',
  'Initiate',
  'Dormant',
];

const emptyStats = (userId: string): ProductivityStatDoc => ({
  userId,
  totalSprintsJoined: 0,
  totalSprintsCompleted: 0,
  sprintCompletionRate: 0,
  totalQuizzesCompleted: 0,
  averageQuizScore: 0,
  currentStreak: 0,
  bestStreak: 0,
  weeklyProductivityRating: 0,
  overallProductivityRating: 0,
  productivityRank: 'Dormant',
});

function rankSortKey(label: ProductivityRankLabel): number {
  const idx = RANK_ORDER.indexOf(label);
  return idx >= 0 ? idx : 99;
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ width: 72, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${p}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
    </div>
  );
}

function RankBadge({ rank }: { rank: ProductivityRankLabel }) {
  const colors: Record<ProductivityRankLabel, string> = {
    'Flow State': '#06b6d4',
    Ascended: '#8b5cf6',
    Focused: '#2563eb',
    Consistent: '#16a34a',
    Initiate: '#eab308',
    Dormant: '#9ca3af',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: 11,
        fontWeight: 700,
        color: 'white',
        background: colors[rank],
        whiteSpace: 'nowrap',
      }}
    >
      {rank}
    </span>
  );
}

type SprintLog = Record<string, unknown> & {
  userId?: string;
  status?: string;
  sprintTitle?: string;
  weekId?: string;
  joinedAt?: unknown;
  completedAt?: unknown;
  missedAt?: unknown;
};

type QuizLog = Record<string, unknown> & {
  userId?: string;
  quizTopic?: string;
  scorePercent?: number;
  completedAt?: unknown;
  questionTags?: string[];
};

const ProductivityDashboardAdmin: React.FC<{
  students: StudentLite[];
  classrooms: Classroom[];
}> = ({ students, classrooms }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsByUser, setStatsByUser] = useState<Record<string, ProductivityStatDoc>>({});
  const [weekActivityUids, setWeekActivityUids] = useState<Set<string> | null>(null);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [weekFilter, setWeekFilter] = useState<string>(getWeekId());
  const [weekFilterEnabled, setWeekFilterEnabled] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [rankFilter, setRankFilter] = useState<ProductivityRankLabel | 'all'>('all');
  const [sortKey, setSortKey] = useState<
    'overall' | 'sprintRate' | 'quiz' | 'streak' | 'name'
  >('overall');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [detailUid, setDetailUid] = useState<string | null>(null);
  const [detailSprints, setDetailSprints] = useState<SprintLog[]>([]);
  const [detailQuizzes, setDetailQuizzes] = useState<QuizLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'productivityStats'));
      const map: Record<string, ProductivityStatDoc> = {};
      snap.docs.forEach((d) => {
        map[d.id] = { userId: d.id, ...(d.data() as object) } as ProductivityStatDoc;
      });
      setStatsByUser(map);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    let cancelled = false;
    async function loadWeekUsers() {
      if (!weekFilterEnabled || !weekFilter.trim()) {
        setWeekActivityUids(null);
        return;
      }
      try {
        const [sSnap, qSnap] = await Promise.all([
          getDocs(query(collection(db, 'sprintProductivityLogs'), where('weekId', '==', weekFilter), limit(500))),
          getDocs(query(collection(db, 'quizProductivityLogs'), where('weekId', '==', weekFilter), limit(500))),
        ]);
        const u = new Set<string>();
        sSnap.docs.forEach((d) => {
          const uid = (d.data() as { userId?: string }).userId;
          if (typeof uid === 'string') u.add(uid);
        });
        qSnap.docs.forEach((d) => {
          const uid = (d.data() as { userId?: string }).userId;
          if (typeof uid === 'string') u.add(uid);
        });
        if (!cancelled) setWeekActivityUids(u);
      } catch (_) {
        if (!cancelled) setWeekActivityUids(new Set());
      }
    }
    void loadWeekUsers();
    return () => {
      cancelled = true;
    };
  }, [weekFilter, weekFilterEnabled]);

  useEffect(() => {
    if (!detailUid) {
      setDetailSprints([]);
      setDetailQuizzes([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const [sSnap, qSnap] = await Promise.all([
          getDocs(query(collection(db, 'sprintProductivityLogs'), where('userId', '==', detailUid), limit(200))),
          getDocs(query(collection(db, 'quizProductivityLogs'), where('userId', '==', detailUid), limit(400))),
        ]);
        const sp = sSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as SprintLog[];
        const qu = qSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as QuizLog[];
        sp.sort((a, b) => (tsMs(b.completedAt || b.joinedAt || b.missedAt) || 0) - (tsMs(a.completedAt || a.joinedAt || a.missedAt) || 0));
        qu.sort((a, b) => (tsMs(b.completedAt) || 0) - (tsMs(a.completedAt) || 0));
        if (!cancelled) {
          setDetailSprints(sp);
          setDetailQuizzes(qu);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailUid]);

  const studentClassLabel = useCallback(
    (studentId: string) => {
      const names = classrooms
        .filter((c) => c.students.includes(studentId))
        .map((c) => c.name);
      return names.length ? names.join(', ') : '—';
    },
    [classrooms]
  );

  const studentClassIdsForFilter = useCallback(
    (studentId: string) => classrooms.filter((c) => c.students.includes(studentId)).map((c) => c.id),
    [classrooms]
  );

  const rows: Row[] = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .map((s) => {
        const stat = statsByUser[s.id] || emptyStats(s.id);
        const rankLabel = stat.productivityRank || getProductivityRank(stat.overallProductivityRating);
        return {
          ...s,
          ...stat,
          productivityRankSort: rankSortKey(rankLabel as ProductivityRankLabel),
          productivityRank: rankLabel as ProductivityRankLabel,
        };
      })
      .filter((r) => {
        if (weekFilterEnabled && weekActivityUids && !weekActivityUids.has(r.id)) return false;
        if (classFilter !== 'all' && !studentClassIdsForFilter(r.id).includes(classFilter)) return false;
        if (rankFilter !== 'all' && r.productivityRank !== rankFilter) return false;
        if (q) {
          const dn = (r.displayName || '').toLowerCase();
          const em = (r.email || '').toLowerCase();
          if (!dn.includes(q) && !em.includes(q) && !r.id.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }, [
    students,
    statsByUser,
    studentSearch,
    classFilter,
    rankFilter,
    weekActivityUids,
    weekFilterEnabled,
    studentClassIdsForFilter,
  ]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.displayName || a.email || a.id).localeCompare(b.displayName || b.email || b.id);
      } else if (sortKey === 'overall') cmp = (a.overallProductivityRating || 0) - (b.overallProductivityRating || 0);
      else if (sortKey === 'sprintRate') cmp = (a.sprintCompletionRate || 0) - (b.sprintCompletionRate || 0);
      else if (sortKey === 'quiz') cmp = (a.averageQuizScore || 0) - (b.averageQuizScore || 0);
      else if (sortKey === 'streak') cmp = (a.currentStreak || 0) - (b.currentStreak || 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [rows, sortDir, sortKey]);

  /** Productivity ranks 1..N within current filtered cohort */
  const rankedRows = useMemo(() => {
    const copy = [...sortedRows];
    copy.sort((a, b) => (b.overallProductivityRating || 0) - (a.overallProductivityRating || 0));
    const orderMap = new Map<string, number>();
    copy.forEach((r, i) => orderMap.set(r.id, i + 1));
    return sortedRows.map((r) => ({
      ...r,
      cohortRank: orderMap.get(r.id) ?? null,
    }));
  }, [sortedRows]);

  const summary = useMemo(() => {
    const list = rankedRows;
    let sum = 0;
    let n = 0;
    let sprintDoneWeek = 0;
    let quizSumWeek = 0;
    let quizNWeek = 0;
    const wk = getWeekId();

    list.forEach((r) => {
      sum += r.overallProductivityRating || 0;
      n += 1;
      if (r.activeWeekId === wk) {
        sprintDoneWeek += r.weekSprintCompleted || 0;
        quizNWeek += r.weekQuizCompletes || 0;
        quizSumWeek += r.weekQuizScoreSum || 0;
      }
    });

    const avgClass = n > 0 ? Math.round((sum / n) * 10) / 10 : 0;
    const avgQuizWeek = quizNWeek > 0 ? Math.round((quizSumWeek / quizNWeek) * 10) / 10 : 0;

    const sortedByRating = [...list].sort(
      (a, b) => (b.overallProductivityRating || 0) - (a.overallProductivityRating || 0)
    );
    const sortedByDelta = [...list].sort((a, b) => (b.ratingDelta || 0) - (a.ratingDelta || 0));

    return {
      avgClass,
      sprintDoneWeek,
      avgQuizWeek,
      topStudent: sortedByRating[0] || null,
      mostImproved: sortedByDelta[0] || null,
    };
  }, [rankedRows]);

  const openDetail = (uid: string) => setDetailUid(uid);

  const detailAnalysis = useMemo(() => {
    const topicScores: Record<string, { sum: number; n: number }> = {};
    detailQuizzes.forEach((q) => {
      const tags = Array.isArray(q.questionTags)
        ? q.questionTags.filter((x): x is string => typeof x === 'string')
        : [];
      const label =
        typeof q.quizTopic === 'string' && q.quizTopic.trim()
          ? q.quizTopic.trim()
          : tags[0] || 'General';
      const pct = Number(q.scorePercent || 0);
      if (!topicScores[label]) topicScores[label] = { sum: 0, n: 0 };
      topicScores[label].sum += pct;
      topicScores[label].n += 1;
    });
    const averages = Object.entries(topicScores).map(([topic, v]) => ({
      topic,
      avg: v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0,
      n: v.n,
    }));
    const strengths = averages.filter((x) => x.avg >= 70 && x.n >= 1).sort((a, b) => b.avg - a.avg);
    const growth = averages.filter((x) => x.avg < 55 && x.n >= 2).sort((a, b) => a.avg - b.avg);

    const missedSprints = detailSprints.filter(
      (s) => s.status === 'missed' || (s.status === 'joined' && !s.completedAt)
    );

    const recent: { kind: 'sprint' | 'quiz'; label: string; when: number; extra?: string }[] = [];
    detailSprints.slice(0, 12).forEach((s) => {
      const t = tsMs(s.completedAt || s.joinedAt || s.missedAt) || 0;
      recent.push({
        kind: 'sprint',
        label: `${(s.status || '').toUpperCase()} — ${s.sprintTitle || 'Sprint'}`,
        when: t,
        extra: typeof s.weekId === 'string' ? s.weekId : undefined,
      });
    });
    detailQuizzes.slice(0, 12).forEach((q) => {
      recent.push({
        kind: 'quiz',
        label: `${q.quizTopic || 'Quiz'} (${q.scorePercent ?? '—'}%)`,
        when: tsMs(q.completedAt) || 0,
      });
    });
    recent.sort((a, b) => b.when - a.when);

    const st = statsByUser[detailUid || ''];

    return { strengths, growth, missedSprints, recent: recent.slice(0, 15), profileStats: st };
  }, [detailQuizzes, detailSprints, detailUid, statsByUser]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      setSortDir(k === 'name' ? 'asc' : 'desc');
    }
  };

  return (
    <div style={{ padding: '1rem', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#111827' }}>Productivity Dashboard</h2>
          <p style={{ color: '#6b7280', marginTop: '0.35rem', maxWidth: 640 }}>
            Class Flow sprint completion, Training Grounds / live quizzes, weekly consistency, and composite productivity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStats()}
          style={{
            padding: '0.5rem 1rem',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ marginTop: '2rem', color: '#6b7280' }}>Loading productivity stats…</p>
      ) : error ? (
        <p style={{ marginTop: '2rem', color: '#b91c1c' }}>{error}</p>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '0.75rem',
              marginTop: '1.25rem',
            }}
          >
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Avg class productivity</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{summary.avgClass}%</div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Sprints completed this week</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#059669' }}>{summary.sprintDoneWeek}</div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Avg quiz score (this week, tracked)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>
                {summary.avgQuizWeek > 0 ? `${summary.avgQuizWeek}%` : '—'}
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Most productive</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {summary.topStudent?.displayName || summary.topStudent?.email || summary.topStudent?.id || '—'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {summary.topStudent ? `${Math.round(summary.topStudent.overallProductivityRating)}% · ${summary.topStudent.productivityRank}` : ''}
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Most improved (Δ overall)</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {summary.mostImproved?.displayName ||
                  summary.mostImproved?.email ||
                  summary.mostImproved?.id ||
                  '—'}
              </div>
              <div style={{ fontSize: 12, color: (summary.mostImproved?.ratingDelta || 0) >= 0 ? '#059669' : '#dc2626' }}>
                {summary.mostImproved && summary.mostImproved.ratingDelta != null
                  ? `${(summary.mostImproved.ratingDelta || 0) >= 0 ? '↑' : '↓'} ${summary.mostImproved.ratingDelta}`
                  : ''}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'flex-end',
              padding: '0.75rem',
              background: '#f9fafb',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Class</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                style={{ padding: '0.35rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              >
                <option value="all">All</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Week (YYYY-MM-DD Monday)</span>
              <input
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                style={{ padding: '0.35rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={weekFilterEnabled}
                onChange={(e) => setWeekFilterEnabled(e.target.checked)}
              />
              Only students active this week
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Rank</span>
              <select
                value={rankFilter}
                onChange={(e) => setRankFilter(e.target.value as ProductivityRankLabel | 'all')}
                style={{ padding: '0.35rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              >
                {rankFilterOptions.map((rk) => (
                  <option key={rk} value={rk}>
                    {rk === 'all' ? 'All ranks' : rk}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Student</span>
              <input
                placeholder="Search name, email, uid"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ padding: '0.35rem 0.5rem', borderRadius: 8, border: '1px solid #d1d5db' }}
              />
            </label>
          </div>

          <div style={{ marginTop: '1rem', overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  <th style={{ padding: '0.6rem', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                    Student
                  </th>
                  <th style={{ padding: '0.6rem' }}>Class</th>
                  <th style={{ padding: '0.6rem' }}>Rank</th>
                  <th style={{ padding: '0.6rem', cursor: 'pointer' }} onClick={() => toggleSort('sprintRate')}>
                    Sprints J / C
                  </th>
                  <th style={{ padding: '0.6rem' }}>% Sprint</th>
                  <th style={{ padding: '0.6rem', cursor: 'pointer' }} onClick={() => toggleSort('quiz')}>
                    Quiz avg
                  </th>
                  <th style={{ padding: '0.6rem' }}># Quiz</th>
                  <th style={{ padding: '0.6rem', cursor: 'pointer' }} onClick={() => toggleSort('streak')}>
                    Streak
                  </th>
                  <th style={{ padding: '0.6rem', cursor: 'pointer' }} onClick={() => toggleSort('overall')}>
                    Weekly / Overall
                  </th>
                  <th style={{ padding: '0.6rem' }}>Badge</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((r) => {
                  const delta = r.ratingDelta ?? 0;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openDetail(r.id)}
                      style={{
                        borderTop: '1px solid #f3f4f6',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '0.6rem', fontWeight: 600 }}>
                        {r.displayName || r.email || r.id.slice(0, 8)}
                      </td>
                      <td style={{ padding: '0.6rem', color: '#4b5563' }}>{studentClassLabel(r.id)}</td>
                      <td style={{ padding: '0.6rem' }}>{r.cohortRank}</td>
                      <td style={{ padding: '0.6rem' }}>
                        {r.totalSprintsJoined} / {r.totalSprintsCompleted}
                      </td>
                      <td style={{ padding: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <MiniBar pct={r.sprintCompletionRate} color="#10b981" />
                          <span>{Math.round(r.sprintCompletionRate)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <MiniBar pct={r.averageQuizScore} color="#3b82f6" />
                          <span>{Math.round(r.averageQuizScore)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem' }}>{r.totalQuizzesCompleted}</td>
                      <td style={{ padding: '0.6rem' }}>{r.currentStreak} wk</td>
                      <td style={{ padding: '0.6rem' }}>
                        <div style={{ fontWeight: 700 }}>
                          {Math.round(r.weeklyProductivityRating)}% / {Math.round(r.overallProductivityRating)}%
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#9ca3af',
                          }}
                        >
                          {delta !== 0 ? `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}` : '—'}
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem' }}>
                        <RankBadge rank={r.productivityRank} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rankedRows.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No students match filters.</div>
            )}
          </div>
        </>
      )}

      {detailUid && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setDetailUid(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Productivity profile</h3>
              <button
                type="button"
                onClick={() => setDetailUid(null)}
                style={{ border: 'none', background: '#f3f4f6', borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <p style={{ color: '#6b7280' }}>Loading history…</p>
            ) : (
              <>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <StatPill label="Weekly score" value={`${Math.round(detailAnalysis.profileStats?.weeklyProductivityRating || 0)}%`} />
                  <StatPill label="Overall score" value={`${Math.round(detailAnalysis.profileStats?.overallProductivityRating || 0)}%`} />
                  <StatPill label="Rank" value={detailAnalysis.profileStats?.productivityRank || '—'} />
                </div>
                <section style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: 14, color: '#374151' }}>Strength areas (quiz topics)</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {detailAnalysis.strengths.length === 0 ? (
                      <li style={{ color: '#9ca3af' }}>Not enough topic data yet</li>
                    ) : (
                      detailAnalysis.strengths.slice(0, 6).map((t) => (
                        <li key={t.topic}>
                          {t.topic} — {t.avg}% ({t.n} tries)
                        </li>
                      ))
                    )}
                  </ul>
                </section>
                <section style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: 14, color: '#374151' }}>Growth areas</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {detailAnalysis.growth.length === 0 ? (
                      <li style={{ color: '#9ca3af' }}>No low-performing topics with multiple attempts</li>
                    ) : (
                      detailAnalysis.growth.slice(0, 6).map((t) => (
                        <li key={t.topic}>
                          {t.topic} — {t.avg}% ({t.n} tries)
                        </li>
                      ))
                    )}
                  </ul>
                </section>
                <section style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: 14, color: '#374151' }}>Sprint history</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13 }}>
                    {detailSprints.length === 0 ? (
                      <li style={{ color: '#9ca3af' }}>No sprint productivity logs yet</li>
                    ) : (
                      detailSprints.slice(0, 20).map((s, i) => (
                        <li key={`${String(s.sessionId)}-${String(s.sprintId)}-${i}`}>
                          {(s.status || '').toUpperCase()} — {s.sprintTitle || 'Sprint'}
                          {typeof s.weekId === 'string' ? ` · ${s.weekId}` : ''}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
                <section style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: 14, color: '#374151' }}>Quiz history</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13 }}>
                    {detailQuizzes.length === 0 ? (
                      <li style={{ color: '#9ca3af' }}>No quiz productivity logs yet</li>
                    ) : (
                      detailQuizzes.slice(0, 25).map((q, i) => (
                        <li key={`${String(q.quizId)}-${i}`}>
                          {q.quizTopic || 'Quiz'} — {q.scorePercent ?? '—'}%
                        </li>
                      ))
                    )}
                  </ul>
                </section>
                <section style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: 14, color: '#374151' }}>Missed / incomplete sprints</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13 }}>
                    {detailAnalysis.missedSprints.length === 0 ? (
                      <li style={{ color: '#9ca3af' }}>None flagged</li>
                    ) : (
                      detailAnalysis.missedSprints.slice(0, 15).map((s, i) => (
                        <li key={`${String(s.sessionId)}-${String(s.sprintId)}-${i}`}>
                          {(s.status || '').toUpperCase()} — {s.sprintTitle || 'Sprint'}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
                <section style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: 14, color: '#374151' }}>Recent activity</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13 }}>
                    {detailAnalysis.recent.map((ev, idx) => (
                      <li key={`${idx}-${ev.kind}-${ev.when}`}>
                        [{ev.kind}] {ev.label}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '0.5rem 0.75rem' }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{value}</div>
    </div>
  );
}

export default ProductivityDashboardAdmin;
