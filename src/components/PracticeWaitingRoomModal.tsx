import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { getLevelFromXP } from '../utils/leveling';

export interface PracticeRoom {
  id: string;
  hostId: string;
  hostName: string;
  hostLevel: number;
  status: 'waiting' | 'in-progress' | 'completed';
  createdAt: any;
  participants: string[];
  maxParticipants: number;
  hostPhotoURL?: string;
  selectedOpponentId: string; // ID of the CPU opponent selected
  selectedOpponentName: string; // Name of the CPU opponent
}

interface ParticipantData {
  id: string;
  name: string;
  level: number;
  photoURL?: string;
}

interface PracticeWaitingRoomModalProps {
  isOpen: boolean;
  onLeaveRoom: () => void;
  currentRoom: PracticeRoom | null;
  onParticipantsUpdate: (participants: ParticipantData[]) => void;
  onBattleStart: () => void;
  currentUserPhotoURL: string | null;
  currentUserName: string;
  currentUserLevel: number;
}

const PracticeWaitingRoomModal: React.FC<PracticeWaitingRoomModalProps> = ({
  isOpen,
  onLeaveRoom,
  currentRoom,
  onParticipantsUpdate,
  onBattleStart,
  currentUserPhotoURL,
  currentUserName,
  currentUserLevel,
}) => {
  const { currentUser } = useAuth();
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentRoom || !currentUser) return;

    setIsHost(currentRoom.hostId === currentUser.uid);

    // Listen for room updates
    const unsubscribe = onSnapshot(doc(db, 'practiceRooms', currentRoom.id), async (docSnapshot) => {
      if (!docSnapshot.exists()) {
        // Room was deleted
        onLeaveRoom();
        return;
      }

      const updatedRoom = { id: docSnapshot.id, ...docSnapshot.data() } as PracticeRoom;

      // Fetch participant data
      const participantDataPromises = updatedRoom.participants.map(async (participantId) => {
        try {
          const userDoc = await getDoc(doc(db, 'students', participantId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            return {
              id: participantId,
              name: userData.displayName || userData.name || 'Unknown Player',
              level: getLevelFromXP(userData.xp || 0),
              photoURL: userData.photoURL || null
            } as ParticipantData;
          }
        } catch (error) {
          console.error('Error fetching participant data:', error);
        }
        return null;
      });

      const participantData = (await Promise.all(participantDataPromises)).filter(
        (p): p is ParticipantData => p !== null
      );

      setParticipants(participantData);
      onParticipantsUpdate(participantData);

      // If room is full and status is in-progress, start battle
      if (updatedRoom.status === 'in-progress' && updatedRoom.participants.length >= 2) {
        onBattleStart();
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentRoom?.id, currentUser]);

  if (!isOpen || !currentRoom) return null;

  const participantsCount = participants.length;
  const isRoomFull = participantsCount >= currentRoom.maxParticipants;
  const canStart = isHost && participantsCount >= 2 && currentRoom.status === 'waiting';

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
        maxWidth: '700px',
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
          🎮 Practice Battle Room
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
            Opponent: <strong style={{ color: '#10b981' }}>
              {currentRoom.selectedOpponentName}
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

        {/* Participants List */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          marginBottom: '2rem',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#cbd5e0' }}>
            Participants
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem'
          }}>
            {participants.map((participant) => (
              <div key={participant.id} style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: participant.id === currentUser?.uid ? '2px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: '#1e293b',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#cbd5e0',
                  overflow: 'hidden',
                  margin: '0 auto 0.5rem',
                  border: '2px solid #60a5fa'
                }}>
                  {participant.photoURL ? (
                    <img 
                      src={participant.photoURL} 
                      alt={participant.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    participant.name.charAt(0).toUpperCase()
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 'bold' }}>
                  {participant.name}
                  {participant.id === currentUser?.uid && ' (You)'}
                </p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', opacity: 0.8 }}>
                  Level {participant.level}
                </p>
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({ length: currentRoom.maxParticipants - participantsCount }).map((_, index) => (
              <div key={`empty-${index}`} style={{
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px dashed rgba(255, 255, 255, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '120px'
              }}>
                <div style={{ fontSize: '2rem', opacity: 0.3 }}>👤</div>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', opacity: 0.5 }}>
                  Waiting...
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Status Message */}
        <div style={{
          background: isRoomFull ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 191, 36, 0.1)',
          border: `1px solid ${isRoomFull ? '#22c55e' : '#fbbf24'}`,
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '2rem'
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: '1.125rem',
            color: isRoomFull ? '#22c55e' : '#fbbf24'
          }}>
            {isRoomFull 
              ? '🎯 Room is full! Waiting for host to start...'
              : `⏳ Waiting for more players... (${participantsCount}/${currentRoom.maxParticipants})`
            }
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {canStart && (
            <button
              onClick={onBattleStart}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                padding: '1rem 2rem',
                borderRadius: '0.75rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
              }}
            >
              ▶️ Start Battle
            </button>
          )}
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
        </div>
      </div>
    </div>
  );
};

export default PracticeWaitingRoomModal;







