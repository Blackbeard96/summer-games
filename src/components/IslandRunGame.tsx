import React from 'react';
import { useParams } from 'react-router-dom';

const IslandRunGame: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>🏝️ Island Raid Game</h1>
      <p>Game ID: {gameId}</p>
      <p style={{ color: '#6b7280', marginTop: '2rem' }}>
        Game implementation coming soon...
      </p>
      <p style={{ color: '#6b7280' }}>
        This will include:
      </p>
      <ul style={{ textAlign: 'left', display: 'inline-block', marginTop: '1rem' }}>
        <li>Team-based PvE combat</li>
        <li>Zombie hordes and hostile groups</li>
        <li>Artifact discovery system</li>
        <li>Sonido artifact objective</li>
        <li>Reward system (XP, PP, loot)</li>
      </ul>
    </div>
  );
};

export default IslandRunGame;

