/**
 * Mission Storage Utilities
 * 
 * Handles Firebase Storage uploads for mission sequence media
 */

import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

/** Allowed video extensions and MIME types for mission steps */
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'ogg']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']);

/**
 * Returns true if the file is an allowed video type (mp4, webm, mov, ogg).
 * Uses extension and MIME type so .mov (video/quicktime) is accepted.
 */
export function isVideoFile(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) || VIDEO_MIME_TYPES.has(mime);
}

/**
 * Upload an image for a mission sequence step
 */
export async function uploadMissionImage(
  missionId: string,
  stepId: string,
  imageFile: File
): Promise<{ url: string; storagePath: string }> {
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  const storagePath = `missions/${missionId}/slides/${stepId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  
  await uploadBytes(storageRef, imageFile, {
    contentType: imageFile.type,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      missionId,
      stepId
    }
  });
  
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/**
 * Upload a background image for a mission BATTLE step.
 * Separate path from story slides so battle and slide assets do not overwrite each other.
 */
export async function uploadMissionBattleBackground(
  missionId: string,
  stepId: string,
  imageFile: File
): Promise<{ url: string; storagePath: string }> {
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  const storagePath = `missions/${missionId}/battles/${stepId}-bkg.${fileExtension}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, imageFile, {
    contentType: imageFile.type,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      missionId,
      stepId,
      kind: 'battle-background',
    },
  });

  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/**
 * Upload a result image for one option on a CHOICE mission step.
 * Path is unique per choice so options on the same step do not overwrite each other.
 */
export async function uploadMissionChoiceResultImage(
  missionId: string,
  stepId: string,
  choiceId: string,
  imageFile: File
): Promise<{ url: string; storagePath: string }> {
  const validationError = validateMissionPreviewImage(imageFile);
  if (validationError) {
    throw new Error(validationError);
  }
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  const safeChoiceId = choiceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `missions/${missionId}/choices/${stepId}_${safeChoiceId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, imageFile, {
    contentType: imageFile.type,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      missionId,
      stepId,
      choiceId,
    },
  });

  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

const PREVIEW_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateMissionPreviewImage(file: File): string | null {
  if (!PREVIEW_IMAGE_TYPES.has(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    return 'Invalid file type. Use JPG, PNG, WebP, or GIF.';
  }
  if (file.size > PREVIEW_MAX_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}

/**
 * Upload Journey preview or modal image for a mission template.
 */
export async function uploadMissionPreviewImage(
  missionId: string,
  kind: 'preview' | 'modal',
  imageFile: File
): Promise<{ url: string; storagePath: string }> {
  const validationError = validateMissionPreviewImage(imageFile);
  if (validationError) {
    throw new Error(validationError);
  }
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  const storagePath = `missions/${missionId}/${kind}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, imageFile, {
    contentType: imageFile.type || 'image/png',
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      missionId,
      kind,
    },
  });

  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime'
};

/**
 * Upload a video for a mission sequence step (MP4, WebM, MOV, OGG).
 * Use uploadMissionVideoResumable for progress updates.
 */
export async function uploadMissionVideo(
  missionId: string,
  stepId: string,
  videoFile: File
): Promise<{ url: string; storagePath: string }> {
  return uploadMissionVideoResumable(missionId, stepId, videoFile);
}

/**
 * Upload video with optional progress callback. Resumable upload for large files.
 */
export async function uploadMissionVideoResumable(
  missionId: string,
  stepId: string,
  videoFile: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  if (!isVideoFile(videoFile)) {
    const ext = (videoFile.name.split('.').pop() || '').toLowerCase();
    throw new Error(`Invalid video file. Use .mp4, .webm, or .mov. Got: ${ext || videoFile.type || 'unknown'}`);
  }

  const fileExtension = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
  const storagePath = `missions/${missionId}/videos/${stepId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  const contentType = videoFile.type || VIDEO_MIME[fileExtension] || 'video/mp4';

  const metadata = {
    contentType,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      missionId,
      stepId
    }
  };

  if (onProgress) {
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, videoFile, metadata);
      task.on(
        'state_changed',
        (snap) => {
          const percent = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(percent);
        },
        (err) => {
          console.error('[missionStorage] Video upload failed:', err);
          reject(err);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            resolve({ url, storagePath });
          } catch (e) {
            console.error('[missionStorage] getDownloadURL failed:', e);
            reject(e);
          }
        }
      );
    });
  }

  await uploadBytes(storageRef, videoFile, metadata);
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/**
 * Upload a poster image for a video step
 */
export async function uploadMissionPoster(
  missionId: string,
  stepId: string,
  posterFile: File
): Promise<{ url: string; storagePath: string }> {
  const fileExtension = posterFile.name.split('.').pop() || 'jpg';
  const storagePath = `missions/${missionId}/posters/${stepId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  
  await uploadBytes(storageRef, posterFile, {
    contentType: posterFile.type,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      missionId,
      stepId
    }
  });
  
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/**
 * Delete a storage file (optional cleanup)
 */
export async function deleteMissionMedia(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting mission media:', error);
    // Don't throw - cleanup is optional
  }
}

