import React from 'react';
import { SkillDefinition, SkillTreeNode } from '../../types/skillSystem';
import { HoldToUnlockButton } from './HoldToUnlockButton';

interface SkillDetailPanelProps {
  selectedNode: SkillTreeNode | null;
  skill: SkillDefinition | null;
  isUnlocked: boolean;
  canUnlock: boolean;
  onUnlock: () => void;
  unlockedNodeIds: string[];
}

export const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({
  selectedNode,
  skill,
  isUnlocked,
  canUnlock,
  onUnlock,
  unlockedNodeIds
}) => {
  if (!selectedNode || !skill) {
    return (
      <div style={{
        padding: '2rem',
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        fontSize: '0.875rem'
      }}>
        Select a skill to view details
      </div>
    );
  }

  const getUnlockRuleText = (node: SkillTreeNode): string => {
    const { unlockRules } = node;
    if (unlockRules.type === 'always') {
      return 'Always available';
    } else if (unlockRules.type === 'ppSpent') {
      return `Requires ${unlockRules.value} PP spent`;
    } else if (unlockRules.type === 'level') {
      return `Requires Level ${unlockRules.value}`;
    } else if (unlockRules.type === 'challengeComplete') {
      return `Complete challenge: ${unlockRules.value}`;
    }
    return 'Check requirements';
  };

  const getRequirementsText = (node: SkillTreeNode): string[] => {
    const requirements: string[] = [];
    
    if (node.requires.length > 0) {
      const missingReqs = node.requires.filter(req => !unlockedNodeIds.includes(req));
      if (missingReqs.length > 0) {
        requirements.push(`Requires ${missingReqs.length} prerequisite skill${missingReqs.length > 1 ? 's' : ''}`);
      }
    }
    
    const ruleText = getUnlockRuleText(node);
    if (ruleText !== 'Always available') {
      requirements.push(ruleText);
    }
    
    return requirements;
  };

  const requirements = getRequirementsText(selectedNode);

  return (
    <div style={{
      padding: '1.5rem',
      height: '100%',
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      color: '#fff',
      overflowY: 'auto'
    }}>
      {/* Skill Title */}
      <div style={{
        fontSize: '1.75rem',
        fontWeight: 'bold',
        marginBottom: '1rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '2rem' }}>{skill.icon.value}</span>
        <span>{skill.name}</span>
      </div>

      {/* In-Game Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{
          fontSize: '0.875rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: '0.75rem'
        }}>
          In-Game
        </h3>
        <p style={{
          fontSize: '1rem',
          lineHeight: '1.6',
          marginBottom: '0.5rem',
          color: 'rgba(255, 255, 255, 0.9)'
        }}>
          {skill.inGame.summary}
        </p>
        <p style={{
          fontSize: '0.875rem',
          lineHeight: '1.5',
          color: 'rgba(255, 255, 255, 0.7)',
          fontStyle: 'italic'
        }}>
          {skill.inGame.effectText}
        </p>
      </div>

      {/* IRL Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{
          fontSize: '0.875rem',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: '0.75rem'
        }}>
          Real-World Application
        </h3>
        <p style={{
          fontSize: '1rem',
          lineHeight: '1.6',
          marginBottom: '0.5rem',
          color: 'rgba(255, 255, 255, 0.9)'
        }}>
          {skill.irl.summary}
        </p>
        <p style={{
          fontSize: '0.875rem',
          lineHeight: '1.5',
          color: 'rgba(255, 255, 255, 0.7)',
          fontStyle: 'italic'
        }}>
          {skill.irl.exampleUse}
        </p>
      </div>

      {/* Example Image Placeholder */}
      <div style={{
        marginBottom: '1.5rem',
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '0.5rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
          {skill.icon.value}
        </div>
        <p style={{
          fontSize: '0.7rem',
          color: 'rgba(255, 255, 255, 0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          Skill Illustration
        </p>
      </div>

      {/* Requirements */}
      {requirements.length > 0 && !isUnlocked && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h4 style={{
            fontSize: '0.75rem',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255, 255, 255, 0.6)',
            marginBottom: '0.5rem'
          }}>
            Requirements
          </h4>
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0
          }}>
            {requirements.map((req, idx) => (
              <li key={idx} style={{
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: '0.25rem',
                paddingLeft: '1rem',
                position: 'relative'
              }}>
                <span style={{
                  position: 'absolute',
                  left: 0,
                  color: 'rgba(255, 255, 255, 0.5)'
                }}>•</span>
                {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unlock Status */}
      {isUnlocked ? (
        <div style={{
          padding: '1rem',
          background: 'rgba(16, 185, 129, 0.2)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(16, 185, 129, 0.5)',
          textAlign: 'center',
          color: '#10b981',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontSize: '0.875rem'
        }}>
          ✓ Unlocked
        </div>
      ) : (
        <HoldToUnlockButton
          onUnlock={onUnlock}
          disabled={!canUnlock}
        />
      )}

      {/* Spacer to push content to top */}
      <div style={{ flex: 1 }} />
    </div>
  );
};

