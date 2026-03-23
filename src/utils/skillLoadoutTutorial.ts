/**
 * Skill Loadout tutorial eligibility and persistence key.
 * Used by App (modal queue) and SkillLoadoutTutorialModal; testable without React/router.
 */

import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export const SKILL_LOADOUT_TUTORIAL_KEY = 'skillLoadoutV1';

/**
 * Returns whether the user has already seen the skill loadout tutorial.
 * Safe to call with missing doc (returns false so we show); on error returns true so we don't block.
 */
export async function hasSeenSkillLoadoutTutorial(uid: string): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    const t = data?.tutorials?.[SKILL_LOADOUT_TUTORIAL_KEY];
    return !!(t?.completed || t?.skipped);
  } catch {
    return true;
  }
}
