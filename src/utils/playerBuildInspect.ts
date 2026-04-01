import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ARTIFACT_PERK_OPTIONS } from '../constants/artifactPerks';
import { getEquippedSkillsForBattle } from './battleSkillsService';
import { getUserRRCandySkills } from './rrCandyService';
import { getPlayerSkillState } from './skillStateService';
import type { SessionLoadout } from './inSessionSkillsService';
import type { Move } from '../types/battle';

export type InspectArtifactEntry = {
  slot: string;
  name: string;
  image?: string | null;
  level?: number | null;
  rarity?: string | null;
  perks: Array<{ id: string; label: string; description: string }>;
};

export type PlayerInspectData = {
  userId: string;
  displayName: string;
  photoURL?: string;
  powerLevel?: number | null;
  loadout: SessionLoadout | null;
  artifacts: InspectArtifactEntry[];
  skillLevelsById: Record<string, number>;
};

export function finitePowerLevel(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

export function normalizeEquippedArtifacts(raw: unknown): InspectArtifactEntry[] {
  if (!raw) return [];
  const entries: InspectArtifactEntry[] = [];
  const perkById = new Map(ARTIFACT_PERK_OPTIONS.map((p) => [p.id, p]));
  const perkByLabel = new Map(ARTIFACT_PERK_OPTIONS.map((p) => [p.label.toLowerCase(), p]));
  const readArtifactLevel = (value: Record<string, unknown>): number | null => {
    const candidates = [value?.level, value?.artifactLevel, value?.upgradeLevel, value?.currentLevel];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return null;
  };
  const pushArtifact = (slot: string, value: Record<string, unknown>) => {
    if (!value) return;
    const name =
      value.name ||
      value.label ||
      value.artifactName ||
      value.id ||
      value.artifactId ||
      'Unknown Artifact';
    const rawPerks = Array.isArray(value.perks)
      ? value.perks
      : typeof value.perk === 'string'
        ? [value.perk]
        : [];
    const perks = rawPerks
      .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p: string) => {
        const byId = perkById.get(p);
        if (byId) return byId;
        const byLabel = perkByLabel.get(p.toLowerCase());
        if (byLabel) return byLabel;
        return { id: p, label: p, description: '' };
      })
      .map((p: { id: string; label: string; description?: string }) => ({
        id: p.id,
        label: p.label,
        description: p.description || '',
      }));
    entries.push({
      slot,
      name: String(name),
      image: typeof value.image === 'string' ? value.image : null,
      level: readArtifactLevel(value),
      rarity: (value.rarity as string | undefined) ?? null,
      perks,
    });
  };

  if (Array.isArray(raw)) {
    raw.forEach((artifact, idx) => pushArtifact(`slot-${idx + 1}`, artifact as Record<string, unknown>));
    return entries;
  }

  if (typeof raw === 'object' && raw !== null) {
    Object.entries(raw).forEach(([slot, artifact]) =>
      pushArtifact(slot, artifact as Record<string, unknown>)
    );
  }

  return entries;
}

function isRRCandyMoveLike(move: { id?: string; name?: string }): boolean {
  const id = String(move?.id || '').toLowerCase();
  const name = String(move?.name || '').toLowerCase();
  return (
    id.includes('rr-candy') ||
    name === 'shield off' ||
    name === 'shield on' ||
    name === 'vault hack' ||
    name === 'shield restoration'
  );
}

function applySkillUpgradeLevelsToLoadout(
  loadout: SessionLoadout,
  skillLevelsById: Record<string, number>
): SessionLoadout {
  const apply = (moves: Move[] = []) =>
    moves.map((m) => {
      const upgraded = Number(skillLevelsById[String(m?.id)]);
      const artifactGranted = Number(m?.artifactGrant?.artifactLevel);
      const fromMove = Number(m?.level);
      const resolved = Number.isFinite(upgraded) && upgraded > 0
        ? upgraded
        : Number.isFinite(artifactGranted) && artifactGranted > 0
          ? artifactGranted
          : Number.isFinite(fromMove) && fromMove > 0
            ? fromMove
            : 1;
      return { ...m, level: Math.floor(resolved) } as Move;
    });

  return {
    ...loadout,
    manifest: apply(loadout.manifest || []),
    elemental: apply(loadout.elemental || []),
    rrCandy: apply(loadout.rrCandy || []),
    artifact: apply(loadout.artifact || []),
  };
}

