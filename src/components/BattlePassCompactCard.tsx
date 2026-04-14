import React from 'react';
import { season0CompactSegment } from '../utils/battlePassTierMath';

interface BattlePassCompactCardProps {
  currentTier: number;
  maxTier: number;
  totalXP: number;
  onViewRewards: () => void;
  /** e.g. deployed season name from Firestore */
  seasonSubtitle?: string;
  /** Bar fill from `computeHomeBattlePassDisplay` (Season 0 + deployed) */
  progressPercentOverride?: number;
  /** XP toward next tier within the current band; label shows `xpIn / span` */
  xpInSegment: number;
  xpSegmentSpan: number;
  xpSegmentComplete: boolean;
  /** Admin deployed active pass */
  deployedSeasonActive?: boolean;
  /** Season doc has intro video and/or slides */
  seasonIntroAvailable?: boolean;
  onWatchSeasonIntro?: () => void;
  /** Home Flow panel copy (moved from floating corner card) */
  flowEyebrow?: string;
  flowTagline?: string;
  flowDescription?: string;
  onEnergyMastery?: () => void;
  /** Shown beside flow eyebrow when live pass is active — opens `/battle-pass` */
  onGoToSeasonBattlePass?: () => void;
}

const BattlePassCompactCard: React.FC<BattlePassCompactCardProps> = ({
  currentTier,
  maxTier,
  totalXP,
  onViewRewards,
  seasonSubtitle,
  progressPercentOverride,
  xpInSegment,
  xpSegmentSpan,
  xpSegmentComplete,
  deployedSeasonActive,
  seasonIntroAvailable,
  onWatchSeasonIntro,
  flowEyebrow,
  flowTagline,
  flowDescription,
  onEnergyMastery,
  onGoToSeasonBattlePass,
}) => {
  const segmentFallback = season0CompactSegment(totalXP, maxTier, currentTier);
  const progressPercent =
    progressPercentOverride !== undefined ? progressPercentOverride : segmentFallback.progressPercent;
  const xpRightLabel =
    xpSegmentComplete || xpSegmentSpan <= 0
      ? `${totalXP.toLocaleString()} XP · max`
      : `${Math.floor(xpInSegment).toLocaleString()} / ${Math.floor(xpSegmentSpan).toLocaleString()} XP`;
  const subtitle = seasonSubtitle?.trim() || 'Season 0 Battle Pass';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Main Battle Pass Card */}
      <div style={{
        background: 'rgba(31, 41, 55, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1.5rem'
      }}>
        {(flowEyebrow || flowTagline || flowDescription) && (
          <div style={{ marginBottom: '1rem' }}>
            {flowEyebrow ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'rgba(255, 255, 255, 0.75)',
                  }}
                >
                  {flowEyebrow}
                </div>
                {deployedSeasonActive && onGoToSeasonBattlePass ? (
                  <button
                    type="button"
                    onClick={onGoToSeasonBattlePass}
                    aria-label="Open Season 1 battle pass page"
                    style={{
                      flexShrink: 0,
                      padding: '0.25rem 0.55rem',
                      borderRadius: '0.375rem',
                      border: '1px solid rgba(129, 140, 248, 0.55)',
                      background: 'rgba(99, 102, 241, 0.25)',
                      color: '#e0e7ff',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Open →
                  </button>
                ) : null}
              </div>
            ) : null}
            {flowTagline ? (
              <div style={{ fontWeight: 800, fontSize: '1rem', marginTop: 6, color: '#fff' }}>{flowTagline}</div>
            ) : null}
            {deployedSeasonActive && subtitle ? (
              seasonIntroAvailable && onWatchSeasonIntro ? (
                <button
                  type="button"
                  onClick={onWatchSeasonIntro}
                  aria-label={`Watch battle pass video: ${subtitle}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    margin: '8px 0 0',
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#c7d2fe',
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    textDecorationColor: 'rgba(165, 180, 252, 0.65)',
                  }}
                >
                  {subtitle}
                </button>
              ) : (
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: 8, color: '#c7d2fe' }}>{subtitle}</div>
              )
            ) : null}
            {flowDescription ? (
              <p
                style={{
                  fontSize: '0.75rem',
                  lineHeight: 1.45,
                  margin: '0.5rem 0 0',
                  color: 'rgba(255, 255, 255, 0.82)',
                }}
              >
                {flowDescription}
              </p>
            ) : null}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: deployedSeasonActive ? '1rem' : '0.75rem',
            marginTop: flowEyebrow || flowTagline || flowDescription ? 4 : 0,
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          <h3 style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: 'white'
          }}>
            Battle Pass
          </h3>
        </div>
        {!deployedSeasonActive ? (
          <p style={{
            margin: 0,
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.7)'
          }}>
            {subtitle}
          </p>
        ) : null}

        {/* Tier Progress */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem'
          }}>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 'bold',
              color: 'white'
            }}>
              Tier {currentTier} / {maxTier}
            </span>
            <span style={{
              fontSize: '0.875rem',
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 'bold'
            }}>
              {xpRightLabel}
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
              borderRadius: '4px',
              transition: 'width 0.3s ease',
              boxShadow: '0 0 8px rgba(251, 191, 36, 0.5)'
            }} />
          </div>
        </div>

        {/* View Rewards Button */}
        <button
          onClick={onViewRewards}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: 'rgba(139, 92, 246, 0.3)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '0.5rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          View Rewards →
        </button>
        {onEnergyMastery ? (
          <button
            type="button"
            onClick={onEnergyMastery}
            style={{
              width: '100%',
              marginTop: '0.5rem',
              padding: '0.55rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(165, 180, 252, 0.45)',
              fontWeight: 600,
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#e0e7ff',
              fontSize: '0.8rem',
            }}
          >
            Energy Mastery
          </button>
        ) : null}
      </div>

      {/* Featured Reward Card (Optional) */}
      <div style={{
        background: 'rgba(31, 41, 55, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1rem',
        textAlign: 'center'
      }}>
        <div style={{
          width: '100%',
          height: '120px',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          borderRadius: '0.5rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '3rem',
          border: '2px solid rgba(251, 191, 36, 0.3)',
          boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)'
        }}>
          🧥
        </div>
        <p style={{
          margin: 0,
          marginBottom: '0.5rem',
          fontSize: '0.75rem',
          color: '#fbbf24',
          fontWeight: 'bold'
        }}>
          ★ Featured Reward
        </p>
        <p style={{
          margin: 0,
          marginBottom: '0.25rem',
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: 'white'
        }}>
          Flame Emperor Cloak
        </p>
        <p style={{
          margin: 0,
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          Unlocks at Tier 18
        </p>
        <button
          onClick={onViewRewards}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            background: 'rgba(139, 92, 246, 0.3)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '0.375rem',
            color: 'white',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
          }}
        >
          View →
        </button>
      </div>
    </div>
  );
};

export default BattlePassCompactCard;


