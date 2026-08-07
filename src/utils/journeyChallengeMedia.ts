/**
 * Preview / modal images for hardcoded Player Journey challenges (CHAPTERS).
 * Stored separately from mission templates so Core Journey steps can have media
 * without requiring a full Firestore STORY mission document.
 */

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  deleteMissionMedia,
  uploadMissionPreviewImage,
  validateMissionPreviewImage,
} from './missionStorage';

export const JOURNEY_CHALLENGE_MEDIA_COLLECTION = 'journeyChallengeMedia';

export interface JourneyChallengeMedia {
  challengeId: string;
  chapterId: number;
  previewImageUrl?: string;
  previewImageStoragePath?: string;
  modalImageUrl?: string;
  modalImageStoragePath?: string;
  updatedAt?: unknown;
}

export async function loadAllJourneyChallengeMedia(): Promise<
  Record<string, JourneyChallengeMedia>
> {
  const snap = await getDocs(collection(db, JOURNEY_CHALLENGE_MEDIA_COLLECTION));
  const out: Record<string, JourneyChallengeMedia> = {};
  snap.forEach((d) => {
    const data = d.data();
    out[d.id] = {
      challengeId: d.id,
      chapterId: typeof data.chapterId === 'number' ? data.chapterId : 0,
      previewImageUrl: data.previewImageUrl || undefined,
      previewImageStoragePath: data.previewImageStoragePath || undefined,
      modalImageUrl: data.modalImageUrl || undefined,
      modalImageStoragePath: data.modalImageStoragePath || undefined,
      updatedAt: data.updatedAt,
    };
  });
  return out;
}

export async function saveJourneyChallengePreviewImage(
  challengeId: string,
  chapterId: number,
  file: File,
  kind: 'preview' | 'modal' = 'preview'
): Promise<JourneyChallengeMedia> {
  const err = validateMissionPreviewImage(file);
  if (err) throw new Error(err);

  const storageId = `journey-challenge-${challengeId}`;
  const { url, storagePath } = await uploadMissionPreviewImage(storageId, kind, file);
  const ref = doc(db, JOURNEY_CHALLENGE_MEDIA_COLLECTION, challengeId);

  const patch =
    kind === 'preview'
      ? {
          challengeId,
          chapterId,
          previewImageUrl: url,
          previewImageStoragePath: storagePath,
          updatedAt: serverTimestamp(),
        }
      : {
          challengeId,
          chapterId,
          modalImageUrl: url,
          modalImageStoragePath: storagePath,
          updatedAt: serverTimestamp(),
        };

  await setDoc(ref, patch, { merge: true });
  return {
    challengeId,
    chapterId,
    ...(kind === 'preview'
      ? { previewImageUrl: url, previewImageStoragePath: storagePath }
      : { modalImageUrl: url, modalImageStoragePath: storagePath }),
  };
}

export async function removeJourneyChallengeImage(
  challengeId: string,
  kind: 'preview' | 'modal',
  existing?: JourneyChallengeMedia
): Promise<void> {
  const path =
    kind === 'preview'
      ? existing?.previewImageStoragePath
      : existing?.modalImageStoragePath;
  if (path) {
    await deleteMissionMedia(path);
  }

  const ref = doc(db, JOURNEY_CHALLENGE_MEDIA_COLLECTION, challengeId);
  if (kind === 'preview') {
    await updateDoc(ref, {
      previewImageUrl: deleteField(),
      previewImageStoragePath: deleteField(),
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(
        ref,
        { challengeId, previewImageUrl: null, previewImageStoragePath: null, updatedAt: serverTimestamp() },
        { merge: true }
      );
    });
  } else {
    await updateDoc(ref, {
      modalImageUrl: deleteField(),
      modalImageStoragePath: deleteField(),
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(
        ref,
        { challengeId, modalImageUrl: null, modalImageStoragePath: null, updatedAt: serverTimestamp() },
        { merge: true }
      );
    });
  }
}
