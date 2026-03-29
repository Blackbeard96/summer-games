import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { squadMemberUid } from './squadMemberUtils';

export interface SquadMemberPreview {
  uid: string;
  displayName?: string;
  photoURL?: string;
}

export interface SquadLeaderboardRow {
  id: string;
  name: string;
  abbreviation?: string;
  memberCount: number;
  totalXp: number;
  totalPp: number;
  totalPl: number;
  memberUids: string[];
  /** From squad doc `members` (fallback when student profile missing on leaderboard). */
  membersPreview: SquadMemberPreview[];
}

function memberUidsFromSquadData(data: Record<string, unknown>): string[] {
  const rawUids = data.memberUids;
  if (Array.isArray(rawUids) && rawUids.length > 0) {
    return Array.from(new Set(rawUids.filter((u): u is string => typeof u === 'string' && u.length > 0)));
  }
  const members = (data.members as unknown[]) || [];
  return Array.from(
    new Set(
      members
        .map((m) => squadMemberUid(m))
        .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    )
  );
}

export async function fetchSquadLeaderboardRows(): Promise<SquadLeaderboardRow[]> {
  const [squadsSnap, studentsSnap] = await Promise.all([
    getDocs(collection(db, 'squads')),
    getDocs(collection(db, 'students')),
  ]);
  const studentById = new Map<
    string,
    { xp: number; powerPoints: number; powerLevel: number }
  >();
  studentsSnap.forEach((d) => {
    const x = d.data();
    const pl = x.powerLevel;
    studentById.set(d.id, {
      xp: Number(x.xp) || 0,
      powerPoints: Number(x.powerPoints) || 0,
      powerLevel: pl != null && pl !== '' && !Number.isNaN(Number(pl)) ? Number(pl) : 0,
    });
  });

  const rows: SquadLeaderboardRow[] = [];
  squadsSnap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const uids = memberUidsFromSquadData(data);
    const previewByUid = new Map<string, SquadMemberPreview>();
    const rawMembers = Array.isArray(data.members) ? (data.members as unknown[]) : [];
    for (const m of rawMembers) {
      const uid = squadMemberUid(m);
      if (!uid) continue;
      const obj = m as Record<string, unknown>;
      previewByUid.set(uid, {
        uid,
        displayName: typeof obj.displayName === 'string' ? obj.displayName : undefined,
        photoURL: typeof obj.photoURL === 'string' ? obj.photoURL : undefined,
      });
    }
    const membersPreview = uids.map((uid) => previewByUid.get(uid) ?? { uid });
    let totalXp = 0;
    let totalPp = 0;
    let totalPl = 0;
    for (const uid of uids) {
      const st = studentById.get(uid);
      if (st) {
        totalXp += st.xp;
        totalPp += st.powerPoints;
        totalPl += st.powerLevel;
      }
    }
    rows.push({
      id: docSnap.id,
      name: typeof data.name === 'string' && data.name ? data.name : 'Squad',
      abbreviation: typeof data.abbreviation === 'string' ? data.abbreviation : undefined,
      memberCount: uids.length,
      totalXp,
      totalPp,
      totalPl,
      memberUids: uids,
      membersPreview,
    });
  });
  return rows;
}
