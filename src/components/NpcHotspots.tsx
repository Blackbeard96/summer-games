/**
 * NPC Hotspots Component
 * 
 * Renders clickable buttons over NPCs in the background image
 * Positioned absolutely using percentage coordinates
 */

import React from 'react';

interface NpcHotspot {
  id: 'sonido' | 'zeke' | 'luz' | 'kon';
  name: string;
  icon: string;
  x: number; // percentage
  y: number; // percentage
  color: string;
  glowColor: string;
}

const NPC_HOTSPOTS: NpcHotspot[] = [
  {
    id: 'sonido',
    name: 'Sonido',
    icon: '📻',
    x: 10,
    y: 28,
    color: '#667eea',
    glowColor: 'rgba(102, 126, 234, 0.6)'
  },
  {
    id: 'zeke',
    name: 'Zeke',
    icon: '⚡',
    x: 34,
    y: 50,
    color: '#f5576c',
    glowColor: 'rgba(245, 87, 108, 0.6)'
  },
  {
    id: 'luz',
    name: 'Luz',
    icon: '💡',
    x: 55,
    // Higher than Zeke/Kon: centered horizontally she sits over the Power Card; lower % = further up, clear of the panel
    y: 38,
    color: '#4facfe',
    glowColor: 'rgba(79, 172, 254, 0.6)'
  },
  {
    id: 'kon',
    name: 'Kon',
    icon: '🛡️',
    x: 83,
    y: 55,
    color: '#fa709a',
    glowColor: 'rgba(250, 112, 154, 0.6)'
  }
];

export type NpcHotspotId = 'sonido' | 'zeke' | 'luz' | 'kon';

interface NpcHotspotsProps {
  onNpcClick: (npcId: NpcHotspotId) => void;
  /** When true, this NPC has an incomplete / actionable hub mission — show a persistent glow. */
  npcMissionAttention?: Partial<Record<NpcHotspotId, boolean>>;
}

