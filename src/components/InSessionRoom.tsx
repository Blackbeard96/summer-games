import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { InSessionRoom, InSessionLaw } from '../types/inSession';

const InSessionRoomView: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<InSessionRoom | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId || !currentUser) return;

    const roomRef = doc(db, 'inSessionRooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setRoom({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          startedAt: data.startedAt?.toDate(),
          endedAt: data.endedAt?.toDate(),
          players: data.players || [],
          activeLaws: data.activeLaws || []
        } as InSessionRoom);
        setLoading(false);
      } else {
        navigate('/in-session');
      }
    }, (error) => {
      // Suppress Firestore internal assertion errors (known Firefox issue)
      if (error.message?.includes('INTERNAL ASSERTION FAILED') || 
          error.message?.includes('Unexpected state')) {
        return;
      }
      console.error('Error listening to room:', error);
    });

    return () => unsubscribe();
  }, [roomId, currentUser, navigate]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading session room...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Room not found.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚 {room.className}</h1>
        <p style={{ fontSize: '1rem', opacity: 0.9 }}>
          Status: <strong>{room.status === 'open' ? '⏳ Open' : room.status === 'active' ? '🔥 Active' : '🔒 Closed'}</strong>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Players List */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '1.5rem'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>Players ({room.players.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {room.players.map((player) => (
              <div
                key={player.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: player.userId === currentUser?.uid ? '2px solid #3b82f6' : '1px solid #e5e7eb'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {player.photoURL && (
                    <img
                      src={player.photoURL}
                      alt={player.displayName}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%'
                      }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold' }}>
                      {player.displayName}
                      {player.isTeacher && ' 👨‍🏫'}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Level {player.level} • {player.battlesWon}W / {player.battlesLost}L
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Laws */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '1.5rem'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>Active Laws ({room.activeLaws.length})</h2>
          {room.activeLaws.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
              No active laws. Create one using your Power Card moves!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {room.activeLaws.map((law) => (
                <div
                  key={law.id}
                  style={{
                    padding: '1rem',
                    background: '#fef3c7',
                    border: '2px solid #f59e0b',
                    borderRadius: '0.5rem'
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    📜 {law.title}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem' }}>
                    {law.description}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#92400e' }}>
                    By: {law.createdByName} • {law.votes.support.length} 👍 / {law.votes.oppose.length} 👎
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Placeholder for battle interface */}
      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '1rem',
        padding: '2rem',
        marginTop: '2rem',
        textAlign: 'center'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Battle Interface</h2>
        <p style={{ color: '#6b7280' }}>
          Battle interface and law creation system coming soon...
        </p>
      </div>
    </div>
  );
};

export default InSessionRoomView;

