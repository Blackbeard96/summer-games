import React, { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { BattleRoom } from './PvPBattle';
import { useAuth } from '../context/AuthContext';

interface OpponentData {
  id: string;
  name: string;
  currentPP: number;
  maxPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  level: number;
  photoURL?: string;
}

interface WaitingRoomModalProps {
  isOpen: boolean;
  onLeaveRoom: () => void;
  currentRoom: BattleRoom | null;
  onOpponentJoined: (opponent: OpponentData) => void;
  currentUserPhotoURL: string | null;
  currentUserName: string;
  currentUserLevel: number;
}

const WaitingRoomModal: React.FC<WaitingRoomModalProps> = ({
  isOpen,
  onLeaveRoom,
  currentRoom,
  onOpponentJoined,
  currentUserPhotoURL,
  currentUserName,
  currentUserLevel,
}) => {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!isOpen || !currentRoom || !currentUser) return;

    const initialParticipantCount = currentRoom.participants.length;

    // Listen for room updates to detect when opponent joins
    const unsubscribe = onSnapshot(doc(db, 'battleRooms', currentRoom.id), async (docSnapshot) => {
      if (!docSnapshot.exists()) return;

      const updatedRoom = { id: docSnapshot.id, ...docSnapshot.data() } as BattleRoom;
      
      // Check if opponent joined (participants length increased from 1 to 2)
      // Or if room status changed to in-progress (both players are ready)
      if ((updatedRoom.participants.length === 2 && initialParticipantCount === 1) ||
          (updatedRoom.status === 'in-progress' && updatedRoom.participants.length === 2)) {
        // Opponent joined! Find the opponent ID (the one who is not the current user)
        const currentUserId = currentUser.uid;
        const opponentId = updatedRoom.participants.find(p => p !== currentUserId);
        
        if (opponentId) {
          try {
            const { getDoc } = await import('firebase/firestore');
            const { getLevelFromXP } = await import('../utils/leveling');
            
            const [opponentStudent, opponentVault] = await Promise.all([
              getDoc(doc(db, 'students', opponentId)),
              getDoc(doc(db, 'vaults', opponentId))
            ]);

            if (opponentStudent.exists() && opponentVault.exists()) {
              const studentData = opponentStudent.data();
              const vaultData = opponentVault.data();
              const opponentLevel = getLevelFromXP(studentData.xp || 0);

              const opponent: OpponentData = {
                id: opponentId,
                name: studentData.displayName || studentData.name || 'Unknown Player',
                currentPP: vaultData.currentPP || 0,
                maxPP: vaultData.capacity || 1000,
                shieldStrength: vaultData.shieldStrength || 0,
                maxShieldStrength: vaultData.maxShieldStrength || 100,
                level: opponentLevel,
                photoURL: studentData.photoURL || null
              };

              onOpponentJoined(opponent);
            }
          } catch (error) {
            console.error('Error fetching opponent data:', error);
          }
        }
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentRoom?.id, onOpponentJoined]);

  if (!isOpen || !currentRoom) return null;

  const getRiskLevelColor = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'easy': return '#22c55e'; // Green
      case 'medium': return '#fbbf24'; // Yellow
      case 'high': return '#ef4444'; // Red
      default: return '#6b7280'; // Grey
    }
  };

  const getRiskLevelLabel = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'easy': return 'Easy (10% at risk)';
      case 'medium': return 'Medium (20% at risk)';
      case 'high': return 'High (25% at risk)';
      default: return 'Unknown Risk';
    }
  };

  const participantsCount = currentRoom.participants.length;
  const isWaitingForOpponent = participantsCount < currentRoom.maxParticipants;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
      padding: '2rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        padding: '3rem',
        borderRadius: '1.5rem',
        textAlign: 'center',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        border: '2px solid #334155'
      }}>
        <h2 style={{ 
          fontSize: '2.5rem', 
          marginBottom: '2rem', 
          color: '#60a5fa',
          textShadow: '0 0 20px rgba(96, 165, 250, 0.5)'
        }}>
          {isWaitingForOpponent ? '⏳ Waiting for Opponent...' : '🎯 Opponent Found!'}
        </h2>

        {/* Battle Room Info */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          marginBottom: '2rem',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
            Risk Level: <strong style={{ color: getRiskLevelColor(currentRoom.riskLevel) }}>
              {getRiskLevelLabel(currentRoom.riskLevel)}
            </strong>
          </div>
          <div style={{ fontSize: '1rem', opacity: 0.8, marginBottom: '0.5rem' }}>
            Players: {participantsCount}/{currentRoom.maxParticipants}
          </div>
          <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>
            Room ID: <code style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
              {currentRoom.id.substring(0, 12)}...
            </code>
          </div>
        </div>

        {/* Player vs Opponent Display */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: '3rem', 
          marginBottom: '2rem' 
        }}>
          {/* Current User */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '3rem',
              fontWeight: 'bold',
              color: '#cbd5e0',
              overflow: 'hidden',
              margin: '0 auto 1rem',
              border: '4px solid #60a5fa',
              boxShadow: '0 0 20px rgba(96, 165, 250, 0.3)'
            }}>
              {currentUserPhotoURL ? (
                <img 
                  src={currentUserPhotoURL} 
                  alt="You" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              ) : (
                currentUserName.charAt(0).toUpperCase()
              )}
            </div>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{currentUserName}</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', opacity: 0.8 }}>Level {currentUserLevel}</p>
          </div>

          {/* VS Divider */}
          <div style={{ 
            fontSize: '3rem', 
            color: '#64748b',
            fontWeight: 'bold',
            textShadow: '0 0 10px rgba(100, 116, 139, 0.5)'
          }}>
            VS
          </div>

          {/* Opponent Placeholder */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '3rem',
              fontWeight: 'bold',
              color: '#64748b',
              margin: '0 auto 1rem',
              border: '4px solid #64748b',
              boxShadow: '0 0 20px rgba(100, 116, 139, 0.2)',
              animation: isWaitingForOpponent ? 'pulse 2s infinite' : 'none'
            }}>
              {isWaitingForOpponent ? '?' : '👤'}
            </div>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#64748b' }}>
              {isWaitingForOpponent ? 'Waiting...' : 'Opponent'}
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', opacity: 0.6 }}>
              {isWaitingForOpponent ? 'Searching...' : 'Joined'}
            </p>
          </div>
        </div>

        {/* Status Message */}
        <div style={{
          background: isWaitingForOpponent ? 'rgba(251, 191, 36, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          border: `1px solid ${isWaitingForOpponent ? '#fbbf24' : '#22c55e'}`,
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '2rem'
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: '1.125rem',
            color: isWaitingForOpponent ? '#fbbf24' : '#22c55e'
          }}>
            {isWaitingForOpponent 
              ? '⏳ Waiting for another player to join...'
              : '🎯 Battle starting soon!'
            }
          </p>
        </div>

        {/* Leave Room Button */}
        {isWaitingForOpponent && (
          <button
            onClick={onLeaveRoom}
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white',
              padding: '1rem 2rem',
              borderRadius: '0.75rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
            }}
          >
            🚪 Leave Room
          </button>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { 
              transform: scale(1);
              opacity: 0.6;
            }
            50% { 
              transform: scale(1.1);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default WaitingRoomModal;

