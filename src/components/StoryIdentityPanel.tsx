/**
 * Compact Story / Identity editor for Power Card & Profile (Guide, Code, Enemy).
 */

import React, { useEffect, useState } from 'react';
import {
  STORY_ENEMY_TYPE_LABELS,
  defaultStoryIdentity,
  type StoryEnemyType,
  type StoryIdentity,
} from '../types/classroomOsIdentity';
import { REPUTATION_STATUS_LABELS, type PlayerReputation } from '../types/classroomOsIdentity';
import {
  fetchPlayerReputation,
  fetchStoryIdentity,
  saveStoryIdentity,
} from '../utils/classroomOsIdentityService';

interface StoryIdentityPanelProps {
  userId: string;
  compact?: boolean;
}

const StoryIdentityPanel: React.FC<StoryIdentityPanelProps> = ({ userId, compact }) => {
  const [identity, setIdentity] = useState<StoryIdentity>(defaultStoryIdentity());
  const [reputation, setReputation] = useState<PlayerReputation | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [id, rep] = await Promise.all([
        fetchStoryIdentity(userId),
        fetchPlayerReputation(userId),
      ]);
      if (!cancelled) {
        setIdentity(id);
        setReputation(rep);
      }
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSave = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await saveStoryIdentity(userId, identity);
      setSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    marginBottom: '0.65rem',
    padding: '0.5rem 0.65rem',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#0f172a',
    boxSizing: 'border-box',
  };

  return (
    <section
      style={{
        background: compact
          ? 'rgba(15, 23, 42, 0.85)'
          : 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
        border: compact ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid #cbd5e1',
        borderRadius: 12,
        padding: '1rem',
        color: compact ? '#e2e8f0' : '#0f172a',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>Story / Identity</h3>
      <p style={{ marginTop: 0, fontSize: '0.85rem', opacity: 0.85 }}>
        Reflective fields only — they do not change grades. Evidence of what guides you.
      </p>

      {reputation && (
        <div
          style={{
            marginBottom: '0.85rem',
            padding: '0.65rem',
            borderRadius: 8,
            background: compact ? 'rgba(30, 41, 59, 0.9)' : '#fff',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            fontSize: '0.85rem',
          }}
        >
          <strong>Reputation:</strong>{' '}
          {REPUTATION_STATUS_LABELS[reputation.currentReputationStatus]} · Streak{' '}
          {reputation.currentGoalStreak} · Achieved {reputation.goalsAchieved}/
          {reputation.goalsDeclared || 0}
        </div>
      )}

      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>
        GUIDE — What currently guides your decisions?
      </label>
      <textarea
        value={identity.guide}
        onChange={(e) => setIdentity({ ...identity, guide: e.target.value })}
        rows={2}
        style={fieldStyle}
      />

      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>
        CODE — What is one rule you try to live by?
      </label>
      <textarea
        value={identity.code}
        onChange={(e) => setIdentity({ ...identity, code: e.target.value })}
        rows={2}
        style={fieldStyle}
      />

      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>
        PRIMARY ENEMY — What gets between you and who you are becoming?
      </label>
      <input
        value={identity.primaryEnemy}
        onChange={(e) => setIdentity({ ...identity, primaryEnemy: e.target.value })}
        style={fieldStyle}
        placeholder="Name your Enemy"
      />
      <select
        value={identity.enemyType}
        onChange={(e) =>
          setIdentity({ ...identity, enemyType: e.target.value as StoryEnemyType })
        }
        style={fieldStyle}
      >
        {(Object.keys(STORY_ENEMY_TYPE_LABELS) as StoryEnemyType[]).map((k) => (
          <option key={k} value={k}>
            {STORY_ENEMY_TYPE_LABELS[k]}
          </option>
        ))}
      </select>
      {!compact && (
        <>
          <textarea
            value={identity.enemyDescription}
            onChange={(e) => setIdentity({ ...identity, enemyDescription: e.target.value })}
            rows={2}
            placeholder="Enemy description (optional)"
            style={fieldStyle}
          />
          <textarea
            value={identity.enemyEffect}
            onChange={(e) => setIdentity({ ...identity, enemyEffect: e.target.value })}
            rows={2}
            placeholder="How it affects you (optional)"
            style={fieldStyle}
          />
          <textarea
            value={identity.enemyWeakness}
            onChange={(e) => setIdentity({ ...identity, enemyWeakness: e.target.value })}
            rows={2}
            placeholder="Its weakness (optional)"
            style={fieldStyle}
          />
        </>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleSave}
        style={{
          padding: '0.55rem 1rem',
          borderRadius: 8,
          border: 'none',
          background: '#0ea5e9',
          color: '#0f172a',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {busy ? 'Saving…' : 'Save Story Identity'}
      </button>
      {saved && (
        <span style={{ marginLeft: 10, fontSize: '0.85rem', color: '#059669' }}>Saved</span>
      )}
    </section>
  );
};

export default StoryIdentityPanel;
