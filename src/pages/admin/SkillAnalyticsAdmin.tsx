import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { listAcademicSkills } from '../../utils/academicSkillService';
import {
  getClassSkillAnalytics,
  syncSkillMasteryFromAttemptHistory,
  SkillHistorySyncResult,
} from '../../utils/masteryService';
import { AcademicSkill } from '../../types/academicSkills';
import MasteryBadge from '../../components/skills/MasteryBadge';
import SkillAnswerDetailPanel from '../../components/skills/SkillAnswerDetailPanel';
import { getMasteryBand } from '../../utils/masteryCalculations';

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
        const analytics = await getClassSkillAnalytics({ classStudentIds: classroom.students });
        if (!cancelled) setRows(analytics);
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

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto', color: '#f4f0e6' }}>
      <h1 className="mst-display" style={{ margin: 0, color: 'var(--mst-gold-bright)', fontSize: '1.75rem' }}>
        Skill Analytics
      </h1>
      <p style={{ margin: '0.35rem 0 1rem', color: '#9ca3af', fontSize: '0.9rem' }}>
        Class-wide academic mastery from tagged CFU questions. Click a skill to see how each player answered.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
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

export default SkillAnalyticsAdmin;
