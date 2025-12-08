import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, collection, getDocs, query, where, onSnapshot, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { IslandRunLobby, IslandRunTeam } from '../types/islandRun';

const IslandRun: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<IslandRunLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateLobby, setShowCreateLobby] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'normal' | 'hard' | 'nightmare'>('normal');

  // Block hard and nightmare difficulties
  const handleDifficultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'easy' | 'normal' | 'hard' | 'nightmare';
    if (value === 'hard' || value === 'nightmare') {
      // Don't allow selection of blocked difficulties
      return;
    }
    setSelectedDifficulty(value);
  };

  // Reset to normal if somehow hard or nightmare is selected
  useEffect(() => {
    if (selectedDifficulty === 'hard' || selectedDifficulty === 'nightmare') {
      setSelectedDifficulty('normal');
    }
  }, [selectedDifficulty]);

  useEffect(() => {
    if (!currentUser) return;

    // Listen for active lobbies
    const lobbiesRef = collection(db, 'islandRunLobbies');
    const q = query(lobbiesRef, where('status', 'in', ['waiting', 'starting']));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lobbyList: IslandRunLobby[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        lobbyList.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          players: data.players || []
        } as IslandRunLobby);
      });
      setLobbies(lobbyList);
      setLoading(false);
    }, (error) => {
      // Suppress Firestore internal assertion errors (known Firefox issue)
      if (error.message?.includes('INTERNAL ASSERTION FAILED') || 
          error.message?.includes('Unexpected state')) {
        return;
      }
      console.error('Error listening to lobbies:', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleCreateLobby = async () => {
    if (!currentUser || !newLobbyName.trim()) return;

    // Block hard and nightmare difficulties
    if (selectedDifficulty === 'hard' || selectedDifficulty === 'nightmare') {
      alert('Hard and Nightmare difficulties are coming soon! Please select Easy or Normal.');
      return;
    }

    try {
      const lobbyData = {
        name: newLobbyName,
        hostId: currentUser.uid,
        maxPlayers: 4,
        currentPlayers: 1,
        difficulty: selectedDifficulty,
        status: 'waiting' as const,
        players: [{
          userId: currentUser.uid,
          displayName: currentUser.displayName || 'Player',
          photoURL: currentUser.photoURL,
          isReady: false,
          isLeader: true
        }],
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'islandRunLobbies'), lobbyData);
      navigate(`/island-raid/lobby/${docRef.id}`);
    } catch (error) {
      console.error('Error creating lobby:', error);
      alert('Failed to create lobby. Please try again.');
    }
  };

  const handleJoinLobby = (lobbyId: string) => {
    navigate(`/island-raid/lobby/${lobbyId}`);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading Island Raid lobbies...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏝️ Island Raid</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
          Team up and survive the zombie hordes to find Sonido's artifact!
        </p>
      </div>

      {/* Create Lobby Button */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <button
          onClick={() => setShowCreateLobby(!showCreateLobby)}
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '1rem 2rem',
            fontSize: '1.125rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
        >
          ➕ Create New Lobby
        </button>
      </div>

      {/* Create Lobby Form */}
      {showCreateLobby && (
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Create Island Raid Lobby</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Lobby Name
            </label>
            <input
              type="text"
              value={newLobbyName}
              onChange={(e) => setNewLobbyName(e.target.value)}
              placeholder="Enter lobby name..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                fontSize: '1rem'
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Difficulty
            </label>
            <select
              value={selectedDifficulty}
              onChange={handleDifficultyChange}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                fontSize: '1rem'
              }}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard" disabled>Hard - Coming Soon</option>
              <option value="nightmare" disabled>Nightmare - Coming Soon</option>
            </select>
            {(selectedDifficulty === 'hard' || selectedDifficulty === 'nightmare') && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '0.5rem',
                color: '#92400e',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>⏳</span>
                <span>This difficulty is coming soon! Please select Easy or Normal.</span>
              </div>
            )}
          </div>
          <button
            onClick={handleCreateLobby}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginRight: '1rem'
            }}
          >
            Create Lobby
          </button>
          <button
            onClick={() => setShowCreateLobby(false)}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Lobbies List */}
      <div>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Available Lobbies</h2>
        {lobbies.length === 0 ? (
          <div style={{
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            No active lobbies. Create one to get started!
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {lobbies.map((lobby) => (
              <div
                key={lobby.id}
                style={{
                  background: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '1rem',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>{lobby.name}</h3>
                  <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    <div>Difficulty: <strong>{lobby.difficulty.toUpperCase()}</strong></div>
                    <div>Players: {lobby.currentPlayers} / {lobby.maxPlayers}</div>
                    <div>Status: {lobby.status === 'waiting' ? '⏳ Waiting' : '🚀 Starting'}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleJoinLobby(lobby.id)}
                  disabled={lobby.currentPlayers >= lobby.maxPlayers}
                  style={{
                    background: lobby.currentPlayers >= lobby.maxPlayers
                      ? '#d1d5db'
                      : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: lobby.currentPlayers >= lobby.maxPlayers ? 'not-allowed' : 'pointer',
                    opacity: lobby.currentPlayers >= lobby.maxPlayers ? 0.6 : 1
                  }}
                >
                  {lobby.currentPlayers >= lobby.maxPlayers ? 'Full' : 'Join'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IslandRun;

