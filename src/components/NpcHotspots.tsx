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
    y: 56,
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

interface NpcHotspotsProps {
  onNpcClick: (npcId: 'sonido' | 'zeke' | 'luz' | 'kon') => void;
}

const NpcHotspots: React.FC<NpcHotspotsProps> = ({ onNpcClick }) => {
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
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '2rem',
            padding: '0.75rem 1.25rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
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
                  transition: 'transform 0.2s'
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
      </>
    );
  }

  // Desktop: show individual hotspots
  return (
    <>
      {NPC_HOTSPOTS.map((npc) => (
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
            background: hoveredNpc === npc.id
              ? `linear-gradient(135deg, ${npc.color} 0%, ${npc.color}dd 100%)`
              : 'rgba(31, 41, 55, 0.85)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${hoveredNpc === npc.id ? npc.color : 'rgba(255, 255, 255, 0.2)'}`,
            borderRadius: '2rem',
            padding: '0.5rem 1rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.3s ease',
            boxShadow: hoveredNpc === npc.id
              ? `0 0 20px ${npc.glowColor}, 0 4px 12px rgba(0, 0, 0, 0.3)`
              : '0 2px 8px rgba(0, 0, 0, 0.2)',
            animation: hoveredNpc === npc.id ? 'pulse 2s infinite' : 'none'
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>{npc.icon}</span>
          <span>{npc.name}</span>
          {hoveredNpc === npc.id && (
            <span style={{ fontSize: '0.75rem', opacity: 0.8, marginLeft: '0.25rem' }}>
              Talk
            </span>
          )}
        </button>
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(102, 126, 234, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(102, 126, 234, 0.8), 0 4px 12px rgba(0, 0, 0, 0.3);
          }
        }
      `}</style>
    </>
  );
};

export default NpcHotspots;

