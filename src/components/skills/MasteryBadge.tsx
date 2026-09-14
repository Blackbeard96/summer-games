import React from 'react';
import { SkillMasteryBand } from '../../types/academicSkills';
import { getMasteryBandMeta } from '../../utils/masteryCalculations';

export const MasteryBadge: React.FC<{
  band: SkillMasteryBand;
  score?: number | null;
  showScore?: boolean;
}> = ({ band, score, showScore }) => {
  const meta = getMasteryBandMeta(band);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.2rem 0.55rem',
        borderRadius: '999px',
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.color}55`,
      }}
      title={meta.label}
    >
      <span>{meta.label}</span>
      {showScore && score != null && band !== 'unexplored' && (
        <span style={{ opacity: 0.9 }}>{Math.round(score)}%</span>
      )}
    </span>
  );
};

export default MasteryBadge;
