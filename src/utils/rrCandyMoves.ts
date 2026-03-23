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

/** Known On/Off RR Candy move ids → display names (independent of chapter candyType; fixes "Vault Hack" in UI). */
const RR_CANDY_ON_OFF_DISPLAY: Record<string, string> = {
  'rr-candy-on-off-shields-off': 'Shield OFF',
  'rr-candy-on-off-shields-on': 'Shield ON',
};

/**
 * Human-readable name for an RR Candy move for UI (loadout preview, lists).
 * Uses move id first so legacy stored names like "Vault Hack" never show when ids are canonical.
 */
export function getRRCandyDisplayName(move: Pick<Move, 'id' | 'name'>): string {
  const id = move.id || '';
  if (RR_CANDY_ON_OFF_DISPLAY[id]) return RR_CANDY_ON_OFF_DISPLAY[id];
  if (!id.startsWith('rr-candy-')) return move.name;

  for (const ct of ['on-off', 'up-down', 'config'] as const) {
    const found = getRRCandyMoves(ct).find((m) => m.id === id);
    if (found) return found.name;
  }

  const n = move.name;
  if (n === 'Vault Hack' || n === 'Shield Restoration') {
    if (id.includes('shields-off')) return 'Shield OFF';
    if (id.includes('shields-on')) return 'Shield ON';
  }
  return n;
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









