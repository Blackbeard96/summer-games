import React, { useEffect, useState } from 'react';
import {
  isBattlePassChoiceGroup,
  type BattlePassReward,
  type BattlePassRewardChoiceGroup,
  type BattlePassTierRewardEntry,
} from '../../types/season1';
import { getAvailableArtifactsAsync, type ArtifactOption } from '../../utils/artifactCompensation';
import { missionRewardEntriesToFirestoreWrite } from '../../utils/seasonFirestoreService';
import BattlePassSeasonRewardRow from './BattlePassSeasonRewardRow';

export function validateMissionRewardEntries(entries: BattlePassTierRewardEntry[]): string | null {
  for (const e of entries) {
    if (isBattlePassChoiceGroup(e)) {
      if (e.options.length < 2) {
        return 'Each choice group must have at least 2 options.';
      }
      const pc = Math.floor(Number(e.pickCount) || 0);
      if (pc < 1 || pc > e.options.length) {
        return `Pick count must be between 1 and ${e.options.length} for "${e.displayName || e.id}".`;
      }
    }
  }
  return null;
}

/** Strip for Firestore (same encoding as battle pass seasons). */
export function serializeMissionRewardEntries(entries: BattlePassTierRewardEntry[]): unknown[] {
  return missionRewardEntriesToFirestoreWrite(entries);
}

export interface MissionRewardsBattlePassEditorProps {
  entries: BattlePassTierRewardEntry[];
  onChange: (entries: BattlePassTierRewardEntry[]) => void;
}

const MissionRewardsBattlePassEditor: React.FC<MissionRewardsBattlePassEditorProps> = ({
  entries,
  onChange,
}) => {
  const [artifactOptions, setArtifactOptions] = useState<ArtifactOption[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [artifactCustomRewardKeys, setArtifactCustomRewardKeys] = useState<Set<string>>(new Set());
  const [skillCardCustomRewardKeys, setSkillCardCustomRewardKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setArtifactsLoading(true);
      try {
        const list = await getAvailableArtifactsAsync();
        if (!cancelled) setArtifactOptions(list);
      } catch (e) {
        console.warn('MissionRewardsBattlePassEditor: artifact catalog load failed', e);
        if (!cancelled) setArtifactOptions([]);
      } finally {
        if (!cancelled) setArtifactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchEntries = (fn: (prev: BattlePassTierRewardEntry[]) => BattlePassTierRewardEntry[]) => {
    onChange(fn(entries));
  };

  const addReward = () => {
    const rid = `reward_${Date.now()}`;
    const blank: BattlePassReward = {
      id: rid,
      rewardType: 'xp',
      displayName: 'New reward',
      description: '',
      quantity: 100,
      rarity: 'common',
    };
    patchEntries((list) => [...list, blank]);
  };

  const addChoiceGroup = () => {
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
    patchEntries((list) => [...list, group]);
  };

  const addOptionToChoiceGroup = (groupId: string) => {
    const rid = `reward_${Date.now()}`;
    const blank: BattlePassReward = {
      id: rid,
      rewardType: 'xp',
      displayName: 'New option',
      description: '',
      quantity: 50,
      rarity: 'common',
    };
    patchEntries((list) =>
      list.map((e) => {
        if (!isBattlePassChoiceGroup(e) || e.id !== groupId) return e;
        const nextOpts = [...e.options, blank];
        return { ...e, options: nextOpts, pickCount: Math.min(Math.max(1, e.pickCount), nextOpts.length) };
      })
    );
  };

  const updateChoiceGroupMeta = (
    groupId: string,
    patch: Partial<Pick<BattlePassRewardChoiceGroup, 'pickCount' | 'displayName' | 'description'>>
  ) => {
    patchEntries((list) =>
      list.map((e) => (isBattlePassChoiceGroup(e) && e.id === groupId ? { ...e, ...patch } : e))
    );
  };

  const updateReward = (rewardId: string, patch: Partial<BattlePassReward>) => {
    patchEntries((list) =>
      list.map((e) => {
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

  const removeReward = (rewardId: string) => {
    patchEntries((list) =>
      list.flatMap((e): BattlePassTierRewardEntry[] => {
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

  return (
    <div
      style={{
        marginBottom: '1rem',
        padding: '1rem',
        background: '#f9fafb',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 'bold' }}>Completion rewards</h3>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.45 }}>
        Same model as the Battle Pass admin: add fixed rewards or a <strong>choice group</strong> so the player picks
        one or more options after finishing the mission. Types include XP, PP, Truth Metal, artifacts, items, skill/move
        IDs, and ability unlock keys.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={addReward}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #6366f1',
            background: '#eef2ff',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          + Reward
        </button>
        <button
          type="button"
          onClick={addChoiceGroup}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #7c3aed',
            background: '#f5f3ff',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          + Choice group
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
          No rewards yet — add fixed rewards and/or a choice group (player picks N of your options).
        </div>
      ) : (
        <>
          {entries.map((entry) =>
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
                        updateChoiceGroupMeta(entry.id, { pickCount: n });
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
                        updateChoiceGroupMeta(entry.id, {
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
                      onChange={(e) => updateChoiceGroupMeta(entry.id, { description: e.target.value })}
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
                    rewardKey={`mission:${entry.id}:${opt.id}`}
                    artifactOptions={artifactOptions}
                    artifactsLoading={artifactsLoading}
                    artifactCustomRewardKeys={artifactCustomRewardKeys}
                    setArtifactCustomRewardKeys={setArtifactCustomRewardKeys}
                    skillCardCustomRewardKeys={skillCardCustomRewardKeys}
                    setSkillCardCustomRewardKeys={setSkillCardCustomRewardKeys}
                    onPatch={(patch) => updateReward(opt.id, patch)}
                    onRemove={() => removeReward(opt.id)}
                  />
                ))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => addOptionToChoiceGroup(entry.id)}
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
                    onClick={() => removeReward(entry.id)}
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
                rewardKey={`mission:${entry.id}`}
                artifactOptions={artifactOptions}
                artifactsLoading={artifactsLoading}
                artifactCustomRewardKeys={artifactCustomRewardKeys}
                setArtifactCustomRewardKeys={setArtifactCustomRewardKeys}
                skillCardCustomRewardKeys={skillCardCustomRewardKeys}
                setSkillCardCustomRewardKeys={setSkillCardCustomRewardKeys}
                onPatch={(patch) => updateReward(entry.id, patch)}
                onRemove={() => removeReward(entry.id)}
              />
            )
          )}
        </>
      )}
    </div>
  );
};

export default MissionRewardsBattlePassEditor;
