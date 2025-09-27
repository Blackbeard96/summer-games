import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface PPBoost {
  id: string;
  userId: string;
  artifactName: string;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  multiplier: number;
}

export const PP_BOOST_DURATION_HOURS = 4;
export const PP_BOOST_MULTIPLIER = 2;

/**
 * Check if a user has an active PP boost
 */
export const getActivePPBoost = async (userId: string): Promise<PPBoost | null> => {
  try {
    const userRef = doc(db, 'students', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return null;
    
    const userData = userSnap.data();
    const activeBoosts = userData.activePPBoosts || [];
    
    // Find the most recent active boost
    const now = new Date();
    const activeBoost = activeBoosts.find((boost: any) => {
      const endTime = boost.endTime?.toDate?.() || new Date(boost.endTime);
      return boost.isActive && endTime > now;
    });
    
    return activeBoost || null;
  } catch (error) {
    console.error('Error getting active PP boost:', error);
    return null;
  }
};

/**
 * Apply PP boost to a PP amount
 */
export const applyPPBoost = (basePP: number, userId: string, activeBoost: PPBoost | null): number => {
  if (!activeBoost) return basePP;
  
  const now = new Date();
  const endTime = activeBoost.endTime instanceof Date ? activeBoost.endTime : new Date(activeBoost.endTime);
  
  // Check if boost is still active
  if (endTime <= now) return basePP;
  
  // Apply the multiplier
  const boostedPP = Math.floor(basePP * activeBoost.multiplier);
  const bonusPP = boostedPP - basePP;
  
  console.log(`⚡ PP Boost applied: ${basePP} → ${boostedPP} (+${bonusPP})`);
  
  return boostedPP;
};

/**
 * Activate a PP boost for a user
 */
export const activatePPBoost = async (userId: string, artifactName: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'students', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return false;
    
    const userData = userSnap.data();
    const now = new Date();
    const endTime = new Date(now.getTime() + (PP_BOOST_DURATION_HOURS * 60 * 60 * 1000));
    
    const newBoost: PPBoost = {
      id: `boost_${Date.now()}`,
      userId,
      artifactName,
      startTime: now,
      endTime,
      isActive: true,
      multiplier: PP_BOOST_MULTIPLIER
    };
    
    // Add to active boosts array
    const activeBoosts = userData.activePPBoosts || [];
    activeBoosts.push(newBoost);
    
    // Update user document
    await updateDoc(userRef, {
      activePPBoosts: activeBoosts,
      lastUpdated: serverTimestamp()
    });
    
    console.log(`⚡ PP Boost activated for user ${userId}: ${artifactName} until ${endTime.toISOString()}`);
    return true;
  } catch (error) {
    console.error('Error activating PP boost:', error);
    return false;
  }
};

/**
 * Clean up expired PP boosts
 */
export const cleanupExpiredPPBoosts = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'students', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data();
    const activeBoosts = userData.activePPBoosts || [];
    const now = new Date();
    
    // Filter out expired boosts
    const validBoosts = activeBoosts.filter((boost: any) => {
      const endTime = boost.endTime?.toDate?.() || new Date(boost.endTime);
      return endTime > now;
    });
    
    // Update if there were expired boosts
    if (validBoosts.length !== activeBoosts.length) {
      await updateDoc(userRef, {
        activePPBoosts: validBoosts,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`🧹 Cleaned up ${activeBoosts.length - validBoosts.length} expired PP boosts for user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up expired PP boosts:', error);
  }
};

/**
 * Get PP boost status for display
 */
export const getPPBoostStatus = (activeBoost: PPBoost | null): { isActive: boolean; timeRemaining: string; multiplier: number } => {
  if (!activeBoost) {
    return { isActive: false, timeRemaining: '', multiplier: 1 };
  }
  
  const now = new Date();
  const endTime = activeBoost.endTime instanceof Date ? activeBoost.endTime : new Date(activeBoost.endTime);
  
  if (endTime <= now) {
    return { isActive: false, timeRemaining: '', multiplier: 1 };
  }
  
  const timeRemaining = endTime.getTime() - now.getTime();
  const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  
  return {
    isActive: true,
    timeRemaining: `${hours}h ${minutes}m`,
    multiplier: activeBoost.multiplier
  };
};
