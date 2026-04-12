import React, { useEffect, useState } from 'react';
import {
  isBattlePassChoiceGroup,
  type BattlePassReward,
  type BattlePassRewardChoiceGroup,
  type BattlePassTier,
} from '../types/season1';
import { getArtifactDetails } from '../utils/artifactCompensation';
import { sortBattlePassTiers } from '../utils/battlePassTierMath';

function iconForRewardType(rt: BattlePassReward['rewardType']): string {
  switch (rt) {
    case 'xp':
      return '⭐';
    case 'pp':
      return '🪙';
    case 'truth_metal':
      return '💎';
    case 'artifact':
      return '⚡';
    case 'item':
      return '📦';
    case 'skill_card':
      return '🃏';
    case 'ability':
      return '✨';
    default:
      return '🎁';
  }
}

function rewardTypeLabel(rt: BattlePassReward['rewardType']): string {
  switch (rt) {
    case 'xp':
      return 'XP';
    case 'pp':
      return 'Power Points';
    case 'truth_metal':
      return 'Truth Metal';
    case 'artifact':
      return 'Artifact';
    case 'item':
      return 'Item';
    case 'skill_card':
      return 'Action card';
    case 'ability':
      return 'Ability';
    default:
      return 'Reward';
  }
}

function rarityAccent(rarity?: BattlePassReward['rarity']): { border: string; glow: string; chipBg: string } {
  switch (rarity) {
    case 'uncommon':
      return { border: 'rgba(34, 197, 94, 0.55)', glow: '0 0 12px rgba(34,197,94,0.25)', chipBg: 'rgba(34,197,94,0.2)' };
    case 'rare':
      return { border: 'rgba(59, 130, 246, 0.55)', glow: '0 0 12px rgba(59,130,246,0.25)', chipBg: 'rgba(59,130,246,0.2)' };
    case 'epic':
      return { border: 'rgba(168, 85, 247, 0.55)', glow: '0 0 14px rgba(168,85,247,0.3)', chipBg: 'rgba(168,85,247,0.22)' };
    case 'legendary':
      return { border: 'rgba(245, 158, 11, 0.6)', glow: '0 0 16px rgba(245,158,11,0.35)', chipBg: 'rgba(245,158,11,0.22)' };
    case 'common':
    default:
      return { border: 'rgba(148, 163, 184, 0.45)', glow: 'none', chipBg: 'rgba(148,163,184,0.15)' };
  }
}

const DeployedChoiceGroupBlock: React.FC<{
  group: BattlePassRewardChoiceGroup;
  locked: boolean;
}> = ({ group, locked }) => {
  const pick = Math.max(1, Math.min(group.pickCount, group.options.length || 1));
  const title =
    group.displayName?.trim() ||
    (pick === 1 ? 'Choose 1 reward' : `Choose ${pick} rewards`);
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        padding: '0.75rem',
        borderRadius: '0.75rem',
        border: '2px dashed rgba(167, 139, 250, 0.65)',
        background: locked ? 'rgba(0,0,0,0.25)' : 'rgba(109, 40, 217, 0.12)',
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div
        style={{
          fontSize: '0.78rem',
          fontWeight: 800,
          color: '#e9d5ff',
          marginBottom: 8,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      {group.description ? (
        <div style={{ fontSize: '0.72rem', color: '#c4b5fd', marginBottom: 10, lineHeight: 1.4 }}>{group.description}</div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
          gap: '0.65rem',
        }}
      >
        {group.options.map((r) => (
          <DeployedRewardTile key={r.id} reward={r} locked={locked} />
        ))}
      </div>
    </div>
  );
};

const DeployedRewardTile: React.FC<{ reward: BattlePassReward; locked: boolean }> = ({ reward, locked }) => {
  const acc = rarityAccent(reward.rarity);
  const qty = reward.quantity != null && !Number.isNaN(Number(reward.quantity)) ? Number(reward.quantity) : null;
  const [resolvedArtifactImage, setResolvedArtifactImage] = useState<string | null>(null);

  useEffect(() => {
    if (reward.iconUrl?.trim()) {
      setResolvedArtifactImage(null);
      return;
    }
    const refId = reward.rewardRefId?.trim();
    if (reward.rewardType !== 'artifact' || !refId) {
      setResolvedArtifactImage(null);
      return;
    }
    let cancelled = false;
    getArtifactDetails(refId).then((d) => {
      const url = typeof d.image === 'string' ? d.image.trim() : '';
      if (!cancelled) setResolvedArtifactImage(url || null);
    });
    return () => {
      cancelled = true;
    };
  }, [reward.iconUrl, reward.rewardRefId, reward.rewardType]);

  const imageSrc = reward.iconUrl?.trim() || resolvedArtifactImage || '';

  return (
    <div
      style={{
        padding: '0.85rem',
        borderRadius: '0.75rem',
        border: `2px solid ${acc.border}`,
        background: locked ? 'rgba(0,0,0,0.35)' : 'rgba(59, 130, 246, 0.08)',
        boxShadow: locked ? 'none' : acc.glow,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        minHeight: 148,
        opacity: locked ? 0.55 : 1,
        position: 'relative',
      }}
    >
      {reward.rarity ? (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            fontSize: '0.6rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '2px 6px',
            borderRadius: 4,
            background: acc.chipBg,
            color: '#e2e8f0',
          }}
        >
          {reward.rarity}
        </span>
      ) : null}
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          style={{
            width: '100%',
            maxHeight: 72,
            objectFit: 'contain',
            borderRadius: 8,
            marginBottom: 8,
            background: 'rgba(0,0,0,0.25)',
          }}
        />
      ) : (
        <div style={{ fontSize: '2.25rem', marginBottom: 6, lineHeight: 1 }}>{iconForRewardType(reward.rewardType)}</div>
      )}
      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#e0e7ff', lineHeight: 1.25 }}>{reward.displayName}</div>
      {reward.description ? (
        <div
          style={{
            fontSize: '0.68rem',
            color: '#94a3b8',
            marginTop: 6,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {reward.description}
        </div>
      ) : null}
      <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: '0.7rem', color: '#a5b4fc', fontWeight: 600 }}>
        {rewardTypeLabel(reward.rewardType)}
        {qty != null &&
        (reward.rewardType === 'xp' ||
          reward.rewardType === 'pp' ||
          reward.rewardType === 'item' ||
          reward.rewardType === 'truth_metal')
          ? ` · ${qty.toLocaleString()}`
          : qty != null
            ? ` · ×${qty.toLocaleString()}`
            : ''}
      </div>
      {locked ? (
        <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>Locked</div>
      ) : (
        <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#4ade80', fontWeight: 700 }}>Unlocked</div>
      )}
    </div>
  );
};

