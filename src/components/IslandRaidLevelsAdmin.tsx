/**
 * Admin UI for Island Raid levels: create/edit levels, set waves, enemy types, and rewards.
 */

import React, { useState, useEffect } from 'react';
import {
  listIslandRaidLevels,
  getIslandRaidLevel,
  createIslandRaidLevel,
  updateIslandRaidLevel,
  deleteIslandRaidLevel
} from '../utils/islandRaidLevelsService';
import type {
  IslandRaidLevel,
  IslandRaidLevelWave,
  IslandRaidLevelEnemyTemplate,
  IslandRaidLevelRewards
} from '../types/islandRaid';

const ENEMY_TYPES: { value: IslandRaidLevelEnemyTemplate['type']; label: string }[] = [
  { value: 'zombie', label: 'Unpowered Zombie' },
  { value: 'powered_zombie', label: 'Powered Zombie' },
  { value: 'zombie_captain', label: 'Zombie Captain' },
  { value: 'hostile_group', label: 'Hostile Group' },
  { value: 'boss', label: 'Boss' }
];

const DEFAULT_IMAGES: Record<string, string> = {
  zombie: '/images/Unpowered Zombie.png',
  powered_zombie: '/images/Powered Zombie.png',
  zombie_captain: '/images/Zombie Captain.png',
  hostile_group: '/images/Powered Zombie.png',
  boss: '/images/Zombie Captain.png'
};

const emptyEnemy = (): IslandRaidLevelEnemyTemplate => ({
  type: 'powered_zombie',
  name: 'Enemy',
  count: 1,
  health: 100,
  shieldStrength: 0,
  level: 2,
  damage: 40,
  image: DEFAULT_IMAGES.powered_zombie
});

const emptyWave = (waveIndex: number): IslandRaidLevelWave => ({
  waveIndex,
  enemies: [emptyEnemy()]
});

const emptyRewards = (): IslandRaidLevelRewards => ({
  pp: 100,
  xp: 100,
  truthMetal: 0,
  captainHelmet: false,
  elementalRingIds: [],
  artifactIds: []
});

/** All marketplace/created artifacts that can be granted as level completion rewards. */
const REWARD_ARTIFACTS: { id: string; name: string }[] = [
  { id: 'checkin-free', name: 'Get Out of Check-in Free' },
  { id: 'shield', name: 'Shield' },
  { id: 'health-potion-25', name: 'Health Potion (25)' },
  { id: 'lunch-mosley', name: 'Lunch on Mosley' },
  { id: 'forge-token', name: 'Forge Token' },
  { id: 'uxp-credit-1', name: '+1 UXP Credit' },
  { id: 'uxp-credit', name: '+2 UXP Credit' },
  { id: 'uxp-credit-4', name: '+4 UXP Credit' },
  { id: 'double-pp', name: 'Double PP Boost' },
  { id: 'skip-the-line', name: 'Skip the Line' },
  { id: 'work-extension', name: 'Work Extension' },
  { id: 'instant-a', name: 'Instant A' },
  { id: 'blaze-ring', name: 'Blaze Ring' },
  { id: 'terra-ring', name: 'Terra Ring' },
  { id: 'aqua-ring', name: 'Aqua Ring' },
  { id: 'air-ring', name: 'Air Ring' },
  { id: 'instant-regrade-pass', name: 'Instant Regrade Pass' },
  { id: 'captains-helmet', name: "Captain's Helmet" }
];

