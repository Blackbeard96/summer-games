import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, addDoc, collection, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';

interface BattleRoom {
  id: string;
  hostId: string;
  hostName: string;
  hostLevel: number;
  status: 'waiting' | 'in-progress' | 'completed';
  createdAt: any;
  participants: string[];
  maxParticipants: number;
}

interface PvPBattleProps {
  onBack: () => void;
}

const PvPBattle: React.FC<PvPBattleProps> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const [userLevel, setUserLevel] = useState(1);
  const [battleRooms, setBattleRooms] = useState<BattleRoom[]>([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<BattleRoom | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch user level
  useEffect(() => {
    const fetchUserLevel = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserLevel(userData.level || 1);
        }
      } catch (error) {
        console.error('Error fetching user level:', error);
      }
    };

    fetchUserLevel();
  }, [currentUser]);

  // Listen for battle rooms
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'battleRooms'),
      where('status', 'in', ['waiting', 'in-progress']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rooms = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BattleRoom[];
      setBattleRooms(rooms);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const createBattleRoom = async () => {
    if (!currentUser || !vault) return;

    setLoading(true);
    try {
      const roomData = {
        hostId: currentUser.uid,
        hostName: currentUser.displayName || currentUser.email || 'Anonymous',
        hostLevel: userLevel,
        status: 'waiting',
        createdAt: serverTimestamp(),
        participants: [currentUser.uid],
        maxParticipants: 2
      };

      const docRef = await addDoc(collection(db, 'battleRooms'), roomData);
      
      // Get the created room
      const roomDoc = await getDoc(docRef);
      if (roomDoc.exists()) {
        const room = { id: docRef.id, ...roomDoc.data() } as BattleRoom;
        setCurrentRoom(room);
        setShowCreateRoom(false);
      }
    } catch (error) {
      console.error('Error creating battle room:', error);
      alert('Failed to create battle room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const joinBattleRoom = async (roomId: string) => {
    if (!currentUser) return;

    setLoading(true);
    try {
      const roomRef = doc(db, 'battleRooms', roomId);
      const roomDoc = await getDoc(roomRef);
      
      if (!roomDoc.exists()) {
        alert('Battle room not found.');
        return;
      }

      const room = roomDoc.data() as BattleRoom;
      
      if (room.participants.includes(currentUser.uid)) {
        alert('You are already in this battle room.');
        return;
      }

      if (room.participants.length >= room.maxParticipants) {
        alert('This battle room is full.');
        return;
      }

      // Add user to room
      await updateDoc(roomRef, {
        participants: [...room.participants, currentUser.uid],
        status: room.participants.length + 1 >= room.maxParticipants ? 'in-progress' : 'waiting'
      });

      // Set current room and start battle
      const updatedRoom = { ...room, participants: [...room.participants, currentUser.uid] };
      setCurrentRoom(updatedRoom);
      setShowBattleEngine(true);
    } catch (error) {
      console.error('Error joining battle room:', error);
      alert('Failed to join battle room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const leaveBattleRoom = async () => {
    if (!currentUser || !currentRoom) return;

    try {
      const roomRef = doc(db, 'battleRooms', currentRoom.id);
      const updatedParticipants = currentRoom.participants.filter(id => id !== currentUser.uid);
      
      if (updatedParticipants.length === 0) {
        // Delete room if empty
        await updateDoc(roomRef, { status: 'completed' });
      } else {
        // Update room
        await updateDoc(roomRef, {
          participants: updatedParticipants,
          status: 'waiting'
        });
      }

      setCurrentRoom(null);
      setShowBattleEngine(false);
    } catch (error) {
      console.error('Error leaving battle room:', error);
    }
  };

  const handleBattleEnd = (result: 'victory' | 'defeat' | 'escape') => {
    setShowBattleEngine(false);
    setCurrentRoom(null);
    
    if (result === 'victory') {
      alert('🎉 Victory! You won the PvP battle! Large PP + XP boost earned!');
    } else if (result === 'defeat') {
      alert('💀 Defeat! Better luck next time!');
    } else {
      alert('🏃 You escaped from battle!');
    }
  };

  if (showBattleEngine && currentRoom) {
    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>⚔️ PvP Battle in Progress</h3>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
              Room: {currentRoom.hostName} (Lv. {currentRoom.hostLevel})
            </p>
          </div>
          <button
            onClick={leaveBattleRoom}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Leave Battle
          </button>
        </div>
        
        <BattleEngine onBattleEnd={handleBattleEnd} />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            ⚔️ PvP Battle Arena
          </h2>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Challenge other players in real-time turn-based combat
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          ← Back to Modes
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Create Room */}
        <div style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏠</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Create Battle Room</h3>
          <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>
            Start a new battle room and wait for opponents to join
          </p>
          <button
            onClick={createBattleRoom}
            disabled={loading}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.75rem 2rem',
              borderRadius: '0.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
        </div>

        {/* Join Room */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚪</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Join Battle Room</h3>
          <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>
            Join an existing battle room to challenge other players
          </p>
          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            {battleRooms.length} room(s) available
          </div>
        </div>
      </div>

      {/* Available Rooms */}
      {battleRooms.length > 0 && (
        <div>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#374151'
          }}>
            Available Battle Rooms
          </h3>
          <div style={{
            display: 'grid',
            gap: '1rem'
          }}>
            {battleRooms.map((room) => (
              <div
                key={room.id}
                style={{
                  background: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ fontSize: '1.25rem' }}>⚔️</span>
                    <h4 style={{
                      fontSize: '1.125rem',
                      fontWeight: 'bold',
                      margin: 0,
                      color: '#374151'
                    }}>
                      {room.hostName}
                    </h4>
                    <span style={{
                      background: '#f3f4f6',
                      color: '#6b7280',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}>
                      Lv. {room.hostLevel}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6b7280'
                  }}>
                    {room.participants.length}/{room.maxParticipants} players • 
                    Status: <span style={{
                      color: room.status === 'waiting' ? '#10b981' : '#f59e0b',
                      fontWeight: '500'
                    }}>
                      {room.status === 'waiting' ? 'Waiting' : 'In Progress'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => joinBattleRoom(room.id)}
                  disabled={loading || room.participants.includes(currentUser?.uid || '') || room.status === 'in-progress'}
                  style={{
                    background: room.participants.includes(currentUser?.uid || '') || room.status === 'in-progress'
                      ? '#f3f4f6'
                      : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: room.participants.includes(currentUser?.uid || '') || room.status === 'in-progress'
                      ? '#9ca3af'
                      : 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: room.participants.includes(currentUser?.uid || '') || room.status === 'in-progress'
                      ? 'not-allowed'
                      : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  {room.participants.includes(currentUser?.uid || '') 
                    ? 'Already Joined' 
                    : room.status === 'in-progress' 
                      ? 'In Progress' 
                      : 'Join Battle'
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {battleRooms.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f9fafb',
          borderRadius: '0.75rem',
          border: '2px dashed #d1d5db'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏟️</div>
          <h3 style={{
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: '#374151',
            marginBottom: '0.5rem'
          }}>
            No Battle Rooms Available
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            Be the first to create a battle room and challenge other players!
          </p>
        </div>
      )}
    </div>
  );
};

export default PvPBattle;
