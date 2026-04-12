/**
 * Island Raid Levels – admin-defined levels (waves, enemies, rewards).
 * Stored in Firestore: islandRaidLevels/{levelId}
 * Default Easy and Normal levels are seeded when the collection is empty.
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import type { IslandRaidLevel, IslandRaidEnemy, IslandRaidLevelEnemyTemplate } from '../types/islandRaid';

const COLLECTION = 'islandRaidLevels';

const DEFAULT_LEVEL_IDS = { easy: 'default-easy', normal: 'default-normal' } as const;

/** Default Easy: 3 waves, unpowered zombies then a few powered (matches lobby behavior). */
const DEFAULT_EASY_PAYLOAD = {
  name: 'Easy',
  difficulty: 'easy' as const,
  maxWaves: 3,
  order: 0,
  waves: [
    {
      waveIndex: 1,
      enemies: [
        { type: 'zombie' as const, name: 'Zombie', count: 2, health: 80, shieldStrength: 0, level: 1, damage: 30, image: '/images/Unpowered Zombie.png' }
      ]
    },
    {
      waveIndex: 2,
      enemies: [
        { type: 'zombie' as const, name: 'Zombie', count: 3, health: 90, shieldStrength: 0, level: 2, damage: 35, image: '/images/Unpowered Zombie.png' }
      ]
    },
    {
      waveIndex: 3,
      enemies: [
        { type: 'zombie' as const, name: 'Zombie', count: 2, health: 100, shieldStrength: 0, level: 2, damage: 40, image: '/images/Unpowered Zombie.png' },
        { type: 'powered_zombie' as const, name: 'Powered Zombie', count: 2, health: 120, shieldStrength: 0, level: 3, damage: 50, image: '/images/Powered Zombie.png' }
      ]
    }
  ],
  rewards: { pp: 75, xp: 75, truthMetal: 0, captainHelmet: false, elementalRingIds: [] }
};

/** Default Normal: 5 waves, powered zombies + captain on wave 5 (matches lobby behavior). */
const DEFAULT_NORMAL_PAYLOAD = {
  name: 'Normal',
  difficulty: 'normal' as const,
  maxWaves: 5,
  order: 1,
  waves: [
    {
      waveIndex: 1,
      enemies: [
        { type: 'powered_zombie' as const, name: 'Powered Zombie', count: 2, health: 100, shieldStrength: 0, level: 2, damage: 40, image: '/images/Powered Zombie.png' }
      ]
    },
    {
      waveIndex: 2,
      enemies: [
        { type: 'powered_zombie' as const, name: 'Powered Zombie', count: 2, health: 120, shieldStrength: 0, level: 3, damage: 45, image: '/images/Powered Zombie.png' }
      ]
    },
    {
      waveIndex: 3,
      enemies: [
        { type: 'powered_zombie' as const, name: 'Powered Zombie', count: 3, health: 140, shieldStrength: 0, level: 5, damage: 55, image: '/images/Powered Zombie.png' }
      ]
    },
    {
      waveIndex: 4,
      enemies: [
        { type: 'powered_zombie' as const, name: 'Powered Zombie', count: 3, health: 180, shieldStrength: 0, level: 6, damage: 60, image: '/images/Powered Zombie.png' },
        { type: 'zombie' as const, name: 'Zombie', count: 1, health: 120, shieldStrength: 0, level: 4, damage: 45, image: '/images/Unpowered Zombie.png' }
      ]
    },
    {
      waveIndex: 5,
      enemies: [
        { type: 'zombie_captain' as const, name: 'Zombie Captain', count: 1, health: 500, shieldStrength: 200, level: 8, damage: 80, image: '/images/Zombie Captain.png' },
        { type: 'powered_zombie' as const, name: 'Powered Zombie', count: 4, health: 180, shieldStrength: 0, level: 7, damage: 60, image: '/images/Powered Zombie.png' }
      ]
    }
  ],
  rewards: { pp: 100, xp: 100, truthMetal: 0, captainHelmet: false, elementalRingIds: [] }
};

