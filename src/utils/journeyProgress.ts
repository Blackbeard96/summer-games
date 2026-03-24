/**
 * Shared Player Journey logic — must stay aligned with ChapterDetail sequential unlock
 * for Chapters 1 & 2 (early journey), where UI unlocks by previous challenge completion
 * rather than only artifact/team requirement flags on users/{uid}.
 */

import { CHAPTERS, Chapter, ChapterChallenge } from '../types/chapters';
import { isChapter2ChallengeEffectivelyComplete } from './chapter2ProgressInference';

export interface NextChallenge {
  chapterId: number;
  challengeId: string;
  title: string;
  status: 'unlocked' | 'active';
}

/** Read chapter blob from users.chapters with Firestore string/number key compatibility */
export function getChapterProgress(userProgress: any, chapterId: number): any {
  if (!userProgress?.chapters) return undefined;
  const ch = userProgress.chapters;
  return ch[String(chapterId)] ?? ch[chapterId];
}

/**
 * Chapters 1 & 2: if every challenge before this one in the chapter order is completed,
 * treat as unlocked for journey/deep links — matches ChapterDetail getChallengeStatus.
 */
export function isSequentialUnlockedInEarlyChapters(
  challenge: ChapterChallenge,
  userProgress: any,
  studentData?: any
): boolean {
  const chapter = CHAPTERS.find(c => c.challenges.some(ch => ch.id === challenge.id));
  if (!chapter || (chapter.id !== 1 && chapter.id !== 2)) return false;

  const idx = chapter.challenges.findIndex(c => c.id === challenge.id);
  if (idx < 0) return false;
  if (idx === 0) return true;

  const cp = getChapterProgress(userProgress, chapter.id);
  if (chapter.id === 1 && !cp?.challenges) return false;

  const cpForCh2 = cp || { challenges: {} };

  for (let i = 0; i < idx; i++) {
    const prevId = chapter.challenges[i].id;
    const p = chapter.id === 1 ? cp?.challenges?.[prevId] : cpForCh2.challenges?.[prevId];
    let done = p?.isCompleted === true || p?.status === 'approved';
    if (!done && chapter.id === 2) {
      done = isChapter2ChallengeEffectivelyComplete(prevId, cpForCh2, userProgress, studentData);
    }
    if (!done) return false;
  }
  return true;
}

/**
 * Check if a challenge's requirements are met (legacy / full requirement set).
 * For Chapters 1–2, sequential completion short-circuits to true so journey matches in-game UI.
 */
export function isChallengeUnlocked(
  challenge: ChapterChallenge,
  userProgress: any,
  studentData?: any
): boolean {
  if (isSequentialUnlockedInEarlyChapters(challenge, userProgress, studentData)) {
    return true;
  }

  if (!challenge.requirements || challenge.requirements.length === 0) {
    return true;
  }

  if (challenge.id === 'ep1-get-letter') {
    return true;
  }

  for (const requirement of challenge.requirements) {
    let requirementMet = false;
    const reqType = requirement.type as string;

    switch (reqType) {
      case 'artifact': {
        const artifactValue = requirement.value;
        if (typeof artifactValue === 'string') {
          const fromUser =
            userProgress?.artifacts?.[artifactValue] === true ||
            userProgress?.artifacts?.includes?.(artifactValue);
          const fromStudent = studentData?.artifacts?.[artifactValue] === true;
          requirementMet = !!(fromUser || fromStudent);
        }
        break;
      }
      case 'team': {
        const teamValue = requirement.value;
        if (teamValue === 'formed') {
          requirementMet = !!userProgress?.team?.id || !!userProgress?.squad?.id;
        }
        break;
      }
      case 'rival': {
        const rivalValue = requirement.value;
        if (rivalValue === 'chosen') {
          requirementMet = !!userProgress?.rivals?.chosen || !!userProgress?.rival;
        }
        break;
      }
      case 'challenge': {
        const requiredChallengeId = requirement.value;
        const cp2 = userProgress?.chapters?.[2] || userProgress?.chapters?.['2'];
        if (
          cp2 &&
          (requiredChallengeId.startsWith('ch2-') || requiredChallengeId.startsWith('ep2-'))
        ) {
          requirementMet = isChapter2ChallengeEffectivelyComplete(
            requiredChallengeId,
            cp2,
            userProgress,
            studentData
          );
          break;
        }
        let challengeFound = false;
        for (const chapterId in userProgress?.chapters || {}) {
          const chapterChallenges = userProgress?.chapters?.[chapterId]?.challenges || {};
          if (chapterChallenges[requiredChallengeId]) {
            const requiredChallenge = chapterChallenges[requiredChallengeId];
            requirementMet =
              requiredChallenge?.isCompleted || requiredChallenge?.status === 'approved';
            challengeFound = true;
            break;
          }
        }
        if (!challengeFound) {
          requirementMet = false;
        }
        break;
      }
      case 'previousChapter': {
        const prevChapterId = requirement.value;
        const prev =
          userProgress?.chapters?.[String(prevChapterId)] ?? userProgress?.chapters?.[prevChapterId];
        requirementMet = prev?.isCompleted === true;
        break;
      }
      case 'level': {
        const requiredLevel = requirement.value;
        const userLevel = userProgress?.level || 1;
        requirementMet = userLevel >= requiredLevel;
        break;
      }
      case 'manifest': {
        if (requirement.value === 'chosen') {
          requirementMet = !!userProgress?.manifest || !!userProgress?.manifestId;
        }
        break;
      }
      default:
        requirementMet = false;
    }

    if (!requirementMet) {
      return false;
    }
  }

  return true;
}

