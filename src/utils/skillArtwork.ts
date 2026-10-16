import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';
import { getMoveNameSync, getMoveTemplateNameSync } from './moveOverrides';
import {
  normalizeSkillArtKey,
  resolveSkillArtwork,
  validateSkillArtFile,
  type ResolvedSkillArt,
  type SkillArtEntries,
  type SkillArtEntry,
  type SkillArtInput,
} from './skillArtworkDefaults';

const SKILL_ART_DOC = () => doc(db, 'adminSettings', 'skillArtwork');
const CACHE_MS = 5 * 60 * 1000;

let entriesCache: SkillArtEntries | null = null;
let cacheTime = 0;
let inflight: Promise<SkillArtEntries> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

export const subscribeSkillArtwork = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** One-shot read (no listener), cached for 5 minutes. Failures fall back to defaults. */
export const loadSkillArtwork = async (force = false): Promise<SkillArtEntries> => {
  if (!force && entriesCache && Date.now() - cacheTime < CACHE_MS) return entriesCache;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await getDoc(SKILL_ART_DOC());
      const raw = snap.exists() ? (snap.data()?.entries as SkillArtEntries | undefined) : undefined;
      entriesCache = raw && typeof raw === 'object' ? raw : {};
    } catch (error) {
      console.warn('[skillArtwork] load failed; using default artwork', error);
      entriesCache = entriesCache || {};
    }
    cacheTime = Date.now();
    inflight = null;
    notify();
    return entriesCache;
  })();
  return inflight;
};

export const getSkillArtworkEntriesSync = (): SkillArtEntries | null => entriesCache;

const namesFor = (skill: SkillArtInput): Array<string | null> => {
  const name = skill.name || '';
  if (!name) return [];
  return [getMoveTemplateNameSync(name), getMoveNameSync(name)];
};

/** Synchronous resolution from the warm cache (defaults when the cache is cold). */
export const resolveSkillArtworkSync = (skill: SkillArtInput | null | undefined): ResolvedSkillArt =>
  resolveSkillArtwork(skill, entriesCache, skill ? namesFor(skill) : []);

const preloaded = new Set<string>();

/** Warms the browser image cache so the activation card never pops in late. */
export const preloadSkillArtwork = (skills: Array<SkillArtInput | null | undefined>) => {
  if (typeof Image === 'undefined') return;
  skills.forEach((skill) => {
    if (!skill) return;
    const { src, source } = resolveSkillArtworkSync(skill);
    if (source !== 'custom' || preloaded.has(src)) return;
    preloaded.add(src);
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  });
};

const randomSuffix = () => Math.random().toString(36).slice(2, 8);

export interface SaveSkillArtworkParams {
  skillKey: string;
  skillName: string;
  category?: string;
  file: File;
  updatedBy?: string | null;
}

/** Upload (or replace) artwork for one skill. Admin-only by Storage + Firestore rules. */
export const saveSkillArtwork = async (params: SaveSkillArtworkParams): Promise<SkillArtEntry> => {
  const key = normalizeSkillArtKey(params.skillKey);
  if (!key) throw new Error('This skill has no usable id.');
  const invalid = validateSkillArtFile(params.file);
  if (invalid) throw new Error(invalid);

  const ext = params.file.type === 'image/png' ? 'png' : params.file.type === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `skill_art/${key}/${Date.now()}_${randomSuffix()}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, params.file, {
    contentType: params.file.type,
    cacheControl: 'public, max-age=31536000',
  });
  const imageUrl = await getDownloadURL(storageRef);

  const previous = (await loadSkillArtwork(true))[key];
  const entry: SkillArtEntry = {
    imageUrl,
    imageStoragePath: storagePath,
    skillName: params.skillName,
    category: params.category || 'unknown',
    updatedAt: Date.now(),
    updatedBy: params.updatedBy || 'admin',
  };
  await setDoc(
    SKILL_ART_DOC(),
    { entries: { [key]: entry }, lastUpdated: serverTimestamp(), updatedBy: entry.updatedBy },
    { merge: true }
  );
  entriesCache = { ...(entriesCache || {}), [key]: entry };
  cacheTime = Date.now();
  notify();

  if (previous?.imageStoragePath && previous.imageStoragePath !== storagePath) {
    deleteObject(ref(storage, previous.imageStoragePath)).catch((e) =>
      console.warn('[skillArtwork] old artwork cleanup failed', e)
    );
  }
  return entry;
};

/** Remove custom artwork; the skill falls back to its default. */
export const removeSkillArtwork = async (skillKey: string, updatedBy?: string | null): Promise<void> => {
  const key = normalizeSkillArtKey(skillKey);
  if (!key) return;
  const previous = (await loadSkillArtwork(true))[key];
  if (!previous) return;
  await updateDoc(SKILL_ART_DOC(), {
    [`entries.${key}`]: deleteField(),
    lastUpdated: serverTimestamp(),
    updatedBy: updatedBy || 'admin',
  });
  if (entriesCache) {
    const next = { ...entriesCache };
    delete next[key];
    entriesCache = next;
  }
  cacheTime = Date.now();
  notify();
  if (previous.imageStoragePath) {
    deleteObject(ref(storage, previous.imageStoragePath)).catch((e) =>
      console.warn('[skillArtwork] artwork file cleanup failed', e)
    );
  }
};