/** Ensure default Easy and Normal levels exist in Firestore (by fixed id so we don't duplicate). */
async function ensureDefaultLevels(): Promise<void> {
  const easyRef = doc(db, COLLECTION, DEFAULT_LEVEL_IDS.easy);
  const normalRef = doc(db, COLLECTION, DEFAULT_LEVEL_IDS.normal);
  const [easySnap, normalSnap] = await Promise.all([getDoc(easyRef), getDoc(normalRef)]);
  const now = serverTimestamp();
  if (!easySnap.exists()) {
    await setDoc(easyRef, { ...DEFAULT_EASY_PAYLOAD, createdAt: now, updatedAt: now });
  }
  if (!normalSnap.exists()) {
    await setDoc(normalRef, { ...DEFAULT_NORMAL_PAYLOAD, createdAt: now, updatedAt: now });
  }
}

export async function listIslandRaidLevels(): Promise<IslandRaidLevel[]> {
  const ref = collection(db, COLLECTION);
  await ensureDefaultLevels();
  try {
    const q = query(ref, orderBy('order', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as IslandRaidLevel));
  } catch (e) {
    // Fallback if order index missing or docs lack 'order': fetch all and sort in memory
    const snap = await getDocs(ref);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as IslandRaidLevel));
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }
}

export async function getIslandRaidLevel(levelId: string): Promise<IslandRaidLevel | null> {
  const ref = doc(db, COLLECTION, levelId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as IslandRaidLevel;
}

/** Remove undefined so Firestore accepts the payload (Firestore rejects undefined values). */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore).filter((v) => v !== undefined);
  if (typeof obj === 'object' && obj.constructor === Object) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const s = sanitizeForFirestore(v);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return obj;
}

export async function createIslandRaidLevel(
  data: Omit<IslandRaidLevel, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = doc(collection(db, COLLECTION));
  const now = serverTimestamp();
  const clean = sanitizeForFirestore(data) || {};
  await setDoc(ref, { ...clean, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function updateIslandRaidLevel(
  levelId: string,
  data: Partial<Omit<IslandRaidLevel, 'id' | 'createdAt'>>
): Promise<void> {
  const ref = doc(db, COLLECTION, levelId);
  const cleaned = sanitizeForFirestore(data);
  if (!cleaned || Object.keys(cleaned).length === 0) return;
  await updateDoc(ref, { ...cleaned, updatedAt: serverTimestamp() });
}

export async function deleteIslandRaidLevel(levelId: string): Promise<void> {
  const ref = doc(db, COLLECTION, levelId);
  await deleteDoc(ref);
}

/** Build IslandRaidEnemy[] for a wave from level config (for lobby and battle). */
export function buildWaveEnemiesFromLevel(level: IslandRaidLevel, wave: number): IslandRaidEnemy[] {
  const waveConfig = level.waves?.find((w) => w.waveIndex === wave);
  if (!waveConfig?.enemies?.length) return [];
  const mult = { easy: 0.8, normal: 1.0, hard: 1.5, nightmare: 2.0 }[level.difficulty];
  const out: IslandRaidEnemy[] = [];
  let idx = 0;
  for (const t of waveConfig.enemies) {
    const count = Math.max(1, (t as IslandRaidLevelEnemyTemplate).count ?? 1);
    for (let c = 0; c < count; c++) {
      const health = Math.floor((t.health || 100) * mult);
      const shield = Math.floor((t.shieldStrength ?? 0) * mult);
      out.push({
        id: `enemy_${wave}_${idx}`,
        type: t.type,
        name: count > 1 ? `${t.name} ${c + 1}` : t.name,
        health,
        maxHealth: health,
        shieldStrength: shield,
        maxShieldStrength: shield,
        level: Math.floor((t.level || 1) * mult),
        damage: Math.floor((t.damage || 40) * mult),
        moves: [],
        position: { x: Math.random() * 100, y: Math.random() * 100 },
        spawnTime: new Date(),
        waveNumber: wave,
        image: t.image,
        ...(t.enemyType !== undefined ? { enemyType: t.enemyType } : {})
      });
      idx++;
    }
  }
  return out;
}