export function getCurrentChapter(userProgress: any): Chapter | null {
  if (!userProgress?.chapters) {
    return CHAPTERS.find(chapter => chapter.id === 1) || null;
  }

  const activeChapter = CHAPTERS.find(chapter =>
    getChapterProgress(userProgress, chapter.id)?.isActive
  );

  if (!activeChapter) {
    const firstIncompleteChapter = CHAPTERS.find(chapter => {
      const chapterProgress = getChapterProgress(userProgress, chapter.id);
      if (!chapterProgress) {
        return chapter.id === 1 || chapter.id === 2;
      }
      return !chapterProgress.isCompleted;
    });

    if (firstIncompleteChapter) {
      return firstIncompleteChapter;
    }

    return CHAPTERS[CHAPTERS.length - 1] || null;
  }

  return activeChapter;
}

export function calculateChapterProgress(
  chapter: Chapter,
  userProgress: any,
  studentData?: any
): number {
  const chapterProgress = getChapterProgress(userProgress, chapter.id);
  if (!chapterProgress) {
    return 0;
  }

  // Chapter-level flag can be true while nested `challenges` was wiped — avoid "Completed" + 0%.
  if (chapterProgress.isCompleted === true) {
    return 100;
  }

  const completedChallenges = chapter.challenges.filter(challenge => {
    if (chapter.id === 2) {
      return isChapter2ChallengeEffectivelyComplete(
        challenge.id,
        chapterProgress,
        userProgress,
        studentData
      );
    }
    const challengeProgress = chapterProgress?.challenges?.[challenge.id];
    return challengeProgress?.isCompleted || challengeProgress?.status === 'approved';
  }).length;
  const totalChallenges = chapter.challenges.length;

  return totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;
}

export function findNextChallenge(userProgress: any, studentData?: any): NextChallenge | null {
  if (!userProgress?.chapters) {
    const chapter1 = CHAPTERS.find(c => c.id === 1);
    if (chapter1 && chapter1.challenges.length > 0) {
      return {
        chapterId: 1,
        challengeId: chapter1.challenges[0].id,
        title: chapter1.challenges[0].title,
        status: 'unlocked'
      };
    }
    return null;
  }

  const currentChapter = getCurrentChapter(userProgress);
  if (!currentChapter) {
    return null;
  }

  for (const challenge of currentChapter.challenges) {
    const cp = getChapterProgress(userProgress, currentChapter.id);
    const cpSafe = cp || { challenges: {} };
    const challengeProgress = cpSafe.challenges?.[challenge.id];

    const inferredDone =
      currentChapter.id === 2 &&
      isChapter2ChallengeEffectivelyComplete(challenge.id, cpSafe, userProgress, studentData);

    if (
      challengeProgress?.isCompleted ||
      challengeProgress?.status === 'approved' ||
      inferredDone
    ) {
      continue;
    }

    if (isChallengeUnlocked(challenge, userProgress, studentData)) {
      return {
        chapterId: currentChapter.id,
        challengeId: challenge.id,
        title: challenge.title,
        status: challengeProgress?.isActive ? 'active' : 'unlocked'
      };
    }
  }

  const currentChapterIndex = CHAPTERS.findIndex(c => c.id === currentChapter.id);
  if (currentChapterIndex >= 0 && currentChapterIndex < CHAPTERS.length - 1) {
    const nextChapter = CHAPTERS[currentChapterIndex + 1];
    const nextChapterProgress = getChapterProgress(userProgress, nextChapter.id);

    const chapterUnlocked = nextChapter.requirements.every(req => {
      if (req.type === 'previousChapter') {
        const v = req.value;
        const prev =
          userProgress?.chapters?.[String(v)] ?? userProgress?.chapters?.[v];
        return prev?.isCompleted === true;
      }
      return true;
    });

    if (chapterUnlocked && nextChapter.challenges.length > 0) {
      return {
        chapterId: nextChapter.id,
        challengeId: nextChapter.challenges[0].id,
        title: nextChapter.challenges[0].title,
        status: 'unlocked'
      };
    }
  }

  return null;
}

export function isCaughtUp(userProgress: any): boolean {
  if (!userProgress?.chapters) {
    return false;
  }

  for (const chapter of CHAPTERS) {
    const chapterProgress = getChapterProgress(userProgress, chapter.id);
    if (!chapterProgress?.isCompleted) {
      return false;
    }
  }

  return true;
}