const IslandRaidLevelsAdmin: React.FC = () => {
  const [levels, setLevels] = useState<IslandRaidLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    difficulty: IslandRaidLevel['difficulty'];
    maxWaves: number;
    waves: IslandRaidLevelWave[];
    rewards: IslandRaidLevelRewards;
    repeatRewards?: IslandRaidLevelRewards;
    order: number;
  }>({
    name: 'New Level',
    difficulty: 'normal',
    maxWaves: 5,
    waves: [1, 2, 3, 4, 5].map(emptyWave),
    rewards: emptyRewards(),
    order: 0
  });

  useEffect(() => {
    loadLevels();
  }, []);

  const loadLevels = async () => {
    setLoading(true);
    try {
      const list = await listIslandRaidLevels();
      setLevels(list);
    } catch (e) {
      console.error(e);
      alert('Failed to load levels');
    } finally {
      setLoading(false);
    }
  };

  const startCreate = () => {
    setCreateNew(true);
    setEditingId(null);
    setForm({
      name: 'New Level',
      difficulty: 'normal',
      maxWaves: 5,
      waves: [1, 2, 3, 4, 5].map(emptyWave),
      rewards: emptyRewards(),
      order: levels.length
    });
  };

  const startEdit = async (id: string) => {
    const level = await getIslandRaidLevel(id);
    if (!level) return;
    setEditingId(id);
    setCreateNew(false);
    setForm({
      name: level.name,
      difficulty: level.difficulty,
      maxWaves: level.maxWaves,
      waves: level.waves?.length
        ? level.waves
        : Array.from({ length: level.maxWaves }, (_, i) => emptyWave(i + 1)),
      rewards: level.rewards || emptyRewards(),
      repeatRewards: level.repeatRewards,
      order: level.order ?? 0
    });
  };

  const setMaxWaves = (n: number) => {
    const num = Math.max(1, Math.min(10, n));
    const waves = Array.from({ length: num }, (_, i) =>
      form.waves[i] ?? emptyWave(i + 1)
    ).slice(0, num);
    setForm((f) => ({ ...f, maxWaves: num, waves }));
  };

  const setWaveEnemies = (waveIndex: number, enemies: IslandRaidLevelEnemyTemplate[]) => {
    setForm((f) => ({
      ...f,
      waves: f.waves.map((w) =>
        w.waveIndex === waveIndex ? { ...w, enemies } : w
      )
    }));
  };

  const addEnemyToWave = (waveIndex: number) => {
    const wave = form.waves.find((w) => w.waveIndex === waveIndex);
    if (!wave) return;
    setWaveEnemies(waveIndex, [...wave.enemies, emptyEnemy()]);
  };

  const removeEnemyFromWave = (waveIndex: number, enemyIdx: number) => {
    const wave = form.waves.find((w) => w.waveIndex === waveIndex);
    if (!wave || wave.enemies.length <= 1) return;
    setWaveEnemies(
      waveIndex,
      wave.enemies.filter((_, i) => i !== enemyIdx)
    );
  };

  const updateEnemyInWave = (
    waveIndex: number,
    enemyIdx: number,
    patch: Partial<IslandRaidLevelEnemyTemplate>
  ) => {
    const wave = form.waves.find((w) => w.waveIndex === waveIndex);
    if (!wave) return;
    const next = [...wave.enemies];
    next[enemyIdx] = { ...next[enemyIdx], ...patch };
    if (patch.type && DEFAULT_IMAGES[patch.type]) next[enemyIdx].image = DEFAULT_IMAGES[patch.type];
    setWaveEnemies(waveIndex, next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const rewards = {
        pp: Number(form.rewards.pp) || 0,
        xp: Number(form.rewards.xp) || 0,
        truthMetal: Number(form.rewards.truthMetal) || 0,
        captainHelmet: Boolean(form.rewards.captainHelmet),
        elementalRingIds: Array.isArray(form.rewards.elementalRingIds)
          ? form.rewards.elementalRingIds.filter((id): id is string => typeof id === 'string')
          : [],
        artifactIds: Array.isArray(form.rewards.artifactIds)
          ? form.rewards.artifactIds.filter((id): id is string => typeof id === 'string')
          : []
      };
      const payload: Record<string, unknown> = {
        name: String(form.name).trim() || 'Unnamed Level',
        difficulty: form.difficulty,
        maxWaves: Math.max(1, Math.min(10, Number(form.maxWaves) || 1)),
        waves: form.waves.slice(0, form.maxWaves),
        rewards,
        order: Number(form.order) || 0
      };
      if (form.repeatRewards != null && typeof form.repeatRewards === 'object') {
        payload.repeatRewards = {
          pp: Number(form.repeatRewards.pp) || 0,
          xp: Number(form.repeatRewards.xp) || 0,
          truthMetal: Number(form.repeatRewards.truthMetal) || 0,
          captainHelmet: Boolean(form.repeatRewards.captainHelmet),
          elementalRingIds: Array.isArray(form.repeatRewards.elementalRingIds)
            ? form.repeatRewards.elementalRingIds.filter((id): id is string => typeof id === 'string')
            : [],
          artifactIds: Array.isArray(form.repeatRewards.artifactIds)
            ? form.repeatRewards.artifactIds.filter((id): id is string => typeof id === 'string')
            : []
        };
      }
      if (createNew) {
        await createIslandRaidLevel(payload as any);
        alert('Level created.');
      } else if (editingId) {
        await updateIslandRaidLevel(editingId, payload as any);
        alert('Level updated.');
      }
      setEditingId(null);
      setCreateNew(false);
      loadLevels();
    } catch (e: any) {
      console.error('Island Raid Level save error:', e);
      const message = e?.message || e?.code || String(e);
      alert(`Failed to save: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const removeLevel = async (id: string) => {
    if (!window.confirm('Delete this level? This cannot be undone.')) return;
    try {
      await deleteIslandRaidLevel(id);
      loadLevels();
      if (editingId === id) setEditingId(null);
    } catch (e) {
      console.error(e);
      alert('Failed to delete');
    }
  };

  const showForm = createNew || editingId !== null;

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px' }}>
      <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>🏝️ Island Raid Levels</h2>
      <p style={{ color: '#64748b', marginBottom: '1rem' }}>
        Define levels with number of waves, enemy types per wave, and completion rewards. Players can play these levels from the Island Raid lobby when you assign a level.
      </p>

      {loading ? (
        <p>Loading levels...</p>
      ) : (
        <>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Current levels</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
            {levels.length === 0
              ? 'No custom levels yet. Use &quot;+ Create level&quot; below to add one, then edit it from this table.'
              : 'Click Edit to change waves, enemies, and rewards for a level.'}
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '0.5rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Difficulty</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Waves</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Rewards (PP / XP / TM)</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {levels.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '1.5rem', color: '#64748b', textAlign: 'center' }}>
                    No levels yet. Create one below to control waves, enemies, and rewards.
                  </td>
                </tr>
              )}
              {levels.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 500 }}>{l.name}</td>
                  <td style={{ padding: '0.75rem' }}>{l.difficulty}</td>
                  <td style={{ padding: '0.75rem' }}>{l.maxWaves}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {l.rewards?.pp ?? 0} / {l.rewards?.xp ?? 0} / {l.rewards?.truthMetal ?? 0}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => startEdit(l.id)}
                      style={{ marginRight: '0.5rem', padding: '0.35rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLevel(l.id)}
                      style={{ padding: '0.35rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={startCreate}
              style={{
                padding: '0.5rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + Create level
            </button>
          </div>

          {showForm && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '0.75rem', border: '2px solid #e2e8f0' }}>
              <h3 style={{ marginBottom: '1rem' }}>{createNew ? 'New level' : 'Edit level'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <label>
                    <span style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Name</span>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', minWidth: '200px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Difficulty</span>
                    <select
                      value={form.difficulty}
                      onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as IslandRaidLevel['difficulty'] }))}
                      style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
                    >
                      {(['easy', 'normal', 'hard', 'nightmare'] as const).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}># Waves</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={form.maxWaves}
                      onChange={(e) => setMaxWaves(parseInt(e.target.value, 10) || 1)}
                      style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', width: '80px' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Order</span>
                    <input
                      type="number"
                      min={0}
                      value={form.order}
                      onChange={(e) => setForm((f) => ({ ...f, order: parseInt(e.target.value, 10) || 0 }))}
                      style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', width: '70px' }}
                    />
                  </label>
                </div>

                <div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Waves &amp; enemies</h4>
                  {form.waves.slice(0, form.maxWaves).map((wave) => (
                    <div key={wave.waveIndex} style={{ marginBottom: '1.5rem', padding: '1rem', background: 'white', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong>Wave {wave.waveIndex}</strong>
                        <button type="button" onClick={() => addEnemyToWave(wave.waveIndex)} style={{ padding: '0.35rem 0.75rem', background: '#e2e8f0', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>+ Enemy</button>
                      </div>
                      {/* Column titles for enemy inputs */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                        <span style={{ minWidth: '140px' }}>Type</span>
                        <span style={{ width: '120px' }}>Name</span>
                        <span style={{ width: '60px' }}>Count</span>
                        <span style={{ width: '70px' }}>Health</span>
                        <span style={{ width: '65px' }}>Shield</span>
                        <span style={{ width: '50px' }}>Level</span>
                        <span style={{ width: '60px' }}>Damage</span>
                        <span style={{ width: '32px' }} />
                      </div>
                      {wave.enemies.map((en, ei) => (
                        <div key={ei} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '0.375rem' }}>
                          <select
                            value={en.type}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { type: e.target.value as IslandRaidLevelEnemyTemplate['type'] })}
                            style={{ padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid #cbd5e1', minWidth: '140px' }}
                            title="Enemy type"
                          >
                            {ENEMY_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <input
                            placeholder="Name"
                            value={en.name}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { name: e.target.value })}
                            style={{ padding: '0.35rem', width: '120px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                            title="Display name"
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder="Count"
                            value={en.count}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { count: parseInt(e.target.value, 10) || 1 })}
                            style={{ padding: '0.35rem', width: '60px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                            title="Number of this enemy"
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder="Health"
                            value={en.health}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { health: parseInt(e.target.value, 10) || 100 })}
                            style={{ padding: '0.35rem', width: '70px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                            title="Health"
                          />
                          <input
                            type="number"
                            min={0}
                            placeholder="Shield"
                            value={en.shieldStrength ?? 0}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { shieldStrength: parseInt(e.target.value, 10) || 0 })}
                            style={{ padding: '0.35rem', width: '65px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                            title="Shield strength"
                          />
                          <input
                            type="number"
                            min={1}
                            placeholder="Lvl"
                            value={en.level}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { level: parseInt(e.target.value, 10) || 1 })}
                            style={{ padding: '0.35rem', width: '50px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                            title="Level"
                          />
                          <input
                            type="number"
                            min={0}
                            placeholder="Dmg"
                            value={en.damage}
                            onChange={(e) => updateEnemyInWave(wave.waveIndex, ei, { damage: parseInt(e.target.value, 10) || 0 })}
                            style={{ padding: '0.35rem', width: '60px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                            title="Damage"
                          />
                          <button
                            type="button"
                            onClick={() => removeEnemyFromWave(wave.waveIndex, ei)}
                            disabled={wave.enemies.length <= 1}
                            style={{ padding: '0.35rem 0.5rem', background: '#fecaca', color: '#dc2626', border: 'none', borderRadius: '0.25rem', cursor: wave.enemies.length > 1 ? 'pointer' : 'not-allowed' }}
                            title="Remove enemy"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div style={{ padding: '1rem', background: 'white', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>Completion rewards</h4>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <label>
                      <span style={{ fontSize: '0.875rem' }}>PP</span>
                      <input
                        type="number"
                        min={0}
                        value={form.rewards.pp}
                        onChange={(e) => setForm((f) => ({ ...f, rewards: { ...f.rewards, pp: parseInt(e.target.value, 10) || 0 } }))}
                        style={{ marginLeft: '0.35rem', padding: '0.35rem', width: '80px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                      />
                    </label>
                    <label>
                      <span style={{ fontSize: '0.875rem' }}>XP</span>
                      <input
                        type="number"
                        min={0}
                        value={form.rewards.xp}
                        onChange={(e) => setForm((f) => ({ ...f, rewards: { ...f.rewards, xp: parseInt(e.target.value, 10) || 0 } }))}
                        style={{ marginLeft: '0.35rem', padding: '0.35rem', width: '80px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                      />
                    </label>
                    <label>
                      <span style={{ fontSize: '0.875rem' }}>Truth Metal</span>
                      <input
                        type="number"
                        min={0}
                        value={form.rewards.truthMetal}
                        onChange={(e) => setForm((f) => ({ ...f, rewards: { ...f.rewards, truthMetal: parseInt(e.target.value, 10) || 0 } }))}
                        style={{ marginLeft: '0.35rem', padding: '0.35rem', width: '60px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={form.rewards.captainHelmet ?? false}
                        onChange={(e) => setForm((f) => ({ ...f, rewards: { ...f.rewards, captainHelmet: e.target.checked } }))}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Captain&apos;s Helmet (first completion)</span>
                    </label>
                    <label>
                      <span style={{ fontSize: '0.875rem' }}>Elemental rings (first, comma ids)</span>
                      <input
                        value={(form.rewards.elementalRingIds ?? []).join(', ')}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          rewards: {
                            ...f.rewards,
                            elementalRingIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          }
                        }))}
                        placeholder="blaze-ring, terra-ring, aqua-ring, air-ring"
                        style={{ marginLeft: '0.35rem', padding: '0.35rem', minWidth: '220px', borderRadius: '0.25rem', border: '1px solid #cbd5e1' }}
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <h5 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Artifacts (first completion)</h5>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>Select any artifacts to grant on first completion of this level.</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                      {REWARD_ARTIFACTS.map((art) => {
                        const selected = (form.rewards.artifactIds ?? []).includes(art.id);
                        return (
                          <label key={art.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                const ids = form.rewards.artifactIds ?? [];
                                const next = e.target.checked ? [...ids, art.id] : ids.filter((id) => id !== art.id);
                                setForm((f) => ({ ...f, rewards: { ...f.rewards, artifactIds: next } }));
                              }}
                            />
                            <span>{art.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    style={{ padding: '0.5rem 1.25rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreateNew(false); setEditingId(null); }}
                    style={{ padding: '0.5rem 1.25rem', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default IslandRaidLevelsAdmin;
