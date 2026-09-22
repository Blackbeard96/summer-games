/**
 * Story identity + reputation helpers for students/{uid}.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  DEFAULT_REPUTATION_THRESHOLDS,
  defaultPlayerReputation,
  defaultStoryIdentity,
  reputationFromStreak,
  type PlayerReputation,
  type ReputationThresholds,
  type StoryIdentity,
} from '../types/classroomOsIdentity';

export async function fetchStoryIdentity(uid: string): Promise<StoryIdentity> {
  const snap = await getDoc(doc(db, 'students', uid));
  if (!snap.exists()) return defaultStoryIdentity();
  const raw = (snap.data() as { storyIdentity?: Partial<StoryIdentity> }).storyIdentity;
  return { ...defaultStoryIdentity(), ...(raw || {}) };
}

export async function saveStoryIdentity(uid: string, identity: StoryIdentity): Promise<void> {
  await setDoc(
    doc(db, 'students', uid),
    {
      storyIdentity: {
        ...identity,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchPlayerReputation(uid: string): Promise<PlayerReputation> {
  const snap = await getDoc(doc(db, 'students', uid));
  if (!snap.exists()) return defaultPlayerReputation();
  const raw = (snap.data() as { reputation?: Partial<PlayerReputation> }).reputation;
  return { ...defaultPlayerReputation(), ...(raw || {}) };
}

export async function fetchReputationThresholds(): Promise<ReputationThresholds> {
  try {
    const snap = await getDoc(doc(db, 'adminSettings', 'reputationThresholds'));
    if (!snap.exists()) return DEFAULT_REPUTATION_THRESHOLDS;
    return { ...DEFAULT_REPUTATION_THRESHOLDS, ...(snap.data() as Partial<ReputationThresholds>) };
  } catch {
    return DEFAULT_REPUTATION_THRESHOLDS;
  }
}

/**
 * Apply a verified goal outcome to reputation (streak + status).
 * Call from weekly goal verification paths — does not punish permanently.
 */
export async function applyGoalOutcomeToReputation(args: {
  studentId: string;
  achieved: boolean;
  declared?: boolean;
}): Promise<PlayerReputation> {
  const thresholds = await fetchReputationThresholds();
  const current = await fetchPlayerReputation(args.studentId);
  const goalsDeclared = current.goalsDeclared + (args.declared === false ? 0 : 1);
  const goalsAchieved = current.goalsAchieved + (args.achieved ? 1 : 0);
  const currentGoalStreak = args.achieved ? current.currentGoalStreak + 1 : 0;
  const longestGoalStreak = Math.max(current.longestGoalStreak, currentGoalStreak);
  const goalCompletionRate =
    goalsDeclared > 0 ? Math.round((goalsAchieved / goalsDeclared) * 1000) / 1000 : null;
  const currentReputationStatus = args.achieved
    ? reputationFromStreak(currentGoalStreak, thresholds)
    : reputationFromStreak(0, thresholds);

  const next: PlayerReputation = {
    currentGoalStreak,
    longestGoalStreak,
    goalsDeclared,
    goalsAchieved,
    goalCompletionRate,
    currentReputationStatus,
  };

  await setDoc(
    doc(db, 'students', args.studentId),
    {
      reputation: { ...next, updatedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return next;
}
