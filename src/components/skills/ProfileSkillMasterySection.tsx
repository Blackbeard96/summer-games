import React, { useEffect, useMemo, useState } from 'react';
import { AcademicSkill } from '../../types/academicSkills';
import { PlayerSkillMastery } from '../../types/academicSkills';
import { listAcademicSkills } from '../../utils/academicSkillService';
import { buildSkillInsights, getPlayerSkillMastery } from '../../utils/masteryService';
import MasteryBadge from './MasteryBadge';
import SkillChip from './SkillChip';
import SkillDetailModal from './SkillDetailModal';

interface Props {
  userId: string;
}

const ProfileSkillMasterySection: React.FC<Props> = ({ userId }) => {
  const [skills, setSkills] = useState<AcademicSkill[]>([]);
  const [mastery, setMastery] = useState<PlayerSkillMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlayerSkillMastery | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [skillRows, masteryRows] = await Promise.all([
          listAcademicSkills({ activeOnly: true }),
          getPlayerSkillMastery(userId),
        ]);
        if (!cancelled) {
          setSkills(skillRows);
          setMastery(masteryRows.filter((m) => m.totalAttempts > 0));
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

  if (loading) {
    return (
      <div className="mst-profile-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
        <h2 className="mst-profile-panel-title">Academic Mastery</h2>
        <p style={{ color: 'var(--mst-text-muted)' }}>Loading skill mastery…</p>
      </div>
    );
  }

  if (mastery.length === 0) {
    return (
      <div className="mst-profile-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
        <h2 className="mst-profile-panel-title">Academic Mastery</h2>
        <p style={{ color: 'var(--mst-text-secondary)', marginBottom: '0.5rem' }}>
          No skill data yet.
        </p>
        <p style={{ color: 'var(--mst-text-muted)', fontSize: '0.875rem', margin: 0 }}>
          Complete CFUs with skill-tagged questions to begin building your Mastery Profile. Unexplored skills are not shown as 0%.
        </p>
      </div>
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

  return (
    <div className="mst-profile-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 className="mst-profile-panel-title" style={{ marginBottom: '0.35rem' }}>
            Academic Mastery
          </h2>
          <p style={{ margin: 0, color: 'var(--mst-text-muted)', fontSize: '0.85rem' }}>
            Real-world skill evidence from CFUs — separate from quiz scores and battle Skill Mastery.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
            Overall Mastery
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f0c96a' }}>
            {overall != null ? `${overall}%` : '—'}
          </div>
        </div>
      </div>

      {insights.length > 0 && (
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

      {selected && (
        <SkillDetailModal
          mastery={selected}
          skill={skillById.get(selected.skillId) || null}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

export default ProfileSkillMasterySection;
