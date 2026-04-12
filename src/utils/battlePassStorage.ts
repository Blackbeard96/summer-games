import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { isVideoFile } from './missionStorage';

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

export async function uploadBattlePassIntroImage(
  seasonId: string,
  stepId: string,
  imageFile: File
): Promise<{ url: string; storagePath: string }> {
  const fileExtension = imageFile.name.split('.').pop() || 'png';
  const storagePath = `battlePass/${seasonId}/intro/slides/${stepId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, imageFile, {
    contentType: imageFile.type,
    customMetadata: { uploadedAt: new Date().toISOString(), seasonId, stepId },
  });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

export async function uploadBattlePassIntroVideoResumable(
  seasonId: string,
  stepId: string,
  videoFile: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  if (!isVideoFile(videoFile)) {
    const ext = (videoFile.name.split('.').pop() || '').toLowerCase();
    throw new Error(`Invalid video file. Use .mp4, .webm, or .mov. Got: ${ext || videoFile.type || 'unknown'}`);
  }
  const fileExtension = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
  const storagePath = `battlePass/${seasonId}/intro/videos/${stepId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  const contentType = videoFile.type || VIDEO_MIME[fileExtension] || 'video/mp4';
  const metadata = {
    contentType,
    customMetadata: { uploadedAt: new Date().toISOString(), seasonId, stepId },
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
        (err) => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            resolve({ url, storagePath });
          } catch (e) {
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

export async function uploadBattlePassIntroPoster(
  seasonId: string,
  stepId: string,
  posterFile: File
): Promise<{ url: string; storagePath: string }> {
  const fileExtension = posterFile.name.split('.').pop() || 'jpg';
  const storagePath = `battlePass/${seasonId}/intro/posters/${stepId}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, posterFile, {
    contentType: posterFile.type,
    customMetadata: { uploadedAt: new Date().toISOString(), seasonId, stepId },
  });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/** Single hero video for the battle pass season document (stable path per extension). */
export async function uploadBattlePassSeasonHeroVideo(
  seasonId: string,
  videoFile: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  if (!isVideoFile(videoFile)) {
    const ext = (videoFile.name.split('.').pop() || '').toLowerCase();
    throw new Error(`Invalid video file. Use .mp4, .webm, or .mov. Got: ${ext || videoFile.type || 'unknown'}`);
  }
  const fileExtension = (videoFile.name.split('.').pop() || 'mp4').toLowerCase();
  const storagePath = `battlePass/${seasonId}/seasonIntro/hero.${fileExtension}`;
  const storageRef = ref(storage, storagePath);
  const contentType = videoFile.type || VIDEO_MIME[fileExtension] || 'video/mp4';
  const metadata = {
    contentType,
    customMetadata: { uploadedAt: new Date().toISOString(), seasonId, kind: 'seasonHero' },
  };

  if (onProgress) {
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, videoFile, metadata);
      task.on(
        'state_changed',
        (snap) => {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        },
        (err) => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            resolve({ url, storagePath });
          } catch (e) {
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
