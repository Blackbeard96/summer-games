import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp, onSnapshot, increment } from 'firebase/firestore';

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
  assignedDate: string; // YYYY-MM-DD format
  type?: string; // Challenge type for easier tracking
  target?: number; // Target value for easier tracking
}

const DailyChallenges: React.FC = () => {
  const { currentUser } = useAuth();
  const [challenges, setChallenges] = useState<DailyChallenge[]>([]);
  const [progress, setProgress] = useState<{ [challengeId: string]: PlayerChallengeProgress }>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [resetTimer, setResetTimer] = useState<string>('');

  useEffect(() => {
    if (currentUser) {
      loadDailyChallenges();
      
      // Set up real-time listener for challenge progress updates
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      const unsubscribe = onSnapshot(playerChallengesRef, async (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const today = getTodayDateString();
          
          if (data.assignedDate === today && data.challenges) {
            const progressMap: { [key: string]: PlayerChallengeProgress } = {};
            const previousProgress = progress; // Store previous state for comparison
            
            data.challenges.forEach((c: PlayerChallengeProgress) => {
              progressMap[c.challengeId] = c;
              
              // Check if challenge just completed (wasn't completed before, but is now)
              const prevChallenge = previousProgress[c.challengeId];
              if (!prevChallenge?.completed && c.completed && !c.claimed) {
                // Challenge just completed - automatically grant rewards
                autoGrantRewards(c.challengeId).catch(err => {
                  console.error('Error auto-granting rewards:', err);
                });
              }
            });
            setProgress(progressMap);
          }
        }
      }, (error) => {
        console.error('Error listening to daily challenges:', error);
      });
      
      return () => unsubscribe();
    }
  }, [currentUser]);

  // Helper to get "day" start time (8am Eastern Time) for a given date
  // Properly handles EST (UTC-5) and EDT (UTC-4) automatically using America/New_York timezone
  const getDayStartForDate = (date: Date): Date => {
    // Get current date/time in Eastern Time
    const easternNow = date.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Parse the Eastern Time string
    const parts = easternNow.split(', ');
    const datePart = parts[0];
    const timePart = parts[1];
    const [month, day, year] = datePart.split('/');
    const [hour] = timePart.split(':');
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month) - 1; // JS months are 0-indexed
    const dayNum = parseInt(day);
    const currentHour = parseInt(hour);
    
    // Determine which day's 8am to use
    let targetYear = yearNum;
    let targetMonth = monthNum;
    let targetDay = dayNum;
    
    // If current Eastern time is before 8am, use previous day's 8am
    if (currentHour < 8) {
      const prevDate = new Date(yearNum, monthNum, dayNum - 1);
      targetYear = prevDate.getFullYear();
      targetMonth = prevDate.getMonth();
      targetDay = prevDate.getDate();
    }
    
    // Find what UTC time corresponds to 8am Eastern on the target date
    // Test both EST (13:00 UTC) and EDT (12:00 UTC) possibilities
    // EST: 8am Eastern = 13:00 UTC (UTC-5)
    // EDT: 8am Eastern = 12:00 UTC (UTC-4)
    
    // Try 13:00 UTC first (EST)
    let testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
    let easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    let easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    
    if (easternHour === 8) {
      // EST: 8am Eastern = 13:00 UTC
      return testUTC;
    }
    
    // Try 12:00 UTC (EDT)
    testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0));
    easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    
    if (easternHour === 8) {
      // EDT: 8am Eastern = 12:00 UTC
      return testUTC;
    }
    
    // Fallback (shouldn't happen, but just in case)
    return testUTC;
  };

  // Calculate next reset time (8am Eastern Time each day)
  const getNextResetTime = (): Date => {
    const now = new Date();
    
    // Get today's 8am Eastern Time
    const today8amEastern = getDayStartForDate(now);
    
    // If current time is already past today's 8am Eastern, get tomorrow's 8am Eastern
    if (now >= today8amEastern) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return getDayStartForDate(tomorrow);
    }
    
    return today8amEastern;
  };

  // Update reset timer every second
  useEffect(() => {
    const updateTimer = () => {
      const nextReset = getNextResetTime();
      const now = new Date();
      const diff = nextReset.getTime() - now.getTime();
      
      if (diff <= 0) {
        setResetTimer('Resetting now...');
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setResetTimer(`${hours}h ${minutes}m ${seconds}s`);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  // Automatically grant rewards when a challenge completes
  const autoGrantRewards = async (challengeId: string) => {
    if (!currentUser) return;

    try {
      // Fetch challenge details
      const challengeDoc = await getDoc(doc(db, 'adminSettings', 'dailyChallenges', 'challenges', challengeId));
      if (!challengeDoc.exists()) {
        console.error('[Daily Challenges] Challenge not found:', challengeId);
        return;
      }
      const challengeData = challengeDoc.data() as DailyChallenge;
      
      // Grant rewards using atomic updates
      const studentRef = doc(db, 'students', currentUser.uid);
      const updateData: any = {
        powerPoints: increment(challengeData.rewardPP),
        xp: increment(challengeData.rewardXP)
      };
      if (challengeData.rewardTruthMetal) {
        updateData.truthMetal = increment(challengeData.rewardTruthMetal);
      }
      await updateDoc(studentRef, updateData);

      // Mark as claimed
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      const currentData = (await getDoc(playerChallengesRef)).data();
      if (currentData && currentData.challenges) {
        const updatedChallenges = currentData.challenges.map((c: PlayerChallengeProgress) => 
          c.challengeId === challengeId ? { ...c, claimed: true } : c
        );
        await updateDoc(playerChallengesRef, {
          challenges: updatedChallenges
        });
      }
      
      console.log(`[Daily Challenges] ✅ Auto-granted rewards for challenge "${challengeData.title}": ${challengeData.rewardPP} PP, ${challengeData.rewardXP} XP${challengeData.rewardTruthMetal ? `, ${challengeData.rewardTruthMetal} Truth Metal` : ''}`);
    } catch (error) {
      console.error('[Daily Challenges] Error auto-granting rewards:', error);
    }
  };

  const loadDailyChallenges = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const today = getTodayDateString();

      // Check if player has challenges assigned for today
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      const playerChallengesDoc = await getDoc(playerChallengesRef);

      let assignedChallenges: PlayerChallengeProgress[] = [];
      let needsNewChallenges = false;

      if (playerChallengesDoc.exists()) {
        const data = playerChallengesDoc.data();
        if (data.assignedDate === today && data.challenges) {
          assignedChallenges = data.challenges;
        } else {
          needsNewChallenges = true;
        }
      } else {
        needsNewChallenges = true;
      }

      // If no challenges for today, assign new ones
      if (needsNewChallenges) {
        assignedChallenges = await assignNewChallenges();
      }

      // Load challenge details
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      const snapshot = await getDocs(challengesRef);
      const allChallenges: DailyChallenge[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isActive) {
          allChallenges.push({ id: doc.id, ...data } as DailyChallenge);
        }
      });

      // Filter to only assigned challenges
      const assignedChallengeIds = assignedChallenges.map(c => c.challengeId);
      const playerChallenges = allChallenges.filter(c => assignedChallengeIds.includes(c.id));

      setChallenges(playerChallenges);

      // Set progress
      const progressMap: { [key: string]: PlayerChallengeProgress } = {};
      assignedChallenges.forEach(c => {
        progressMap[c.challengeId] = c;
      });
      setProgress(progressMap);
    } catch (error) {
      console.error('Error loading daily challenges:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignNewChallenges = async (): Promise<PlayerChallengeProgress[]> => {
    if (!currentUser) return [];

    try {
      // Get all active challenges
      const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
      const snapshot = await getDocs(challengesRef);
      const activeChallenges: DailyChallenge[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isActive) {
          activeChallenges.push({ id: doc.id, ...data } as DailyChallenge);
        }
      });

      // Randomly select 3 challenges
      const shuffled = [...activeChallenges].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, Math.min(3, shuffled.length));

      const assigned: PlayerChallengeProgress[] = selected.map(challenge => ({
        challengeId: challenge.id,
        progress: 0,
        completed: false,
        claimed: false,
        assignedDate: getTodayDateString(),
        type: challenge.type, // Store type for efficient tracking
        target: challenge.target // Store target for completion checking
      }));

      // Save to player's daily challenges
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      await setDoc(playerChallengesRef, {
        challenges: assigned,
        assignedDate: getTodayDateString(),
        updatedAt: serverTimestamp()
      });

      return assigned;
    } catch (error) {
      console.error('Error assigning challenges:', error);
      return [];
    }
  };

  const handleClaimReward = async (challenge: DailyChallenge) => {
    if (!currentUser || claiming) return;

    const challengeProgress = progress[challenge.id];
    if (!challengeProgress || !challengeProgress.completed || challengeProgress.claimed) {
      return;
    }

    try {
      setClaiming(challenge.id);

      // Update player stats using atomic updates
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, {
        powerPoints: increment(challenge.rewardPP),
        xp: increment(challenge.rewardXP),
        ...(challenge.rewardTruthMetal ? { truthMetal: increment(challenge.rewardTruthMetal) } : {})
      });

      // Mark as claimed
      const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
      const currentData = (await getDoc(playerChallengesRef)).data();
      if (currentData && currentData.challenges) {
        const updatedChallenges = currentData.challenges.map((c: PlayerChallengeProgress) => 
          c.challengeId === challenge.id ? { ...c, claimed: true } : c
        );
        await updateDoc(playerChallengesRef, {
          challenges: updatedChallenges
        });
      }

      // Update local state
      setProgress(prev => ({
        ...prev,
        [challenge.id]: { ...prev[challenge.id], claimed: true }
      }));

      alert(`✅ Claimed rewards: ${challenge.rewardPP} PP, ${challenge.rewardXP} XP${challenge.rewardTruthMetal ? `, ${challenge.rewardTruthMetal} Truth Metal` : ''}`);
    } catch (error) {
      console.error('Error claiming reward:', error);
      alert('Failed to claim reward. Please try again.');
    } finally {
      setClaiming(null);
    }
  };

  // Helper to extract target from title if it contains a number (e.g., "THREE (3)" or "5 enemies")
  const getEffectiveTarget = (challenge: DailyChallenge): number => {
    // Check if title contains a number in parentheses or as a word
    const title = challenge.title;
    
    // Look for patterns like "THREE (3)", "FIVE (5)", etc.
    const parenMatch = title.match(/\((\d+)\)/);
    if (parenMatch) {
      const extractedTarget = parseInt(parenMatch[1]);
      if (extractedTarget > 0) {
        // Always use extracted target from parentheses if found (more reliable than stored value)
        if (extractedTarget !== challenge.target) {
          console.log(`[DailyChallenges] Extracted target ${extractedTarget} from title "${title}" (stored: ${challenge.target})`);
        }
        return extractedTarget;
      }
    }
    
    // Look for number words followed by numbers: "THREE 3", "FIVE 5", etc.
    const numberWordMap: { [key: string]: number } = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    
    const titleLower = title.toLowerCase();
    for (const [word, num] of Object.entries(numberWordMap)) {
      if (titleLower.includes(word)) {
        // Check if there's also a digit that matches
        const digitMatch = title.match(/\b(\d+)\b/);
        if (digitMatch && parseInt(digitMatch[1]) === num) {
          if (num !== challenge.target) {
            console.log(`[DailyChallenges] Extracted target ${num} from title "${title}" (stored: ${challenge.target})`);
          }
          return num;
        }
      }
    }
    
    // Fallback to stored target
    return challenge.target;
  };

  const getProgressPercentage = (challenge: DailyChallenge) => {
    const challengeProgress = progress[challenge.id];
    if (!challengeProgress) return 0;
    const effectiveTarget = getEffectiveTarget(challenge);
    return Math.min(100, (challengeProgress.progress / effectiveTarget) * 100);
  };

  const getTypeIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      defeat_enemies: '⚔️',
      use_elemental_move: '🔥',
      attack_vault: '🏦',
      use_action_card: '🃏',
      win_battle: '🏆',
      earn_pp: '🪙',
      use_manifest_ability: '✨',
      use_health_potion: '🧪',
      custom: '⭐'
    };
    return icons[type] || '⭐';
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>📅</div>
        <div>Loading daily challenges...</div>
      </div>
    );
  }

  if (challenges.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>📅</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          No Daily Challenges Available
        </div>
        <div style={{ color: '#6b7280' }}>
          Check back tomorrow for new challenges!
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 'bold' }}>
            📅 Daily Challenges
          </h2>
          <div style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            color: '#92400e',
            fontWeight: '500'
          }}>
            ⏰ Resets in: {resetTimer || 'Calculating...'}
          </div>
        </div>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Complete challenges to earn rewards! New challenges refresh daily.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {challenges.map((challenge) => {
          const challengeProgress = progress[challenge.id];
          const progressPercent = getProgressPercentage(challenge);
          const isCompleted = challengeProgress?.completed || false;
          const isClaimed = challengeProgress?.claimed || false;

          return (
            <div
              key={challenge.id}
              style={{
                background: 'white',
                border: '2px solid',
                borderColor: isCompleted ? (isClaimed ? '#d1d5db' : '#10b981') : '#e5e7eb',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '2rem' }}>{getTypeIcon(challenge.type)}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {challenge.title}
                  </h3>
                  <p style={{ margin: 0, color: '#6b7280', marginBottom: '1rem' }}>
                    {challenge.description}
                  </p>
                  
                  {/* Progress Bar */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                        Progress: {challengeProgress?.progress || 0} / {getEffectiveTarget(challenge)}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: '#e5e7eb',
                      borderRadius: '4px',
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

                  {/* Rewards */}
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '1rem',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      background: '#fef3c7',
                      color: '#92400e',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold'
                    }}>
                      🪙 {challenge.rewardPP} PP
                    </span>
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      background: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold'
                    }}>
                      ⭐ {challenge.rewardXP} XP
                    </span>
                    {challenge.rewardTruthMetal && challenge.rewardTruthMetal > 0 && (
                      <span style={{
                        padding: '0.375rem 0.75rem',
                        background: '#f3e8ff',
                        color: '#6b21a8',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold'
                      }}>
                        💎 {challenge.rewardTruthMetal} Truth Metal
                      </span>
                    )}
                  </div>

                  {/* Claim Button */}
                  {isCompleted && !isClaimed && (
                    <button
                      onClick={() => handleClaimReward(challenge)}
                      disabled={claiming === challenge.id}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: claiming === challenge.id ? 'not-allowed' : 'pointer',
                        opacity: claiming === challenge.id ? 0.7 : 1
                      }}
                    >
                      {claiming === challenge.id ? 'Claiming...' : '🎁 Claim Rewards'}
                    </button>
                  )}
                  {isClaimed && (
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      background: '#d1fae5',
                      color: '#065f46',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      textAlign: 'center'
                    }}>
                      ✅ Rewards Claimed
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyChallenges;

