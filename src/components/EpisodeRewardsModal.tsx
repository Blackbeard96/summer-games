import React, { useState } from 'react';
import { StoryEpisode, StoryReward, PATH_CHOICES } from '../types/story';
import { useStory } from '../context/StoryContext';
import { useBattle } from '../context/BattleContext';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface EpisodeRewardsModalProps {
  episode: StoryEpisode;
  onClose: () => void;
  onClaimComplete: () => void;
}

const EpisodeRewardsModal: React.FC<EpisodeRewardsModalProps> = ({ episode, onClose, onClaimComplete }) => {
  const { claimRewards } = useStory();
  const { currentUser } = useAuth();
  const { unlockMove, unlockActionCard } = useBattle();
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const isEpisode9 = episode.id === 'ep_09_pressure_points';

  // Grant fixed rewards from episode completion
  const grantFixedRewards = async (fixedRewards: string[]) => {
    if (!currentUser) return;

    for (const rewardId of fixedRewards) {
      try {
        // Map reward IDs to actual system unlocks
        if (rewardId.includes('move_')) {
          await unlockMove(rewardId);
        } else if (rewardId.includes('card_') || rewardId.includes('action_card_')) {
          await unlockActionCard(rewardId);
        } else if (rewardId.includes('vault_')) {
          // Handle vault upgrades
          await grantVaultUpgrade(rewardId);
        } else if (rewardId.includes('artifact_')) {
          // Handle artifact rewards
          await grantArtifact(rewardId);
        }
      } catch (error) {
        console.error(`Failed to grant reward ${rewardId}:`, error);
      }
    }
  };

  // Grant choice-based rewards
  const grantChoiceReward = async (choiceId: string) => {
    if (!currentUser) return;

    try {
      // Map choice rewards to actual unlocks
      if (choiceId.includes('move_')) {
        await unlockMove(choiceId);
      } else if (choiceId.includes('card_') || choiceId.includes('action_card_')) {
        await unlockActionCard(choiceId);
      } else if (choiceId.includes('vault_')) {
        await grantVaultUpgrade(choiceId);
      } else if (choiceId.includes('artifact_')) {
        await grantArtifact(choiceId);
      }
    } catch (error) {
      console.error(`Failed to grant choice reward ${choiceId}:`, error);
    }
  };

  // Grant vault upgrades
  const grantVaultUpgrade = async (upgradeId: string) => {
    if (!currentUser) return;

    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const vaultDoc = await getDoc(vaultRef);
      
      if (vaultDoc.exists()) {
        const currentVault = vaultDoc.data();
        
        // Apply specific vault upgrades based on reward ID
        const updates: any = {};
        
        if (upgradeId === 'vault_materials_shield_core') {
          updates.maxShieldStrength = Math.min(60, (currentVault.maxShieldStrength || 50) + 5);
          updates.shieldStrength = updates.maxShieldStrength; // Restore to max
        } else if (upgradeId === 'firewall_module_v1') {
          updates.firewall = Math.min(20, (currentVault.firewall || 10) + 5);
        } else if (upgradeId.includes('capacity')) {
          updates.capacity = Math.min(2000, (currentVault.capacity || 1000) + 200);
        }
        
        if (Object.keys(updates).length > 0) {
          await updateDoc(vaultRef, updates);
        }
      }
    } catch (error) {
      console.error('Failed to grant vault upgrade:', error);
    }
  };

  // Grant artifact rewards
  const grantArtifact = async (artifactId: string) => {
    if (!currentUser) return;

    try {
      // For now, artifacts are tracked as unlocked items in the user's profile
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const unlockedArtifacts = userData.unlockedArtifacts || [];
        
        if (!unlockedArtifacts.includes(artifactId)) {
          await updateDoc(userRef, {
            unlockedArtifacts: [...unlockedArtifacts, artifactId]
          });
        }
      }
    } catch (error) {
      console.error('Failed to grant artifact:', error);
    }
  };

  const handleClaimRewards = async () => {
    if (!currentUser) return;
    
    // For episodes with choices, require a selection
    if ((episode.rewards.choices.length > 0 || isEpisode9) && !selectedChoice) {
      alert('Please select a reward choice before claiming!');
      return;
    }

    setClaiming(true);
    
    try {
      // Claim the episode rewards
      await claimRewards(episode.id);

      // Update player stats with PP and XP
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);

      await updateDoc(userRef, {
        powerPoints: increment(episode.rewards.pp),
        xp: increment(episode.rewards.xp)
      });

      await updateDoc(studentRef, {
        powerPoints: increment(episode.rewards.pp),
        xp: increment(episode.rewards.xp)
      });

      // Grant fixed rewards (moves, items, artifacts, etc.)
      await grantFixedRewards(episode.rewards.fixed);

      // Grant selected choice reward if applicable
      if (selectedChoice) {
        await grantChoiceReward(selectedChoice);
      }
      
      setClaimed(true);
      
      // Wait a moment before closing
      setTimeout(() => {
        onClaimComplete();
      }, 2000);
      
    } catch (error) {
      console.error('Error claiming rewards:', error);
      alert('Failed to claim rewards. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '2rem',
      animation: 'fadeIn 0.3s ease-in-out'
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
      `}</style>
      
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)',
        borderRadius: '1.5rem',
        padding: '3rem',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        animation: 'slideUp 0.4s ease-out'
      }}>
        {/* Victory Header */}
        {!claimed && (
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              fontSize: '4rem',
              marginBottom: '1rem',
              animation: 'pulse 2s ease-in-out infinite'
            }}>
              🎉
            </div>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '0.5rem',
              textShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}>
              Victory!
            </h2>
            <p style={{
              fontSize: '1.25rem',
              color: 'rgba(255, 255, 255, 0.8)',
              marginBottom: '0.5rem'
            }}>
              {episode.title} Complete
            </p>
            <div style={{
              background: 'linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24)',
              backgroundSize: '200% auto',
              animation: 'shimmer 3s linear infinite',
              height: '3px',
              width: '200px',
              margin: '1rem auto',
              borderRadius: '2px'
            }} />
          </div>
        )}

        {/* Success Message After Claiming */}
        {claimed && (
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: '#10b981',
              marginBottom: '1rem'
            }}>
              Rewards Claimed!
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
              Your rewards have been added to your inventory.
            </p>
          </div>
        )}

        {!claimed && (
          <>
            {/* Fixed Rewards */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '1rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: 'white',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>🎁</span> Fixed Rewards
              </h3>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                {episode.rewards.fixed.map((reward, index) => (
                  <li key={index} style={{
                    color: 'rgba(255, 255, 255, 0.9)',
                    padding: '0.75rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}>
                    <span style={{ fontSize: '1.25rem' }}>✓</span>
                    <span>{reward}</span>
                  </li>
                ))}
                <li style={{
                  color: '#fbbf24',
                  padding: '0.75rem',
                  background: 'rgba(251, 191, 36, 0.1)',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: '1px solid rgba(251, 191, 36, 0.3)'
                }}>
                  <span>💰</span>
                  <span>{episode.rewards.pp} Power Points</span>
                </li>
                <li style={{
                  color: '#a78bfa',
                  padding: '0.75rem',
                  background: 'rgba(167, 139, 250, 0.1)',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: '1px solid rgba(167, 139, 250, 0.3)'
                }}>
                  <span>⭐</span>
                  <span>{episode.rewards.xp} Experience Points</span>
                </li>
              </ul>
            </div>

            {/* Choice Rewards - Episode 9 Path Selection */}
            {isEpisode9 && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <h3 style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: 'white',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>🛤️</span> Choose Your Path
                </h3>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '0.875rem',
                  marginBottom: '1rem'
                }}>
                  Select your ascension path - this choice will define your playstyle
                </p>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  {Object.entries(PATH_CHOICES).map(([pathId, pathData]) => (
                    <button
                      key={pathId}
                      onClick={() => setSelectedChoice(pathId)}
                      style={{
                        background: selectedChoice === pathId
                          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                          : 'rgba(255, 255, 255, 0.05)',
                        border: selectedChoice === pathId
                          ? '2px solid #10b981'
                          : '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                        transform: selectedChoice === pathId ? 'scale(1.02)' : 'scale(1)'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedChoice !== pathId) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedChoice !== pathId) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                    >
                      <div style={{
                        fontWeight: 'bold',
                        color: 'white',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        {selectedChoice === pathId && <span>✓</span>}
                        <span>{pathData.name}</span>
                      </div>
                      <div style={{
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '0.875rem',
                        marginBottom: '0.5rem'
                      }}>
                        {pathData.description}
                      </div>
                      <div style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '0.75rem'
                      }}>
                        Rewards: {pathData.rewards.join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Regular Choice Rewards */}
            {!isEpisode9 && episode.rewards.choices.length > 0 && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <h3 style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: 'white',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>🎯</span> Choose One Reward
                </h3>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '0.875rem',
                  marginBottom: '1rem'
                }}>
                  Select one of the following rewards
                </p>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  {episode.rewards.choices.map((choice, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedChoice(choice)}
                      style={{
                        background: selectedChoice === choice
                          ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                          : 'rgba(255, 255, 255, 0.05)',
                        border: selectedChoice === choice
                          ? '2px solid #3b82f6'
                          : '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedChoice !== choice) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedChoice !== choice) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                    >
                      {selectedChoice === choice && <span style={{ fontSize: '1.25rem' }}>✓</span>}
                      <span>{choice}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '2rem'
            }}>
              <button
                onClick={onClose}
                disabled={claiming}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: claiming ? 'not-allowed' : 'pointer',
                  opacity: claiming ? 0.5 : 1,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!claiming) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                Close
              </button>
              <button
                onClick={handleClaimRewards}
                disabled={claiming}
                style={{
                  flex: 2,
                  background: claiming
                    ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: claiming ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: claiming ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (!claiming) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                }}
              >
                {claiming ? '⏳ Claiming Rewards...' : '🎁 Claim Rewards'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EpisodeRewardsModal;

