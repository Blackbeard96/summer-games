import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface IslandRaidVictoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  waveNumber: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  rewards: {
    pp: number;
    xp: number;
    truthMetal: number;
    elementalRing?: {
      id: string;
      name: string;
      image: string;
    };
    captainHelmet?: boolean; // Captain Helmet reward
  };
  customTitle?: string; // Optional custom title
  customSubtitle?: string; // Optional custom subtitle
  /** Mission replay: rewards were already claimed on a prior completion. */
  rewardsAlreadyCollected?: boolean;
}

const IslandRaidVictoryModal: React.FC<IslandRaidVictoryModalProps> = ({
  isOpen,
  onClose,
  waveNumber,
  difficulty,
  rewards,
  customTitle,
  customSubtitle,
  rewardsAlreadyCollected = false,
}) => {
  const { currentUser } = useAuth();
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClaimed(false);
      setClaiming(false);
    }
  }, [isOpen]);

  const handleClaimRewards = async () => {
    if (!currentUser || claiming) return;

    setClaiming(true);

    try {
      // Note: Rewards are already granted to all players when battle completes
      // This function just marks them as "claimed" for UI purposes
      // Verify rewards were granted by checking student data
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);

      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        
        // Check if Captain Helmet was granted (if it was in rewards)
        if (rewards.captainHelmet) {
          const hasHelmet = studentData.artifacts?.['captains-helmet'] === true;
          if (!hasHelmet) {
            // If helmet wasn't granted yet, grant it now (fallback)
            const currentArtifacts = studentData.artifacts || {};
            const updatedArtifacts = {
              ...currentArtifacts,
              'captains-helmet': true,
              'captains-helmet_purchase': {
                id: 'captains-helmet',
                name: 'Captain\'s Helmet',
                image: '/images/Captains Helmet.png',
                slot: 'head',
                category: 'armor',
                rarity: 'rare',
                stats: {
                  manifestDamageBoost: 0.05 // 5% boost
                },
                obtainedAt: new Date(),
                fromIslandRaid: true
              }
            };
            
            await updateDoc(studentRef, {
              artifacts: updatedArtifacts
            });
            console.log('✅ Captain Helmet granted (fallback)');
          }
        }
        
        // Check if elemental ring was granted (if it was in rewards)
        if (rewards.elementalRing) {
          const hasRing = studentData.artifacts?.[rewards.elementalRing.id] === true;
          if (!hasRing) {
            // If ring wasn't granted yet, grant it now (fallback)
            const currentArtifacts = studentData.artifacts || {};
            const updatedArtifacts = {
              ...currentArtifacts,
              [rewards.elementalRing.id]: true,
              [`${rewards.elementalRing.id}_purchase`]: {
                id: rewards.elementalRing.id,
                name: rewards.elementalRing.name,
                image: rewards.elementalRing.image,
                category: 'ring',
                rarity: 'rare',
                purchasedAt: new Date(),
                used: false,
                fromIslandRaid: true
              }
            };
            
            await updateDoc(studentRef, {
              artifacts: updatedArtifacts
            });
            console.log('✅ Elemental Ring granted (fallback)');
          }
        }

        setClaimed(true);
        console.log('✅ Island Raid rewards displayed. Rewards were already granted when battle completed.');
      }
    } catch (error) {
      console.error('Error verifying Island Raid rewards:', error);
      // Don't show error to user - rewards were already granted
      setClaimed(true);
    } finally {
      setClaiming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="mst-victory-backdrop"
      onClick={!claimed ? undefined : onClose}
    >
      <div
        className="mst-victory-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mst-victory-title"
      >
        {!claimed ? (
          <>
            <div className="mst-victory-check" aria-hidden="true">✓</div>
            <h2 id="mst-victory-title" className="mst-victory-title">
              {customTitle || 'Island Raid Complete!'}
            </h2>
            <p className="mst-victory-subtitle">
              {customSubtitle || `All ${waveNumber} waves cleared on ${difficulty.toUpperCase()} difficulty!`}
            </p>

            <div className="mst-victory-rewards">
              <h3 className="mst-victory-rewards-title">🎁 Rewards</h3>
              {rewardsAlreadyCollected ? (
                <p className="mst-victory-subtitle" style={{ marginBottom: '1rem' }}>
                  You already collected this mission&apos;s rewards. Replays do not grant them again.
                </p>
              ) : null}
              <div className="mst-victory-reward-list">
                <div className="mst-victory-reward mst-victory-reward--pp">
                  <div className="mst-victory-reward-icon" aria-hidden="true">🪙</div>
                  <div className="mst-victory-reward-body">
                    <div className="mst-victory-reward-amount">{rewards.pp} Power Points</div>
                    <div className="mst-victory-reward-note">
                      {rewardsAlreadyCollected
                        ? 'Already collected'
                        : 'Already added to your account'}
                    </div>
                  </div>
                </div>

                {rewards.xp > 0 && (
                  <div className="mst-victory-reward mst-victory-reward--xp">
                    <div className="mst-victory-reward-icon" aria-hidden="true">⭐</div>
                    <div className="mst-victory-reward-body">
                      <div className="mst-victory-reward-amount">{rewards.xp} Experience Points</div>
                      <div className="mst-victory-reward-note">
                        {rewardsAlreadyCollected ? 'Already collected' : 'Added to your account'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mst-victory-reward mst-victory-reward--tm">
                  <div className="mst-victory-reward-icon" aria-hidden="true">💎</div>
                  <div className="mst-victory-reward-body">
                    <div className="mst-victory-reward-amount">{rewards.truthMetal} Truth Metal</div>
                    <div className="mst-victory-reward-note">
                      {rewardsAlreadyCollected ? 'Already collected' : 'Rare currency'}
                    </div>
                  </div>
                </div>

                {rewards.elementalRing && (
                  <div className="mst-victory-reward mst-victory-reward--artifact">
                    <div className="mst-victory-reward-icon">
                      {rewards.elementalRing.image ? (
                        <img
                          src={rewards.elementalRing.image}
                          alt={rewards.elementalRing.name}
                        />
                      ) : (
                        <span aria-hidden="true">💍</span>
                      )}
                    </div>
                    <div className="mst-victory-reward-body">
                      <div className="mst-victory-reward-amount">{rewards.elementalRing.name}</div>
                      <div className="mst-victory-reward-note">
                        +1 Level to all{' '}
                        {rewards.elementalRing.name.includes('Blaze')
                          ? 'Fire'
                          : rewards.elementalRing.name.includes('Terra')
                            ? 'Earth'
                            : rewards.elementalRing.name.includes('Aqua')
                              ? 'Water'
                              : 'Air'}{' '}
                        moves
                      </div>
                    </div>
                  </div>
                )}

                {rewards.captainHelmet && (
                  <div className="mst-victory-reward mst-victory-reward--helmet">
                    <div className="mst-victory-reward-icon">
                      <img
                        src="/images/Captains Helmet.png"
                        alt="Captain's Helmet"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.innerHTML = '🪖';
                        }}
                      />
                    </div>
                    <div className="mst-victory-reward-body">
                      <div className="mst-victory-reward-amount">Captain&apos;s Helmet</div>
                      <div className="mst-victory-reward-note">
                        +5% damage boost to all Manifest moves
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="mst-victory-cta"
              onClick={handleClaimRewards}
              disabled={claiming}
            >
              {claiming ? 'Verifying...' : 'Continue'}
            </button>
          </>
        ) : (
          <>
            <div className="mst-victory-check" aria-hidden="true">✓</div>
            <h2 id="mst-victory-title" className="mst-victory-title" style={{ color: '#6ee7a8' }}>
              Rewards Claimed!
            </h2>
            <p className="mst-victory-subtitle">
              Your rewards have been added to your account.
            </p>
            <button
              type="button"
              className="mst-victory-cta mst-victory-cta--claimed"
              onClick={onClose}
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default IslandRaidVictoryModal;
