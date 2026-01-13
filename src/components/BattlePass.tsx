import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import BattlePassRewardModal from './BattlePassRewardModal';

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
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [claimedReward, setClaimedReward] = useState<{ reward: any; tier: number; isPremium: boolean } | null>(null);

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

  // Fetch battle pass progress - use player's actual XP
  useEffect(() => {
    const fetchBattlePassProgress = async () => {
      if (!currentUser || !isOpen) return;

      setLoading(true);
      try {
        // Get player's actual XP from students collection
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const playerXP = studentDoc.exists() ? (studentDoc.data().xp || 0) : 0;
        
        // Get or create battle pass document for claim tracking
        const battlePassRef = doc(db, 'battlePass', `${currentUser.uid}_season${season}`);
        const battlePassDoc = await getDoc(battlePassRef);

        if (battlePassDoc.exists()) {
          const data = battlePassDoc.data();
          setBattlePassProgress(data);
          // Use player's actual XP, not the stored totalXP
          setTotalXP(playerXP);
          // Calculate current tier based on player's actual XP
          const tier = calculateTier(playerXP);
          setCurrentTier(tier);
          
          // Sync totalXP in battle pass document with player XP
          if (data.totalXP !== playerXP) {
            await updateDoc(battlePassRef, {
              totalXP: playerXP,
              currentTier: tier
            });
          }
        } else {
          // Initialize battle pass for this season
          const initialData = {
            userId: currentUser.uid,
            season,
            totalXP: playerXP, // Use player's actual XP
            currentTier: calculateTier(playerXP),
            claimedTiers: [],
            isPremium: false,
            createdAt: serverTimestamp()
          };
          await setDoc(battlePassRef, initialData);
          setBattlePassProgress(initialData);
          setTotalXP(playerXP);
          setCurrentTier(calculateTier(playerXP));
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

      // Apply rewards to user - Update BOTH users and students collections with atomic increments
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      const userUpdates: any = {};
      const studentUpdates: any = {};

      if (reward.type === 'pp') {
        userUpdates.powerPoints = increment(reward.amount);
        studentUpdates.powerPoints = increment(reward.amount);
      } else if (reward.type === 'xp') {
        userUpdates.xp = increment(reward.amount);
        studentUpdates.xp = increment(reward.amount);
      } else if (reward.type === 'shard') {
        userUpdates.truthMetal = increment(reward.amount);
        studentUpdates.truthMetal = increment(reward.amount);
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
          // Create new cards document with the card
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

      // Update both collections atomically
      const updatePromises: Promise<any>[] = [];
      
      if (Object.keys(userUpdates).length > 0) {
        updatePromises.push(updateDoc(userRef, userUpdates));
      }
      
      if (Object.keys(studentUpdates).length > 0) {
        updatePromises.push(updateDoc(studentRef, studentUpdates));
      }
      
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      // Update local state
      setBattlePassProgress({
        ...battlePassProgress,
        claimedTiers: updatedClaimedTiers
      });

      // Show reward modal instead of alert
      setClaimedReward({
        reward,
        tier,
        isPremium
      });
      setShowRewardModal(true);
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
      alignItems: 'flex-start',
      zIndex: 10000,
      padding: '1rem',
      paddingTop: '5rem', // Reduced padding at top
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        borderRadius: '1.5rem',
        padding: '1.5rem',
        maxWidth: '1400px',
        width: '100%',
        minHeight: 'calc(100vh - 6rem)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        border: '2px solid rgba(139, 92, 246, 0.5)',
        position: 'relative',
        marginBottom: '2rem',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          borderBottom: '2px solid rgba(139, 92, 246, 0.3)',
          paddingBottom: '1rem',
          flexShrink: 0
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
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ color: '#94a3b8', margin: '0 0 0.5rem 0' }}>
                {totalXP} / {season0Tiers[season0Tiers.length - 1].requiredXP} XP • Tier {currentTier} / {season0Tiers.length}
              </p>
              {(() => {
                const nextTier = currentTier < season0Tiers.length ? currentTier + 1 : season0Tiers.length;
                const currentTierXP = currentTier > 0 ? season0Tiers[currentTier - 1].requiredXP : 0;
                const nextTierXP = nextTier <= season0Tiers.length ? season0Tiers[nextTier - 1].requiredXP : season0Tiers[season0Tiers.length - 1].requiredXP;
                const xpInCurrentTier = totalXP - currentTierXP;
                const xpNeededForNextTier = nextTierXP - currentTierXP;
                const progressPercent = xpNeededForNextTier > 0 ? Math.min(100, (xpInCurrentTier / xpNeededForNextTier) * 100) : 100;
                
                return (
                  <div style={{ width: '100%', maxWidth: '400px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                      fontSize: '0.875rem',
                      color: '#cbd5e1'
                    }}>
                      <span>Progress to Tier {nextTier}:</span>
                      <span>{xpInCurrentTier} / {xpNeededForNextTier} XP</span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '12px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid rgba(139, 92, 246, 0.5)'
                    }}>
                      <div style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)',
                        borderRadius: '6px',
                        transition: 'width 0.3s ease',
                        boxShadow: '0 0 10px rgba(139, 92, 246, 0.5)'
                      }} />
                    </div>
                  </div>
                );
              })()}
            </div>
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
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
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
            marginBottom: '1.5rem',
            textAlign: 'center',
            flexShrink: 0
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

        {/* Overall Progress Bar */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: '2px solid rgba(139, 92, 246, 0.3)',
          flexShrink: 0
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem'
          }}>
            <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>Overall Progress</span>
            <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>
              {totalXP.toLocaleString()} / {season0Tiers[season0Tiers.length - 1].requiredXP.toLocaleString()} XP
            </span>
          </div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.5)',
            height: '24px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '2px solid rgba(139, 92, 246, 0.5)',
            position: 'relative'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)',
              height: '100%',
              borderRadius: '12px',
              width: `${Math.min(100, (totalXP / season0Tiers[season0Tiers.length - 1].requiredXP) * 100)}%`,
              maxWidth: '100%',
              transition: 'width 0.3s ease',
              boxShadow: '0 0 15px rgba(139, 92, 246, 0.6)'
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '0.5rem',
            fontSize: '0.875rem',
            color: '#94a3b8'
          }}>
            <span>Tier {currentTier} of {season0Tiers.length}</span>
            {(() => {
              const nextTier = currentTier < season0Tiers.length ? currentTier + 1 : season0Tiers.length;
              const currentTierXP = currentTier > 0 ? season0Tiers[currentTier - 1].requiredXP : 0;
              const nextTierXP = nextTier <= season0Tiers.length ? season0Tiers[nextTier - 1].requiredXP : season0Tiers[season0Tiers.length - 1].requiredXP;
              const xpNeeded = nextTierXP - totalXP;
              return xpNeeded > 0 ? (
                <span>{xpNeeded.toLocaleString()} XP to Tier {nextTier}</span>
              ) : (
                <span>Max Tier Reached!</span>
              );
            })()}
          </div>
        </div>

        {/* Tiers Grid - Improved Layout */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8', flex: 1 }}>
            Loading Battle Pass...
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: '0.75rem',
            paddingBottom: '1rem',
              // Custom scrollbar styling
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(139, 92, 246, 0.5) rgba(0, 0, 0, 0.3)'
          }}
          className="battle-pass-scroll"
          >
            {season0Tiers.map((tier, index) => {
              const isUnlocked = tier.tier <= currentTier;
              const freeClaimed = battlePassProgress?.claimedTiers?.includes(`tier${tier.tier}_free`);
              const premiumClaimed = battlePassProgress?.claimedTiers?.includes(`tier${tier.tier}_premium`);
              const isCurrentTier = tier.tier === currentTier;
              const isNextTier = tier.tier === currentTier + 1;

              return (
                <div
                  key={tier.tier}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    background: isUnlocked 
                      ? (isCurrentTier 
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(124, 58, 237, 0.3) 100%)'
                          : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)')
                      : 'rgba(0, 0, 0, 0.3)',
                    border: `2px solid ${isCurrentTier 
                      ? 'rgba(139, 92, 246, 0.8)' 
                      : isUnlocked 
                        ? 'rgba(139, 92, 246, 0.5)' 
                        : 'rgba(100, 100, 100, 0.3)'}`,
                    borderRadius: '1rem',
                    padding: '1.25rem',
                    opacity: isUnlocked ? 1 : 0.6,
                    position: 'relative',
                    boxShadow: isCurrentTier 
                      ? '0 0 20px rgba(139, 92, 246, 0.4)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {/* Tier Number Badge */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '80px',
                    gap: '0.5rem'
                  }}>
                    <div style={{
                      background: isUnlocked 
                        ? (isCurrentTier 
                            ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                            : 'linear-gradient(135deg, rgba(139, 92, 246, 0.6) 0%, rgba(124, 58, 237, 0.6) 100%)')
                        : 'rgba(100, 100, 100, 0.3)',
                      borderRadius: '50%',
                      width: '60px',
                      height: '60px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: 'white',
                      border: `2px solid ${isCurrentTier ? '#a78bfa' : 'rgba(139, 92, 246, 0.5)'}`,
                      boxShadow: isCurrentTier ? '0 0 15px rgba(139, 92, 246, 0.6)' : 'none'
                    }}>
                      {tier.tier}
                    </div>
                    {isCurrentTier && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#a78bfa',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        Current
                      </div>
                    )}
                    {isNextTier && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        textAlign: 'center'
                      }}>
                        Next
                      </div>
                    )}
                    <div style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                      textAlign: 'center',
                      marginTop: '0.25rem'
                    }}>
                      {tier.requiredXP.toLocaleString()} XP
                    </div>
                  </div>

                  {/* Rewards Section */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    flex: 1
                  }}>

                    {/* Free Reward */}
                    {tier.freeReward && (
                      <div style={{
                        padding: '1rem',
                        background: freeClaimed 
                          ? 'rgba(34, 197, 94, 0.15)'
                          : 'rgba(59, 130, 246, 0.1)',
                        borderRadius: '0.75rem',
                        border: `2px solid ${freeClaimed 
                          ? 'rgba(34, 197, 94, 0.5)' 
                          : 'rgba(59, 130, 246, 0.3)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '140px',
                        position: 'relative'
                      }}>
                        {freeClaimed && (
                          <div style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            background: 'rgba(34, 197, 94, 0.8)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.875rem',
                            color: 'white'
                          }}>
                            ✓
                          </div>
                        )}
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#94a3b8',
                          marginBottom: '0.5rem',
                          fontWeight: 'bold'
                        }}>
                          FREE
                        </div>
                        {tier.freeReward.type === 'actionCard' && tier.freeReward.actionCardName ? (
                          <>
                            {tier.freeReward.imageUrl ? (
                              <img 
                                src={tier.freeReward.imageUrl} 
                                alt={tier.freeReward.actionCardName}
                                style={{
                                  width: '100%',
                                  maxHeight: '80px',
                                  objectFit: 'contain',
                                  borderRadius: '0.5rem',
                                  marginBottom: '0.5rem'
                                }}
                              />
                            ) : (
                              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                                {getRewardIcon(tier.freeReward.type)}
                              </div>
                            )}
                            <div style={{ fontSize: '0.875rem', color: '#60a5fa', fontWeight: 'bold', textAlign: 'center' }}>
                              {tier.freeReward.actionCardName}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                              Action Card
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                              {getRewardIcon(tier.freeReward.type)}
                            </div>
                            <div style={{ fontSize: '1rem', color: '#60a5fa', fontWeight: 'bold', textAlign: 'center' }}>
                              {tier.freeReward.amount}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                              {tier.freeReward.type === 'pp' ? 'PP' : tier.freeReward.type === 'xp' ? 'XP' : 'Shards'}
                            </div>
                          </>
                        )}
                        <button
                          onClick={() => claimReward(tier.tier, false)}
                          disabled={!isUnlocked || freeClaimed}
                          style={{
                            width: '100%',
                            marginTop: '0.75rem',
                            padding: '0.5rem',
                            background: freeClaimed 
                              ? 'rgba(34, 197, 94, 0.4)'
                              : isUnlocked 
                                ? 'rgba(59, 130, 246, 0.6)'
                                : 'rgba(100, 100, 100, 0.3)',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: 'white',
                            cursor: isUnlocked && !freeClaimed ? 'pointer' : 'not-allowed',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (isUnlocked && !freeClaimed) {
                              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isUnlocked && !freeClaimed) {
                              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.6)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }
                          }}
                        >
                          {freeClaimed ? '✓ Claimed' : isUnlocked ? 'Claim' : 'Locked'}
                        </button>
                      </div>
                    )}

                    {/* Premium Reward */}
                    {tier.premiumReward && (
                      <div style={{
                        padding: '1rem',
                        background: premiumClaimed 
                          ? 'rgba(34, 197, 94, 0.15)'
                          : 'rgba(251, 191, 36, 0.1)',
                        borderRadius: '0.75rem',
                        border: `2px solid ${premiumClaimed 
                          ? 'rgba(34, 197, 94, 0.5)' 
                          : 'rgba(251, 191, 36, 0.3)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '140px',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.875rem',
                          fontWeight: 'bold',
                          color: '#1e293b',
                          boxShadow: '0 2px 8px rgba(251, 191, 36, 0.4)'
                        }}>
                          ⭐
                        </div>
                        {premiumClaimed && (
                          <div style={{
                            position: 'absolute',
                            top: '0.5rem',
                            left: '0.5rem',
                            background: 'rgba(34, 197, 94, 0.8)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.875rem',
                            color: 'white'
                          }}>
                            ✓
                          </div>
                        )}
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#fbbf24',
                          marginBottom: '0.5rem',
                          fontWeight: 'bold'
                        }}>
                          PREMIUM
                        </div>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                          {getRewardIcon(tier.premiumReward.type)}
                        </div>
                        <div style={{ fontSize: '1rem', color: '#fbbf24', fontWeight: 'bold', textAlign: 'center' }}>
                          {tier.premiumReward.amount}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                          {tier.premiumReward.type === 'pp' ? 'PP' : tier.premiumReward.type === 'xp' ? 'XP' : 'Shards'}
                        </div>
                        <button
                          onClick={() => claimReward(tier.tier, true)}
                          disabled={!isUnlocked || premiumClaimed || !battlePassProgress?.isPremium}
                          style={{
                            width: '100%',
                            marginTop: '0.75rem',
                            padding: '0.5rem',
                            background: premiumClaimed 
                              ? 'rgba(34, 197, 94, 0.4)'
                              : !battlePassProgress?.isPremium
                                ? 'rgba(100, 100, 100, 0.3)'
                                : isUnlocked 
                                  ? 'rgba(251, 191, 36, 0.6)'
                                  : 'rgba(100, 100, 100, 0.3)',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: 'white',
                            cursor: isUnlocked && !premiumClaimed && battlePassProgress?.isPremium ? 'pointer' : 'not-allowed',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (isUnlocked && !premiumClaimed && battlePassProgress?.isPremium) {
                              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.8)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isUnlocked && !premiumClaimed && battlePassProgress?.isPremium) {
                              e.currentTarget.style.background = 'rgba(251, 191, 36, 0.6)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }
                          }}
                        >
                          {premiumClaimed ? '✓ Claimed' : !battlePassProgress?.isPremium ? 'Premium Only' : isUnlocked ? 'Claim' : 'Locked'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reward Modal */}
      <BattlePassRewardModal
        isOpen={showRewardModal}
        onClose={() => {
          setShowRewardModal(false);
          setClaimedReward(null);
        }}
        reward={claimedReward?.reward || null}
        tier={claimedReward?.tier || 0}
        isPremium={claimedReward?.isPremium || false}
      />
    </div>
  );
};

export default BattlePass;

