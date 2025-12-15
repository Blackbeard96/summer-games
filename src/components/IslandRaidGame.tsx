import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import IslandRaidBattle from './IslandRaidBattle';

const IslandRaidGame: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lobbyId, setLobbyId] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !currentUser) return;

    const gameRef = doc(db, 'islandRaidGames', gameId);
    const unsubscribe = onSnapshot(gameRef, async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setGame({
          id: docSnapshot.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        });
        setLobbyId(data.lobbyId);
        setLoading(false);
      } else {
        // Game doesn't exist, redirect to Island Raid page
        navigate('/island-raid');
      }
    }, (error) => {
      // Suppress Firestore internal assertion errors
      if (error.message?.includes('INTERNAL ASSERTION FAILED') || 
          error.message?.includes('Unexpected state')) {
        return;
      }
      console.error('Error listening to game:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [gameId, currentUser, navigate]);

  const handleLeave = () => {
    navigate('/island-raid');
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading Island Raid...</div>
      </div>
    );
  }

  if (!game || !lobbyId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Game not found.</div>
        <button onClick={handleLeave} style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: 'pointer'
        }}>
          Return to Island Raid
        </button>
      </div>
    );
  }

  return (
    <IslandRaidBattle
      gameId={gameId!}
      lobbyId={lobbyId}
      onLeave={handleLeave}
    />
  );
};

export default IslandRaidGame;




