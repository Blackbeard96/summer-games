import React from 'react';
import { SkillTreeBranch } from '../../types/skillSystem';

interface BranchSelectorProps {
  branches: SkillTreeBranch[];
  selectedBranchId: string;
  onSelectBranch: (branchId: string) => void;
}

const BRANCH_ICONS: Record<string, string> = {
  manifest: '✨',
  elemental: '🔥',
  system: '⚡'
};

const BRANCH_COLORS: Record<string, { accent: string; bg: string }> = {
  manifest: { accent: '#8b5cf6', bg: '#faf5ff' },
  elemental: { accent: '#f59e0b', bg: '#fffbeb' },
  system: { accent: '#10b981', bg: '#f0fdf4' }
};

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  branches,
  selectedBranchId,
  onSelectBranch
}) => {
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      marginBottom: '1.5rem',
      borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
      paddingBottom: '0.75rem',
      flexWrap: 'wrap'
    }}>
      {branches.map((branch) => {
        const isSelected = branch.id === selectedBranchId;
        const colors = BRANCH_COLORS[branch.id] || { accent: '#6b7280', bg: '#f3f4f6' };
        const icon = BRANCH_ICONS[branch.id] || '●';
        
        return (
          <button
            key={branch.id}
            onClick={() => onSelectBranch(branch.id)}
            style={{
              background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              border: `2px solid ${isSelected ? colors.accent : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '0.5rem',
              padding: '0.625rem 1.25rem',
              color: isSelected ? colors.accent : 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.8125rem',
              fontWeight: isSelected ? 'bold' : 'normal',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
            onMouseOver={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = colors.accent;
              }
            }}
            onMouseOut={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{icon}</span>
            <span>{branch.name}</span>
          </button>
        );
      })}
    </div>
  );
};

