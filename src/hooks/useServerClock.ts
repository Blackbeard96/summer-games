import { useEffect, useState } from 'react';
import { doc, getDocFromServer, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

let cachedOffsetMs: number | null = null;
let probe: Promise<number> | null = null;

/**
 * Estimates (server time − local time) once per page load by writing a server timestamp to
 * `inSessionRooms/{sid}/cfClock/{uid}`. Countdowns use `Date.now() + offset` so a student whose
 * device clock is wrong still sees the same remaining time as everyone else.
 */
async function probeOffset(sessionId: string, uid: string): Promise<number> {
  const ref = doc(db, 'inSessionRooms', sessionId, 'cfClock', uid);
  const t0 = Date.now();
  await setDoc(ref, { at: serverTimestamp() });
  const t1 = Date.now();
  const snap = await getDocFromServer(ref);
  const at = snap.data()?.at as Timestamp | undefined;
  if (!at || typeof at.toMillis !== 'function') return 0;
  const offset = at.toMillis() - (t0 + t1) / 2;
  // Ignore implausible probes (e.g. stale caches); a few ms of skew is not worth correcting.
  return Math.abs(offset) > 12 * 3600_000 || Math.abs(offset) < 250 ? 0 : Math.round(offset);
}

export function useServerClockOffset(sessionId: string, uid: string | undefined, enabled: boolean): number {
  const [offset, setOffset] = useState<number>(cachedOffsetMs ?? 0);
  useEffect(() => {
    if (!enabled || !sessionId || !uid) return;
    if (cachedOffsetMs != null) {
      setOffset(cachedOffsetMs);
      return;
    }
    let cancelled = false;
    if (!probe) {
      probe = probeOffset(sessionId, uid)
        .then((o) => {
          cachedOffsetMs = o;
          return o;
        })
        .catch(() => {
          probe = null;
          return 0;
        });
    }
    void probe.then((o) => {
      if (!cancelled) setOffset(o);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, uid, enabled]);
  return offset;
}