const NpcHotspots: React.FC<NpcHotspotsProps> = ({
  onNpcClick,
  npcMissionAttention = {},
}) => {
  const [hoveredNpc, setHoveredNpc] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const anyNpcAttention = NPC_HOTSPOTS.some(
    (npc) => npcMissionAttention[npc.id] === true
  );

  // On mobile, show a single "NPCs" button that opens a menu
  if (isMobile) {
    
    return (
      <>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            position: 'fixed',
            bottom: '120px',
            right: '1rem',
            background: 'rgba(59, 130, 246, 0.9)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${
              anyNpcAttention
                ? 'rgba(255, 255, 255, 0.65)'
                : 'rgba(255, 255, 255, 0.3)'
            }`,
            borderRadius: '2rem',
            padding: '0.75rem 1.25rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 100,
            boxShadow: anyNpcAttention
              ? '0 0 20px rgba(96, 165, 250, 0.85), 0 4px 12px rgba(0, 0, 0, 0.3)'
              : '0 4px 12px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            animation: anyNpcAttention
              ? 'hubNpcMenuButtonPulse 2.2s ease-in-out infinite'
              : 'none',
          }}
        >
          <span>👥</span>
          <span>NPCs</span>
        </button>
        
        {showMenu && (
          <div
            style={{
              position: 'fixed',
              bottom: '180px',
              right: '1rem',
              background: 'rgba(31, 41, 55, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '2px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '1rem',
              padding: '1rem',
              zIndex: 101,
              minWidth: '200px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {NPC_HOTSPOTS.map((npc) => (
              <button
                key={npc.id}
                onClick={() => {
                  onNpcClick(npc.id);
                  setShowMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: `linear-gradient(135deg, ${npc.color} 0%, ${npc.color}dd 100%)`,
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'transform 0.2s',
                  boxShadow:
                    npcMissionAttention[npc.id] === true
                      ? `0 0 16px ${npc.glowColor}, 0 2px 8px rgba(0,0,0,0.25)`
                      : '0 2px 6px rgba(0,0,0,0.2)',
                  animation:
                    npcMissionAttention[npc.id] === true
                      ? `npcAttentionPulse_${npc.id} 2.2s ease-in-out infinite`
                      : 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>{npc.icon}</span>
                <span>{npc.name}</span>
              </button>
            ))}
          </div>
        )}
        <style>{`
          @keyframes hubNpcMenuButtonPulse {
            0%, 100% { box-shadow: 0 0 14px rgba(96, 165, 250, 0.55), 0 4px 12px rgba(0, 0, 0, 0.3); }
            50% { box-shadow: 0 0 26px rgba(96, 165, 250, 0.95), 0 4px 14px rgba(0, 0, 0, 0.35); }
          }
          ${NPC_HOTSPOTS.map(
            (npc) => `
          @keyframes npcAttentionPulse_${npc.id} {
            0%, 100% {
              box-shadow: 0 0 12px ${npc.glowColor}, 0 0 24px ${npc.glowColor}, 0 2px 8px rgba(0, 0, 0, 0.22);
            }
            50% {
              box-shadow: 0 0 22px ${npc.glowColor}, 0 0 40px ${npc.glowColor}, 0 2px 10px rgba(0, 0, 0, 0.28);
            }
          }`
          ).join('')}
        `}</style>
      </>
    );
  }

  // Desktop: show individual hotspots
  return (
    <>
      {NPC_HOTSPOTS.map((npc) => {
        const hasMissionAttention = npcMissionAttention[npc.id] === true;
        const isHovered = hoveredNpc === npc.id;
        const idleShadow = hasMissionAttention
          ? `0 0 18px ${npc.glowColor}, 0 0 36px ${npc.glowColor}, 0 2px 8px rgba(0, 0, 0, 0.25)`
          : '0 2px 8px rgba(0, 0, 0, 0.2)';
        const hoverShadow = `0 0 20px ${npc.glowColor}, 0 4px 12px rgba(0, 0, 0, 0.3)`;
        return (
        <button
          key={npc.id}
          onClick={() => onNpcClick(npc.id)}
          onMouseEnter={() => setHoveredNpc(npc.id)}
          onMouseLeave={() => setHoveredNpc(null)}
          style={{
            position: 'fixed',
            left: `${npc.x}%`,
            top: `${npc.y}%`,
            transform: 'translate(-50%, -50%)',
            background: isHovered
              ? `linear-gradient(135deg, ${npc.color} 0%, ${npc.color}dd 100%)`
              : hasMissionAttention
                ? `linear-gradient(135deg, rgba(31, 41, 55, 0.92) 0%, rgba(55, 65, 81, 0.88) 100%)`
                : 'rgba(31, 41, 55, 0.85)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${
              isHovered
                ? npc.color
                : hasMissionAttention
                  ? npc.color
                  : 'rgba(255, 255, 255, 0.2)'
            }`,
            borderRadius: '2rem',
            padding: '0.5rem 1rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 120,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.3s ease',
            boxShadow: isHovered ? hoverShadow : idleShadow,
            animation: isHovered
              ? 'pulse 2s infinite'
              : hasMissionAttention
                ? `npcAttentionPulse_${npc.id} 2.2s ease-in-out infinite`
                : 'none'
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>{npc.icon}</span>
          <span>{npc.name}</span>
          {isHovered && (
            <span style={{ fontSize: '0.75rem', opacity: 0.8, marginLeft: '0.25rem' }}>
              Talk
            </span>
          )}
        </button>
        );
      })}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(102, 126, 234, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(102, 126, 234, 0.8), 0 4px 12px rgba(0, 0, 0, 0.3);
          }
        }
        ${NPC_HOTSPOTS.map(
          (npc) => `
        @keyframes npcAttentionPulse_${npc.id} {
          0%, 100% {
            box-shadow: 0 0 12px ${npc.glowColor}, 0 0 24px ${npc.glowColor}, 0 2px 8px rgba(0, 0, 0, 0.22);
          }
          50% {
            box-shadow: 0 0 22px ${npc.glowColor}, 0 0 40px ${npc.glowColor}, 0 2px 10px rgba(0, 0, 0, 0.28);
          }
        }`
        ).join('')}
      `}</style>
    </>
  );
};

export default NpcHotspots;

