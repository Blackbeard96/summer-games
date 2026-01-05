import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
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
}

const IslandRaidVictoryModal: React.FC<IslandRaidVictoryModalProps> = ({
  isOpen,
  onClose,
  waveNumber,
  difficulty,
  rewards,
  customTitle,
  customSubtitle
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
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 20000,
      animation: 'fadeIn 0.3s ease-in'
    }}
    onClick={!claimed ? undefined : onClose}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '1.5rem',
        padding: '2.5rem',
        maxWidth: '600px',
        width: '90%',
        border: '3px solid #fbbf24',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        animation: 'slideUp 0.3s ease-out',
        position: 'relative',
        textAlign: 'center'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        {!claimed ? (
          <>
            {/* Title */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                color: '#fbbf24',
                margin: 0,
                textShadow: '0 2px 10px rgba(251, 191, 36, 0.5)',
                marginBottom: '0.5rem'
              }}>
                {customTitle || '🏝️ ISLAND RAID COMPLETE!'}
              </h2>
              <p style={{
                fontSize: '1.25rem',
                color: '#cbd5e1',
                margin: 0
              }}>
                {customSubtitle || `All ${waveNumber} waves cleared on ${difficulty.toUpperCase()} difficulty!`}
              </p>
            </div>

            {/* Rewards Section */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '1rem',
              padding: '2rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{
                fontSize: '1.5rem',
                color: '#fbbf24',
                marginBottom: '1.5rem',
                marginTop: 0
              }}>
                🎁 Rewards
              </h3>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                alignItems: 'center'
              }}>
                {/* PP Reward */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  background: 'rgba(251, 191, 36, 0.1)',
                  padding: '1rem 1.5rem',
                  borderRadius: '0.75rem',
                  width: '100%',
                  maxWidth: '400px'
                }}>
                  <div style={{ fontSize: '2.5rem' }}>🪙</div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24' }}>
                      {rewards.pp} Power Points
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                      Already added to your account
                    </div>
                  </div>
                </div>

                {/* XP Reward */}
                {rewards.xp > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    background: 'rgba(34, 197, 94, 0.1)',
                    padding: '1rem 1.5rem',
                    borderRadius: '0.75rem',
                    width: '100%',
                    maxWidth: '400px'
                  }}>
                    <div style={{ fontSize: '2.5rem' }}>⭐</div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#22c55e' }}>
                        {rewards.xp} Experience Points
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                        Added to your account
                      </div>
                    </div>
                  </div>
                )}

                {/* Truth Metal Reward */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  padding: '1rem 1.5rem',
                  borderRadius: '0.75rem',
                  width: '100%',
                  maxWidth: '400px'
                }}>
                  <div style={{ fontSize: '2.5rem' }}>💎</div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#8b5cf6' }}>
                      {rewards.truthMetal} Truth Metal
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                      Rare currency
                    </div>
                  </div>
                </div>

                {/* Elemental Ring Reward */}
                {rewards.elementalRing && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    background: 'rgba(236, 72, 153, 0.1)',
                    padding: '1rem 1.5rem',
                    borderRadius: '0.75rem',
                    width: '100%',
                    maxWidth: '400px',
                    border: '2px solid rgba(236, 72, 153, 0.3)'
                  }}>
                    <div style={{ fontSize: '2.5rem' }}>
                      {rewards.elementalRing.image && (
                        <img 
                          src={rewards.elementalRing.image} 
                          alt={rewards.elementalRing.name}
                          style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ec4899' }}>
                        {rewards.elementalRing.name}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                        +1 Level to all {rewards.elementalRing.name.includes('Blaze') ? 'Fire' : 
                                       rewards.elementalRing.name.includes('Terra') ? 'Earth' :
                                       rewards.elementalRing.name.includes('Aqua') ? 'Water' : 'Air'} moves
                      </div>
                    </div>
                  </div>
                )}

                {/* Captain Helmet Reward */}
                {rewards.captainHelmet && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    background: 'rgba(251, 191, 36, 0.1)',
                    padding: '1rem 1.5rem',
                    borderRadius: '0.75rem',
                    width: '100%',
                    maxWidth: '400px',
                    border: '2px solid rgba(251, 191, 36, 0.3)'
                  }}>
                    <div style={{ fontSize: '2.5rem' }}>
                      <img 
                        src="/images/Captains Helmet.png" 
                        alt="Captain's Helmet"
                        style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.innerHTML = '🪖';
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24' }}>
                        Captain's Helmet
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                        +5% damage boost to all Manifest moves
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Claim Button */}
            <button
              onClick={handleClaimRewards}
              disabled={claiming}
              style={{
                background: claiming ? '#475569' : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '1rem 2rem',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                cursor: claiming ? 'not-allowed' : 'pointer',
                width: '100%',
                maxWidth: '400px',
                transition: 'all 0.2s',
                boxShadow: claiming ? 'none' : '0 4px 15px rgba(251, 191, 36, 0.4)'
              }}
              onMouseEnter={(e) => {
                if (!claiming) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {claiming ? 'Verifying...' : 'Continue'}
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#10b981',
                margin: 0
              }}>
                Rewards Claimed!
              </h2>
              <p style={{
                fontSize: '1rem',
                color: '#cbd5e1',
                marginTop: '0.5rem'
              }}>
                Your rewards have been added to your account.
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '1rem 2rem',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                maxWidth: '400px',
                transition: 'all 0.2s'
              }}
            >
              Continue
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(50px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default IslandRaidVictoryModal;


