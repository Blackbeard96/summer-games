import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserAllies, AllySlot, AllyDefinition } from '../types/allies';

/**
 * Get or create user's Allies document
 * Bootstrap logic: creates default Allies with Kon in slot 1 if doesn't exist
 */
export async function getOrCreateAllies(userId: string): Promise<UserAllies> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  const alliesDoc = await getDoc(alliesRef);
  
  if (alliesDoc.exists()) {
    const data = alliesDoc.data();
    return {
      userId,
      maxSlots: 4,
      slots: data.slots || [],
      updatedAt: data.updatedAt
    } as UserAllies;
  }
  
  // Create default Allies document with Kon in slot 1
  const defaultAllies: UserAllies = {
    userId,
    maxSlots: 4,
    slots: [
      {
        slot: 1,
        status: 'unlocked',
        allyId: 'konfig',
        active: true,
        assignedAt: serverTimestamp()
      },
      {
        slot: 2,
        status: 'locked'
      },
      {
        slot: 3,
        status: 'locked'
      },
      {
        slot: 4,
        status: 'locked'
      }
    ],
    updatedAt: serverTimestamp()
  };
  
  await setDoc(alliesRef, defaultAllies);
  return defaultAllies;
}

/**
 * Update user's Allies slots
 */
export async function updateAlliesSlots(userId: string, slots: AllySlot[]): Promise<void> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  await updateDoc(alliesRef, {
    slots,
    updatedAt: serverTimestamp()
  });
}

/**
 * Unlock an ally slot
 */
export async function unlockAllySlot(userId: string, slotNumber: number): Promise<void> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  const alliesDoc = await getDoc(alliesRef);
  
  if (!alliesDoc.exists()) {
    throw new Error('Allies document not found');
  }
  
  const data = alliesDoc.data() as UserAllies;
  const updatedSlots = data.slots.map(slot => 
    slot.slot === slotNumber 
      ? { ...slot, status: 'unlocked' as const }
      : slot
  );
  
  await updateAlliesSlots(userId, updatedSlots);
}

/**
 * Assign an ally to a slot
 */
export async function assignAlly(userId: string, slotNumber: number, allyId: string): Promise<void> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  const alliesDoc = await getDoc(alliesRef);
  
  if (!alliesDoc.exists()) {
    throw new Error('Allies document not found');
  }
  
  const data = alliesDoc.data() as UserAllies;
  
  // Validate slot is unlocked
  const targetSlot = data.slots.find(s => s.slot === slotNumber);
  if (!targetSlot || targetSlot.status === 'locked') {
    throw new Error(`Slot ${slotNumber} is locked`);
  }
  
  // Prevent duplicate ally assignment
  const hasAlly = data.slots.some(s => s.allyId === allyId && s.slot !== slotNumber);
  if (hasAlly) {
    throw new Error('Ally is already assigned to another slot');
  }
  
  const updatedSlots = data.slots.map(slot => 
    slot.slot === slotNumber 
      ? { 
          ...slot, 
          allyId, 
          active: slot.active ?? true,
          assignedAt: serverTimestamp()
        }
      : slot
  );
  
  await updateAlliesSlots(userId, updatedSlots);
}

/**
 * Remove an ally from a slot
 */
export async function removeAlly(userId: string, slotNumber: number): Promise<void> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  const alliesDoc = await getDoc(alliesRef);
  
  if (!alliesDoc.exists()) {
    throw new Error('Allies document not found');
  }
  
  const data = alliesDoc.data() as UserAllies;
  
  const updatedSlots = data.slots.map(slot => 
    slot.slot === slotNumber 
      ? { 
          slot: slotNumber,
          status: 'unlocked' as const
        }
      : slot
  );
  
  await updateAlliesSlots(userId, updatedSlots);
}

/**
 * Set active state for an ally slot
 */
export async function setAllyActive(userId: string, slotNumber: number, active: boolean): Promise<void> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  const alliesDoc = await getDoc(alliesRef);
  
  if (!alliesDoc.exists()) {
    throw new Error('Allies document not found');
  }
  
  const data = alliesDoc.data() as UserAllies;
  
  const updatedSlots = data.slots.map(slot => 
    slot.slot === slotNumber 
      ? { ...slot, active }
      : slot
  );
  
  await updateAlliesSlots(userId, updatedSlots);
}

/**
 * Reorder allies (swap two slots)
 */
export async function reorderAllies(userId: string, fromSlot: number, toSlot: number): Promise<void> {
  const alliesRef = doc(db, 'users', userId, 'allies', 'current');
  const alliesDoc = await getDoc(alliesRef);
  
  if (!alliesDoc.exists()) {
    throw new Error('Allies document not found');
  }
  
  const data = alliesDoc.data() as UserAllies;
  
  // Validate both slots are unlocked
  const fromSlotData = data.slots.find(s => s.slot === fromSlot);
  const toSlotData = data.slots.find(s => s.slot === toSlot);
  
  if (!fromSlotData || fromSlotData.status === 'locked') {
    throw new Error(`Slot ${fromSlot} is locked`);
  }
  if (!toSlotData || toSlotData.status === 'locked') {
    throw new Error(`Slot ${toSlot} is locked`);
  }
  
  // Swap ally assignments
  const updatedSlots = data.slots.map(slot => {
    if (slot.slot === fromSlot) {
      return { ...toSlotData, slot: fromSlot };
    }
    if (slot.slot === toSlot) {
      return { ...fromSlotData, slot: toSlot };
    }
    return slot;
  });
  
  await updateAlliesSlots(userId, updatedSlots);
}

/**
 * Get all ally definitions from the allies collection
 */
export async function getAllAllyDefinitions(): Promise<AllyDefinition[]> {
  const alliesSnapshot = await getDocs(collection(db, 'allies'));
  return alliesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as AllyDefinition));
}

/**
 * Get a specific ally definition
 */
export async function getAllyDefinition(allyId: string): Promise<AllyDefinition | null> {
  const allyDoc = await getDoc(doc(db, 'allies', allyId));
  if (!allyDoc.exists()) {
    return null;
  }
  return {
    id: allyDoc.id,
    ...allyDoc.data()
  } as AllyDefinition;
}

/**
 * Seed Kon into the allies collection (dev/admin tool)
 */
export async function seedKonAlly(): Promise<void> {
  const konRef = doc(db, 'allies', 'konfig');
  const konDoc = await getDoc(konRef);
  
  if (konDoc.exists()) {
    console.log('Kon ally definition already exists');
    return;
  }
  
  const konDefinition: AllyDefinition = {
    id: 'konfig',
    displayName: 'Kon (Konfig)',
    description: 'Your first mentor and guide. Kon helps you understand the world of Xiotein and supports you on your journey.',
    role: 'Mentor',
    rarity: 'legendary',
    portraitUrl: '/images/kon-portrait.png', // Update with actual path
    abilities: [
      {
        name: 'Guidance',
        description: 'Provides strategic advice and support',
        icon: '🧙'
      },
      {
        name: 'Protection',
        description: 'Shields you from harm',
        icon: '🛡️'
      }
    ],
    passiveAbility: {
      name: 'Mentor\'s Wisdom',
      description: 'Grants bonus XP and PP when active'
    },
    unlockCondition: {
      method: 'default'
    }
  };
  
  await setDoc(konRef, konDefinition);
  console.log('Kon ally definition seeded successfully');
}











