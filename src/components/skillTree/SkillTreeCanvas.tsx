import React, { useMemo } from 'react';
import { SkillTreeNode, SkillDefinition } from '../../types/skillSystem';

interface SkillTreeCanvasProps {
  nodes: SkillTreeNode[];
  skills: Record<string, SkillDefinition>;
  unlockedNodeIds: string[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  branchAccentColor: string;
}

const NODE_SIZE = 60;
const NODE_SPACING_X = 180;
const NODE_SPACING_Y = 140;

export const SkillTreeCanvas: React.FC<SkillTreeCanvasProps> = ({
  nodes,
  skills,
  unlockedNodeIds,
  selectedNodeId,
  onSelectNode,
  branchAccentColor
}) => {
  // Calculate node positions
  const positionedNodes = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      x: node.position.col * NODE_SPACING_X + NODE_SPACING_X,
      y: node.position.row * NODE_SPACING_Y + NODE_SPACING_Y
    }));
  }, [nodes]);

  // Get canvas dimensions
  const canvasWidth = useMemo(() => {
    if (nodes.length === 0) return NODE_SPACING_X * 4;
    const maxCol = Math.max(...nodes.map(n => n.position.col));
    return (maxCol + 2) * NODE_SPACING_X;
  }, [nodes]);

  const canvasHeight = useMemo(() => {
    if (nodes.length === 0) return NODE_SPACING_Y * 4;
    const maxRow = Math.max(...nodes.map(n => n.position.row));
    return (maxRow + 2) * NODE_SPACING_Y;
  }, [nodes]);

  // Build connections
  const connections = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; fromUnlocked: boolean }> = [];
    
    positionedNodes.forEach(node => {
      if (node.requires.length > 0) {
        node.requires.forEach(reqNodeId => {
          const parentNode = positionedNodes.find(n => n.id === reqNodeId);
          if (parentNode) {
            const parentUnlocked = unlockedNodeIds.includes(parentNode.id);
            lines.push({
              x1: parentNode.x,
              y1: parentNode.y + NODE_SIZE / 2,
              x2: node.x,
              y2: node.y - NODE_SIZE / 2,
              fromUnlocked: parentUnlocked
            });
          }
        });
      }
    });
    
    return lines;
  }, [positionedNodes, unlockedNodeIds]);

  const isNodeUnlocked = (nodeId: string) => unlockedNodeIds.includes(nodeId);
  const isNodeSelected = (nodeId: string) => nodeId === selectedNodeId;
  const isRootNode = (node: SkillTreeNode) => node.requires.length === 0;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'auto',
      padding: '2rem',
      background: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '0.5rem'
    }}>
      {/* Connection lines */}
      <svg
        width={canvasWidth}
        height={canvasHeight}
        style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          pointerEvents: 'none',
          zIndex: 1
        }}
      >
        {connections.map((line, idx) => (
          <line
            key={idx}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.fromUnlocked ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'}
            strokeWidth="2"
            strokeDasharray={line.fromUnlocked ? '0' : '6,6'}
            opacity={line.fromUnlocked ? 1 : 0.5}
          />
        ))}
      </svg>

      {/* Skill Nodes */}
      <div style={{
        position: 'relative',
        width: canvasWidth,
        height: canvasHeight,
        zIndex: 2
      }}>
        {positionedNodes.map((node) => {
          const skill = skills[node.skillId];
          const unlocked = isNodeUnlocked(node.id);
          const selected = isNodeSelected(node.id);
          const isRoot = isRootNode(node);
          
          if (!skill) return null;

          // Root nodes are circular, others are diamond
          const isCircular = isRoot;

          return (
            <div
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              style={{
                position: 'absolute',
                left: `${node.x - NODE_SIZE / 2}px`,
                top: `${node.y - NODE_SIZE / 2}px`,
                width: isCircular ? NODE_SIZE * 1.2 : NODE_SIZE,
                height: isCircular ? NODE_SIZE * 1.2 : NODE_SIZE,
                cursor: 'pointer',
                transform: selected ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 0.2s ease',
                zIndex: selected ? 10 : unlocked ? 5 : 1,
                filter: selected ? `drop-shadow(0 0 12px ${branchAccentColor})` : 'none'
              }}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              {/* Root node - circular */}
              {isCircular ? (
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: unlocked
                    ? (selected 
                      ? `radial-gradient(circle, ${branchAccentColor} 0%, ${branchAccentColor}80 50%, ${branchAccentColor}40 100%)`
                      : `radial-gradient(circle, ${branchAccentColor}60 0%, ${branchAccentColor}30 100%)`)
                    : 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                  border: selected
                    ? `3px solid #eab308`
                    : unlocked
                      ? `2px solid ${branchAccentColor}`
                      : '2px solid rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: unlocked ? 1 : 0.5,
                  boxShadow: selected
                    ? `0 0 20px ${branchAccentColor}80, inset 0 0 20px rgba(255, 255, 255, 0.2)`
                    : unlocked
                      ? `0 4px 12px rgba(0, 0, 0, 0.4)`
                      : 'none'
                }}>
                  <span style={{
                    fontSize: '2rem',
                    opacity: unlocked ? 1 : 0.5
                  }}>
                    {skill.icon.value}
                  </span>
                </div>
              ) : (
                /* Child node - diamond */
                <div style={{
                  width: '100%',
                  height: '100%',
                  transform: 'rotate(45deg)',
                  background: unlocked
                    ? (selected 
                      ? `linear-gradient(135deg, ${branchAccentColor} 0%, ${branchAccentColor}CC 100%)`
                      : `linear-gradient(135deg, ${branchAccentColor}80 0%, ${branchAccentColor}40 100%)`)
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
                  border: selected
                    ? `3px solid #eab308`
                    : unlocked
                      ? `2px solid ${branchAccentColor}`
                      : '2px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: unlocked ? 1 : 0.5,
                  boxShadow: selected
                    ? `0 0 20px ${branchAccentColor}80, inset 0 0 20px rgba(255, 255, 255, 0.2)`
                    : unlocked
                      ? `0 4px 12px rgba(0, 0, 0, 0.4)`
                      : 'none'
                }}>
                  <div style={{
                    transform: 'rotate(-45deg)',
                    fontSize: '1.5rem',
                    opacity: unlocked ? 1 : 0.5
                  }}>
                    {skill.icon.value}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Node labels */}
      <div style={{
        position: 'absolute',
        top: '2rem',
        left: '2rem',
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 3
      }}>
        {positionedNodes.map((node) => {
          const skill = skills[node.skillId];
          const unlocked = isNodeUnlocked(node.id);
          const selected = isNodeSelected(node.id);
          const isRoot = isRootNode(node);
          
          if (!skill) return null;

          return (
            <div
              key={`label-${node.id}`}
              style={{
                position: 'absolute',
                left: `${node.x}px`,
                top: `${node.y + (isRoot ? NODE_SIZE * 0.7 : NODE_SIZE * 0.6)}px`,
                transform: 'translateX(-50%)',
                textAlign: 'center',
                pointerEvents: 'auto',
                cursor: 'pointer'
              }}
              onClick={() => onSelectNode(node.id)}
            >
              <div style={{
                fontSize: '0.75rem',
                color: unlocked ? (selected ? '#eab308' : '#fff') : 'rgba(255, 255, 255, 0.5)',
                fontWeight: selected ? 'bold' : unlocked ? '600' : 'normal',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                padding: '0.25rem 0.5rem',
                background: selected
                  ? `rgba(234, 179, 8, 0.3)`
                  : unlocked
                    ? 'rgba(0, 0, 0, 0.6)'
                    : 'rgba(0, 0, 0, 0.4)',
                borderRadius: '0.25rem',
                border: selected
                  ? '1px solid #eab308'
                  : unlocked
                    ? '1px solid rgba(255, 255, 255, 0.2)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                maxWidth: '140px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textShadow: selected ? '0 2px 4px rgba(0, 0, 0, 0.8)' : '0 1px 2px rgba(0, 0, 0, 0.6)'
              }}>
                {skill.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
