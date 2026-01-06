import { Move } from '../types/battle';

/**
 * Generates RR Candy moves based on the candy type the player has unlocked
 */
export function getRRCandyMoves(candyType: 'on-off' | 'up-down' | 'config'): Move[] {
  const moves: Move[] = [];

  if (candyType === 'on-off') {
    // Shield OFF - Remove 25% of opponent's shields (Level 1)
    moves.push({
      id: 'rr-candy-on-off-shields-off',
      name: 'Shield OFF',
      description: 'Remove 25% of opponent\'s shields. Can be leveled up for higher impact.',
      category: 'system',
      type: 'control',
      level: 1,
      cost: 2,
      debuffType: 'shield_break',
      debuffStrength: 25, // 25% of shields removed
      cooldown: 3,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      targetType: 'single',
      priority: 0
    });

    // Shield ON - Restore 50% of max shields
    moves.push({
      id: 'rr-candy-on-off-shields-on',
      name: 'Shield ON',
      description: 'Restore 50% of your maximum shields.',
      category: 'system',
      type: 'defense',
      level: 1,
      cost: 3,
      shieldBoost: 50, // 50% of max shields restored
      cooldown: 4,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      targetType: 'self',
      priority: 0
    });
  }

  // TODO: Add moves for 'up-down' and 'config' candy types

  return moves;
}

/**
 * Checks if a player has unlocked an RR Candy
 */
export async function hasRRCandyUnlocked(userId: string, candyType: 'on-off' | 'up-down' | 'config'): Promise<boolean> {
  const { db } = await import('../firebase');
  const { doc, getDoc } = await import('firebase/firestore');
  
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return false;
    
    const userData = userDoc.data();
    const chapters = userData.chapters || {};
    const chapter2 = chapters[2] || {};
    const challenges = chapter2.challenges || {};
    const challenge = challenges['ep2-its-all-a-game'] || {};
    
    // Check if challenge is completed and candy choice matches
    if (challenge.isCompleted && challenge.candyChoice === candyType) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking RR Candy unlock:', error);
    return false;
  }
}









