import { getLevelFromXP } from './leveling';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Normalized player data structure matching Profile page display
 */
export interface NormalizedPlayerData {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  pp: number;
  tm: number;
  level: number;
  powerLevel?: number | null; // Power Level (PL)
  powerBreakdown?: { base: number; skills: number; artifacts: number; ascension: number; total: number } | null; // Power Level breakdown
  xpCurrent: number;
  xpRequired: number;
  levelProgressPercent: number;
  manifest: string;
  element: string;
  badgesCount: number;
  rarity: number;
  // Additional fields for PlayerCard compatibility
  style?: string;
  description?: string;
  cardBgColor?: string;
  cardFrameShape?: 'circular' | 'rectangular';
  cardBorderColor?: string;
  cardImageBorderColor?: string;
  moves?: any[];
  badges?: any[];
  userId?: string;
  squadAbbreviation?: string | null;
  ordinaryWorld?: string;
}

/**
 * Calculate XP progress for current level
 * Returns current XP in level, required XP for next level, and percentage
 */
function getXPProgress(xp: number): { currentLevelXP: number; nextLevelXP: number; percent: number } {
  let level = 1;
  let required = 100;
  let total = 0;
  while (xp >= total + required) {
    total += required;
    required = required * 1.25;
    level++;
  }
  const currentLevelXP = xp - total;
  const nextLevelXP = required;
  const percent = Math.min(100, Math.max(0, (currentLevelXP / nextLevelXP) * 100));
  return { currentLevelXP, nextLevelXP, percent };
}

/**
 * Extract manifest from various possible sources (matches Profile.tsx logic)
 */
function extractManifest(
  userData: any,
  studentData: any,
  playerManifest: any
): string {
  // Priority order matches Profile.tsx:
  // 1. playerManifest.manifestId (from students collection manifest field)
  if (playerManifest?.manifestId) {
    return playerManifest.manifestId;
  }
  
  // 2. userData.playerManifest.manifestId
  if (userData?.playerManifest && typeof userData.playerManifest === 'object' && userData.playerManifest.manifestId) {
    return userData.playerManifest.manifestId;
  }
  
  // 3. studentData.playerManifest.manifestId
  if (studentData?.playerManifest && typeof studentData.playerManifest === 'object' && studentData.playerManifest.manifestId) {
    return studentData.playerManifest.manifestId;
  }
  
  // 4. userData.manifest.manifestId
  if (userData?.manifest && typeof userData.manifest === 'object' && (userData.manifest as any).manifestId) {
    return (userData.manifest as any).manifestId;
  }
  
  // 5. studentData.manifest.manifestId
  if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
    return studentData.manifest.manifestId;
  }
  
  // 6. userData.manifest (string)
  if (userData?.manifest && typeof userData.manifest === 'string') {
    const level = userData.level || studentData?.level || 1;
    // Filter out advanced manifests for Level 1 players (matches Profile logic)
    if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(userData.manifest)) {
      // Skip invalid manifest, continue to next source
    } else {
      return userData.manifest;
    }
  }
  
  // 7. studentData.manifest (string)
  if (studentData?.manifest && typeof studentData.manifest === 'string') {
    const level = userData?.level || studentData.level || 1;
    if (level <= 1 && ['Imposition', 'Memory', 'Intelligence', 'Dimensional', 'Truth', 'Creation'].includes(studentData.manifest)) {
      // Skip invalid manifest, continue to next source
    } else {
      return studentData.manifest;
    }
  }
  
  // 8. userData.bio
  if (userData?.bio) {
    return userData.bio;
  }
  
  // 9. studentData.bio
  if (studentData?.bio) {
    return studentData.bio;
  }
  
  // 10. userData.manifestationType
  if (userData?.manifestationType) {
    return userData.manifestationType;
  }
  
  // 11. studentData.manifestationType
  if (studentData?.manifestationType) {
    return studentData.manifestationType;
  }
  
  // 12. userData.style
  if (userData?.style) {
    return userData.style;
  }
  
  // 13. studentData.style
  if (studentData?.style) {
    return studentData.style;
  }
  
  // 14. userData.manifest.manifestationType
  if (userData?.manifest && typeof userData.manifest === 'object' && (userData.manifest as any).manifestationType) {
    return (userData.manifest as any).manifestationType;
  }
  
  // 15. studentData.manifest.manifestationType
  if (studentData?.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestationType) {
    return studentData.manifest.manifestationType;
  }
  
  return 'None';
}

/**
 * Extract element from various possible sources (matches Profile.tsx logic)
 */
function extractElement(userData: any, studentData: any): string {
  // Priority order matches Profile.tsx:
  // 1. artifacts.chosen_element (from students collection)
  if (studentData?.artifacts?.chosen_element) {
    return studentData.artifacts.chosen_element;
  }
  
  // 2. userData.elementalAffinity
  if (userData?.elementalAffinity) {
    return userData.elementalAffinity;
  }
  
  // 3. studentData.elementalAffinity
  if (studentData?.elementalAffinity) {
    return studentData.elementalAffinity;
  }
  
  // 4. userData.manifestationType
  if (userData?.manifestationType) {
    return userData.manifestationType;
  }
  
  // 5. studentData.manifestationType
  if (studentData?.manifestationType) {
    return studentData.manifestationType;
  }
  
  // 6. userData.style
  if (userData?.style) {
    return userData.style;
  }
  
  // 7. studentData.style
  if (studentData?.style) {
    return studentData.style;
  }
  
  // Default to Fire
  return 'Fire';
}

