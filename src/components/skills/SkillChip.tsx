import React from 'react';
import { AcademicSkill } from '../../types/academicSkills';

export const SkillChip: React.FC<{
  skill: Pick<AcademicSkill, 'name' | 'color' | 'icon'> | { name: string; color?: string; icon?: string };
  onRemove?: () => void;
  size?: 'sm' | 'md';
  /** Shrink to the available width and ellipsize long names instead of overflowing. */
  truncate?: boolean;
}> = ({ skill, onRemove, size = 'sm', truncate = false }) => {
  const pad = size === 'sm' ? '0.15rem 0.5rem' : '0.3rem 0.65rem';
  const fontSize = size === 'sm' ? '0.7rem' : '0.8rem';
  return (
    <span
      title={truncate ? skill.name : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: pad,
        borderRadius: '999px',
        fontSize,
        fontWeight: 700,
        color: skill.color || '#f0c96a',
        background: 'rgba(212,168,79,0.12)',
        border: `1px solid ${skill.color || 'rgba(212,168,79,0.45)'}`,
        whiteSpace: 'nowrap',
        ...(truncate ? { minWidth: 0, maxWidth: '100%' } : {}),
      }}
    >
      <span aria-hidden style={{ flexShrink: 0 }}>{skill.icon || '✦'}</span>
      {truncate ? (
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{skill.name}</span>
      ) : (
        skill.name
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${skill.name}`}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
            fontSize: '0.85rem',
          }}
        >
          ×
        </button>
      )}
    </span>
  );
};

export default SkillChip;
