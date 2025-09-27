import React from 'react';
import { useBattle } from '../context/BattleContext';
import { useAuth } from '../context/AuthContext';
import { ACTION_CARD_DAMAGE_VALUES } from '../types/battle';

const DashboardActionCards: React.FC = () => {
  const { currentUser } = useAuth();
  const { actionCards, activateActionCard, upgradeActionCard, vault, error } = useBattle();

  const handleUseCard = (cardId: string) => {
    activateActionCard(cardId);
  };

  if (!currentUser) return null;

  // Filter for cards that can be used outside of battle
  const usableCards = actionCards.filter(card => 
    card.unlocked && 
    card.uses > 0 && 
    card.effect.type === 'shield_restore' // Currently only Shield Restore can be used outside battle
  );

  if (usableCards.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        color: '#6b7280'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🃏</div>
        <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
          No action cards available for use
        </p>
        <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>
          Visit the Battle Arena to unlock and upgrade action cards
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Error Display */}
      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
          color: '#dc2626',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {/* Action Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1rem'
      }}>
        {usableCards.map(card => {
          // Get card icon
          const getCardIcon = () => {
            switch (card.type) {
              case 'attack': return '⚔️';
              case 'defense': return '🛡️';
              case 'utility': return '⚡';
              default: return '🃏';
            }
          };

          // Get card background
          const getCardBackground = () => {
            switch (card.rarity) {
              case 'common': return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
              case 'rare': return 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
              case 'epic': return 'linear-gradient(135deg, #e9d5ff 0%, #c4b5fd 100%)';
              case 'legendary': return 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
              default: return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
            }
          };

          return (
            <div key={card.id} style={{
              background: getCardBackground(),
              border: '2px solid #ffffff',
              borderRadius: '1rem',
              padding: '1.5rem',
              position: 'relative',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              minHeight: '200px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            }}>
              
              {/* Card Header */}
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ 
                  fontSize: '2rem', 
                  marginBottom: '0.5rem',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}>
                  {getCardIcon()}
                </div>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 'bold', 
                  color: '#1f2937',
                  margin: '0',
                  textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  {card.name}
                </h3>
              </div>

              {/* Card Description */}
              <div style={{ 
                background: 'rgba(255,255,255,0.9)',
                padding: '1rem',
                borderRadius: '0.75rem',
                marginBottom: '1rem',
                backdropFilter: 'blur(10px)'
              }}>
                <p style={{ 
                  color: '#374151', 
                  fontSize: '0.875rem', 
                  lineHeight: '1.5',
                  margin: '0',
                  textAlign: 'center'
                }}>
                  {card.description}
                </p>
              </div>

              {/* Card Stats */}
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  background: 'rgba(255,255,255,0.9)',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>USES</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>{card.uses}/{card.maxUses}</div>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.9)',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>LEVEL</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#059669' }}>{card.masteryLevel}/5</div>
                </div>
              </div>

              {/* Effect Stats */}
              {(() => {
                const cardDamage = ACTION_CARD_DAMAGE_VALUES[card.name];
                return cardDamage && cardDamage.damage > 0 && (
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{
                      background: 'rgba(255,255,255,0.9)',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      textAlign: 'center',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>
                        DAMAGE
                      </div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: 'bold', 
                        color: '#ef4444'
                      }}>
                        {cardDamage.damage}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Next Level Preview */}
              {card.masteryLevel < 5 && card.nextLevelEffect && (
                <div style={{
                  background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                  border: '2px solid #10b981',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ fontSize: '0.625rem', fontWeight: 'bold', color: '#065f46', marginBottom: '0.25rem', textAlign: 'center' }}>
                    Next Level Preview
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', textAlign: 'center' }}>
                    Strength: {card.effect.strength} → {card.nextLevelEffect.strength}
                  </div>
                </div>
              )}

              {/* Upgrade Button */}
              {card.masteryLevel < 5 && (
                <button
                  onClick={() => upgradeActionCard(card.id)}
                  disabled={!vault || vault.currentPP < card.upgradeCost}
                  style={{
                    background: (!vault || vault.currentPP < card.upgradeCost) ? '#9ca3af' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    cursor: (!vault || vault.currentPP < card.upgradeCost) ? 'not-allowed' : 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    width: '100%',
                    marginBottom: '1rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (vault && vault.currentPP >= card.upgradeCost) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(5, 150, 105, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  ⬆️ Upgrade to Level {card.masteryLevel + 1} ({card.upgradeCost} PP)
                </button>
              )}

              {/* Use Button */}
              <button
                onClick={() => handleUseCard(card.id)}
                disabled={!vault || card.uses <= 0}
                style={{
                  background: (!vault || card.uses <= 0) ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  cursor: (!vault || card.uses <= 0) ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (vault && card.uses > 0) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                🎯 Use {card.name}
              </button>
            </div>
          );
        })}
      </div>

      {/* Info Text */}
      <div style={{
        textAlign: 'center',
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(16, 185, 129, 0.1)',
        borderRadius: '0.5rem',
        border: '1px solid rgba(16, 185, 129, 0.2)'
      }}>
        <p style={{
          color: '#065f46',
          fontSize: '0.875rem',
          margin: '0',
          lineHeight: '1.5'
        }}>
          💡 <strong>Tip:</strong> Action cards can be used to enhance your abilities outside of battle. 
          Shield Restore will instantly restore your vault's shield strength.
        </p>
      </div>
    </div>
  );
};

export default DashboardActionCards;