function normalizeLoadoutBuckets(loadout: SessionLoadout): SessionLoadout {
  const all = [
    ...(loadout.manifest || []),
    ...(loadout.elemental || []),
    ...(loadout.rrCandy || []),
    ...(loadout.artifact || []),
  ];
  const dedup = new Map<string, Move>();
  all.forEach((m: Move, idx: number) => dedup.set(String(m?.id || `${m?.name || 'move'}-${idx}`), m));
  const merged = Array.from(dedup.values());
  return {
    ...loadout,
    manifest: merged.filter((m) => m?.category === 'manifest'),
    elemental: merged.filter((m) => m?.category === 'elemental'),
    rrCandy: merged.filter((m) => isRRCandyMoveLike(m)),
    artifact: merged.filter((m) => m?.category === 'system' && !isRRCandyMoveLike(m)),
  };
}

export type FetchPlayerBuildInspectOptions = {
  sessionId?: string | null;
  roster?: { displayName?: string; photoURL?: string; powerLevel?: number | null };
};

export async function fetchPlayerBuildInspectData(
  playerId: string,
  options?: FetchPlayerBuildInspectOptions
): Promise<PlayerInspectData> {
  const sessionId = options?.sessionId ?? undefined;
  const roster = options?.roster;

  const studentRef = doc(db, 'students', playerId);
  const battleMovesRef = doc(db, 'battleMoves', playerId);

  const playerRef = sessionId ? doc(db, 'inSessionRooms', sessionId, 'players', playerId) : null;

  const [studentSnap, playerSnap, skillState, battleMovesSnap] = await Promise.all([
    getDoc(studentRef),
    playerRef ? getDoc(playerRef) : Promise.resolve(null),
    getPlayerSkillState(playerId),
    getDoc(battleMovesRef),
  ]);

  const studentData = studentSnap.exists() ? studentSnap.data() : {};
  const playerData = playerSnap?.exists() ? playerSnap.data() : {};
  const battleMoves = battleMovesSnap.exists() ? ((battleMovesSnap.data().moves || []) as Move[]) : [];

  const skillLevelsById = Object.entries(skillState?.skillUpgrades || {}).reduce((acc, [skillId, data]) => {
    const lvl = Number((data as { level?: number })?.level);
    if (Number.isFinite(lvl) && lvl > 0) acc[skillId] = Math.floor(lvl);
    return acc;
  }, {} as Record<string, number>);

  battleMoves.forEach((m) => {
    const id = String(m?.id || '');
    if (!id) return;
    const fromLevel = Number(m?.level);
    const fromMastery = Number(m?.masteryLevel);
    const best = Math.max(
      Number.isFinite(fromLevel) ? fromLevel : 0,
      Number.isFinite(fromMastery) ? fromMastery : 0,
      Number(skillLevelsById[id] || 0)
    );
    if (best > 0) skillLevelsById[id] = Math.floor(best);
  });

  let activeLoadout = (playerData.activeLoadout || null) as SessionLoadout | null;
  if (!activeLoadout) {
    const userElement =
      (studentData as { elementalAffinity?: string; manifestationType?: string }).elementalAffinity ||
      (studentData as { manifestationType?: string }).manifestationType ||
      undefined;
    const equippedSkills = await getEquippedSkillsForBattle(playerId, userElement);
    activeLoadout = {
      manifest: equippedSkills.filter((s) => s.category === 'manifest'),
      elemental: equippedSkills.filter((s) => s.category === 'elemental'),
      rrCandy: equippedSkills.filter((s) => isRRCandyMoveLike(s)),
      artifact: equippedSkills.filter((s) => s.category === 'system' && !isRRCandyMoveLike(s)),
      snapshotAt: null,
    };
  }
  if (activeLoadout) {
    activeLoadout = normalizeLoadoutBuckets(applySkillUpgradeLevelsToLoadout(activeLoadout, skillLevelsById));
    const rrCandyFromService = await getUserRRCandySkills(playerId, battleMoves);
    if (rrCandyFromService.length > 0) {
      const rrWithLevels = rrCandyFromService.map((m: Move) => ({
        ...m,
        level: Math.max(
          1,
          Number(skillLevelsById[String(m?.id)]) ||
            Number(m?.masteryLevel) ||
            Number(m?.level) ||
            1
        ),
      }));
      activeLoadout = normalizeLoadoutBuckets({
        ...activeLoadout,
        rrCandy: rrWithLevels,
        artifact: [...(activeLoadout.artifact || [])],
      });
    }
  }

  const artifacts = normalizeEquippedArtifacts(
    (studentData as { equippedArtifacts?: unknown }).equippedArtifacts
  );

  const displayName =
    roster?.displayName ||
    (studentData as { displayName?: string }).displayName ||
    'Player';
  const photoURL = roster?.photoURL || (studentData as { photoURL?: string }).photoURL;

  return {
    userId: playerId,
    displayName,
    photoURL,
    powerLevel:
      finitePowerLevel((studentData as Record<string, unknown>).powerLevel) ??
      finitePowerLevel(roster?.powerLevel),
    loadout: activeLoadout,
    artifacts,
    skillLevelsById,
  };
}
