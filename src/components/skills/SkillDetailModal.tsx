import React from 'react';
import { AcademicSkill, PlayerSkillMastery } from '../../types/academicSkills';
import MasteryBadge from './MasteryBadge';

interface Props {
  mastery: PlayerSkillMastery;
  skill: AcademicSkill | null;
  onClose: () => void;
}

const SkillDetailModal: React.FC<Props> = ({ mastery, skill, onClose }) => {
  const trend = mastery.trend || [];
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'linear-gradient(165deg, #0e1420, #090d16)',
          border: '1px solid rgba(212,168,79,0.45)',
          borderRadius: '0.85rem',
          padding: '1.25rem 1.35rem',
          color: '#f4f0e6',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f0c96a', fontSize: '1.25rem' }}>
              {skill?.icon || '✦'} {skill?.name || mastery.skillId}
            </h3>
            <div style={{ marginTop: '0.35rem' }}>
              <MasteryBadge band={mastery.masteryBand} score={mastery.masteryScore} showScore />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#e5e7eb',
              borderRadius: '0.4rem',
              padding: '0.35rem 0.6rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.65rem',
            marginTop: '1rem',
            fontSize: '0.85rem',
          }}
        >
          <Stat label="Attempts" value={String(mastery.totalAttempts)} />
          <Stat label="Correct" value={String(mastery.correctAttempts)} />
          <Stat label="Incorrect" value={String(mastery.incorrectAttempts)} />
          <Stat label="Raw Accuracy" value={`${mastery.rawAccuracy}%`} />
          <Stat label="Weighted" value={`${mastery.weightedAccuracy}%`} />
          <Stat label="Recent" value={`${mastery.recentAccuracy}%`} />
        </div>

        {trend.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.35rem' }}>Trend</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.35rem', height: '64px' }}>
              {trend.map((v, i) => (
                <div
                  key={i}
                  title={`${Math.round(v)}%`}
                  style={{
                    flex: 1,
                    height: `${Math.max(8, v)}%`,
                    background: 'linear-gradient(180deg, #f0c96a, #8e6b31)',
                    borderRadius: '0.25rem 0.25rem 0 0',
                    minWidth: '8px',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#d1d5db', marginTop: '0.35rem' }}>
              {trend.map((v) => `${Math.round(v)}%`).join(' → ')}
            </div>
          </div>
        )}

        <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
          Performance on a single CFU stays separate from this mastery score.
        </p>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      padding: '0.55rem 0.65rem',
      borderRadius: '0.45rem',
      background: 'rgba(5,7,13,0.55)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <div style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </div>
    <div style={{ fontWeight: 800, color: '#f4f0e6' }}>{value}</div>
  </div>
);

export default SkillDetailModal;
