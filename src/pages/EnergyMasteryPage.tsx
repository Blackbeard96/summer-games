import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { mergeSeason1FromStudentData } from '../utils/season1PlayerHydration';
import { energyXPForNextLevel, getEnergyLevelBonuses } from '../utils/season1Energy';
import type { EnergyType } from '../types/season1';

const ENERGY_META: { key: EnergyType; label: string; icon: string; blurb: string }[] = [
  { key: 'kinetic', label: 'Kinetic', icon: '⚡', blurb: 'Motion, action, Battle Royale intensity.' },
  { key: 'mental', label: 'Mental', icon: '🧠', blurb: 'Focus, recall, Quiz mastery.' },
  { key: 'emotional', label: 'Emotional', icon: '💜', blurb: 'Honesty, reflection, empathy.' },
  { key: 'spiritual', label: 'Spiritual', icon: '✨', blurb: 'Purpose, intention — Kon’s path.' },
];

const EnergyMasteryPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [slice, setSlice] = useState(mergeSeason1FromStudentData(undefined));

  useEffect(() => {
    const run = async () => {
      if (!currentUser) return;
      try {
        const snap = await getDoc(doc(db, 'students', currentUser.uid));
        setSlice(mergeSeason1FromStudentData(snap.exists() ? (snap.data().season1 as Record<string, unknown>) : undefined));
      } catch (e) {
        console.error(e);
      }
    };
    run();
  }, [currentUser]);

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '1.5rem' }}>
      <button
        type="button"
        onClick={() => navigate('/profile')}
        style={{ marginBottom: '1rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '0.5rem 1rem', borderRadius: 8, cursor: 'pointer' }}
      >
        ← Profile
      </button>
      <h1 style={{ margin: '0 0 0.5rem 0' }}>Energy Mastery</h1>
      <p style={{ maxWidth: 560, opacity: 0.85, lineHeight: 1.5 }}>
        Four tracks power Flow State. Earn energy in live modes; levels unlock bonuses (see descriptions). Missing Firestore data defaults safely to
        level 1 / zero pools.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
        }}
      >
        {ENERGY_META.map(({ key, label, icon, blurb }) => {
          const level = slice.energyLevels[key];
          const xp = slice.energyXP[key];
          const pool = slice.energies[key];
          const need = energyXPForNextLevel(level);
          const pct = Math.min(100, Math.round((xp / need) * 100));
          const bonus = getEnergyLevelBonuses(level);
          return (
            <div
              key={key}
              style={{
                background: 'linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98))',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 12,
                padding: '1.1rem',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>
                {icon} <strong>{label}</strong>
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: 8 }}>{blurb}</div>
              <div style={{ fontSize: '0.85rem' }}>Pool: {pool}</div>
              <div style={{ fontSize: '0.85rem' }}>Level: {level}</div>
              <div style={{ fontSize: '0.75rem', marginTop: 6, opacity: 0.75 }}>
                Next level: {xp} / {need} XP
              </div>
              <div style={{ height: 8, background: '#334155', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#22d3ee)' }} />
              </div>
              <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#a5b4fc' }}>
                <strong>{bonus.label}:</strong> {bonus.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EnergyMasteryPage;
