import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BattlePass from '../components/BattlePass';

/**
 * Season 1 — dedicated Battle Pass route (`/battle-pass`).
 * Season 1 track is not live yet; Season 0 rewards remain available via the button below.
 */
const BattlePassSeasonPage: React.FC = () => {
  const navigate = useNavigate();
  const [showLegacy, setShowLegacy] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)', color: '#fff', padding: '1.5rem' }}>
      <button
        type="button"
        onClick={() => navigate('/home')}
        style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer' }}
      >
        ← Home
      </button>
      <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>Battle Pass — Flow State</h1>
      <p style={{ opacity: 0.85, maxWidth: 560, lineHeight: 1.5 }}>
        Season 1 centers on mastery of time and energy. The full Season 1 battle pass is not available yet — check back soon. Legacy
        Season 0 tracks stay open below.
      </p>
      <div
        style={{
          marginTop: '1.5rem',
          padding: '2rem 1.5rem',
          borderRadius: 12,
          background: 'rgba(15,23,42,0.75)',
          border: '1px solid rgba(129,140,248,0.45)',
          maxWidth: 480,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 700, marginBottom: '0.75rem' }}>
          Season 1
        </div>
        <div style={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '0.75rem' }}>Coming Soon</div>
        <p style={{ margin: 0, fontSize: '0.95rem', opacity: 0.88, lineHeight: 1.55 }}>
          Rewards, tiers, and progression for this season are still being built. You can still use the Season 0 battle pass for claims and
          rewards.
        </p>
      </div>
      <div style={{ marginTop: '2rem' }}>
        <button
          type="button"
          onClick={() => setShowLegacy(true)}
          style={{
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.5)',
            color: '#fde68a',
            padding: '0.75rem 1.25rem',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Open Season 0 Battle Pass (rewards & claims)
        </button>
      </div>
      <BattlePass isOpen={showLegacy} onClose={() => setShowLegacy(false)} season={0} />
    </div>
  );
};

export default BattlePassSeasonPage;
