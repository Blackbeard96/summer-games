import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isBattlePassChoiceGroup,
  type BattlePassReward,
  type BattlePassRewardChoiceGroup,
  type BattlePassTier,
  type BattlePassTierRewardEntry,
  type Season,
} from '../../types/season1';
import type { BattlePassIntroStep } from '../../types/missions';
import {
  listSeasons,
  saveSeason,
  deleteSeasonById,
  setActiveSeasonExclusive,
  createNewSeasonDraftId,
  createDefaultSeason,
  dateToDatetimeLocalValue,
  datetimeLocalValueToDate,
  getSeasonById,
  sortSeasonsList,
} from '../../utils/seasonFirestoreService';
import { SKILL_CARDS_CATALOG } from '../../data/skillCardsCatalog';
import { getAvailableArtifactsAsync, type ArtifactOption } from '../../utils/artifactCompensation';
import BattlePassSeasonRewardRow from './BattlePassSeasonRewardRow';
import BattlePassIntroSequenceEditor from './BattlePassIntroSequenceEditor';
import { uploadBattlePassSeasonHeroVideo } from '../../utils/battlePassStorage';

const LINKED_GAME_SEASON_PRESETS: { key: string; label: string }[] = [
  { key: '', label: 'Not linked' },
  { key: 'season_1', label: 'Season 1 — Flow & Energy' },
  { key: 'season_2', label: 'Season 2' },
  { key: 'season_3', label: 'Season 3' },
  { key: 'season_4', label: 'Season 4' },
];

const PRESET_KEYS = new Set(LINKED_GAME_SEASON_PRESETS.map((p) => p.key).filter(Boolean));

function sortTiers(tiers: BattlePassTier[]): BattlePassTier[] {
  return [...tiers].sort((a, b) => a.tierNumber - b.tierNumber);
}

function validateBattlePassDraft(draft: Season): string | null {
  for (const t of draft.tiers) {
    for (const e of t.rewards) {
      if (isBattlePassChoiceGroup(e)) {
        if (e.options.length < 2) {
          return `Tier ${t.tierNumber}: a reward choice group must have at least 2 options.`;
        }
        const pc = Math.floor(Number(e.pickCount) || 0);
        if (pc < 1 || pc > e.options.length) {
          return `Tier ${t.tierNumber}: "Pick count" must be between 1 and ${e.options.length}.`;
        }
      }
    }
  }
  return null;
}

function seasonRewardListStats(tiers: BattlePassTier[]): string {
  let flat = 0;
  let groups = 0;
  let opts = 0;
  for (const t of tiers) {
    for (const e of t.rewards) {
      if (isBattlePassChoiceGroup(e)) {
        groups += 1;
        opts += e.options.length;
      } else {
        flat += 1;
      }
    }
  }
  if (groups === 0) return `${flat} rewards`;
  return `${flat} fixed + ${groups} choice group(s) (${opts} options)`;
}

function cloneSeason(s: Season): Season {
  return JSON.parse(JSON.stringify(s)) as Season;
}

