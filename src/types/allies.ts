/**
 * Allies System Types
 * 
 * Allies are in-game character companions (NPCs, story characters)
 * Distinct from Squad (real-life players)
 */

export interface AllySlot {
  slot: number; // 1-4
  status: 'unlocked' | 'locked';
  allyId?: string; // ID from allies collection
  active?: boolean; // Whether this ally is currently active
  assignedAt?: Date | any; // Firestore timestamp
}

export interface UserAllies {
  userId: string;
  maxSlots: 4;
  slots: AllySlot[];
  updatedAt: Date | any; // Firestore timestamp
}

export interface AllyDefinition {
  id: string; // e.g., "konfig"
  displayName: string; // e.g., "Kon (Konfig)"
  description: string;
  role: string; // e.g., "Mentor", "Warrior", "Scholar"
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  portraitUrl?: string;
  abilities: Array<{
    name: string;
    description: string;
    icon?: string;
  }>;
  passiveAbility: {
    name: string;
    description: string;
  };
  unlockCondition: {
    chapter?: string; // e.g., "2-5"
    method: 'story' | 'quest' | 'purchase' | 'default';
  };
}









