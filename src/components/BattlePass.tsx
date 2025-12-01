import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface BattlePassTier {
  tier: number;
  freeReward?: {
    type: 'pp' | 'xp' | 'item' | 'shard' | 'actionCard';
    amount: number;
    name?: string;
    actionCardName?: string; // For action card rewards
    imageUrl?: string; // For action card image
  };
  premiumReward?: {
    type: 'pp' | 'xp' | 'item' | 'shard' | 'actionCard';
    amount: number;
    name?: string;
    actionCardName?: string; // For action card rewards
    imageUrl?: string; // For action card image
  };
  requiredXP: number;
}

interface BattlePassProps {
  isOpen: boolean;
  onClose: () => void;
  season: number;
}

const BattlePass: React.FC<BattlePassProps> = ({ isOpen, onClose, season }) => {
  const { currentUser } = useAuth();
  const { vault, syncVaultPP } = useBattle();
  const [battlePassProgress, setBattlePassProgress] = useState<any>(null);
  const [currentTier, setCurrentTier] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasingPremium, setPurchasingPremium] = useState(false);

  // Season 0 Battle Pass Tiers - Each tier requires 1000 XP more than the previous
  const season0Tiers: BattlePassTier[] = [
    { tier: 1, freeReward: { type: 'pp', amount: 100 }, premiumReward: { type: 'pp', amount: 200 }, requiredXP: 1000 },
    { tier: 2, freeReward: { type: 'xp', amount: 50 }, premiumReward: { type: 'xp', amount: 100 }, requiredXP: 2000 },
    { tier: 3, freeReward: { type: 'pp', amount: 150 }, premiumReward: { type: 'pp', amount: 300 }, requiredXP: 3000 },
    { tier: 4, freeReward: { type: 'shard', amount: 1 }, premiumReward: { type: 'shard', amount: 2 }, requiredXP: 4000 },
    { tier: 5, freeReward: { type: 'pp', amount: 200 }, premiumReward: { type: 'pp', amount: 400 }, requiredXP: 5000 },
    { tier: 6, freeReward: { type: 'xp', amount: 75 }, premiumReward: { type: 'xp', amount: 150 }, requiredXP: 6000 },
    { tier: 7, freeReward: { type: 'pp', amount: 250 }, premiumReward: { type: 'pp', amount: 500 }, requiredXP: 7000 },
    { tier: 8, freeReward: { type: 'shard', amount: 2 }, premiumReward: { type: 'shard', amount: 4 }, requiredXP: 8000 },
    { tier: 9, freeReward: { type: 'pp', amount: 300 }, premiumReward: { type: 'pp', amount: 600 }, requiredXP: 9000 },
    { tier: 10, freeReward: { type: 'xp', amount: 100 }, premiumReward: { type: 'xp', amount: 200 }, requiredXP: 10000 },
    { tier: 11, freeReward: { type: 'pp', amount: 350 }, premiumReward: { type: 'pp', amount: 700 }, requiredXP: 11000 },
    { tier: 12, freeReward: { type: 'shard', amount: 3 }, premiumReward: { type: 'shard', amount: 6 }, requiredXP: 12000 },
    { tier: 13, freeReward: { type: 'pp', amount: 400 }, premiumReward: { type: 'pp', amount: 800 }, requiredXP: 13000 },
    { tier: 14, freeReward: { type: 'xp', amount: 125 }, premiumReward: { type: 'xp', amount: 250 }, requiredXP: 14000 },
    { tier: 15, freeReward: { type: 'actionCard', amount: 1, actionCardName: 'Freeze', imageUrl: '/images/Action Card - Freeze.png' }, premiumReward: { type: 'pp', amount: 1000 }, requiredXP: 15000 },
  ];

  // Fetch battle pass progress
  useEffect(() => {
    const fetchBattlePassProgress = async () => {
      if (!currentUser || !isOpen) return;

      setLoading(true);
      try {
        const battlePassRef = doc(db, 'battlePass', `${currentUser.uid}_season${season}`);
        const battlePassDoc = await getDoc(battlePassRef);

        if (battlePassDoc.exists()) {
          const data = battlePassDoc.data();
          setBattlePassProgress(data);
          setTotalXP(data.totalXP || 0);
          // Calculate current tier based on total XP
          const tier = calculateTier(data.totalXP || 0);
          setCurrentTier(tier);
        } else {
          // Initialize battle pass for this season
          const initialData = {
            userId: currentUser.uid,
            season,
            totalXP: 0,
            currentTier: 0,
            claimedTiers: [],
            isPremium: false,
            createdAt: serverTimestamp()
          };
          await setDoc(battlePassRef, initialData);
          setBattlePassProgress(initialData);
          setTotalXP(0);
          setCurrentTier(0);
        }
      } catch (error) {
        console.error('Error fetching battle pass progress:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBattlePassProgress();
  }, [currentUser, season, isOpen]);

  const calculateTier = (xp: number): number => {
    for (let i = season0Tiers.length - 1; i >= 0; i--) {
      if (xp >= season0Tiers[i].requiredXP) {
        return season0Tiers[i].tier;
      }
    }
    return 0;
  };

  const purchasePremium = async () => {
    if (!currentUser || !vault || battlePassProgress?.isPremium) return;

    const premiumCost = 99;
    
    // Check if player has enough PP
    if (vault.currentPP < premiumCost) {
      alert(`Not enough PP! You need ${premiumCost} PP to purchase Premium Battle Pass.`);
      return;
    }

    try {
      setPurchasingPremium(true);

      // Calculate new PP
      const newPP = vault.currentPP - premiumCost;

      // Update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, {
        powerPoints: newPP
      });

      // Update vault PP
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, {
        currentPP: newPP
      });

      // Update battle pass to premium
      const battlePassRef = doc(db, 'battlePass', `${currentUser.uid}_season${season}`);
      await updateDoc(battlePassRef, {
        isPremium: true
      });

      // Sync vault PP
      await syncVaultPP();

      // Update local state
      setBattlePassProgress({
        ...battlePassProgress,
        isPremium: true
      });

      alert(`Premium Battle Pass purchased! Spent ${premiumCost} PP.`);
    } catch (error) {
      console.error('Error purchasing premium:', error);
      alert('Failed to purchase Premium Battle Pass. Please try again.');
    } finally {
      setPurchasingPremium(false);
    }
  };

  const claimReward = async (tier: number, isPremium: boolean) => {
    if (!currentUser || !battlePassProgress) return;

    const tierKey = `tier${tier}_${isPremium ? 'premium' : 'free'}`;
    if (battlePassProgress.claimedTiers?.includes(tierKey)) {
      alert('Reward already claimed!');
      return;
    }

    if (tier > currentTier) {
      alert('You must reach this tier first!');
      return;
    }

    if (isPremium && !battlePassProgress.isPremium) {
      alert('Premium rewards require Battle Pass Premium!');
      return;
    }

    try {
      const battlePassRef = doc(db, 'battlePass', `${currentUser.uid}_season${season}`);
      const reward = isPremium 
        ? season0Tiers.find(t => t.tier === tier)?.premiumReward
        : season0Tiers.find(t => t.tier === tier)?.freeReward;

      if (!reward) return;

      // Update claimed tiers
      const updatedClaimedTiers = [...(battlePassProgress.claimedTiers || []), tierKey];
      await updateDoc(battlePassRef, {
        claimedTiers: updatedClaimedTiers
      });

      // Apply rewards to user
      const userRef = doc(db, 'students', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const updates: any = {};

        if (reward.type === 'pp') {
          updates.powerPoints = (userData.powerPoints || 0) + reward.amount;
        } else if (reward.type === 'xp') {
          updates.xp = (userData.xp || 0) + reward.amount;
        } else if (reward.type === 'shard') {
          updates.truthMetal = (userData.truthMetal || 0) + reward.amount;
        } else if (reward.type === 'actionCard' && reward.actionCardName) {
          // Unlock the action card
          const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
          const cardsDoc = await getDoc(cardsRef);
          
          if (cardsDoc.exists()) {
            const cardsData = cardsDoc.data();
            const currentCards = cardsData.cards || [];
            
            // Check if card already exists
            const cardIndex = currentCards.findIndex((card: any) => card.name === reward.actionCardName);
            
            if (cardIndex >= 0) {
              // Card exists, just unlock it
              currentCards[cardIndex].unlocked = true;
              currentCards[cardIndex].uses = currentCards[cardIndex].maxUses || 1;
            } else {
              // Card doesn't exist, add it from template
              const { ACTION_CARD_TEMPLATES } = await import('../types/battle');
              const template = ACTION_CARD_TEMPLATES.find(t => t.name === reward.actionCardName);
              
              if (template) {
                const newCard = {
                  ...template,
                  id: `card_${Date.now()}`,
                  unlocked: true,
                };
                currentCards.push(newCard);
              }
            }
            
            await updateDoc(cardsRef, { cards: currentCards });
          } else {
            // Create new cards document with the Freeze card
            const { ACTION_CARD_TEMPLATES } = await import('../types/battle');
            const template = ACTION_CARD_TEMPLATES.find(t => t.name === reward.actionCardName);
            
            if (template) {
              const newCard = {
                ...template,
                id: `card_${Date.now()}`,
                unlocked: true,
              };
              await setDoc(cardsRef, { cards: [newCard] });
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(userRef, updates);
        }
      }

      // Update local state
      setBattlePassProgress({
        ...battlePassProgress,
        claimedTiers: updatedClaimedTiers
      });

      const rewardMessage = reward.type === 'pp' 
        ? `${reward.amount} PP`
        : reward.type === 'xp' 
        ? `${reward.amount} XP`
        : reward.type === 'shard'
        ? `${reward.amount} Truth Metal Shards`
        : reward.type === 'actionCard'
        ? `${reward.actionCardName} Action Card`
        : 'Reward';
      
      alert(`Claimed ${rewardMessage}!`);
    } catch (error) {
      console.error('Error claiming reward:', error);
      alert('Failed to claim reward. Please try again.');
    }
  };

  if (!isOpen) return null;

  const getRewardIcon = (type: string) => {
    switch (type) {
      case 'pp': return '🪙';
      case 'xp': return '⭐';
      case 'shard': return '💎';
      case 'actionCard': return '🃏';
      default: return '🎁';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000,
      padding: '2rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        borderRadius: '1.5rem',
        padding: '2rem',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        border: '2px solid rgba(139, 92, 246, 0.5)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          borderBottom: '2px solid rgba(139, 92, 246, 0.3)',
          paddingBottom: '1rem'
        }}>
          <div>
            <h2 style={{
              fontSize: '2.5rem',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0
            }}>
              Battle Pass - Season {season}
            </h2>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
              {totalXP} / {season0Tiers[season0Tiers.length - 1].requiredXP} XP • Tier {currentTier} / {season0Tiers.length}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '1.125rem',
              fontWeight: 'bold'
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Premium Purchase Section */}
        {!battlePassProgress?.isPremium && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)',
            border: '2px solid rgba(251, 191, 36, 0.5)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#fbbf24',
                margin: 0,
                marginBottom: '0.5rem'
              }}>
                ⭐ Premium Battle Pass
              </h3>
              <p style={{
                color: '#94a3b8',
                margin: 0,
                fontSize: '0.875rem'
              }}>
                Unlock exclusive premium rewards for all tiers!
              </p>
            </div>
            <button
              onClick={purchasePremium}
              disabled={purchasingPremium || !vault || vault.currentPP < 99}
              style={{
                background: purchasingPremium || !vault || vault.currentPP < 99
                  ? 'rgba(100, 100, 100, 0.3)'
                  : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '1rem 2rem',
                color: 'white',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: purchasingPremium || !vault || vault.currentPP < 99 ? 'not-allowed' : 'pointer',
                boxShadow: purchasingPremium || !vault || vault.currentPP < 99
                  ? 'none'
                  : '0 4px 12px rgba(251, 191, 36, 0.4)',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                if (!purchasingPremium && vault && vault.currentPP >= 99) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(251, 191, 36, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!purchasingPremium && vault && vault.currentPP >= 99) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(251, 191, 36, 0.4)';
                }
              }}
            >
              {purchasingPremium ? 'Processing...' : `Purchase Premium - 99 PP`}
            </button>
          </div>
        )}

        {/* Premium Status Badge */}
        {battlePassProgress?.isPremium && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)',
            border: '2px solid rgba(251, 191, 36, 0.5)',
            borderRadius: '1rem',
            padding: '1rem',
            marginBottom: '2rem',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '1.5rem',
              marginBottom: '0.5rem'
            }}>
              ⭐
            </div>
            <p style={{
              color: '#fbbf24',
              fontWeight: 'bold',
              margin: 0,
              fontSize: '1.125rem'
            }}>
              Premium Battle Pass Active
            </p>
          </div>
        )}

        {/* Progress Bar */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '1rem',
          padding: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)',
            height: '20px',
            borderRadius: '10px',
            width: `${(totalXP / season0Tiers[season0Tiers.length - 1].requiredXP) * 100}%`,
            maxWidth: '100%',
            transition: 'width 0.3s ease'
          }} />
        </div>

        {/* Tiers Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
            Loading Battle Pass...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            {season0Tiers.map((tier) => {
              const isUnlocked = tier.tier <= currentTier;
              const freeClaimed = battlePassProgress?.claimedTiers?.includes(`tier${tier.tier}_free`);
              const premiumClaimed = battlePassProgress?.claimedTiers?.includes(`tier${tier.tier}_premium`);

              return (
                <div
                  key={tier.tier}
                  style={{
                    background: isUnlocked 
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)'
                      : 'rgba(0, 0, 0, 0.3)',
                    border: `2px solid ${isUnlocked ? 'rgba(139, 92, 246, 0.5)' : 'rgba(100, 100, 100, 0.3)'}`,
                    borderRadius: '1rem',
                    padding: '1rem',
                    opacity: isUnlocked ? 1 : 0.5,
                    position: 'relative'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    background: 'rgba(139, 92, 246, 0.3)',
                    borderRadius: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    Tier {tier.tier}
                  </div>

                  {/* Free Reward */}
                  {tier.freeReward && (
                    <div style={{
                      marginBottom: '0.75rem',
                      padding: '0.75rem',
                      background: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(59, 130, 246, 0.3)'
                    }}>
                      {tier.freeReward.type === 'actionCard' && tier.freeReward.actionCardName ? (
                        <>
                          {tier.freeReward.imageUrl ? (
                            <img 
                              src={tier.freeReward.imageUrl} 
                              alt={tier.freeReward.actionCardName}
                              style={{
                                width: '100%',
                                maxHeight: '120px',
                                objectFit: 'contain',
                                borderRadius: '0.5rem',
                                marginBottom: '0.5rem',
                                border: '2px solid rgba(59, 130, 246, 0.5)'
                              }}
                            />
                          ) : (
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem', textAlign: 'center' }}>
                              {getRewardIcon(tier.freeReward.type)}
                            </div>
                          )}
                          <div style={{ fontSize: '0.875rem', color: '#60a5fa', fontWeight: 'bold', textAlign: 'center' }}>
                            {tier.freeReward.actionCardName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                            Action Card
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                            {getRewardIcon(tier.freeReward.type)}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#60a5fa', fontWeight: 'bold' }}>
                            {tier.freeReward.amount} {tier.freeReward.type === 'pp' ? 'PP' : tier.freeReward.type === 'xp' ? 'XP' : 'Shards'}
                          </div>
                        </>
                      )}
                      <button
                        onClick={() => claimReward(tier.tier, false)}
                        disabled={!isUnlocked || freeClaimed}
                        style={{
                          width: '100%',
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          background: freeClaimed 
                            ? 'rgba(34, 197, 94, 0.3)'
                            : isUnlocked 
                              ? 'rgba(59, 130, 246, 0.5)'
                              : 'rgba(100, 100, 100, 0.3)',
                          border: 'none',
                          borderRadius: '0.5rem',
                          color: 'white',
                          cursor: isUnlocked && !freeClaimed ? 'pointer' : 'not-allowed',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {freeClaimed ? '✓ Claimed' : isUnlocked ? 'Claim' : 'Locked'}
                      </button>
                    </div>
                  )}

                  {/* Premium Reward */}
                  {tier.premiumReward && (
                    <div style={{
                      padding: '0.75rem',
                      background: 'rgba(251, 191, 36, 0.1)',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      position: 'relative'
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: '-0.5rem',
                        right: '-0.5rem',
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: '#1e293b'
                      }}>
                        ⭐
                      </div>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                        {getRewardIcon(tier.premiumReward.type)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#fbbf24', fontWeight: 'bold' }}>
                        {tier.premiumReward.amount} {tier.premiumReward.type === 'pp' ? 'PP' : tier.premiumReward.type === 'xp' ? 'XP' : 'Shards'}
                      </div>
                      <button
                        onClick={() => claimReward(tier.tier, true)}
                        disabled={!isUnlocked || premiumClaimed || !battlePassProgress?.isPremium}
                        style={{
                          width: '100%',
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          background: premiumClaimed 
                            ? 'rgba(34, 197, 94, 0.3)'
                            : !battlePassProgress?.isPremium
                              ? 'rgba(100, 100, 100, 0.3)'
                              : isUnlocked 
                                ? 'rgba(251, 191, 36, 0.5)'
                                : 'rgba(100, 100, 100, 0.3)',
                          border: 'none',
                          borderRadius: '0.5rem',
                          color: 'white',
                          cursor: isUnlocked && !premiumClaimed && battlePassProgress?.isPremium ? 'pointer' : 'not-allowed',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {premiumClaimed ? '✓ Claimed' : !battlePassProgress?.isPremium ? 'Premium Only' : isUnlocked ? 'Claim' : 'Locked'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BattlePass;