/**
 * Normalize player data from Firestore documents to match Profile page display
 * This is the single source of truth for player data formatting
 * 
 * @param uid - User ID
 * @param userData - Data from 'users' collection (optional)
 * @param studentData - Data from 'students' collection (optional)
 * @param currentUser - Firebase Auth user object (optional, for fallback displayName/photoURL)
 * @param playerManifest - Player manifest object from students collection (optional)
 * @param squadAbbreviation - Squad abbreviation (optional)
 * @returns Normalized player data matching Profile page
 */
export function normalizePlayerData(
  uid: string,
  userData?: any,
  studentData?: any,
  currentUser?: any,
  playerManifest?: any,
  squadAbbreviation?: string | null
): NormalizedPlayerData {
  // Merge data sources (students takes precedence for most fields, users for artifacts/chapters)
  const mergedData = {
    ...userData,
    ...studentData,
    // But preserve artifacts and chapters from users collection
    artifacts: userData?.artifacts || studentData?.artifacts,
    chapters: userData?.chapters || studentData?.chapters
  };
  
  // Display Name - matches Profile.tsx logic
  const displayName = 
    studentData?.displayName || 
    userData?.displayName || 
    currentUser?.displayName || 
    currentUser?.email?.split('@')[0] || 
    'User';
  
  // Avatar URL - matches Profile.tsx logic
  const avatarUrl = 
    studentData?.photoURL || 
    userData?.photoURL || 
    currentUser?.photoURL || 
    null;
  
  // Power Points
  const pp = studentData?.powerPoints || userData?.powerPoints || 0;
  
  // Truth Metal
  const tm = studentData?.truthMetal || userData?.truthMetal || 0;
  
  // XP - total XP (not just current level XP)
  const xp = studentData?.xp || userData?.xp || 0;
  
  // Level - calculated from XP
  const level = getLevelFromXP(xp);
  
  // XP Progress - calculates current level XP, next level XP, and percentage
  const xpProgress = getXPProgress(xp);
  
  // Manifest - extract using same logic as Profile
  const manifest = extractManifest(userData, studentData, playerManifest);
  
  // Element - extract using same logic as Profile
  const elementRaw = extractElement(userData, studentData);
  // Capitalize first letter (matches Profile.tsx)
  const element = elementRaw.charAt(0).toUpperCase() + elementRaw.slice(1);
  
  // Badges count
  const badges = studentData?.badges || userData?.badges || [];
  const badgesCount = Array.isArray(badges) ? badges.length : 0;
  
  // Rarity - migrate old default (3) to new default (1)
  let rarity = studentData?.rarity || userData?.rarity || 1;
  if (rarity === 3 || rarity === undefined) {
    rarity = 1;
  }
  
  // Additional fields for PlayerCard compatibility
  const style = elementRaw; // Use raw element for style
  const description = studentData?.bio || userData?.bio || '';
  const cardBgColor = studentData?.cardBgColor || userData?.cardBgColor || '#e0e7ff';
  const cardFrameShape = (studentData?.cardFrameShape === 'circular' || studentData?.cardFrameShape === 'rectangular')
    ? studentData.cardFrameShape
    : 'circular';
  const cardBorderColor = studentData?.cardBorderColor || userData?.cardBorderColor || '#a78bfa';
  const cardImageBorderColor = studentData?.cardImageBorderColor || userData?.cardImageBorderColor || '#a78bfa';
  const moves = studentData?.moves || userData?.moves || [];
  const ordinaryWorld = studentData?.ordinaryWorld || userData?.ordinaryWorld;
  
  // Power Level and breakdown (from students collection)
  const powerLevel = studentData?.powerLevel ?? null;
  const powerBreakdown = studentData?.powerBreakdown ?? null;
  
  return {
    uid,
    displayName,
    avatarUrl,
    pp,
    tm,
    level,
    powerLevel,
    powerBreakdown,
    xpCurrent: xpProgress.currentLevelXP,
    xpRequired: Math.round(xpProgress.nextLevelXP),
    levelProgressPercent: xpProgress.percent,
    manifest,
    element,
    badgesCount,
    rarity,
    style,
    description,
    cardBgColor,
    cardFrameShape,
    cardBorderColor,
    cardImageBorderColor,
    moves,
    badges,
    userId: uid,
    squadAbbreviation: squadAbbreviation || null,
    ordinaryWorld
  };
}

/**
 * Fetch and normalize player data from Firestore
 * Fetches from both 'users' and 'students' collections and normalizes
 * 
 * @param uid - User ID to fetch
 * @param currentUser - Firebase Auth user object (optional, for fallback)
 * @param squadAbbreviation - Squad abbreviation (optional)
 * @returns Normalized player data
 */
export async function fetchAndNormalizePlayerData(
  uid: string,
  currentUser?: any,
  squadAbbreviation?: string | null
): Promise<NormalizedPlayerData> {
  const [userDoc, studentDoc] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'students', uid))
  ]);
  
  const userData = userDoc.exists() ? userDoc.data() : undefined;
  const studentData = studentDoc.exists() ? studentDoc.data() : undefined;
  
  // Extract playerManifest from students collection
  let playerManifest = undefined;
  if (studentData?.manifest) {
    const manifestData = studentData.manifest;
    if (manifestData.manifestId) {
      playerManifest = {
        manifestId: manifestData.manifestId,
        currentLevel: manifestData.currentLevel || 1,
        lastAscension: manifestData.lastAscension?.toDate ? 
          manifestData.lastAscension.toDate() : 
          (manifestData.lastAscension ? new Date(manifestData.lastAscension) : undefined)
      };
    }
  }
  
  return normalizePlayerData(uid, userData, studentData, currentUser, playerManifest, squadAbbreviation);
}

