import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, serverTimestamp, onSnapshot, increment, runTransaction, setDoc } from 'firebase/firestore';
import { getTodayDateStringEastern, getDayStartForDateEastern, getNextResetTimeEastern } from '../utils/dailyChallengeDateUtils';
import { createLiveFeedMilestone } from '../services/liveFeed';
import { getLevelFromXP } from '../utils/leveling';

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  type: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'use_manifest_ability' | 'use_health_potion' | 'custom';
  target: number;
  rewardPP: number;
  rewardXP: number;
  rewardTruthMetal?: number;
}

interface PlayerChallengeProgress {
  challengeId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  target: number;
}

const getTypeIcon = (type: DailyChallenge['type']): string => {
  switch (type) {
    case 'use_health_potion':
      return '🧪';
    case 'use_elemental_move':
      return '🔥';
    case 'defeat_enemies':
      return '⚔️';
    case 'attack_vault':
      return '🏰';
    case 'use_action_card':
      return '🃏';
    case 'win_battle':
      return '🏆';
    case 'earn_pp':
      return '🪙';
    case 'use_manifest_ability':
      return '✨';
    default:
      return '📋';
  }
};

const DailyChallengesCompact: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [progress, setProgress] = useState<{ [challengeId: string]: PlayerChallengeProgress }>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [resetTimer, setResetTimer] = useState<string>('');

  useEffect(() => {
    if (currentUser) {
      loadDailyChallenges();
      
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      
      // Helper to check if error is a Firestore internal assertion error
      const isFirestoreInternalError = (error: any): boolean => {
        if (!error) return false;
        const errorString = String(error);
        const errorMessage = error?.message || '';
        return errorString.includes('INTERNAL ASSERTION FAILED') || 
               errorMessage.includes('INTERNAL ASSERTION FAILED') ||
               errorString.includes('ID: ca9') ||
               (errorMessage.includes('FIRESTORE') && errorMessage.includes('Unexpected state'));
      };
      
      // Guard to prevent recursive calls
      let isAssigning = false;
      
      const unsubscribe = onSnapshot(playerChallengesRef, (doc) => {
        // Make callback synchronous, defer async work
        setTimeout(async () => {
          try {
            if (doc.exists()) {
              const data = doc.data();
              const today = getTodayDateStringEastern();
              
              // If challenges are not for today, assign new ones
              if (data.assignedDate !== today) {
                if (!isAssigning) {
                  isAssigning = true;
                  console.log('[DailyChallengesCompact] Challenges not for today, assigning new challenges...');
                  try {
                    await assignNewChallengesIfNeeded();
                  } finally {
                    isAssigning = false;
                  }
                }
                return;
              }
              
              if (data.challenges) {
                // Use functional update to avoid stale closure
                setProgress((previousProgress) => {
                  const progressMap: { [key: string]: PlayerChallengeProgress } = {};
                  
                  data.challenges.forEach((c: PlayerChallengeProgress) => {
                    progressMap[c.challengeId] = c;
                    
                    // Check if challenge just completed
                    const prevChallenge = previousProgress[c.challengeId];
                    if (!prevChallenge?.completed && c.completed && !c.claimed) {
                      autoGrantRewards(c.challengeId).catch(err => {
                        console.error('Error auto-granting rewards:', err);
                      });
                    }
                  });
                  
                  return progressMap;
                });
              } else {
                // No challenges assigned, assign new ones
                if (!isAssigning) {
                  isAssigning = true;
                  console.log('[DailyChallengesCompact] No challenges found, assigning new challenges...');
                  try {
                    await assignNewChallengesIfNeeded();
                  } finally {
                    isAssigning = false;
                  }
                }
              }
            } else {
              // Document doesn't exist, assign new challenges
              if (!isAssigning) {
                isAssigning = true;
                console.log('[DailyChallengesCompact] Challenge document doesn\'t exist, assigning new challenges...');
                try {
                  await assignNewChallengesIfNeeded();
                } finally {
                  isAssigning = false;
                }
              }
            }
          } catch (error) {
            if (isFirestoreInternalError(error)) {
              console.warn('[DailyChallengesCompact] Firestore internal assertion error - ignoring');
              return;
            }
            console.error('[DailyChallengesCompact] Error processing snapshot:', error);
          }
        }, 0); // Execute async work on next tick
      }, (error) => {
        if (isFirestoreInternalError(error)) {
          console.warn('[DailyChallengesCompact] Firestore internal assertion error in listener - ignoring');
          return;
        }
        console.error('Error listening to daily challenges:', error);
      });
      
      return () => unsubscribe();
    }
  }, [currentUser]);

  useEffect(() => {
    const updateResetTimer = () => {
      const resetTime = getNextResetTimeEastern();
      const now = new Date();
      const diff = resetTime.getTime() - now.getTime();
      
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setResetTimer(`${hours}h ${minutes}m`);
      } else {
        setResetTimer('Resetting...');
      }
    };

    updateResetTimer();
    const interval = setInterval(updateResetTimer, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadDailyChallenges = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      const today = getTodayDateStringEastern();
      
      // Check if player has challenges assigned for today
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      const playerChallengesDoc = await getDoc(playerChallengesRef);
      
      let needsNewChallenges = false;
      
      if (playerChallengesDoc.exists()) {
        const data = playerChallengesDoc.data();
        if (data.assignedDate !== today || !data.challenges || data.challenges.length === 0) {
          needsNewChallenges = true;
        } else {
          // Load existing progress
          const progressMap: { [key: string]: PlayerChallengeProgress } = {};
          data.challenges.forEach((c: PlayerChallengeProgress) => {
            progressMap[c.challengeId] = c;
          });
          setProgress(progressMap);
        }
      } else {
        needsNewChallenges = true;
      }
      
      // Assign new challenges if needed
      if (needsNewChallenges) {
        await assignNewChallengesIfNeeded();
      }
      
      // Load challenge definitions
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      const snapshot = await getDocs(challengesRef);
      const challengesList: DailyChallenge[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isActive !== false) {
          challengesList.push({ id: doc.id, ...data } as DailyChallenge);
        }
      });
      
      setChallenges(challengesList);
    } catch (error) {
      console.error('Error loading daily challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignNewChallengesIfNeeded = async () => {
    if (!currentUser) return;
    
    try {
      const today = getTodayDateStringEastern();
      
      // Check if challenges already exist for today
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      const playerChallengesDoc = await getDoc(playerChallengesRef);
      
      if (playerChallengesDoc.exists()) {
        const data = playerChallengesDoc.data();
        if (data.assignedDate === today && data.challenges && data.challenges.length > 0) {
          // Challenges already assigned for today
          console.log('[DailyChallengesCompact] Challenges already assigned for today');
          return;
        }
      }
      
      // Get all active challenges
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      const snapshot = await getDocs(challengesRef);
      const activeChallenges: DailyChallenge[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isActive !== false) {
          activeChallenges.push({ id: doc.id, ...data } as DailyChallenge);
        }
      });
      
      if (activeChallenges.length === 0) {
        console.warn('[DailyChallengesCompact] No active challenges available to assign');
        return;
      }
      
      // Randomly select 3 challenges
      const shuffled = [...activeChallenges].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Math.min(3, shuffled.length));
      
      const assigned: PlayerChallengeProgress[] = selected.map(challenge => ({
        challengeId: challenge.id,
        progress: 0,
        completed: false,
        claimed: false,
        target: challenge.target,
        type: challenge.type // Store type for efficient tracking
      }));
      
      // Save to player's daily challenges
      await setDoc(playerChallengesRef, {
        challenges: assigned,
        assignedDate: today,
        updatedAt: serverTimestamp()
      });
      
      console.log('[DailyChallengesCompact] ✅ Assigned new challenges for today:', assigned.map(c => c.challengeId));
      
      // Update local progress state
      const progressMap: { [key: string]: PlayerChallengeProgress } = {};
      assigned.forEach(c => {
        progressMap[c.challengeId] = c;
      });
      setProgress(progressMap);
    } catch (error) {
      console.error('[DailyChallengesCompact] Error assigning challenges:', error);
    }
  };

  const autoGrantRewards = async (challengeId: string) => {
    if (!currentUser) return;
    
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      await runTransaction(db, async (transaction) => {
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists()) return;

        const studentData = studentDoc.data();
        const updates: any = {
          xp: increment(challenge.rewardXP),
          pp: increment(challenge.rewardPP)
        };

        if (challenge.rewardTruthMetal && challenge.rewardTruthMetal > 0) {
          updates.truthMetal = increment(challenge.rewardTruthMetal);
        }

        transaction.update(studentRef, updates);
      });
    } catch (error) {
      console.error('Error auto-granting rewards:', error);
    }
  };

  const handleClaimReward = async (challenge: DailyChallenge) => {
    if (!currentUser || claiming) return;
    
    setClaiming(challenge.id);
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      
      await runTransaction(db, async (transaction) => {
        const studentDoc = await transaction.get(studentRef);
        const challengesDoc = await transaction.get(playerChallengesRef);
        
        if (!studentDoc.exists() || !challengesDoc.exists()) return;

        const studentData = studentDoc.data();
        const challengesData = challengesDoc.data();
        const today = getTodayDateStringEastern();
        
        if (challengesData.assignedDate !== today) return;

        const challengeProgress = challengesData.challenges?.find(
          (c: PlayerChallengeProgress) => c.challengeId === challenge.id
        );
        
        if (!challengeProgress || !challengeProgress.completed || challengeProgress.claimed) {
          return;
        }

        const updates: any = {
          xp: increment(challenge.rewardXP),
          pp: increment(challenge.rewardPP)
        };

        if (challenge.rewardTruthMetal && challenge.rewardTruthMetal > 0) {
          updates.truthMetal = increment(challenge.rewardTruthMetal);
        }

        transaction.update(studentRef, updates);

        const updatedChallenges = challengesData.challenges.map((c: PlayerChallengeProgress) => {
          if (c.challengeId === challenge.id) {
            return { ...c, claimed: true };
          }
          return c;
        });

        transaction.update(playerChallengesRef, {
          challenges: updatedChallenges
        });
      });

      // Create milestone event after successful claim
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const studentRef = doc(db, 'students', currentUser.uid);
        const [userDoc, studentDoc] = await Promise.all([
          getDoc(userRef),
          getDoc(studentRef)
        ]);

        const userData = userDoc.exists() ? userDoc.data() : null;
        const studentData = studentDoc.exists() ? studentDoc.data() : null;
        const displayName = userData?.displayName || currentUser.displayName || 'Unknown';
        const photoURL = userData?.photoURL || currentUser.photoURL || undefined;
        const role = userData?.role || undefined;
        const xp = studentData?.xp || 0;
        const level = getLevelFromXP(xp);

        await createLiveFeedMilestone(
          currentUser.uid,
          displayName,
          photoURL,
          role,
          level,
          'challenge_complete',
          {
            challengeTitle: challenge.title,
            ppEarned: challenge.rewardPP,
            xpEarned: challenge.rewardXP
          },
          challenge.id
        );
      } catch (milestoneError) {
        console.error('Error creating milestone event:', milestoneError);
        // Don't fail the claim if milestone creation fails
      }
    } catch (error) {
      console.error('Error claiming reward:', error);
      alert('Failed to claim reward. Please try again.');
    } finally {
      setClaiming(null);
    }
  };

  const getProgressPercentage = (challenge: DailyChallenge): number => {
    const challengeProgress = progress[challenge.id];
    if (!challengeProgress) return 0;
    const target = challenge.target || 1;
    return Math.min(100, (challengeProgress.progress / target) * 100);
  };

  const getEffectiveTarget = (challenge: DailyChallenge): number => {
    return challenge.target || 1;
  };

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'rgba(255, 255, 255, 0.7)' }}>
        Loading challenges...
      </div>
    );
  }

  // Show only assigned challenges (filter to challenges that have progress)
  // This ensures we only show challenges that were actually assigned to the player
  const displayChallenges = challenges.filter(c => progress[c.id] !== undefined).slice(0, 3);

  return (
    <div style={{
      background: 'rgba(31, 41, 55, 0.85)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '1rem',
      padding: '1.5rem',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: 'white'
          }}>
            📅 Daily Challenges
          </h2>
        </div>
        <div style={{
          background: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem',
          fontSize: '0.75rem',
          color: '#fbbf24',
          fontWeight: '500'
        }}>
          ⏰ {resetTimer || 'Calculating...'}
        </div>
      </div>


      {/* Challenges List - Compact */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        marginBottom: '1rem',
        overflowY: 'auto',
        maxHeight: '500px'
      }}>
        {displayChallenges.map((challenge) => {
          const challengeProgress = progress[challenge.id];
          const progressPercent = getProgressPercentage(challenge);
          const isCompleted = challengeProgress?.completed || false;
          const isClaimed = challengeProgress?.claimed || false;

          return (
            <div
              key={challenge.id}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid',
                borderColor: isCompleted ? (isClaimed ? 'rgba(255, 255, 255, 0.2)' : '#10b981') : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '0.5rem',
                padding: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>
                  {getTypeIcon(challenge.type)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    color: 'white',
                    marginBottom: '0.25rem'
                  }}>
                    {challenge.title}
                  </h3>
                  
                  {/* Progress Bar */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.25rem'
                    }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: 'rgba(255, 255, 255, 0.9)'
                      }}>
                        Progress: {challengeProgress?.progress || 0} / {getEffectiveTarget(challenge)}
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '6px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        background: isCompleted ? '#10b981' : '#4f46e5',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>

                  {/* Rewards - Compact */}
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(251, 191, 36, 0.2)',
                      color: '#fbbf24',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      🪙 {challenge.rewardPP} PP
                    </span>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#60a5fa',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      ⭐ {challenge.rewardXP} XP
                    </span>
                  </div>

                  {/* Claim Button - Compact */}
                  {isCompleted && !isClaimed && (
                    <button
                      onClick={() => handleClaimReward(challenge)}
                      disabled={claiming === challenge.id}
                      style={{
                        width: '100%',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: claiming === challenge.id ? 'not-allowed' : 'pointer',
                        opacity: claiming === challenge.id ? 0.7 : 1
                      }}
                    >
                      {claiming === challenge.id ? 'Claiming...' : '🎁 Claim'}
                    </button>
                  )}
                  {isClaimed && (
                    <div style={{
                      padding: '0.5rem',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center'
                    }}>
                      ✅ Claimed
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View All Button */}
      <button
        onClick={() => {
          // Navigate to home with hash to scroll to full challenges section
          // If a dedicated challenges page exists, update this route
          window.location.hash = 'daily-challenges';
          navigate('/home#daily-challenges');
        }}
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
        View All Challenges →
      </button>
    </div>
  );
};

export default DailyChallengesCompact;

