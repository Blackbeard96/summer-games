import React from 'react';
import type { BattlePassReward } from '../../types/season1';
import { SKILL_CARDS_CATALOG, getSkillCardById } from '../../data/skillCardsCatalog';
import type { ArtifactOption } from '../../utils/artifactCompensation';
import {
  REWARD_TYPE_OPTIONS,
  REWARD_TYPE_LABELS,
  RARITY_OPTIONS,
  CUSTOM_ARTIFACT_REF,
  CUSTOM_SKILL_CARD_REF,
  findArtifactOptionByRefId,
  artifactRefSelectValue,
  skillCardRefSelectValue,
  rewardRefPlaceholder,
} from './battlePassAdminRewardUtils';

export type BattlePassSeasonRewardRowProps = {
  reward: BattlePassReward;
  /** For artifact / skill-card custom-select state */
  rewardKey: string;
  artifactOptions: ArtifactOption[];
  artifactsLoading: boolean;
  artifactCustomRewardKeys: Set<string>;
  setArtifactCustomRewardKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  skillCardCustomRewardKeys: Set<string>;
  setSkillCardCustomRewardKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  onPatch: (patch: Partial<BattlePassReward>) => void;
  onRemove: () => void;
};

const BattlePassSeasonRewardRow: React.FC<BattlePassSeasonRewardRowProps> = ({
  reward: r,
  rewardKey: rk,
  artifactOptions,
  artifactsLoading,
  artifactCustomRewardKeys,
  setArtifactCustomRewardKeys,
  skillCardCustomRewardKeys,
  setSkillCardCustomRewardKeys,
  onPatch,
  onRemove,
}) => {
  return (
    <div
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
          onChange={(e) => onPatch({ rewardType: e.target.value as BattlePassReward['rewardType'] })}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6 }}
        >
          {REWARD_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {REWARD_TYPE_LABELS[opt]}
            </option>
          ))}
        </select>
      </label>
      <label style={{ gridColumn: 'span 2' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Display name</span>
        <input
          value={r.displayName}
          onChange={(e) => onPatch({ displayName: e.target.value })}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>
      <label style={{ gridColumn: '1 / -1' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Description</span>
        <input
          value={r.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>
      <label>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Quantity</span>
        <input
          type="number"
          value={r.quantity ?? ''}
          onChange={(e) => onPatch({ quantity: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>
      <label>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Rarity</span>
        <select
          value={r.rarity || ''}
          onChange={(e) => onPatch({ rarity: (e.target.value || undefined) as BattlePassReward['rarity'] })}
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
          {r.rewardType === 'artifact'
            ? 'Artifact (from marketplace, equippable, and store catalogs)'
            : r.rewardType === 'skill_card'
              ? 'Skill / move ID (battle pool — catalog or custom below)'
              : r.rewardType === 'truth_metal'
                ? 'Truth Metal'
                : r.rewardType === 'ability'
                  ? 'Challenge-style ability key'
                  : 'Reference ID (item key — as used by grant logic)'}
        </span>
        {r.rewardType === 'artifact' ? (
          <>
            {artifactsLoading ? (
              <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#64748b' }}>Loading artifacts…</div>
            ) : null}
            {(() => {
              const forceCustom = artifactCustomRewardKeys.has(rk);
              const sel = artifactRefSelectValue(artifactOptions, r.rewardRefId, forceCustom);
              return (
                <>
                  <select
                    value={sel}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') {
                        setArtifactCustomRewardKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(rk);
                          return next;
                        });
                        onPatch({ rewardRefId: undefined });
                      } else if (v === CUSTOM_ARTIFACT_REF) {
                        setArtifactCustomRewardKeys((prev) => new Set(prev).add(rk));
                        onPatch({ rewardRefId: undefined });
                      } else {
                        setArtifactCustomRewardKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(rk);
                          return next;
                        });
                        onPatch({ rewardRefId: v });
                      }
                    }}
                    disabled={artifactsLoading}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 4,
                      padding: 6,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      maxWidth: '100%',
                    }}
                  >
                    <option value="">— Select artifact —</option>
                    {artifactOptions.map((a) => (
                      <option key={`${a.source}:${a.id}`} value={a.id}>
                        {a.icon} {a.name} · {a.id}
                        {a.source === 'equippable'
                          ? ' (equippable)'
                          : a.source === 'marketplace'
                            ? ' (marketplace)'
                            : ''}
                      </option>
                    ))}
                    <option value={CUSTOM_ARTIFACT_REF}>Custom ID (enter below)…</option>
                  </select>
                  {sel === CUSTOM_ARTIFACT_REF ? (
                    <input
                      value={r.rewardRefId || ''}
                      onChange={(e) => {
                        const next = e.target.value.trim() || undefined;
                        onPatch({ rewardRefId: next });
                        if (next && findArtifactOptionByRefId(artifactOptions, next)) {
                          setArtifactCustomRewardKeys((prev) => {
                            const s = new Set(prev);
                            s.delete(rk);
                            return s;
                          });
                        }
                      }}
                      placeholder="Artifact id (must match grant / inventory keys)"
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: 8,
                        padding: 6,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                      }}
                    />
                  ) : null}
                </>
              );
            })()}
            {!artifactsLoading && artifactOptions.length === 0 ? (
              <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#b45309' }}>
                No artifacts loaded. Check Firestore admin catalogs or enter a custom ID above.
              </p>
            ) : null}
          </>
        ) : r.rewardType === 'skill_card' ? (
          (() => {
            const forceCustom = skillCardCustomRewardKeys.has(rk);
            const sel = skillCardRefSelectValue(r.rewardRefId, forceCustom);
            return (
              <>
                <select
                  value={sel}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setSkillCardCustomRewardKeys((prev) => {
                        const next = new Set(prev);
                        next.delete(rk);
                        return next;
                      });
                      onPatch({ rewardRefId: undefined });
                    } else if (v === CUSTOM_SKILL_CARD_REF) {
                      setSkillCardCustomRewardKeys((prev) => new Set(prev).add(rk));
                      onPatch({ rewardRefId: undefined });
                    } else {
                      setSkillCardCustomRewardKeys((prev) => {
                        const next = new Set(prev);
                        next.delete(rk);
                        return next;
                      });
                      onPatch({ rewardRefId: v });
                    }
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 4,
                    padding: 6,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    maxWidth: '100%',
                  }}
                >
                  <option value="">— Select action card —</option>
                  {SKILL_CARDS_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.id} ({c.rarity} / {c.energyType})
                    </option>
                  ))}
                  <option value={CUSTOM_SKILL_CARD_REF}>Custom ID (enter below)…</option>
                </select>
                {sel === CUSTOM_SKILL_CARD_REF ? (
                  <input
                    value={r.rewardRefId || ''}
                    onChange={(e) => {
                      const next = e.target.value.trim() || undefined;
                      onPatch({ rewardRefId: next });
                      if (next && getSkillCardById(next)) {
                        setSkillCardCustomRewardKeys((prev) => {
                          const s = new Set(prev);
                          s.delete(rk);
                          return s;
                        });
                      }
                    }}
                    placeholder="Action card id (must match grant logic)"
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 8,
                      padding: 6,
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                    }}
                  />
                ) : null}
              </>
            );
          })()
        ) : r.rewardType === 'truth_metal' ? (
          <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
            Set the Truth Metal amount in <strong>Quantity</strong> above.
          </div>
        ) : (
          <input
            value={r.rewardRefId || ''}
            onChange={(e) => onPatch({ rewardRefId: e.target.value.trim() || undefined })}
            placeholder={rewardRefPlaceholder(r)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        )}
      </label>
      <label style={{ gridColumn: '1 / -1' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Icon URL (optional)</span>
        <input
          value={r.iconUrl || ''}
          onChange={(e) => onPatch({ iconUrl: e.target.value.trim() || undefined })}
          placeholder="https://…"
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onRemove}
          style={{
            fontSize: '0.8rem',
            color: '#b91c1c',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Remove reward
        </button>
      </div>
    </div>
  );
};

export default BattlePassSeasonRewardRow;
