import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface LiveEventPlacementTotals {
  top3: number;
  firstPlace: number;
}

export function aggregateRanksFromRollupDocs(
  rollupRows: Array<{ rankByPlayer?: Record<string, number> }>
): Record<string, LiveEventPlacementTotals> {
  const out: Record<string, LiveEventPlacementTotals> = {};
  for (const row of rollupRows) {
    const ranks = row.rankByPlayer;
    if (!ranks || typeof ranks !== 'object') continue;
    for (const [uid, rank] of Object.entries(ranks)) {
      const r = Number(rank);
      if (!Number.isFinite(r)) continue;
      if (!out[uid]) out[uid] = { top3: 0, firstPlace: 0 };
      if (r <= 3) out[uid].top3 += 1;
      if (r === 1) out[uid].firstPlace += 1;
    }
  }
  return out;
}

/** School-wide totals from minimal rollup docs (readable by all signed-in users). */
export async function fetchLiveEventPlacementAggregates(): Promise<
  Record<string, LiveEventPlacementTotals>
> {
  const snap = await getDocs(collection(db, 'liveEventPlacementRollups'));
  const rows = snap.docs.map((d) => d.data() as { rankByPlayer?: Record<string, number> });
  return aggregateRanksFromRollupDocs(rows);
}
