import { onSnapshot } from 'firebase/firestore';
import type { DocumentReference, DocumentSnapshot, FirestoreError, Query, QuerySnapshot } from 'firebase/firestore';

/**
 * One Firestore listener per key, shared by every subscriber.
 *
 * Firestore 11 can hit `INTERNAL ASSERTION FAILED (ca9, ve:-1)` — which permanently breaks the client
 * for the tab — when the same target is unlistened and relistened in quick succession (React Strict
 * Mode, remounts) or relistened after a permission error. Teardown is therefore delayed so a quick
 * remount reuses the live listener, and denied targets are not relistened for a cool-down period.
 */
type Snap = QuerySnapshot | DocumentSnapshot;
type Next = (snap: Snap) => void;
type Fail = (e: FirestoreError) => void;

interface Entry {
  unsub: (() => void) | null;
  subs: Set<{ next: Next; fail?: Fail }>;
  last: Snap | null;
  error: FirestoreError | null;
  deniedAt: number;
  teardown: ReturnType<typeof setTimeout> | null;
}

const TEARDOWN_DELAY_MS = 1500;
const DENIED_COOLDOWN_MS = 60_000;
const entries = new Map<string, Entry>();

function start(key: string, entry: Entry, target: Query | DocumentReference) {
  entry.error = null;
  const onNext = (snap: Snap) => {
    entry.last = snap;
    entry.subs.forEach((s) => s.next(snap));
  };
  const onFail = (e: FirestoreError) => {
    // The SDK has already removed the target; never call this unsub again.
    entry.unsub = null;
    entry.error = e;
    entry.last = null;
    if (e.code === 'permission-denied') entry.deniedAt = Date.now();
    entry.subs.forEach((s) => s.fail?.(e));
  };
  const unsub =
    'type' in target && target.type === 'document'
      ? onSnapshot(target as DocumentReference, onNext, onFail)
      : onSnapshot(target as Query, onNext, onFail);
  if (!entry.error) entry.unsub = unsub;
}

export function sharedSnapshot<S extends Snap>(
  key: string,
  target: Query | DocumentReference,
  next: (snap: S) => void,
  fail?: Fail
): () => void {
  let entry = entries.get(key);
  if (!entry) {
    entry = { unsub: null, subs: new Set(), last: null, error: null, deniedAt: 0, teardown: null };
    entries.set(key, entry);
  }
  if (entry.teardown) {
    clearTimeout(entry.teardown);
    entry.teardown = null;
  }
  const sub = { next: next as Next, fail };
  entry.subs.add(sub);

  if (entry.unsub) {
    if (entry.last) next(entry.last as S);
  } else if (entry.error && Date.now() - entry.deniedAt < DENIED_COOLDOWN_MS && entry.error.code === 'permission-denied') {
    const err = entry.error;
    void Promise.resolve().then(() => fail?.(err));
  } else {
    start(key, entry, target);
  }

  const e = entry;
  return () => {
    e.subs.delete(sub);
    if (e.subs.size > 0 || e.teardown) return;
    e.teardown = setTimeout(() => {
      e.teardown = null;
      if (e.subs.size > 0) return;
      e.unsub?.();
      e.unsub = null;
      e.last = null;
      if (!e.error) entries.delete(key);
    }, TEARDOWN_DELAY_MS);
  };
}
