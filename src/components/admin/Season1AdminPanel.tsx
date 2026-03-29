import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { SKILL_CARDS_CATALOG } from '../../data/skillCardsCatalog';
import { ENERGY_LEVEL_BONUSES } from '../../utils/season1Energy';
import BattlePassSeasonAdmin from './BattlePassSeasonAdmin';

const SETTINGS_PATH = 'adminSettings/season1';

/**
 * Admin — Season 1 tuning (Firestore-backed).
 * Stores global defaults; students still use merged `season1` on their profile.
 */
const Season1AdminPanel: React.FC = () => {
  const [energyTickCap, setEnergyTickCap] = useState(25);
  const [awakenedFlowTest, setAwakenedFlowTest] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, SETTINGS_PATH));
        if (snap.exists()) {
          const d = snap.data();
          setEnergyTickCap(Number(d.energyTickCap) || 25);
          setAwakenedFlowTest(!!d.awakenedFlowTestMode);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    setStatus('Saving…');
    try {
      await setDoc(
        doc(db, SETTINGS_PATH),
        {
          energyTickCap,
          awakenedFlowTestMode: awakenedFlowTest,
          energyLevelBonuses: ENERGY_LEVEL_BONUSES,
          skillCardCatalogVersion: 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setStatus('Saved.');
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading Season 1 admin…</div>;

  return (
    <div style={{ background: '#f8fafc', borderRadius: 12, padding: '2rem', border: '1px solid #e5e7eb', maxWidth: 1280 }}>
      <h2 style={{ marginTop: 0 }}>Season 1 — Flow &amp; Energy</h2>
      <p style={{ color: '#64748b', lineHeight: 1.5 }}>
        Tune client-visible caps and test flags. Battle pass seasons should live in <code>seasons/&#123;id&#125;</code> (extend UI as needed).
      </p>
      <label style={{ display: 'block', marginTop: 16 }}>
        <span style={{ fontWeight: 600 }}>Max energy per client tick</span>
        <input
          type="number"
          value={energyTickCap}
          onChange={(e) => setEnergyTickCap(Number(e.target.value) || 0)}
          style={{ display: 'block', marginTop: 8, padding: 8, width: 120, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <input type="checkbox" checked={awakenedFlowTest} onChange={(e) => setAwakenedFlowTest(e.target.checked)} />
        <span>Awakened Flow test mode (clients should read this flag from session or settings)</span>
      </label>
      <button
        type="button"
        onClick={save}
        style={{
          marginTop: 20,
          background: '#4f46e5',
          color: '#fff',
          border: 'none',
          padding: '0.65rem 1.25rem',
          borderRadius: 8,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Save settings
      </button>
      {status && <p style={{ marginTop: 12 }}>{status}</p>}

      <BattlePassSeasonAdmin />

      <hr style={{ margin: '2rem 0', borderColor: '#e2e8f0' }} />
      <h3>Skill cards (seed catalog)</h3>
      <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{SKILL_CARDS_CATALOG.length} cards in code — mirror to Firestore collection <code>skillCards</code> for live edits.</p>
      <ul style={{ fontSize: '0.875rem' }}>
        {SKILL_CARDS_CATALOG.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong> — {c.rarity} / {c.energyType}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Season1AdminPanel;
