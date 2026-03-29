import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BattlePassReward, BattlePassTier, Season } from '../../types/season1';
import {
  listSeasons,
  saveSeason,
  deleteSeasonById,
  setActiveSeasonExclusive,
  createNewSeasonDraftId,
  createDefaultSeason,
  dateToDatetimeLocalValue,
  datetimeLocalValueToDate,
} from '../../utils/seasonFirestoreService';
import { SKILL_CARDS_CATALOG } from '../../data/skillCardsCatalog';

const REWARD_TYPE_OPTIONS: BattlePassReward['rewardType'][] = ['xp', 'pp', 'artifact', 'item', 'skill_card'];
const RARITY_OPTIONS: NonNullable<BattlePassReward['rarity']>[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

function sortTiers(tiers: BattlePassTier[]): BattlePassTier[] {
  return [...tiers].sort((a, b) => a.tierNumber - b.tierNumber);
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

  const persistDraft = async (next: Season) => {
    setSaving(true);
    setStatus('');
    try {
      await saveSeason(next);
      setStatus('Saved.');
      await load();
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    await persistDraft({ ...draft, tiers: sortTiers(draft.tiers) });
  };

  const handleDeployActive = async () => {
    if (!draft) return;
    setSaving(true);
    setStatus('');
    try {
      await saveSeason({ ...draft, active: true, tiers: sortTiers(draft.tiers) });
      const fresh = await listSeasons();
      const ids = fresh.map((s) => s.id);
      if (!ids.includes(draft.id)) ids.push(draft.id);
      await setActiveSeasonExclusive(draft.id, ids);
      setStatus('Deployed: this season is now the only active battle pass.');
      await load();
    } catch (e) {
      setStatus(`Deploy failed: ${String(e)}`);
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
    if (!window.confirm(`Delete season "${draft.name}" (${draft.id})? This cannot be undone.`)) return;
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
    setStatus('New draft — click Save to write to Firestore.');
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

  const addReward = (tierId: string) => {
    setDraft((d) => {
      if (!d) return d;
      const rid = `reward_${Date.now()}`;
      const blank: BattlePassReward = {
        id: rid,
        rewardType: 'xp',
        displayName: 'New reward',
        description: '',
        quantity: 100,
        rarity: 'common',
      };
      return {
        ...d,
        tiers: d.tiers.map((t) => (t.id === tierId ? { ...t, rewards: [...t.rewards, blank] } : t)),
      };
    });
  };

  const updateReward = (tierId: string, rewardId: string, patch: Partial<BattlePassReward>) => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        tiers: d.tiers.map((t) =>
          t.id === tierId
            ? { ...t, rewards: t.rewards.map((r) => (r.id === rewardId ? { ...r, ...patch } : r)) }
            : t
        ),
      };
    });
  };

  const removeReward = (tierId: string, rewardId: string) => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        tiers: d.tiers.map((t) =>
          t.id === tierId ? { ...t, rewards: t.rewards.filter((r) => r.id !== rewardId) } : t
        ),
      };
    });
  };

  const skillCardIds = useMemo(() => SKILL_CARDS_CATALOG.map((c) => c.id).join(', '), []);

  if (loading) return <div style={{ padding: 16 }}>Loading battle pass seasons…</div>;

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
        <h3 style={{ margin: 0, color: '#312e81' }}>Battle Pass — seasons ({seasons.length})</h3>
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
            New season draft
          </button>
        </div>
      </div>
      <p style={{ color: '#4338ca', fontSize: '0.9rem', lineHeight: 1.5, marginTop: 8 }}>
        Documents live in <code>seasons/&#123;seasonId&#125;</code>. Use <strong>Save</strong> to persist edits.{' '}
        <strong>Deploy as active season</strong> marks this season active, deactivates all others, and sets{' '}
        <code>adminSettings/season1.activeBattlePassSeasonId</code> for clients.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: 20, marginTop: 16 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: '1px solid #e0e7ff', maxHeight: 420, overflowY: 'auto' }}>
          {seasons.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.9rem' }}>No seasons yet. Create a draft.</div>
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
            <div style={{ color: '#64748b' }}>Select a season or create a draft.</div>
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
                  Save season
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
                  Deploy as active season
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
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Season ID</span>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h4 style={{ margin: 0, color: '#312e81' }}>Tiers &amp; rewards</h4>
                <button
                  type="button"
                  onClick={addTier}
                  style={{ padding: '0.35rem 0.75rem', borderRadius: 8, border: '1px solid #6366f1', background: '#fff', cursor: 'pointer' }}
                >
                  + Add tier
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
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>XP required (cumulative or threshold — your client logic)</span>
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
                  </div>
                  {tier.rewards.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>No rewards — add one.</div>
                  ) : (
                    tier.rewards.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          marginTop: 8,
                          padding: 10,
                          background: '#fff',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          display: 'grid',
                          gap: 8,
                          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        }}
                      >
                        <label>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Type</span>
                          <select
                            value={r.rewardType}
                            onChange={(e) =>
                              updateReward(tier.id, r.id, { rewardType: e.target.value as BattlePassReward['rewardType'] })
                            }
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6 }}
                          >
                            {REWARD_TYPE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ gridColumn: 'span 2' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Display name</span>
                          <input
                            value={r.displayName}
                            onChange={(e) => updateReward(tier.id, r.id, { displayName: e.target.value })}
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                        <label style={{ gridColumn: '1 / -1' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Description</span>
                          <input
                            value={r.description}
                            onChange={(e) => updateReward(tier.id, r.id, { description: e.target.value })}
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                        <label>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Quantity</span>
                          <input
                            type="number"
                            value={r.quantity ?? ''}
                            onChange={(e) =>
                              updateReward(tier.id, r.id, {
                                quantity: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                        <label>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Rarity</span>
                          <select
                            value={r.rarity || ''}
                            onChange={(e) =>
                              updateReward(tier.id, r.id, {
                                rarity: (e.target.value || undefined) as BattlePassReward['rarity'],
                              })
                            }
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6 }}
                          >
                            <option value="">—</option>
                            {RARITY_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ gridColumn: '1 / -1' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>
                            Ref ID (artifact / item / skill_card id)
                          </span>
                          <input
                            value={r.rewardRefId || ''}
                            onChange={(e) =>
                              updateReward(tier.id, r.id, { rewardRefId: e.target.value.trim() || undefined })
                            }
                            placeholder={r.rewardType === 'skill_card' ? `e.g. ${SKILL_CARDS_CATALOG[0]?.id ?? 'card_…'}` : 'optional'}
                            list="skill-card-ids-datalist"
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => removeReward(tier.id, r.id)}
                            style={{ fontSize: '0.8rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Remove reward
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
              <datalist id="skill-card-ids-datalist">
                {SKILL_CARDS_CATALOG.map((c) => (
                  <option key={c.id} value={c.id} />
                ))}
              </datalist>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 12 }}>
                Seed skill card ids for reference: <code style={{ fontSize: '0.75rem' }}>{skillCardIds}</code>
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
