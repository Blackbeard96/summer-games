import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { MANIFEST_EVOLUTION_LEVELS } from '../data/manifestSkillEvolution';
import { mergeSeason1FromStudentData } from '../utils/season1PlayerHydration';

/**
 * Player-facing manifest evolution (BG3-style tiers).
 * Purchasing deducts PP from students doc and records level in season1.unlockedManifestSkillLevels.
 */
const ManifestSkillEvolutionPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const manifestKey = 'manifest_primary';
  const [pp, setPp] = useState(0);
  const [unlocked, setUnlocked] = useState(1);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!currentUser) return;
    try {
      const snap = await getDoc(doc(db, 'students', currentUser.uid));
      if (!snap.exists()) return;
      const d = snap.data();
      setPp(d.powerPoints || 0);
      const s1 = mergeSeason1FromStudentData(d.season1 as Record<string, unknown>);
      const prog = s1.unlockedManifestSkillLevels[manifestKey];
      setUnlocked(prog?.currentLevel ?? 1);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [currentUser]);

  const purchase = async (targetLevel: number) => {
    if (!currentUser) return;
    const cfg = MANIFEST_EVOLUTION_LEVELS.find((c) => c.level === targetLevel);
    if (!cfg || targetLevel <= unlocked) return;
    if (pp < cfg.unlockCostPP) {
      setMsg(`Need ${cfg.unlockCostPP} PP (have ${pp}).`);
      return;
    }
    setMsg('Processing…');
    try {
      const ref = doc(db, 'students', currentUser.uid);
      const snap = await getDoc(ref);
      const d = snap.data() || {};
      const s1 = mergeSeason1FromStudentData(d.season1 as Record<string, unknown>);
      const prevLvls = s1.unlockedManifestSkillLevels[manifestKey]?.unlockedLevels || [];
      const nextLevels = Array.from(new Set([...prevLvls, targetLevel])).sort((a, b) => a - b);
      await updateDoc(ref, {
        powerPoints: (d.powerPoints || 0) - cfg.unlockCostPP,
        season1: {
          ...s1,
          unlockedManifestSkillLevels: {
            ...s1.unlockedManifestSkillLevels,
            [manifestKey]: {
              currentLevel: targetLevel,
              unlockedLevels: nextLevels,
            },
          },
        },
        manifestEvolutionUpdatedAt: serverTimestamp(),
      });
      setMsg(`Unlocked level ${targetLevel}! Next: customize in admin-equivalent flow (guided UI follow-up).`);
      await load();
    } catch (e) {
      setMsg(`Error: ${String(e)}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#faf5ff', padding: '1.5rem', color: '#1e1b4b' }}>
      <button type="button" onClick={() => navigate('/profile')} style={{ marginBottom: 12, cursor: 'pointer' }}>
        ← Profile
      </button>
      <h1 style={{ marginTop: 0 }}>Manifest skill evolution</h1>
      <p style={{ maxWidth: 640, lineHeight: 1.5 }}>
        Level 1 is your base manifest skill. Higher levels raise max targets: 2 → 3 → 4 → whole class. After purchase, use the same customization
        patterns as skill authoring (player-safe pools — wire ManifestAdmin constraints next).
      </p>
      <p>
        <strong>Your PP:</strong> {pp} — <strong>Current manifest tier:</strong> {unlocked}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
        {MANIFEST_EVOLUTION_LEVELS.filter((c) => c.level > 1).map((c) => (
          <div
            key={c.level}
            style={{
              border: '1px solid #e9d5ff',
              borderRadius: 10,
              padding: '1rem',
              background: unlocked >= c.level ? '#ecfccb' : 'white',
            }}
          >
            <strong>Level {c.level}</strong> — {c.maxTargets === 999 ? 'Whole class' : `Up to ${c.maxTargets} targets`} —{' '}
            <strong>{c.unlockCostPP} PP</strong>
            <div style={{ fontSize: '0.875rem', marginTop: 6 }}>{c.description}</div>
            {unlocked < c.level && (
              <button
                type="button"
                onClick={() => purchase(c.level)}
                style={{
                  marginTop: 10,
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Unlock
              </button>
            )}
            {unlocked >= c.level && <div style={{ marginTop: 8, fontWeight: 600 }}>Unlocked</div>}
          </div>
        ))}
      </div>
      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
    </div>
  );
};

export default ManifestSkillEvolutionPage;