export interface DeployedBattlePassTierTrackProps {
  tiers: BattlePassTier[];
  /** Highest tier number the player has reached (from XP thresholds). */
  playerTier: number;
}

/**
 * Visual tier list for Firestore-defined battle passes (mirrors Season 0 card density; no claim actions yet).
 */
const DeployedBattlePassTierTrack: React.FC<DeployedBattlePassTierTrackProps> = ({ tiers, playerTier }) => {
  const sorted = sortBattlePassTiers(tiers);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.15rem',
        maxWidth: 960,
        maxHeight: 'min(70vh, 720px)',
        overflowY: 'auto',
        paddingRight: 8,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(139, 92, 246, 0.5) rgba(0, 0, 0, 0.3)',
      }}
      className="deployed-bp-scroll"
    >
      {sorted.map((t) => {
        const isUnlocked = t.tierNumber <= playerTier;
        const isCurrent = t.tierNumber === playerTier;

        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              gap: '1rem',
              background: isUnlocked
                ? isCurrent
                  ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.28) 0%, rgba(124, 58, 237, 0.28) 100%)'
                  : 'linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(124, 58, 237, 0.14) 100%)'
                : 'rgba(0, 0, 0, 0.28)',
              border: `2px solid ${
                isCurrent ? 'rgba(139, 92, 246, 0.85)' : isUnlocked ? 'rgba(139, 92, 246, 0.45)' : 'rgba(100, 100, 100, 0.28)'
              }`,
              borderRadius: '1rem',
              padding: '1.1rem 1.15rem',
              boxShadow: isCurrent ? '0 0 18px rgba(139, 92, 246, 0.35)' : '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 76,
                gap: 6,
              }}
            >
              <div
                style={{
                  background: isUnlocked
                    ? isCurrent
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                      : 'linear-gradient(135deg, rgba(139, 92, 246, 0.55) 0%, rgba(124, 58, 237, 0.55) 100%)'
                    : 'rgba(100, 100, 100, 0.35)',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.35rem',
                  fontWeight: 800,
                  color: 'white',
                  border: `2px solid ${isCurrent ? '#c4b5fd' : 'rgba(139, 92, 246, 0.45)'}`,
                }}
              >
                {t.tierNumber}
              </div>
              {isCurrent ? (
                <div style={{ fontSize: '0.7rem', color: '#c4b5fd', fontWeight: 800, textAlign: 'center' }}>Current</div>
              ) : null}
              <div style={{ fontSize: '0.68rem', color: '#64748b', textAlign: 'center' }}>
                {t.requiredXP.toLocaleString()} XP
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {!t.rewards?.length ? (
                <div style={{ fontSize: '0.85rem', color: '#64748b', padding: '0.5rem 0' }}>No rewards configured for this tier.</div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                    gap: '0.65rem',
                  }}
                >
                  {t.rewards.map((entry) =>
                    isBattlePassChoiceGroup(entry) ? (
                      <DeployedChoiceGroupBlock key={entry.id} group={entry} locked={!isUnlocked} />
                    ) : (
                      <DeployedRewardTile key={entry.id} reward={entry} locked={!isUnlocked} />
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DeployedBattlePassTierTrack;
