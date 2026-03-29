import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import BattlePass from '../components/BattlePass';
import { mergeSeason1FromStudentData } from '../utils/season1PlayerHydration';

/**
 * Season 1 — dedicated Battle Pass screen (Home links here).
 * Shows Season 1 progress summary + embedded legacy Battle Pass modal trigger for Season 0 rewards.
 */
const BattlePassSeasonPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [season1Xp, setSeason1Xp] = useState(0);
  const [tierHint, setTierHint] = useState(0);
  const [showLegacy, setShowLegacy] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!currentUser) return;
      try {
        const snap = await getDoc(doc(db, 'students', currentUser.uid));
        const xp = snap.exists() ? snap.data().xp || 0 : 0;
        const s1 = mergeSeason1FromStudentData(snap.exists() ? (snap.data().season1 as Record<string, unknown>) : undefined);
        const bpXp = s1.battlePass.battlePassXP > 0 ? s1.battlePass.battlePassXP : xp;
        setSeason1Xp(bpXp);
        setTierHint(Math.min(50, Math.floor(bpXp / 1000)));
      } catch (e) {
        console.error(e);
      }
    };
    run();
  }, [currentUser]);

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
        Season 1 centers on mastery of time and energy. Progress here ties to live participation, goals, and Flow. Legacy Season 0
        tracks remain available below.
      </p>
      <div
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          borderRadius: 12,
          background: 'rgba(15,23,42,0.6)',
          border: '1px solid rgba(99,102,241,0.35)',
          maxWidth: 480,
        }}
      >
        <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Season 1 battle pass XP (falls back to profile XP until dedicated XP accrues)</div>
        <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8 }}>{season1Xp} XP</div>
        <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
          Approx. tier band: {tierHint} — configure full tracks in Admin → Season 1. BP XP accrues from live events, goals, energy
          milestones, and streaks (services to wire incrementally).
        </div>
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
