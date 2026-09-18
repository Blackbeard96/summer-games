/**
 * Read/write adminSettings/popupControls — kill-switches for login popups.
 */

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  DEFAULT_POPUP_CONTROLS,
  POPUP_CONTROLS_DOC,
  type PopupControlKey,
  type PopupControls,
} from '../types/popupControls';

const settingsRef = () => doc(db, 'adminSettings', POPUP_CONTROLS_DOC);

export function mergePopupControls(raw: Record<string, unknown> | undefined | null): PopupControls {
  const out = { ...DEFAULT_POPUP_CONTROLS };
  if (!raw) return out;
  (Object.keys(DEFAULT_POPUP_CONTROLS) as PopupControlKey[]).forEach((key) => {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  });
  return out;
}

export async function getPopupControls(): Promise<PopupControls> {
  try {
    const snap = await getDoc(settingsRef());
    if (!snap.exists()) return { ...DEFAULT_POPUP_CONTROLS };
    return mergePopupControls(snap.data() as Record<string, unknown>);
  } catch (e) {
    console.warn('[popupControls] get failed — using defaults (all on)', e);
    return { ...DEFAULT_POPUP_CONTROLS };
  }
}

export async function savePopupControls(controls: PopupControls): Promise<void> {
  await setDoc(
    settingsRef(),
    {
      ...controls,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Live updates for clients + admin UI. */
export function subscribePopupControls(
  onChange: (controls: PopupControls) => void,
  onError?: (err: unknown) => void
): () => void {
  return onSnapshot(
    settingsRef(),
    (snap) => {
      if (!snap.exists()) {
        onChange({ ...DEFAULT_POPUP_CONTROLS });
        return;
      }
      onChange(mergePopupControls(snap.data() as Record<string, unknown>));
    },
    (err) => {
      console.warn('[popupControls] subscribe failed', err);
      onError?.(err);
      onChange({ ...DEFAULT_POPUP_CONTROLS });
    }
  );
}

export function isPopupEnabled(controls: PopupControls, key: PopupControlKey): boolean {
  return controls[key] !== false;
}
