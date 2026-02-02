/**
 * Test Account Service
 * 
 * Handles creation, seeding, resetting, and management of test accounts
 */

import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  orderBy, 
  limit,
  serverTimestamp,
  updateDoc,
  runTransaction,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { TEST_PHASE_PRESETS, PhasePreset, getPreset } from './testAccountPresets';
import { PlayerManifest } from '../types/manifest';
import { MANIFESTS } from '../types/manifest';
import { MOVE_TEMPLATES } from '../types/battle';
import { Move } from '../types/battle';

/**
 * Helper function to remove undefined values from nested objects
 * Firestore doesn't allow undefined values, so we need to clean them out
 */
function removeUndefined(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = removeUndefined(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
}

export interface TestAccount {
  id: string;
  label: string;
  phaseKey: string;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  createdBy: string;
  isActive: boolean;
  notes?: string;
  seedConfig: PhasePreset;
}

/**
 * Get the next available test account ID
 */
export async function getNextTestAccountId(): Promise<string> {
  try {
    const testAccountsRef = collection(db, 'testAccounts');
    const q = query(testAccountsRef, orderBy('id', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return 'test-account-001';
    }
    
    const lastId = snapshot.docs[0].id;
    const match = lastId.match(/test-account-(\d+)/);
    
    if (match) {
      const lastNum = parseInt(match[1], 10);
      const nextNum = lastNum + 1;
      return `test-account-${String(nextNum).padStart(3, '0')}`;
    }
    
    // Fallback: count existing accounts
    const allSnapshot = await getDocs(testAccountsRef);
    const count = allSnapshot.size + 1;
    return `test-account-${String(count).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error getting next test account ID:', error);
    // Fallback to timestamp-based ID
    return `test-account-${Date.now()}`;
  }
}

/**
 * Seed player data from a preset
 */
export async function seedPlayerDataFromPreset(
  testAccountId: string,
  preset: PhasePreset,
  createdBy: string
): Promise<void> {
  const testEmail = `${testAccountId}@mstgames.net`;
  const testDisplayName = `Test Account ${testAccountId.replace('test-account-', '')}`;

  // Build chapters object from preset
  const chapters: any = {};
  const activeChapters = preset.chapters.activeChapters || [];
  
  // Initialize all chapters mentioned in completed or active
  const allChapterNumbers = new Set<number>();
  preset.chapters.completed.forEach(challengeId => {
    const match = challengeId.match(/^ch(\d+)-/);
    if (match) {
      allChapterNumbers.add(parseInt(match[1], 10));
    }
  });
  activeChapters.forEach(ch => allChapterNumbers.add(ch));
  
  // Build chapter progress structure
  allChapterNumbers.forEach(chapterNum => {
    const chapterKey = `chapter${chapterNum}`;
    const isActive = activeChapters.includes(chapterNum);
    
    chapters[chapterKey] = {
      isActive,
      challenges: {}
    };
    
    // Mark completed challenges
    preset.chapters.completed.forEach(challengeId => {
      const match = challengeId.match(/^ch(\d+)-/);
      if (match && parseInt(match[1], 10) === chapterNum) {
        chapters[chapterKey].challenges[challengeId] = {
          isCompleted: true,
          status: 'approved',
          completedAt: serverTimestamp()
        };
      }
    });
  });

  // Build PlayerManifest object if manifest type is provided
  let playerManifest: PlayerManifest | null = null;
  if (preset.manifest?.type) {
    const manifestDef = MANIFESTS.find(m => m.id === preset.manifest!.type);
    if (manifestDef) {
      playerManifest = {
        manifestId: preset.manifest.type,
        currentLevel: 1,
        xp: 0,
        catalyst: manifestDef.catalyst,
        veil: 'Fear of inadequacy',
        signatureMove: manifestDef.signatureMove,
        unlockedLevels: [1],
        lastAscension: serverTimestamp()
      };
    }
  }

  // Build user document data
  const userData: any = {
    uid: testAccountId,
    email: testEmail,
    displayName: testDisplayName,
    emailVerified: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isTestAccount: true,
    level: preset.player.level,
    xp: preset.player.xp,
    pp: preset.player.pp,
    powerPoints: preset.player.pp, // Alias for compatibility
    chapters: chapters,
    manifest: playerManifest, // Store as PlayerManifest object
    manifestationType: preset.manifest?.element || null,
    style: preset.manifest?.element || null,
    rarity: preset.manifest?.rarity || 1,
    storyChapter: parseInt(preset.chapters.current.split('-')[0]) || 1,
    photoURL: null,
    bio: null,
    cardBgColor: null,
    moves: [],
    badges: [],
    inventory: preset.inventory || {},
    flags: preset.flags || {},
  };

  // Build student document data (similar structure)
  const studentData = {
    ...userData,
    // Student-specific fields if any
  };

  // Initialize battle moves if manifest is set
  let battleMoves: Move[] = [];
  if (playerManifest) {
    battleMoves = MOVE_TEMPLATES.map((template, index) => {
      const moveId = `move_${index + 1}`;
      const isUnlocked = template.category === 'system' || 
        (template.category === 'manifest' && template.manifestType === playerManifest!.manifestId) ||
        (template.category === 'elemental' && preset.manifest?.element && template.elementalAffinity === preset.manifest.element.toLowerCase());
      
      return {
        ...template,
        id: moveId,
        unlocked: isUnlocked
      } as Move;
    });
  }

  // Use transaction to ensure all documents are created atomically
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', testAccountId);
    const studentRef = doc(db, 'students', testAccountId);
    const movesRef = doc(db, 'battleMoves', testAccountId);
    
    // Check if documents exist
    const [userDoc, studentDoc, movesDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(studentRef),
      transaction.get(movesRef)
    ]);
    
    // Set or update user document
    if (userDoc.exists()) {
      transaction.update(userRef, userData);
    } else {
      transaction.set(userRef, userData);
    }
    
    // Set or update student document
    if (studentDoc.exists()) {
      transaction.update(studentRef, studentData);
    } else {
      transaction.set(studentRef, studentData);
    }
    
    // Set or update battle moves if manifest is set
    if (playerManifest && battleMoves.length > 0) {
      if (movesDoc.exists()) {
        transaction.update(movesRef, { moves: battleMoves });
      } else {
        transaction.set(movesRef, { moves: battleMoves });
      }
    }
  });

  console.log(`✅ Seeded player data for ${testAccountId} from preset ${preset.label}`);
  if (playerManifest) {
    console.log(`✅ Initialized battle moves for manifest: ${playerManifest.manifestId} (${battleMoves.filter(m => m.unlocked && m.category === 'manifest').length} manifest moves unlocked)`);
  }
}

/**
 * Create a new test account
 */
export async function createTestAccount(
  label: string,
  phaseKey: string,
  notes: string | undefined,
  createdBy: string
): Promise<{ testAccountId: string }> {
  // Verify preset exists
  const preset = getPreset(phaseKey);
  if (!preset) {
    throw new Error(`Invalid phase preset: ${phaseKey}`);
  }

  // Get next ID
  const testAccountId = await getNextTestAccountId();

  // Seed player data
  await seedPlayerDataFromPreset(testAccountId, preset, createdBy);

  // Create test account metadata
  // Build data object, omitting undefined/null values
  const testAccountData: any = {
    id: testAccountId,
    label,
    phaseKey,
    createdBy,
    isActive: true,
    seedConfig: removeUndefined(preset), // Clean undefined values from preset
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Only include notes if it's a non-empty string
  if (notes && notes.trim()) {
    testAccountData.notes = notes.trim();
  }

  const testAccountRef = doc(db, 'testAccounts', testAccountId);
  await setDoc(testAccountRef, testAccountData);

  console.log(`✅ Created test account: ${testAccountId} (${label})`);
  
  return { testAccountId };
}

/**
 * Reset a test account to its original preset
 */
export async function resetTestAccount(
  testAccountId: string,
  resetBy: string
): Promise<void> {
  // Get test account metadata
  const testAccountRef = doc(db, 'testAccounts', testAccountId);
  const testAccountDoc = await getDoc(testAccountRef);
  
  if (!testAccountDoc.exists()) {
    throw new Error(`Test account not found: ${testAccountId}`);
  }
  
  const testAccountData = testAccountDoc.data() as TestAccount;
  
  if (!testAccountData.seedConfig) {
    throw new Error(`Test account missing seed config: ${testAccountId}`);
  }

  // Re-seed from stored preset
  await seedPlayerDataFromPreset(testAccountId, testAccountData.seedConfig, resetBy);

  // Update test account metadata
  await updateDoc(testAccountRef, {
    updatedAt: serverTimestamp(),
  });

  console.log(`✅ Reset test account: ${testAccountId}`);
}

/**
 * Get all test accounts
 */
export async function getAllTestAccounts(): Promise<TestAccount[]> {
  const testAccountsRef = collection(db, 'testAccounts');
  const q = query(testAccountsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as TestAccount));
}

/**
 * Get active test accounts
 */
export async function getActiveTestAccounts(): Promise<TestAccount[]> {
  const testAccountsRef = collection(db, 'testAccounts');
  const q = query(
    testAccountsRef, 
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as TestAccount));
}

/**
 * Get test account by ID
 */
export async function getTestAccount(testAccountId: string): Promise<TestAccount | null> {
  const testAccountRef = doc(db, 'testAccounts', testAccountId);
  const testAccountDoc = await getDoc(testAccountRef);
  
  if (!testAccountDoc.exists()) {
    return null;
  }
  
  return {
    id: testAccountDoc.id,
    ...testAccountDoc.data()
  } as TestAccount;
}

/**
 * Update test account metadata
 */
export async function updateTestAccount(
  testAccountId: string,
  updates: Partial<Pick<TestAccount, 'label' | 'notes' | 'isActive'>>
): Promise<void> {
  const testAccountRef = doc(db, 'testAccounts', testAccountId);
  await updateDoc(testAccountRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Duplicate a test account
 */
export async function duplicateTestAccount(
  sourceTestAccountId: string,
  newLabel: string,
  createdBy: string
): Promise<{ testAccountId: string }> {
  const sourceAccount = await getTestAccount(sourceTestAccountId);
  
  if (!sourceAccount) {
    throw new Error(`Source test account not found: ${sourceTestAccountId}`);
  }

  // Create new account with same preset
  return await createTestAccount(
    newLabel,
    sourceAccount.phaseKey,
    sourceAccount.notes || undefined,
    createdBy
  );
}

/**
 * Migrate existing test-account-001 to new system
 */
export async function migrateExistingTestAccount(
  testAccountId: string,
  label: string,
  phaseKey: string,
  createdBy: string
): Promise<void> {
  // Check if already exists in new system
  const existing = await getTestAccount(testAccountId);
  if (existing) {
    console.log(`Test account ${testAccountId} already exists in new system`);
    return;
  }

  // Get preset
  const preset = getPreset(phaseKey);
  if (!preset) {
    throw new Error(`Invalid phase preset: ${phaseKey}`);
  }

  // Create metadata entry
  const testAccountData: any = {
    id: testAccountId,
    label,
    phaseKey,
    createdBy,
    isActive: true,
    seedConfig: removeUndefined(preset), // Clean undefined values from preset
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const testAccountRef = doc(db, 'testAccounts', testAccountId);
  await setDoc(testAccountRef, testAccountData);

  console.log(`✅ Migrated test account: ${testAccountId}`);
}

