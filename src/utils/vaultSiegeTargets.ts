/**
 * Load attackable players for Vault Siege.
 *
 * Firestore only returns documents from a collection query that pass `read` rules.
 * If rules allow a user to read only their own `students/{uid}` doc, `getDocs(students)`
 * yields a single document — after excluding self, Vault Siege shows zero targets.
 *
 * Mitigations here:
 * - Merge peers from `classrooms/{classId}.students` (explicit UIDs) + per-doc `getDoc`.
 * - Optional `where('classId'|'class', '==', classId)` for classmates who set that field.
 * - Full collection read from server (cache-bust) and merge.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface VaultSiegePlayerBase {
  uid: string;
  displayName: string;
  powerPoints: number;
  level: number;
  email?: string;
}

function addStudent(
  map: Map<string, VaultSiegePlayerBase>,
  id: string,
  data: Record<string, unknown>,
  currentUserUid: string
): void {
  if (id === currentUserUid) return;
  map.set(id, {
    uid: id,
    displayName: (data.displayName as string) || (data.name as string) || 'Unknown Player',
    powerPoints: (data.powerPoints as number) || (data.currentPP as number) || 0,
    level: (data.level as number) || 1,
    email: typeof data.email === 'string' ? data.email : undefined,
  });
}

export async function loadVaultSiegePlayerList(
  currentUserUid: string
): Promise<{ players: VaultSiegePlayerBase[]; loadError?: string }> {
  const map = new Map<string, VaultSiegePlayerBase>();

  let myClassId: string | null = null;
  try {
    const mySnap = await getDoc(doc(db, 'students', currentUserUid));
    if (mySnap.exists()) {
      const d = mySnap.data();
      myClassId = (typeof d.classId === 'string' && d.classId) || (typeof d.class === 'string' && d.class) || null;
    }
  } catch {
    /* ignore */
  }

  // 1) Classroom roster: explicit UID list (works when enrolled users can read the classroom doc)
  if (myClassId) {
    try {
      const classSnap = await getDoc(doc(db, 'classrooms', myClassId));
      if (classSnap.exists()) {
        const ids = (classSnap.data().students as string[]) || [];
        await Promise.all(
          ids
            .filter((id) => typeof id === 'string' && id.length > 0 && id !== currentUserUid)
            .map(async (id) => {
              try {
                const s = await getDoc(doc(db, 'students', id));
                if (s.exists()) addStudent(map, id, s.data() as Record<string, unknown>, currentUserUid);
              } catch {
                /* permission-denied or network */
              }
            })
        );
      }
    } catch (e) {
      console.warn('VaultSiege: classroom doc load failed:', e);
    }

    // 2) Classmates by class field (common patterns)
    for (const field of ['classId', 'class'] as const) {
      try {
        const q = query(collection(db, 'students'), where(field, '==', myClassId));
        const snap = await getDocs(q);
        snap.forEach((d) => addStudent(map, d.id, d.data() as Record<string, unknown>, currentUserUid));
      } catch (e) {
        console.warn(`VaultSiege: students where(${field}) failed:`, e);
      }
    }
  }

  // 3) Full collection — prefer server to avoid empty cache edge cases
  let fullScanDenied = false;
  try {
    const snap = await getDocsFromServer(collection(db, 'students'));
    snap.forEach((d) => addStudent(map, d.id, d.data() as Record<string, unknown>, currentUserUid));
  } catch (e: unknown) {
    const code =
      typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === 'permission-denied') {
      fullScanDenied = true;
    }
    try {
      const snap = await getDocs(collection(db, 'students'));
      snap.forEach((d) => addStudent(map, d.id, d.data() as Record<string, unknown>, currentUserUid));
    } catch (e2) {
      console.error('VaultSiege: full students collection load failed:', e2);
    }
  }

  const players = Array.from(map.values());

  if (players.length === 0 && fullScanDenied) {
    return {
      players,
      loadError:
        'Could not read the full student directory (permission denied). Deploy Firestore rules so authenticated users can read `students` documents for Vault Siege, or ensure your class roster is set on the classroom document.',
    };
  }

  return { players };
}
