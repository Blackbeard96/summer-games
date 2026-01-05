/**
 * Daily Generator Notification Utility
 * Handles daily PP and Shield generation for users based on their vault generator level
 */

import { db } from '../firebase';
import { doc, getDoc, runTransaction, Timestamp, serverTimestamp } from 'firebase/firestore';
import { getCurrentUTCDayStart, calculateDaysAway, calculateEarnings } from './generatorEarnings';

export interface DailyGeneratorResult {
  daysAway: number;
  ppEarned: number;
  shieldsEarned: number;
  generatorLevel: number;
  ppPerDay: number;
  shieldsPerDay: number;
}

/**
 * Get today's date key in UTC (YYYY-MM-DD format)
 */
export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if daily generator modal should be shown today
 * Returns true if lastDailyGeneratorModalDate is not today
 */
export function shouldShowDailyGeneratorModal(lastModalDate: string | null | undefined): boolean {
  if (!lastModalDate) {
    return true; // Never shown before
  }
  const todayKey = getTodayDateKey();
  return lastModalDate !== todayKey;
}

/**
 * Calculate and credit daily generator earnings for a user
 * Uses Firestore transaction to prevent duplicate credits
 * 
 * @param userId - User ID
 * @param generatorLevel - Generator level (from vault)
 * @param ppPerDay - PP per day rate
 * @param shieldsPerDay - Shields per day rate
 * @param vaultCapacity - Maximum PP capacity
 * @param maxShieldStrength - Maximum shield strength
 * @returns Earnings result if credits were applied, null otherwise
 */
export async function checkAndCreditDailyGenerator(
  userId: string,
  generatorLevel: number,
  ppPerDay: number,
  shieldsPerDay: number,
  vaultCapacity: number,
  maxShieldStrength: number
): Promise<DailyGeneratorResult | null> {
  try {
    const todayKey = getTodayDateKey();
    const usersRef = doc(db, 'users', userId);
    const vaultRef = doc(db, 'vaults', userId);
    const studentRef = doc(db, 'students', userId);

    let result: DailyGeneratorResult | null = null;

    await runTransaction(db, async (transaction) => {
      // Read current state
      const usersDoc = await transaction.get(usersRef);
      const vaultDoc = await transaction.get(vaultRef);
      const studentDoc = await transaction.get(studentRef);

      if (!vaultDoc.exists()) {
        // No vault, can't generate
        return;
      }

      const vaultData = vaultDoc.data();
      const usersData = usersDoc.exists() ? usersDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};

      // Check if modal was already shown today
      const lastModalDate = usersData.lastDailyGeneratorModalDate || null;
      if (!shouldShowDailyGeneratorModal(lastModalDate)) {
        // Already shown today, just update lastLoginAt
        if (usersDoc.exists()) {
          transaction.update(usersRef, {
            lastLoginAt: serverTimestamp()
          });
        }
        return;
      }

      // Get last claim time (prefer users.lastGeneratorClaimAt, fallback to vault.generatorLastClaimedAt)
      let lastClaimedAt: Date | null = null;
      if (usersData.lastGeneratorClaimAt) {
        const claimedAt = usersData.lastGeneratorClaimAt;
        if (claimedAt instanceof Date) {
          lastClaimedAt = claimedAt;
        } else if (claimedAt && typeof claimedAt === 'object' && 'toDate' in claimedAt) {
          lastClaimedAt = claimedAt.toDate();
        } else {
          lastClaimedAt = new Date(claimedAt as any);
        }
      } else if (vaultData.generatorLastClaimedAt) {
        const claimedAt = vaultData.generatorLastClaimedAt;
        if (claimedAt instanceof Date) {
          lastClaimedAt = claimedAt;
        } else if (claimedAt && typeof claimedAt === 'object' && 'toDate' in claimedAt) {
          lastClaimedAt = claimedAt.toDate();
        } else {
          lastClaimedAt = new Date(claimedAt as any);
        }
      } else if (usersData.lastLoginAt) {
        // Fallback to lastLoginAt if no claim time exists
        const loginAt = usersData.lastLoginAt;
        if (loginAt instanceof Date) {
          lastClaimedAt = loginAt;
        } else if (loginAt && typeof loginAt === 'object' && 'toDate' in loginAt) {
          lastClaimedAt = loginAt.toDate();
        } else {
          lastClaimedAt = new Date(loginAt as any);
        }
      } else if (usersData.createdAt) {
        // Fallback to account creation
        const createdAt = usersData.createdAt;
        if (createdAt instanceof Date) {
          lastClaimedAt = createdAt;
        } else if (createdAt && typeof createdAt === 'object' && 'toDate' in createdAt) {
          lastClaimedAt = createdAt.toDate();
        } else {
          lastClaimedAt = new Date(createdAt as any);
        }
      }

      // Calculate days away
      const daysAway = calculateDaysAway(lastClaimedAt);

      // If no days away, still update lastLoginAt and modal date
      if (daysAway <= 0) {
        const updates: any = {
          lastLoginAt: serverTimestamp(),
          lastDailyGeneratorModalDate: todayKey
        };
        if (usersDoc.exists()) {
          transaction.update(usersRef, updates);
        } else {
          transaction.set(usersRef, updates);
        }
        return;
      }

      // Calculate earnings
      const { ppEarned, shieldsEarned } = calculateEarnings(daysAway, ppPerDay, shieldsPerDay);

      // Get current values
      const currentVaultPP = vaultData.currentPP || 0;
      const currentStudentPP = studentData.powerPoints || 0;
      const currentUsersPP = usersData.powerPoints || 0;
      const currentShieldStrength = vaultData.shieldStrength || 0;

      // Calculate new values (capped at max)
      const newVaultPP = Math.min(vaultCapacity, currentVaultPP + ppEarned);
      const newStudentPP = Math.min(vaultCapacity, currentStudentPP + ppEarned);
      const newUsersPP = Math.min(vaultCapacity, currentUsersPP + ppEarned);
      const newShieldStrength = Math.min(maxShieldStrength, currentShieldStrength + shieldsEarned);

      // Update timestamp to start of current UTC day
      const now = getCurrentUTCDayStart();

      // Update vault
      transaction.update(vaultRef, {
        currentPP: newVaultPP,
        shieldStrength: newShieldStrength,
        generatorLastClaimedAt: Timestamp.fromDate(now)
      });

      // Update student PP
      if (studentDoc.exists()) {
        transaction.update(studentRef, {
          powerPoints: newStudentPP
        });
      }

      // Update users collection
      const usersUpdates: any = {
        lastLoginAt: serverTimestamp(),
        lastGeneratorClaimAt: Timestamp.fromDate(now),
        lastDailyGeneratorModalDate: todayKey
      };
      if (usersDoc.exists()) {
        // Update existing users doc
        if (usersData.powerPoints !== undefined) {
          usersUpdates.powerPoints = newUsersPP;
        }
        transaction.update(usersRef, usersUpdates);
      } else {
        // Create users doc if it doesn't exist
        transaction.set(usersRef, {
          ...usersUpdates,
          powerPoints: newUsersPP
        });
      }

      // Set result for return
      result = {
        daysAway,
        ppEarned,
        shieldsEarned,
        generatorLevel,
        ppPerDay,
        shieldsPerDay
      };
    });

    return result;
  } catch (error) {
    console.error('Error checking and crediting daily generator:', error);
    return null;
  }
}


