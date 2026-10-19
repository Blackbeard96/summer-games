import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AcademicSkill } from '../../types/academicSkills';
import { PlayerSkillMastery } from '../../types/academicSkills';
import { listAcademicSkills } from '../../utils/academicSkillService';
import { buildSkillInsights, getPlayerSkillMastery } from '../../utils/masteryService';
import { getClassroomIdsForEnrolledStudent } from '../../utils/classroomQueries';
import { filterSkillIdsForStudent, skillAppliesToAnyClass } from '../../utils/skillClassScope';
import { getMasteryBand } from '../../utils/masteryCalculations';
import { formatLastPracticed, trendLabel } from '../../utils/skillPlayerView';
import MasteryBadge from './MasteryBadge';
import SkillChip from './SkillChip';
import SkillDetailModal from './SkillDetailModal';

interface Props {
  userId: string;
}

/** `/profile?view=skill-mastery` (or `#skill-mastery`) opens this panel on the full skill list. */
export const PROFILE_SKILL_MASTERY_ANCHOR = 'skill-mastery';

type PanelTab = 'overview' | 'all';

const ProfileSkillMasterySection: React.FC<Props> = ({ userId }) => {
  const location = useLocation();
  const deepLinked =
    new URLSearchParams(location.search).get('view') === PROFILE_SKILL_MASTERY_ANCHOR ||
    location.hash === `#${PROFILE_SKILL_MASTERY_ANCHOR}`;
  const [skills, setSkills] = useState<AcademicSkill[]>([]);
  /** Skills tracked for this student's classes (null = classes unknown, so every skill). */
  const [studentClassIds, setStudentClassIds] = useState<string[] | null>(null);
  const [mastery, setMastery] = useState<PlayerSkillMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlayerSkillMastery | null>(null);
  const [tab, setTab] = useState<PanelTab>(deepLinked ? 'all' : 'overview');
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deepLinked) return;
    setTab('all');
  }, [deepLinked, location.key]);

  useEffect(() => {
    if (!deepLinked || loading) return;
    const id = window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => clearTimeout(id);
  }, [deepLinked, loading, location.key]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [skillRows, masteryRows, classIds] = await Promise.all([
          listAcademicSkills({ activeOnly: true }),
          getPlayerSkillMastery(userId),
          getClassroomIdsForEnrolledStudent(userId).catch(() => null),
        ]);
        const byId = new Map(skillRows.map((s) => [s.id, s]));
        const inScope = new Set(
          filterSkillIdsForStudent(masteryRows.map((m) => m.skillId), byId, classIds)
        );
        if (!cancelled) {
          setSkills(skillRows);
          setStudentClassIds(classIds);
          setMastery(masteryRows.filter((m) => m.totalAttempts > 0 && inScope.has(m.skillId)));
        }
      } catch (e) {
        console.error('Profile mastery load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const skillNames = useMemo(() => {
    const map: Record<string, string> = {};
    skills.forEach((s) => {
      map[s.id] = s.name;
    });
    return map;
  }, [skills]);

  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);

  const overall =
    mastery.length > 0
      ? Math.round(
          (mastery.reduce((sum, m) => sum + m.masteryScore, 0) / mastery.length) * 10
        ) / 10
      : null;

  const strongest = [...mastery].sort((a, b) => b.masteryScore - a.masteryScore).slice(0, 5);
  const developing = mastery
    .filter((m) => m.masteryBand === 'developing')
    .sort((a, b) => b.masteryScore - a.masteryScore)
    .slice(0, 5);
  const weakest = [...mastery]
    .filter((m) => m.masteryBand === 'weak' || m.masteryBand === 'critical')
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 5);
  const recent = [...mastery]
    .sort((a, b) => {
      const at = a.lastPracticed?.toMillis?.() || (a.lastPracticed ? new Date(a.lastPracticed).getTime() : 0);
      const bt = b.lastPracticed?.toMillis?.() || (b.lastPracticed ? new Date(b.lastPracticed).getTime() : 0);
      return bt - at;
    })
    .slice(0, 5);

  const insights = buildSkillInsights(mastery, skillNames);

  const masteryBySkill = new Map(mastery.map((m) => [m.skillId, m]));
  const classSkills = skills.filter((s) => studentClassIds === null || skillAppliesToAnyClass(s, studentClassIds));
  const allRows = [
    ...[...mastery].sort((a, b) => b.masteryScore - a.masteryScore).map((m) => ({ skillId: m.skillId, mastery: m })),
    ...classSkills
      .filter((s) => !masteryBySkill.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ skillId: s.id, mastery: null as PlayerSkillMastery | null })),
  ];
  const totalSkills = Math.max(allRows.length, mastery.length);
  const bandCounts = {
    masteredStrong: mastery.filter((m) => ['mastered', 'strong'].includes(getMasteryBand(m.masteryScore, m.totalAttempts))).length,
    developing: mastery.filter((m) => getMasteryBand(m.masteryScore, m.totalAttempts) === 'developing').length,
    weakCritical: mastery.filter((m) => ['weak', 'critical'].includes(getMasteryBand(m.masteryScore, m.totalAttempts))).length,
  };

  const shell = (body: React.ReactNode) => (
    <div
      ref={panelRef}
      id={PROFILE_SKILL_MASTERY_ANCHOR}
      className="mst-profile-panel"
      style={{ marginTop: '1.5rem', padding: '1.25rem', scrollMarginTop: '90px' }}
    >
      {body}
    </div>
  );

  if (loading) {
    return shell(
      <>
        <h2 className="mst-profile-panel-title">Skill Mastery</h2>
        <p style={{ color: 'var(--mst-text-muted)' }}>Loading skill mastery…</p>
      </>
    );
  }

  const renderAllSkills = () => (
    <div style={{ overflowX: 'auto', borderRadius: '0.6rem', border: '1px solid rgba(212,168,79,0.25)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#e5e7eb' }}>
        <thead>
          <tr style={{ background: 'rgba(212,168,79,0.1)', color: '#f0c96a', textAlign: 'left' }}>
            <th style={cellHead}>Skill</th>
            <th style={cellHead}>Mastery</th>
            <th style={cellHead}>Correct</th>
            <th style={cellHead}>Trend</th>
            <th style={cellHead}>Last practiced</th>
          </tr>
        </thead>
        <tbody>
          {allRows.map(({ skillId, mastery: m }) => {
            const skill = skillById.get(skillId);
            const trend = m ? trendLabel(m.trend) : null;
            const open = () => m && setSelected(m);
            return (
              <tr
                key={skillId}
                tabIndex={m ? 0 : -1}
                onClick={open}
                onKeyDown={(e) => {
                  if (m && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    open();
                  }
                }}
                title={m ? 'See details for this skill' : 'You have not answered a question on this skill yet'}
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', cursor: m ? 'pointer' : 'default', opacity: m ? 1 : 0.7 }}
              >
                <td style={cell}>
                  <div style={{ fontWeight: 600, color: '#f4f0e6' }}>
                    {skill?.icon || '✦'} {skill?.name || skillNames[skillId] || skillId}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{skill?.category || '—'}</div>
                </td>
                <td style={cell}>
                  {m ? (
                    <MasteryBadge band={getMasteryBand(m.masteryScore, m.totalAttempts)} score={m.masteryScore} showScore />
                  ) : (
                    <MasteryBadge band="unexplored" />
                  )}
                </td>
                <td style={cell}>{m ? `${m.correctAttempts ?? 0} / ${m.totalAttempts}` : '—'}</td>
                <td style={{ ...cell, color: trend?.color || '#9ca3af' }}>{trend?.text || '—'}</td>
                <td style={cell}>{m ? formatLastPracticed(m.lastPracticed || m.updatedAt) : 'Not started'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (mastery.length === 0) {
    return shell(
      <>
        <h2 className="mst-profile-panel-title">Skill Mastery</h2>
        <p style={{ color: 'var(--mst-text-secondary)', marginBottom: '0.5rem' }}>No skill data yet.</p>
        <p style={{ color: 'var(--mst-text-muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          Complete CFUs with skill-tagged questions to begin building your Mastery Profile. Unexplored skills are not shown as 0%.
        </p>
        {allRows.length > 0 && (
          <>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#f0c96a' }}>
              Skills you will be tracked on ({allRows.length})
            </h3>
            {renderAllSkills()}
          </>
        )}
      </>
    );
  }

  const renderList = (title: string, rows: PlayerSkillMastery[]) => (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#f0c96a' }}>{title}</h3>
      {rows.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>None yet</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {rows.map((m) => {
            const skill = skillById.get(m.skillId);
            return (
              <button
                key={m.skillId}
                type="button"
                onClick={() => setSelected(m)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  alignItems: 'center',
                  textAlign: 'left',
                  padding: '0.55rem 0.7rem',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(5,7,13,0.45)',
                  color: '#f4f0e6',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <SkillChip skill={skill || { name: skillNames[m.skillId] || m.skillId }} />
                </div>
                <MasteryBadge band={m.masteryBand} score={m.masteryScore} showScore />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return shell(
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 className="mst-profile-panel-title" style={{ marginBottom: '0.35rem' }}>
            Skill Mastery
          </h2>
          <p style={{ margin: 0, color: 'var(--mst-text-muted)', fontSize: '0.85rem' }}>
            Your academic skill levels from CFU questions — separate from quiz scores and battle abilities.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
            Overall Mastery
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f0c96a' }}>
            {overall != null ? `${overall}%` : '—'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {mastery.length} of {totalSkills} skills explored
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { label: 'Mastered / Strong', value: bandCounts.masteredStrong, color: '#6ee7b7' },
          { label: 'Developing', value: bandCounts.developing, color: '#f0c96a' },
          { label: 'Weak / Critical', value: bandCounts.weakCritical, color: '#fca5a5' },
          { label: 'Not started', value: Math.max(0, totalSkills - mastery.length), color: '#9ca3af' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: '1 1 120px',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(5,7,13,0.45)',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Skill Mastery view" style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid rgba(212,168,79,0.25)' }}>
        {(
          [
            ['overview', 'Overview'],
            ['all', `All my skills (${totalSkills})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              padding: '0.5rem 0.9rem',
              border: 'none',
              borderBottom: `2px solid ${tab === id ? '#d4a84f' : 'transparent'}`,
              background: 'transparent',
              color: tab === id ? '#f0c96a' : '#9ca3af',
              fontWeight: tab === id ? 700 : 500,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'all' && renderAllSkills()}

      {tab === 'overview' && insights.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: '#f0c96a' }}>Insights</h3>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {insights.map((insight, idx) => (
              <div
                key={`${insight.type}-${idx}`}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(139,92,246,0.35)',
                  background: 'rgba(109,62,242,0.1)',
                  fontSize: '0.85rem',
                  color: '#e5e7eb',
                }}
              >
                <strong style={{ color: '#c4b5fd' }}>{insight.title}: </strong>
                {insight.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {renderList('Strongest', strongest)}
          {renderList('Developing', developing)}
          {renderList('Needs Training', weakest)}
          {renderList('Recently Practiced', recent)}
        </div>
      )}

      {selected && (
        <SkillDetailModal
          mastery={selected}
          skill={skillById.get(selected.skillId) || null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
};

const cellHead: React.CSSProperties = { padding: '0.6rem 0.65rem', fontWeight: 700, fontSize: '0.78rem' };
const cell: React.CSSProperties = { padding: '0.55rem 0.65rem', verticalAlign: 'middle' };

export default ProfileSkillMasterySection;
