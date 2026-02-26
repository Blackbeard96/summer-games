import React from 'react';
import { SessionStats, SessionSummary } from '../types/inSessionStats';
import {
  LIVE_EVENT_PP_BASE_PER_ELIMINATION,
  LIVE_EVENT_PP_PER_PARTICIPATION_POINT
} from '../utils/inSessionStatsService';

interface SessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: SessionSummary | null;
  currentPlayerId: string;
}

const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  currentPlayerId
}) => {
  if (!isOpen || !summary) return null;

  const currentPlayerStats = summary.stats[currentPlayerId];
  const allStats = Object.values(summary.stats);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Players who earned PP (with breakdown: +900 per elimination, +50 per participation point)
  const playersWithPP = allStats
    .filter((s) => (s.ppEarned || 0) > 0)
    .sort((a, b) => (b.ppEarned || 0) - (a.ppEarned || 0));

  // Players eliminated
  const eliminatedPlayers = allStats.filter((s) => s.isEliminated);

  // Who had the most participation
  const mostParticipation = allStats.reduce<SessionStats | null>((best, s) => {
    const p = s.participationEarned || 0;
    if (!best || p > (best.participationEarned || 0)) return s;
    return best;
  }, null);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-summary-title"
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '2px solid #fff'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2
            id="session-summary-title"
            style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '0.5rem',
              textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            🎉 Live Event Summary
          </h2>
          <p style={{ fontSize: '1rem', color: '#f0f0f0' }}>
            {summary.className} • {formatDuration(summary.duration)}
          </p>
        </div>

        {/* 1. PP Earned — who earned PP and breakdown (+900 per elimination, +50 per participation point) */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            marginBottom: '1rem',
            border: '2px solid #10b981'
          }}
        >
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.75rem' }}>
            💰 PP Earned
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
            +{LIVE_EVENT_PP_BASE_PER_ELIMINATION} PP + eliminated player&apos;s vault PP per elimination • +{LIVE_EVENT_PP_PER_PARTICIPATION_POINT} PP per participation point
          </p>
          {playersWithPP.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>No PP earned this event.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {playersWithPP.map((s) => {
                const partPP = (s.participationEarned || 0) * LIVE_EVENT_PP_PER_PARTICIPATION_POINT;
                const elimPP = Math.max(0, (s.ppEarned || 0) - partPP);
                const total = s.ppEarned || 0;
                return (
                  <li
                    key={s.playerId}
                    style={{
                      padding: '0.5rem 0',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{s.playerName}</span>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>+{total} PP</span>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280', width: '100%' }}>
                      {s.eliminations ? `${s.eliminations} elimination(s): +${elimPP} PP (${LIVE_EVENT_PP_BASE_PER_ELIMINATION} + vault each)` : ''}
                      {s.eliminations && (s.participationEarned || 0) > 0 ? ' • ' : ''}
                      {(s.participationEarned || 0) > 0
                        ? `${s.participationEarned} participation × ${LIVE_EVENT_PP_PER_PARTICIPATION_POINT} = +${partPP} PP`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 2. Players Eliminated */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            marginBottom: '1rem',
            border: '2px solid #ef4444'
          }}
        >
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.75rem' }}>
            ☠️ Players Eliminated
          </h3>
          {eliminatedPlayers.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>No one was eliminated.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {eliminatedPlayers.map((s) => (
                <li
                  key={s.playerId}
                  style={{
                    padding: '0.35rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{s.playerName}</span>
                  {s.eliminatedBy && summary.stats[s.eliminatedBy] && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      (eliminated by {summary.stats[s.eliminatedBy].playerName})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Most Participation */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            border: '2px solid #3b82f6'
          }}
        >
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.75rem' }}>
            ✨ Most Participation
          </h3>
          {mostParticipation && (mostParticipation.participationEarned || 0) > 0 ? (
            <p style={{ fontSize: '1rem', color: '#1f2937', margin: 0 }}>
              <strong>{mostParticipation.playerName}</strong> — {mostParticipation.participationEarned} participation point{mostParticipation.participationEarned !== 1 ? 's' : ''}
            </p>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: 0 }}>No participation points earned this event.</p>
          )}
        </div>

        {/* Current Player Stats (Highlighted) */}
        {currentPlayerStats && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '2rem',
              border: '3px solid #ffd700',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
            }}
          >
            <h3 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: '#1f2937', 
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              👤 {currentPlayerStats.playerName}
              {currentPlayerStats.isEliminated && (
                <span style={{ 
                  fontSize: '0.875rem', 
                  background: '#ef4444', 
                  color: '#fff',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.5rem'
                }}>
                  ELIMINATED
                </span>
              )}
            </h3>

            {/* Badges */}
            {currentPlayerStats.badges && currentPlayerStats.badges.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {currentPlayerStats.badges.map((badge, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      color: '#fff',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            )}

            {/* Stats Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              {/* PP Stats */}
              <div style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                padding: '1rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>
                  Net PP Gained
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {currentPlayerStats.netPPGained >= 0 ? '+' : ''}
                  {currentPlayerStats.netPPGained} PP
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                  {currentPlayerStats.startingPP} → {currentPlayerStats.endingPP}
                </div>
              </div>

              {/* Participation */}
              <div style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: '#fff',
                padding: '1rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>
                  Participation
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {currentPlayerStats.participationEarned}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                  {currentPlayerStats.movesEarned} moves earned
                </div>
              </div>

              {/* Eliminations */}
              <div style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                padding: '1rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>
                  Eliminations
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {currentPlayerStats.eliminations}
                </div>
              </div>

              {/* Skills Used */}
              <div style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                color: '#fff',
                padding: '1rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>
                  Skills Used
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {currentPlayerStats.totalSkillsUsed}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                  {currentPlayerStats.ppSpent} PP spent
                </div>
              </div>
            </div>

            {/* Damage Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{
                background: '#fee2e2',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', color: '#991b1b', marginBottom: '0.25rem' }}>
                  Damage Dealt
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}>
                  {currentPlayerStats.damageDealt}
                </div>
              </div>
              <div style={{
                background: '#dbeafe',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', color: '#1e3a8a', marginBottom: '0.25rem' }}>
                  Damage Taken
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2563eb' }}>
                  {currentPlayerStats.damageTaken}
                </div>
              </div>
            </div>

            {/* Skills Breakdown */}
            {currentPlayerStats.skillsUsed && currentPlayerStats.skillsUsed.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ 
                  fontSize: '1rem', 
                  fontWeight: 'bold', 
                  color: '#1f2937', 
                  marginBottom: '0.5rem' 
                }}>
                  Skills Used:
                </h4>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '0.5rem' 
                }}>
                  {currentPlayerStats.skillsUsed.map((skill, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#f3f4f6',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        border: '1px solid #d1d5db'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {skill.skillName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {skill.count}x
                        {skill.totalDamage && skill.totalDamage > 0 && (
                          <span> • {skill.totalDamage} damage</span>
                        )}
                        {skill.totalHealing && skill.totalHealing > 0 && (
                          <span> • {skill.totalHealing} healing</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Elimination Info */}
            {currentPlayerStats.isEliminated && currentPlayerStats.eliminatedBy && (
              <div style={{
                background: '#fee2e2',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                marginTop: '1rem',
                textAlign: 'center',
                color: '#991b1b'
              }}>
                Eliminated by {summary.stats[currentPlayerStats.eliminatedBy]?.playerName || 'Unknown'}
              </div>
            )}
          </div>
        )}

        {/* All Players Summary (Collapsed by default, can be expanded) */}
        <details style={{ marginTop: '1rem' }}>
          <summary style={{
            cursor: 'pointer',
            padding: '0.75rem',
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '0.5rem',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '1rem'
          }}>
            View All Players ({summary.totalPlayers})
          </summary>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.values(summary.stats)
              .sort((a, b) => {
                // Sort by eliminations first, then net PP
                if (b.eliminations !== a.eliminations) {
                  return b.eliminations - a.eliminations;
                }
                return b.netPPGained - a.netPPGained;
              })
              .map((stats) => (
                <div
                  key={stats.playerId}
                  style={{
                    background: stats.playerId === currentPlayerId 
                      ? 'rgba(255, 215, 0, 0.3)' 
                      : 'rgba(255, 255, 255, 0.9)',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: stats.playerId === currentPlayerId ? '2px solid #ffd700' : '1px solid #e5e7eb'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                      {stats.playerName}
                      {stats.isEliminated && (
                        <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>☠️</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {stats.eliminations} elim • {stats.netPPGained >= 0 ? '+' : ''}
                      {stats.netPPGained} PP • {stats.participationEarned} participation
                    </div>
                  </div>
                  {stats.badges && stats.badges.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {stats.badges.slice(0, 2).map((badge, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: '#fbbf24',
                            color: '#fff',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem'
                          }}
                        >
                          {badge.label.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </details>

        {/* Close button — summary stays until user dismisses */}
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.85)', marginTop: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>
          Close when you&apos;re done reading.
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '0.5rem',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            border: 'none',
            padding: '1rem',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 8px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SessionSummaryModal;