const BattlePassSeasonAdmin: React.FC = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [batchTierCount, setBatchTierCount] = useState(5);
  const [batchXpStep, setBatchXpStep] = useState(1000);
  const [artifactOptions, setArtifactOptions] = useState<ArtifactOption[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  /** `${tierId}:${rewardId}` when admin chose "Custom ID" so the select stays on custom with an empty ref. */
  const [artifactCustomRewardKeys, setArtifactCustomRewardKeys] = useState<Set<string>>(new Set());
  const [skillCardCustomRewardKeys, setSkillCardCustomRewardKeys] = useState<Set<string>>(new Set());
  const [heroIntroUploading, setHeroIntroUploading] = useState(false);
  const [heroIntroProgress, setHeroIntroProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setArtifactsLoading(true);
      try {
        const list = await getAvailableArtifactsAsync();
        if (!cancelled) setArtifactOptions(list);
      } catch (e) {
        console.warn('BattlePassSeasonAdmin: artifact catalog load failed', e);
        if (!cancelled) setArtifactOptions([]);
      } finally {
        if (!cancelled) setArtifactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const list = await listSeasons();
      setSeasons(list);
      setSavedIds(new Set(list.map((s) => s.id)));
      setSelectedId((cur) => {
        if (cur && list.some((s) => s.id === cur)) return cur;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setStatus(`Load failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    const found = seasons.find((s) => s.id === selectedId);
    if (found) setDraft(cloneSeason(found));
  }, [selectedId, seasons]);

  const mergeVerifiedIntoList = (fromServer: Season[], verified: Season): Season[] => {
    const map = new Map<string, Season>();
    for (const s of fromServer) map.set(s.id, s);
    map.set(verified.id, verified);
    return sortSeasonsList(Array.from(map.values()));
  };

  const persistDraft = async (next: Season) => {
    setSaving(true);
    setStatus('');
    try {
      const toSave = { ...next, tiers: sortTiers(next.tiers) };
      await saveSeason(toSave);
      const verified = await getSeasonById(next.id);
      if (!verified) {
        setStatus(
          `Could not read seasons/${next.id} after save. The write may have failed, or another Firebase project is selected. Check the browser console.`
        );
        await load();
        return;
      }
      const fromList = await listSeasons();
      const merged = mergeVerifiedIntoList(fromList, verified);
      setSeasons(merged);
      setSavedIds(new Set(merged.map((s) => s.id)));
      setSelectedId(verified.id);
      setDraft(cloneSeason(verified));
      setStatus('Battle pass saved to Firestore.');
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(code ? `Save failed (${code}): ${msg}` : `Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    const v = validateBattlePassDraft(draft);
    if (v) {
      alert(v);
      return;
    }
    await persistDraft(draft);
  };

  const handleDeployActive = async () => {
    if (!draft) return;
    const v = validateBattlePassDraft(draft);
    if (v) {
      alert(v);
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      const toSave = { ...draft, active: true, tiers: sortTiers(draft.tiers) };
      await saveSeason(toSave);
      let fromList = await listSeasons();
      const ids = fromList.map((s) => s.id);
      if (!ids.includes(draft.id)) ids.push(draft.id);
      await setActiveSeasonExclusive(draft.id, ids);
      fromList = await listSeasons();
      const verified = await getSeasonById(draft.id);
      if (!verified) {
        setStatus('Deploy finished but this pass could not be re-read. Click Refresh.');
        await load();
        return;
      }
      const merged = mergeVerifiedIntoList(fromList, verified);
      setSeasons(merged);
      setSavedIds(new Set(merged.map((s) => s.id)));
      setSelectedId(verified.id);
      setDraft(cloneSeason(verified));
      setStatus('Deployed: this battle pass is now the only active one.');
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(code ? `Deploy failed (${code}): ${msg}` : `Deploy failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateOnly = async () => {
    if (!draft) return;
    await persistDraft({ ...draft, active: false });
  };

  const handleDelete = async () => {
    if (!draft || !savedIds.has(draft.id)) return;
    if (!window.confirm(`Delete battle pass "${draft.name}" (${draft.id})? This cannot be undone.`)) return;
    setSaving(true);
    setStatus('');
    try {
      await deleteSeasonById(draft.id);
      setSelectedId(null);
      setDraft(null);
      setStatus('Deleted.');
      await load();
    } catch (e) {
      setStatus(`Delete failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleNewSeason = () => {
    const id = createNewSeasonDraftId();
    const s = createDefaultSeason(id);
    setSeasons((prev) => [s, ...prev]);
    setSelectedId(id);
    setDraft(cloneSeason(s));
    setStatus('New draft — click Save battle pass to write to Firestore (seasons/{id}).');
  };

  const addMultipleTiers = () => {
    const n = Math.min(50, Math.max(1, Math.floor(Number(batchTierCount)) || 0));
    const step = Math.max(1, Math.floor(Number(batchXpStep)) || 1000);
    setDraft((d) => {
      if (!d) return d;
      let maxNum = d.tiers.reduce((m, t) => Math.max(m, t.tierNumber), 0);
      const lastXp = d.tiers.length ? Math.max(...d.tiers.map((t) => t.requiredXP)) : 0;
      const newTiers: BattlePassTier[] = [];
      const baseTime = Date.now();
      for (let i = 0; i < n; i++) {
        maxNum += 1;
        newTiers.push({
          id: `tier_${baseTime}_${maxNum}_${i}`,
          tierNumber: maxNum,
          requiredXP: lastXp + (i + 1) * step,
          rewards: [],
        });
      }
      return { ...d, tiers: sortTiers([...d.tiers, ...newTiers]) };
    });
  };

  const updateTier = (tierId: string, patch: Partial<BattlePassTier>) => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        tiers: d.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
      };
    });
  };

  const addTier = () => {
    setDraft((d) => {
      if (!d) return d;
      const maxNum = d.tiers.reduce((m, t) => Math.max(m, t.tierNumber), 0);
      const n = maxNum + 1;
      const newTier: BattlePassTier = {
        id: `tier_${Date.now()}_${n}`,
        tierNumber: n,
        requiredXP: n * 1000,
        rewards: [],
      };
      return { ...d, tiers: sortTiers([...d.tiers, newTier]) };
    });
  };

  const removeTier = (tierId: string) => {
    setDraft((d) => {
      if (!d || d.tiers.length <= 1) return d;
      return { ...d, tiers: d.tiers.filter((t) => t.id !== tierId) };
    });
  };

  const patchTierRewards = (tierId: string, fn: (rewards: BattlePassTierRewardEntry[]) => BattlePassTierRewardEntry[]) => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        tiers: d.tiers.map((t) => (t.id === tierId ? { ...t, rewards: fn(t.rewards) } : t)),
      };
    });
  };

  const addReward = (tierId: string) => {
    const rid = `reward_${Date.now()}`;
    const blank: BattlePassReward = {
      id: rid,
      rewardType: 'xp',
      displayName: 'New reward',
      description: '',
      quantity: 100,
      rarity: 'common',
    };
    patchTierRewards(tierId, (entries) => [...entries, blank]);
  };

  const addChoiceGroup = (tierId: string) => {
    const ts = Date.now();
    const gid = `choice_${ts}`;
    const makeOpt = (s: string): BattlePassReward => ({
      id: `reward_${ts}_${s}`,
      rewardType: 'pp',
      displayName: `Option ${s.toUpperCase()}`,
      description: '',
      quantity: 100,
      rarity: 'common',
    });
    const group: BattlePassRewardChoiceGroup = {
      id: gid,
      pickCount: 1,
      displayName: 'Player choice',
      description: 'Pick one of the rewards below.',
      options: [makeOpt('a'), makeOpt('b')],
    };
    patchTierRewards(tierId, (entries) => [...entries, group]);
  };

  const addOptionToChoiceGroup = (tierId: string, groupId: string) => {
    const rid = `reward_${Date.now()}`;
    const blank: BattlePassReward = {
      id: rid,
      rewardType: 'xp',
      displayName: 'New option',
      description: '',
      quantity: 50,
      rarity: 'common',
    };
    patchTierRewards(tierId, (entries) =>
      entries.map((e) => {
        if (!isBattlePassChoiceGroup(e) || e.id !== groupId) return e;
        const nextOpts = [...e.options, blank];
        return { ...e, options: nextOpts, pickCount: Math.min(Math.max(1, e.pickCount), nextOpts.length) };
      })
    );
  };

  const updateChoiceGroupMeta = (
    tierId: string,
    groupId: string,
    patch: Partial<Pick<BattlePassRewardChoiceGroup, 'pickCount' | 'displayName' | 'description'>>
  ) => {
    patchTierRewards(tierId, (entries) =>
      entries.map((e) => (isBattlePassChoiceGroup(e) && e.id === groupId ? { ...e, ...patch } : e))
    );
  };

  const updateReward = (tierId: string, rewardId: string, patch: Partial<BattlePassReward>) => {
    patchTierRewards(tierId, (entries) =>
      entries.map((e) => {
        if (isBattlePassChoiceGroup(e)) {
          return {
            ...e,
            options: e.options.map((o) => (o.id === rewardId ? { ...o, ...patch } : o)),
          };
        }
        return e.id === rewardId ? { ...e, ...patch } : e;
      })
    );
  };

  const removeReward = (tierId: string, rewardId: string) => {
    patchTierRewards(tierId, (entries) =>
      entries.flatMap((e): BattlePassTierRewardEntry[] => {
        if (isBattlePassChoiceGroup(e)) {
          if (e.id === rewardId) return [];
          const opts = e.options.filter((o) => o.id !== rewardId);
          if (opts.length === 0) return [];
          return [{ ...e, options: opts, pickCount: Math.min(e.pickCount, opts.length) }];
        }
        return e.id === rewardId ? [] : [e];
      })
    );
  };

  const skillCardIds = useMemo(() => SKILL_CARDS_CATALOG.map((c) => c.id).join(', '), []);

  if (loading) return <div style={{ padding: 16 }}>Loading battle passes…</div>;

  return (
    <div
      style={{
        marginTop: 24,
        border: '1px solid #c7d2fe',
        borderRadius: 12,
        padding: '1.25rem',
        background: '#eef2ff',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, color: '#312e81' }}>Battle passes ({seasons.length})</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={load}
            disabled={saving}
            style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid #6366f1', background: '#fff', cursor: 'pointer' }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleNewSeason}
            disabled={saving}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: 8,
              border: 'none',
              background: '#4f46e5',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            New battle pass
          </button>
        </div>
      </div>
      <p style={{ color: '#4338ca', fontSize: '0.9rem', lineHeight: 1.5, marginTop: 8 }}>
        Each battle pass is a document in <code>seasons/&#123;id&#125;</code> with tiers, XP thresholds, fixed rewards, and
        optional <strong>choice groups</strong> (player picks N of the options you list). Rewards support XP, PP, artifacts,
        items, and action cards. Link a pass to a <strong>game season</strong> below so players and tools know which
        content season it belongs to. <strong>Save battle pass</strong> (in the editor) writes to Firestore;{' '}
        <strong>Deploy as active</strong> sets this pass as the only active one and updates{' '}
        <code>adminSettings/season1.activeBattlePassSeasonId</code>.
      </p>
      <p
        style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#fff7ed',
          border: '1px solid #fdba74',
          color: '#9a3412',
          fontSize: '0.88rem',
          lineHeight: 1.5,
        }}
      >
        <strong>New drafts only exist in this browser tab</strong> until you click <strong>Save battle pass</strong>. If you
        refresh or leave without saving, the list will show zero passes.         <strong>Save flow &amp; energy settings</strong> (below) does not write <code>seasons/</code> — only the blue editor&apos;s{' '}
        <strong>Save battle pass</strong> does.
      </p>

      {draft && !savedIds.has(draft.id) ? (
        <p
          style={{
            marginTop: 10,
            marginBottom: 0,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            color: '#92400e',
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          Unsaved draft: <code style={{ fontWeight: 600 }}>{draft.id}</code> — click <strong>Save battle pass</strong> or it
          will disappear when you reload.
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: 20, marginTop: 16 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: '1px solid #e0e7ff', maxHeight: 420, overflowY: 'auto' }}>
          {seasons.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.9rem' }}>No battle passes yet. Create one.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {seasons.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 10px',
                      marginBottom: 6,
                      borderRadius: 8,
                      border: selectedId === s.id ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                      background: selectedId === s.id ? '#eef2ff' : '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e1b4b' }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>{s.id}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                      {s.linkedGameSeasonKey ? `Season: ${s.linkedGameSeasonKey}` : 'No season link'} · {s.tiers.length} tiers ·{' '}
                      {seasonRewardListStats(s.tiers)}
                    </div>
                    {s.active && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 4,
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          color: '#059669',
                          background: '#d1fae5',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: 16, border: '1px solid #e0e7ff', minHeight: 320 }}>
          {!draft ? (
            <div style={{ color: '#64748b' }}>Select a battle pass or create a new one.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save battle pass
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDeployActive}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: 8,
                    border: '1px solid #059669',
                    background: '#ecfdf5',
                    color: '#047857',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Deploy as active battle pass
                </button>
                <button
                  type="button"
                  disabled={saving || !draft.active}
                  onClick={handleDeactivateOnly}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: 8,
                    border: '1px solid #94a3b8',
                    background: '#f8fafc',
                    cursor: draft.active ? 'pointer' : 'not-allowed',
                  }}
                >
                  Deactivate (save)
                </button>
                {savedIds.has(draft.id) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDelete}
                    style={{
                      padding: '0.55rem 1rem',
                      borderRadius: 8,
                      border: '1px solid #dc2626',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      cursor: 'pointer',
                    }}
                  >
                    Delete from Firestore
                  </button>
                )}
              </div>

              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Battle pass document ID</span>
                <input
                  value={draft.id}
                  readOnly
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f1f5f9' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Name</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Theme</span>
                <input
                  value={draft.theme}
                  onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </label>

              <div
                style={{
                  marginBottom: 14,
                  padding: 12,
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 6 }}>
                  Season intro video (optional)
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.45 }}>
                  Legacy fallback: used only when you have <strong>no</strong> intro sequence below. If you use slides + video
                  steps, add your video there (e.g. slide first, then video) and clear this field so players do not see the
                  same video twice.
                </p>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,video/*"
                  disabled={heroIntroUploading || saving}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file || !draft) return;
                    setHeroIntroUploading(true);
                    setHeroIntroProgress(0);
                    try {
                      const { url, storagePath } = await uploadBattlePassSeasonHeroVideo(draft.id, file, (p) =>
                        setHeroIntroProgress(p)
                      );
                      setDraft((d) =>
                        d ? { ...d, seasonIntroVideoUrl: url, seasonIntroVideoStoragePath: storagePath } : d
                      );
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      alert(`Intro video upload failed: ${msg}`);
                    } finally {
                      setHeroIntroUploading(false);
                      setHeroIntroProgress(0);
                    }
                  }}
                  style={{ marginBottom: 10, fontSize: '0.8rem' }}
                />
                {heroIntroUploading ? (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${heroIntroProgress}%`, background: '#4f46e5' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{heroIntroProgress}%</span>
                  </div>
                ) : null}
                <label style={{ display: 'block', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Video URL</span>
                  <input
                    value={draft.seasonIntroVideoUrl || ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setDraft({
                        ...draft,
                        seasonIntroVideoUrl: v || undefined,
                        seasonIntroVideoStoragePath: undefined,
                      });
                    }}
                    placeholder="https://…"
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 4,
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                    }}
                  />
                </label>
                {draft.seasonIntroVideoUrl ? (
                  <div style={{ marginTop: 10 }}>
                    <video
                      src={draft.seasonIntroVideoUrl}
                      controls
                      style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, background: '#000' }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          seasonIntroVideoUrl: undefined,
                          seasonIntroVideoStoragePath: undefined,
                        })
                      }
                      style={{
                        marginTop: 8,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      Clear intro video
                    </button>
                  </div>
                ) : null}
              </div>

              <BattlePassIntroSequenceEditor
                seasonId={draft.id}
                sequence={draft.introSequence ?? []}
                onChange={(steps: BattlePassIntroStep[]) =>
                  setDraft({ ...draft, introSequence: steps.length ? steps : undefined })
                }
              />

              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Description</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', resize: 'vertical' }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <label style={{ display: 'block' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Link to game season</span>
                  <select
                    value={
                      !draft.linkedGameSeasonKey
                        ? ''
                        : PRESET_KEYS.has(draft.linkedGameSeasonKey)
                          ? draft.linkedGameSeasonKey
                          : '__custom__'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') {
                        setDraft({
                          ...draft,
                          linkedGameSeasonKey:
                            draft.linkedGameSeasonKey && !PRESET_KEYS.has(draft.linkedGameSeasonKey)
                              ? draft.linkedGameSeasonKey
                              : 'custom_season_key',
                        });
                      } else {
                        setDraft({ ...draft, linkedGameSeasonKey: v ? v : undefined });
                      }
                    }}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  >
                    {LINKED_GAME_SEASON_PRESETS.map((p) => (
                      <option key={p.key || 'none'} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                    <option value="__custom__">Custom key…</option>
                  </select>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Custom season key (if selected)</span>
                  <input
                    value={
                      draft.linkedGameSeasonKey && !PRESET_KEYS.has(draft.linkedGameSeasonKey)
                        ? draft.linkedGameSeasonKey
                        : ''
                    }
                    onChange={(e) =>
                      setDraft({ ...draft, linkedGameSeasonKey: e.target.value.trim() || undefined })
                    }
                    placeholder="e.g. summer_2026_collab"
                    disabled={!!draft.linkedGameSeasonKey && PRESET_KEYS.has(draft.linkedGameSeasonKey)}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 4,
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background:
                        draft.linkedGameSeasonKey && PRESET_KEYS.has(draft.linkedGameSeasonKey) ? '#f1f5f9' : '#fff',
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <label>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Start</span>
                  <input
                    type="datetime-local"
                    value={dateToDatetimeLocalValue(coerceDate(draft.startAt))}
                    onChange={(e) => setDraft({ ...draft, startAt: datetimeLocalValueToDate(e.target.value) })}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>End</span>
                  <input
                    type="datetime-local"
                    value={dateToDatetimeLocalValue(coerceDate(draft.endAt))}
                    onChange={(e) => setDraft({ ...draft, endAt: datetimeLocalValueToDate(e.target.value) })}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </label>
              </div>
              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Featured hero (e.g. Kon)</span>
                <input
                  value={draft.featuredHero || ''}
                  onChange={(e) => setDraft({ ...draft, featuredHero: e.target.value.trim() || undefined })}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Home banner image URL</span>
                <input
                  value={draft.homeBannerImage || ''}
                  onChange={(e) => setDraft({ ...draft, homeBannerImage: e.target.value.trim() || undefined })}
                  placeholder="https://…"
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                <span style={{ fontWeight: 600 }}>Marked active (use Deploy for exclusive active)</span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ margin: 0, color: '#312e81' }}>Levels, XP &amp; rewards</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={addTier}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: 8, border: '1px solid #6366f1', background: '#fff', cursor: 'pointer' }}
                  >
                    + Add tier
                  </button>
                </div>
              </div>
              <div
                style={{
                  marginBottom: 14,
                  padding: 12,
                  background: '#f1f5f9',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ flex: '1 1 100%', fontWeight: 700, fontSize: '0.8rem', color: '#475569' }}>
                  Bulk-add empty tiers (XP = last tier’s XP + step × n; then add rewards per tier)
                </div>
                <label style={{ flex: '0 0 88px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Count</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={batchTierCount}
                    onChange={(e) => setBatchTierCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ flex: '0 0 100px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>XP step</span>
                  <input
                    type="number"
                    min={1}
                    value={batchXpStep}
                    onChange={(e) => setBatchXpStep(Math.max(1, Number(e.target.value) || 1000))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                </label>
                <button
                  type="button"
                  onClick={addMultipleTiers}
                  style={{ padding: '0.45rem 0.85rem', borderRadius: 8, border: '1px solid #0d9488', background: '#ccfbf1', cursor: 'pointer', fontWeight: 700 }}
                >
                  Add tiers
                </button>
              </div>

              {sortTiers(draft.tiers).map((tier) => (
                <div
                  key={tier.id}
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
                    <label style={{ flex: '0 0 80px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Tier #</span>
                      <input
                        type="number"
                        value={tier.tierNumber}
                        onChange={(e) => updateTier(tier.id, { tierNumber: Number(e.target.value) || 1 })}
                        style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </label>
                    <label style={{ flex: '1 1 140px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                        Battle pass XP to unlock (total; match your client tier math)
                      </span>
                      <input
                        type="number"
                        value={tier.requiredXP}
                        onChange={(e) => updateTier(tier.id, { requiredXP: Number(e.target.value) || 0 })}
                        style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeTier(tier.id)}
                      disabled={draft.tiers.length <= 1}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #fca5a5',
                        background: '#fff',
                        color: '#b91c1c',
                        cursor: draft.tiers.length <= 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Remove tier
                    </button>
                    <button
                      type="button"
                      onClick={() => addReward(tier.id)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #6366f1', background: '#eef2ff', cursor: 'pointer' }}
                    >
                      + Reward
                    </button>
                    <button
                      type="button"
                      onClick={() => addChoiceGroup(tier.id)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #7c3aed',
                        background: '#f5f3ff',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      + Choice group
                    </button>
                  </div>
                  {tier.rewards.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      No rewards — add a fixed reward or a <strong>choice group</strong> (player picks 1 or more options you
                      define).
                    </div>
                  ) : (
                    <>
                      {tier.rewards.map((entry) =>
                        isBattlePassChoiceGroup(entry) ? (
                          <div
                            key={entry.id}
                            style={{
                              marginTop: 10,
                              padding: 12,
                              borderRadius: 10,
                              border: '2px solid #c4b5fd',
                              background: '#faf5ff',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                color: '#6d28d9',
                                marginBottom: 8,
                              }}
                            >
                              Reward choice — player picks {entry.pickCount} of {entry.options.length}
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: 10,
                                marginBottom: 10,
                              }}
                            >
                              <label>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Pick count</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, entry.options.length)}
                                  value={entry.pickCount}
                                  onChange={(e) => {
                                    const n = Math.max(1, Math.min(entry.options.length, Number(e.target.value) || 1));
                                    updateChoiceGroupMeta(tier.id, entry.id, { pickCount: n });
                                  }}
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    marginTop: 4,
                                    padding: 6,
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                  }}
                                />
                              </label>
                              <label style={{ gridColumn: 'span 2' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>
                                  Group title (optional)
                                </span>
                                <input
                                  value={entry.displayName || ''}
                                  onChange={(e) =>
                                    updateChoiceGroupMeta(tier.id, entry.id, {
                                      displayName: e.target.value.trim() || undefined,
                                    })
                                  }
                                  placeholder="e.g. Choose your bundle"
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    marginTop: 4,
                                    padding: 6,
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                  }}
                                />
                              </label>
                              <label style={{ gridColumn: '1 / -1' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Group description</span>
                                <input
                                  value={entry.description}
                                  onChange={(e) => updateChoiceGroupMeta(tier.id, entry.id, { description: e.target.value })}
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    marginTop: 4,
                                    padding: 6,
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                  }}
                                />
                              </label>
                            </div>
                            {entry.options.map((opt) => (
                              <BattlePassSeasonRewardRow
                                key={opt.id}
                                reward={opt}
                                rewardKey={`${tier.id}:${entry.id}:${opt.id}`}
                                artifactOptions={artifactOptions}
                                artifactsLoading={artifactsLoading}
                                artifactCustomRewardKeys={artifactCustomRewardKeys}
                                setArtifactCustomRewardKeys={setArtifactCustomRewardKeys}
                                skillCardCustomRewardKeys={skillCardCustomRewardKeys}
                                setSkillCardCustomRewardKeys={setSkillCardCustomRewardKeys}
                                onPatch={(patch) => updateReward(tier.id, opt.id, patch)}
                                onRemove={() => removeReward(tier.id, opt.id)}
                              />
                            ))}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() => addOptionToChoiceGroup(tier.id, entry.id)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #6366f1',
                                  background: '#eef2ff',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                }}
                              >
                                + Option in this group
                              </button>
                              <button
                                type="button"
                                onClick={() => removeReward(tier.id, entry.id)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #fca5a5',
                                  background: '#fff',
                                  color: '#b91c1c',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                }}
                              >
                                Remove entire choice group
                              </button>
                            </div>
                          </div>
                        ) : (
                          <BattlePassSeasonRewardRow
                            key={entry.id}
                            reward={entry}
                            rewardKey={`${tier.id}:${entry.id}`}
                            artifactOptions={artifactOptions}
                            artifactsLoading={artifactsLoading}
                            artifactCustomRewardKeys={artifactCustomRewardKeys}
                            setArtifactCustomRewardKeys={setArtifactCustomRewardKeys}
                            skillCardCustomRewardKeys={skillCardCustomRewardKeys}
                            setSkillCardCustomRewardKeys={setSkillCardCustomRewardKeys}
                            onPatch={(patch) => updateReward(tier.id, entry.id, patch)}
                            onRemove={() => removeReward(tier.id, entry.id)}
                          />
                        )
                      )}
                    </>
                  )}
                </div>
              ))}
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 12 }}>
                Action card rewards use the seed catalog above; ids: <code style={{ fontSize: '0.75rem' }}>{skillCardIds}</code>
              </p>
            </>
          )}
        </div>
      </div>
      {status && (
        <p style={{ marginTop: 14, fontWeight: 600, color: status.includes('failed') ? '#b91c1c' : '#047857' }}>{status}</p>
      )}
    </div>
  );
};

function coerceDate(d: Date | import('firebase/firestore').Timestamp | string | number): Date {
  if (d instanceof Date) return d;
  if (d && typeof (d as { toDate?: () => Date }).toDate === 'function') return (d as { toDate: () => Date }).toDate();
  const x = new Date(d as string | number);
  return Number.isNaN(x.getTime()) ? new Date() : x;
}

export default BattlePassSeasonAdmin;
