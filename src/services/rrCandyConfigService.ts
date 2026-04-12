/**
 * RR Candy global tree config — Firestore system_config/rr_candy_trees_v1 + DEFAULT_RR_CANDY_TREES fallback.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_RR_CANDY_TREES } from '../data/defaultRRCandyTrees';
import type { RRCandyConfig, RRCandyDefinition } from '../types/rrCandyConfig';

const DOC_REF = () => doc(db, 'system_config', 'rr_candy_trees_v1');

function deepMergeCandies(remote: RRCandyDefinition[] | undefined): RRCandyDefinition[] {
  const byId = new Map(DEFAULT_RR_CANDY_TREES.candies.map((c) => [c.id, { ...c, nodes: [...c.nodes] }]));
  if (!remote?.length) return DEFAULT_RR_CANDY_TREES.candies;
  for (const c of remote) {
    if (!c?.id) continue;
    const base = byId.get(c.id);
    if (base) {
      byId.set(c.id, {
        ...base,
        ...c,
        nodes: Array.isArray(c.nodes) ? c.nodes : base.nodes,
        starterNodeIds: Array.isArray(c.starterNodeIds) ? c.starterNodeIds : base.starterNodeIds,
      });
    } else {
      byId.set(c.id, c);
    }
  }
  return DEFAULT_RR_CANDY_TREES.candies.map((d) => byId.get(d.id) || d);
}

export async function getRRCandyConfig(): Promise<RRCandyConfig> {
  try {
    const snap = await getDoc(DOC_REF());
    if (!snap.exists()) {
      return { ...DEFAULT_RR_CANDY_TREES, updatedAt: null };
    }
    const data = snap.data() as Partial<RRCandyConfig>;
    return {
      version: typeof data.version === 'number' ? data.version : DEFAULT_RR_CANDY_TREES.version,
      candies: deepMergeCandies(data.candies),
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e) {
    console.warn('getRRCandyConfig: falling back to defaults', e);
    return { ...DEFAULT_RR_CANDY_TREES, updatedAt: null };
  }
}

export function validateRRCandyConfig(config: RRCandyConfig): { ok: true } | { ok: false; error: string } {
  const nodeIds = new Set<string>();
  const skillIds = new Set<string>();
  for (const candy of config.candies) {
    for (const n of candy.nodes || []) {
      if (!n.nodeId?.trim()) return { ok: false, error: 'Every node needs nodeId.' };
      if (!n.skillId?.trim()) return { ok: false, error: 'Every node needs skillId.' };
      if (nodeIds.has(n.nodeId)) return { ok: false, error: `Duplicate nodeId: ${n.nodeId}` };
      if (skillIds.has(n.skillId)) return { ok: false, error: `Duplicate skillId: ${n.skillId}` };
      nodeIds.add(n.nodeId);
      skillIds.add(n.skillId);
    }
  }
  return { ok: true };
}

export async function saveRRCandyConfig(config: RRCandyConfig): Promise<void> {
  const v = validateRRCandyConfig(config);
  if (!v.ok) throw new Error(v.error);
  await setDoc(
    DOC_REF(),
    {
      candies: config.candies,
      version: config.version,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
